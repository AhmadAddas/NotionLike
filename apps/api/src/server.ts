import { createHash, randomBytes, randomUUID } from "node:crypto";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as Y from "yjs";
import {
  createPageSchema,
  createWorkspaceSchema,
  documentUpdateSchema,
  loginSchema,
  registerSchema,
  updatePageSchema,
} from "@notionlike/contracts";
import { authenticate, createSession, destroySession, passwordHash, passwordMatches } from "./auth.js";
import { config } from "./config.js";
import { pageAccess, sql, workspaceRole } from "./db.js";
import { registerCollaboration } from "./collaboration.js";
import { registerPlatformRoutes } from "./platform-routes.js";
import { registerDatabaseRoutes } from "./database-routes.js";
import { registerContentRoutes } from "./content-routes.js";

const app = Fastify({ logger: true, trustProxy: process.env.TRUST_PROXY === "true", bodyLimit: 2 * 1024 * 1024 });
await app.register(cookie);
await app.register(cors, { origin: config.appUrl, credentials: true });
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
await app.register(websocket);

const s3 = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  forcePathStyle: true,
  credentials: { accessKeyId: config.s3.accessKey, secretAccessKey: config.s3.secretKey },
});
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const parse = <T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: unknown } }, value: unknown, reply: any) => {
  const result = schema.safeParse(value);
  if (!result.success) { reply.code(400).send({ error: "Invalid request", details: result.error }); return null; }
  return result.data as T;
};
const requireRole = async (userId: string, workspaceId: string, allowed: string[], reply: any) => {
  const role = await workspaceRole(userId, workspaceId);
  if (!role || !allowed.includes(role)) { reply.code(403).send({ error: "Forbidden" }); return null; }
  return role;
};

app.get("/health", async () => ({ status: "ok" }));
app.get("/ready", async (_request, reply) => {
  try { await sql`SELECT 1`; return { status: "ready" }; } catch { return reply.code(503).send({ status: "unavailable" }); }
});
app.get("/api/v1/meta", async () => ({ apiVersion: "1", product: "NotionLike", maxUploadBytes: 25_000_000, registration: config.allowRegistration, sso: Boolean(config.oidc) }));
await registerCollaboration(app);
await registerPlatformRoutes(app);
await registerDatabaseRoutes(app);
await registerContentRoutes(app);

app.post("/api/v1/auth/register", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request, reply) => {
  if (!config.allowRegistration) return reply.code(403).send({ error: "Registration is disabled" });
  const body = parse(registerSchema, request.body, reply); if (!body) return;
  try {
    const password = await passwordHash(body.password);
    const [user] = await sql.begin(async (tx) => {
      const users = await tx<{ id: string; name: string; email: string }[]>`INSERT INTO users (name, email, password_hash) VALUES (${body.name}, ${body.email}, ${password}) RETURNING id, name, email`;
      const workspace = await tx<{ id: string }[]>`INSERT INTO workspaces (name, created_by) VALUES (${`${body.name}'s workspace`}, ${users[0]!.id}) RETURNING id`;
      await tx`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (${workspace[0]!.id}, ${users[0]!.id}, 'owner')`;
      return users;
    });
    const token = await createSession(user!.id, reply);
    return reply.code(201).send({ user, token });
  } catch (error: any) {
    if (error.code === "23505") return reply.code(409).send({ error: "Email already registered" });
    throw error;
  }
});

app.post("/api/v1/auth/login", { config: { rateLimit: { max: 15, timeWindow: "15 minutes" } } }, async (request, reply) => {
  const body = parse(loginSchema, request.body, reply); if (!body) return;
  const users = await sql<{ id: string; name: string; email: string; passwordHash: string | null }[]>`SELECT id, name, email, password_hash FROM users WHERE email = ${body.email}`;
  const user = users[0];
  if (!user?.passwordHash || !(await passwordMatches(user.passwordHash, body.password))) return reply.code(401).send({ error: "Invalid email or password" });
  const token = await createSession(user.id, reply);
  return { user: { id: user.id, name: user.name, email: user.email }, token };
});
app.post("/api/v1/auth/logout", { preHandler: authenticate }, async (request, reply) => { await destroySession(request, reply); return reply.code(204).send(); });
app.get("/api/v1/auth/me", { preHandler: authenticate }, async (request) => ({ user: request.user }));

app.get("/api/v1/workspaces", { preHandler: authenticate }, async (request) => ({ workspaces: await sql`
  SELECT w.id, w.name, wm.role FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id WHERE wm.user_id = ${request.user.id} ORDER BY w.created_at
` }));
app.post("/api/v1/workspaces", { preHandler: authenticate }, async (request, reply) => {
  const body = parse(createWorkspaceSchema, request.body, reply); if (!body) return;
  const workspace = await sql.begin(async (tx) => {
    const rows = await tx`INSERT INTO workspaces (name, created_by) VALUES (${body.name}, ${request.user.id}) RETURNING id, name`;
    await tx`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (${rows[0]!.id}, ${request.user.id}, 'owner')`;
    return rows[0];
  });
  return reply.code(201).send({ workspace: { ...workspace, role: "owner" } });
});

app.get("/api/v1/workspaces/:workspaceId/pages", { preHandler: authenticate }, async (request, reply) => {
  const { workspaceId } = request.params as { workspaceId: string };
  if (!await requireRole(request.user.id, workspaceId, ["owner", "member", "guest"], reply)) return;
  const role = await workspaceRole(request.user.id, workspaceId);
  const pages = role === "guest"
    ? await sql`SELECT p.* FROM pages p JOIN page_guests pg ON pg.page_id = p.id WHERE p.workspace_id = ${workspaceId} AND pg.user_id = ${request.user.id} AND NOT p.archived ORDER BY p.position`
    : await sql`SELECT * FROM pages WHERE workspace_id = ${workspaceId} ORDER BY parent_id NULLS FIRST, position`;
  return { pages };
});
app.post("/api/v1/pages", { preHandler: authenticate }, async (request, reply) => {
  const body = parse(createPageSchema, request.body, reply); if (!body) return;
  if (!await requireRole(request.user.id, body.workspaceId, ["owner", "member"], reply)) return;
  if (body.parentId) {
    const parent = await sql`SELECT 1 FROM pages WHERE id = ${body.parentId} AND workspace_id = ${body.workspaceId}`;
    if (!parent.length) return reply.code(400).send({ error: "Invalid parent page" });
  }
  const id = body.clientId ?? randomUUID();
  const rows = await sql`INSERT INTO pages (id, workspace_id, parent_id, title, position, created_by)
    VALUES (${id}, ${body.workspaceId}, ${body.parentId ?? null}, ${body.title}, COALESCE((SELECT max(position) + 1 FROM pages WHERE workspace_id = ${body.workspaceId} AND parent_id IS NOT DISTINCT FROM ${body.parentId ?? null}), 0), ${request.user.id}) RETURNING *`;
  return reply.code(201).send({ page: rows[0] });
});
app.get("/api/v1/pages/:pageId", { preHandler: authenticate }, async (request, reply) => {
  const { pageId } = request.params as { pageId: string };
  if (!await pageAccess(request.user.id, pageId)) return reply.code(403).send({ error: "Forbidden" });
  const pages = await sql`SELECT * FROM pages WHERE id = ${pageId}`;
  return pages[0] ? { page: pages[0] } : reply.code(404).send({ error: "Page not found" });
});
app.patch("/api/v1/pages/:pageId", { preHandler: authenticate }, async (request, reply) => {
  const { pageId } = request.params as { pageId: string };
  const body = parse(updatePageSchema, request.body, reply); if (!body) return;
  if (!await pageAccess(request.user.id, pageId, true)) return reply.code(403).send({ error: "Forbidden" });
  const rows = await sql`UPDATE pages SET
    title = COALESCE(${body.title ?? null}, title), icon = CASE WHEN ${body.icon !== undefined} THEN ${body.icon ?? null} ELSE icon END,
    cover_url = CASE WHEN ${body.coverUrl !== undefined} THEN ${body.coverUrl ?? null} ELSE cover_url END,
    parent_id = CASE WHEN ${body.parentId !== undefined} THEN ${body.parentId ?? null} ELSE parent_id END,
    position = COALESCE(${body.position ?? null}, position), favorite = COALESCE(${body.favorite ?? null}, favorite),
    archived = COALESCE(${body.archived ?? null}, archived), revision = revision + 1, updated_at = now()
    WHERE id = ${pageId} AND revision = ${body.revision} RETURNING *`;
  return rows[0] ? { page: rows[0] } : reply.code(409).send({ error: "Page changed on another device" });
});

app.get("/api/v1/pages/:pageId/document", { preHandler: authenticate }, async (request, reply) => {
  const { pageId } = request.params as { pageId: string };
  if (!await pageAccess(request.user.id, pageId)) return reply.code(403).send({ error: "Forbidden" });
  const rows = await sql<{ updateData: Buffer }[]>`SELECT update_data FROM page_updates WHERE page_id = ${pageId} ORDER BY id`;
  const merged = rows.length ? Y.mergeUpdates(rows.map((row) => new Uint8Array(row.updateData))) : new Uint8Array();
  return { update: Buffer.from(merged).toString("base64") };
});
app.post("/api/v1/pages/:pageId/document", { preHandler: authenticate }, async (request, reply) => {
  const { pageId } = request.params as { pageId: string };
  const body = parse(documentUpdateSchema, request.body, reply); if (!body) return;
  if (!await pageAccess(request.user.id, pageId, true)) return reply.code(403).send({ error: "Forbidden" });
  const bytes = Buffer.from(body.update, "base64");
  try { Y.applyUpdate(new Y.Doc(), bytes); } catch { return reply.code(400).send({ error: "Invalid document update" }); }
  await sql`INSERT INTO page_updates (page_id, client_id, sequence, update_data) VALUES (${pageId}, ${body.clientId}, ${body.sequence}, ${bytes}) ON CONFLICT DO NOTHING`;
  await sql`UPDATE pages SET updated_at = now() WHERE id = ${pageId}`;
  return reply.code(202).send({ accepted: true });
});

app.get("/api/v1/workspaces/:workspaceId/search", { preHandler: authenticate }, async (request, reply) => {
  const { workspaceId } = request.params as { workspaceId: string };
  const { q = "" } = request.query as { q?: string };
  if (!await requireRole(request.user.id, workspaceId, ["owner", "member", "guest"], reply)) return;
  const pages = await sql`SELECT id, workspace_id, parent_id, title, icon, updated_at FROM pages
    WHERE workspace_id = ${workspaceId} AND NOT archived AND to_tsvector('simple', title || ' ' || search_text) @@ plainto_tsquery('simple', ${q}) ORDER BY updated_at DESC LIMIT 50`;
  return { pages };
});

app.post("/api/v1/pages/:pageId/attachments/presign", { preHandler: authenticate }, async (request, reply) => {
  const { pageId } = request.params as { pageId: string };
  if (!await pageAccess(request.user.id, pageId, true)) return reply.code(403).send({ error: "Forbidden" });
  const input = request.body as { fileName?: string; contentType?: string; size?: number };
  if (!input.fileName || !input.contentType || !input.size || input.size > 25_000_000) return reply.code(400).send({ error: "Invalid file" });
  const pages = await sql<{ workspaceId: string }[]>`SELECT workspace_id FROM pages WHERE id = ${pageId}`;
  const attachmentId = randomUUID();
  const key = `${pages[0]!.workspaceId}/${pageId}/${attachmentId}`;
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, ContentType: input.contentType, ContentLength: input.size }), { expiresIn: 900 });
  await sql`INSERT INTO attachments (id, workspace_id, page_id, object_key, file_name, content_type, size_bytes, created_by)
    VALUES (${attachmentId}, ${pages[0]!.workspaceId}, ${pageId}, ${key}, ${input.fileName}, ${input.contentType}, ${input.size}, ${request.user.id})`;
  return { attachmentId, uploadUrl, publicUrl: `${config.s3.publicUrl}/${config.s3.bucket}/${key}` };
});

app.post("/api/v1/pages/:pageId/public-share", { preHandler: authenticate }, async (request, reply) => {
  const { pageId } = request.params as { pageId: string };
  if (!await pageAccess(request.user.id, pageId, true)) return reply.code(403).send({ error: "Forbidden" });
  const token = randomBytes(24).toString("base64url");
  await sql`INSERT INTO public_shares (page_id, token_hash, created_by) VALUES (${pageId}, ${sha256(token)}, ${request.user.id})
    ON CONFLICT (page_id) DO UPDATE SET token_hash = excluded.token_hash, created_by = excluded.created_by, created_at = now()`;
  return { url: `${config.appUrl}/public/${token}` };
});
app.delete("/api/v1/pages/:pageId/public-share", { preHandler: authenticate }, async (request, reply) => {
  const { pageId } = request.params as { pageId: string };
  if (!await pageAccess(request.user.id, pageId, true)) return reply.code(403).send({ error: "Forbidden" });
  await sql`DELETE FROM public_shares WHERE page_id = ${pageId}`;
  return reply.code(204).send();
});
app.get("/api/v1/public/:token", async (request, reply) => {
  const { token } = request.params as { token: string };
  const pages = await sql`SELECT p.id, p.title, p.icon, p.updated_at FROM public_shares ps JOIN pages p ON p.id = ps.page_id WHERE ps.token_hash = ${sha256(token)} AND NOT p.archived`;
  if (!pages[0]) return reply.code(404).send({ error: "Public page not found" });
  const updates = await sql<{ updateData: Buffer }[]>`SELECT update_data FROM page_updates WHERE page_id = ${pages[0].id} ORDER BY id`;
  return { page: pages[0], update: updates.length ? Buffer.from(Y.mergeUpdates(updates.map((row) => new Uint8Array(row.updateData)))).toString("base64") : "" };
});

app.setErrorHandler((error, _request, reply) => { app.log.error(error); reply.code(500).send({ error: "Internal server error" }); });
const close = async () => { await app.close(); await sql.end(); process.exit(0); };
process.on("SIGTERM", close); process.on("SIGINT", close);
await app.listen({ port: config.port, host: "0.0.0.0" });
