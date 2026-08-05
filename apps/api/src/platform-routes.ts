import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  acceptInvitationSchema, commentSchema, forgotPasswordSchema, invitationSchema, pagePermissionSchema,
  profileSchema, resetPasswordSchema, updateCommentSchema,
} from "@notionlike/contracts";
import { authenticate, createSession, passwordHash } from "./auth.js";
import { audit } from "./audit.js";
import { config } from "./config.js";
import { effectivePagePermission, pageAccess, sql, workspaceRole } from "./db.js";
import { sendMail } from "./email.js";
import * as Y from "yjs";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const base64url = (value: Buffer) => value.toString("base64url");
const parse = <T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: unknown } }, value: unknown, reply: any) => {
  const result = schema.safeParse(value);
  if (!result.success) { reply.code(400).send({ error: "Invalid request", details: result.error }); return null; }
  return result.data as T;
};
const manageWorkspace = async (userId: string, workspaceId: string, reply: any) => {
  const role = await workspaceRole(userId, workspaceId);
  if (role !== "owner" && role !== "admin") { reply.code(403).send({ error: "Workspace administration required" }); return null; }
  return role;
};
const canComment = (permission: string | null) => permission === "comment" || permission === "edit" || permission === "full_access";

type OidcDiscovery = { authorization_endpoint: string; token_endpoint: string; jwks_uri: string; issuer: string };
let discoveryCache: OidcDiscovery | null = null;
async function oidcDiscovery() {
  if (!config.oidc) throw new Error("OIDC is not configured");
  if (!discoveryCache) {
    const response = await fetch(`${config.oidc.issuer}/.well-known/openid-configuration`);
    if (!response.ok) throw new Error("Unable to load OIDC discovery document");
    discoveryCache = await response.json() as OidcDiscovery;
  }
  return discoveryCache;
}

export async function registerPlatformRoutes(app: FastifyInstance) {
  app.patch("/api/v1/profile", { preHandler: authenticate }, async (request, reply) => {
    const body = parse(profileSchema, request.body, reply); if (!body) return;
    const rows = await sql`UPDATE users SET name = COALESCE(${body.name ?? null}, name), locale = COALESCE(${body.locale ?? null}, locale), timezone = COALESCE(${body.timezone ?? null}, timezone) WHERE id = ${request.user.id} RETURNING id, name, email, locale, timezone, avatar_url`;
    return { user: rows[0] };
  });

  app.post("/api/v1/auth/forgot-password", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (request, reply) => {
    const body = parse(forgotPasswordSchema, request.body, reply); if (!body) return;
    const users = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${body.email}`;
    if (users[0]) {
      const token = randomBytes(32).toString("base64url");
      await sql`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (${users[0].id}, ${sha256(token)}, now() + interval '1 hour')`;
      await sendMail(body.email, "Reset your NotionLike password", `Open ${config.appUrl}/reset-password?token=${encodeURIComponent(token)} to choose a new password. This link expires in one hour.`);
    }
    return reply.code(202).send({ accepted: true });
  });
  app.post("/api/v1/auth/reset-password", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request, reply) => {
    const body = parse(resetPasswordSchema, request.body, reply); if (!body) return;
    const tokens = await sql<{ id: string; userId: string }[]>`SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ${sha256(body.token)} AND used_at IS NULL AND expires_at > now()`;
    if (!tokens[0]) return reply.code(400).send({ error: "Reset link is invalid or expired" });
    const encoded = await passwordHash(body.password);
    await sql.begin(async (tx) => { await tx`UPDATE users SET password_hash = ${encoded} WHERE id = ${tokens[0]!.userId}`; await tx`UPDATE password_reset_tokens SET used_at = now() WHERE id = ${tokens[0]!.id}`; await tx`DELETE FROM sessions WHERE user_id = ${tokens[0]!.userId}`; });
    return reply.code(204).send();
  });

  app.get("/api/v1/auth/oidc", async (_request, reply) => {
    if (!config.oidc) return reply.code(404).send({ error: "SSO is not configured" });
    const discovery = await oidcDiscovery(); const state = randomBytes(32).toString("base64url"); const nonce = randomBytes(24).toString("base64url"); const verifier = randomBytes(48).toString("base64url");
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    await sql`INSERT INTO oidc_states (state_hash, nonce, code_verifier, expires_at) VALUES (${sha256(state)}, ${nonce}, ${verifier}, now() + interval '10 minutes')`;
    const url = new URL(discovery.authorization_endpoint); url.search = new URLSearchParams({ client_id: config.oidc.clientId, response_type: "code", scope: "openid email profile", redirect_uri: `${config.appUrl}/api/v1/auth/oidc/callback`, state, nonce, code_challenge: challenge, code_challenge_method: "S256" }).toString();
    return reply.redirect(url.toString());
  });
  app.get("/api/v1/auth/oidc/callback", async (request, reply) => {
    if (!config.oidc) return reply.code(404).send({ error: "SSO is not configured" });
    const { code, state } = request.query as { code?: string; state?: string }; if (!code || !state) return reply.code(400).send({ error: "Invalid SSO callback" });
    const states = await sql<{ id: string; nonce: string; codeVerifier: string; redirectTo: string }[]>`DELETE FROM oidc_states WHERE state_hash = ${sha256(state)} AND expires_at > now() RETURNING id, nonce, code_verifier, redirect_to`;
    if (!states[0]) return reply.code(400).send({ error: "SSO state is invalid or expired" });
    const discovery = await oidcDiscovery(); const parameters = new URLSearchParams({ grant_type: "authorization_code", code, client_id: config.oidc.clientId, redirect_uri: `${config.appUrl}/api/v1/auth/oidc/callback`, code_verifier: states[0].codeVerifier });
    if (config.oidc.clientSecret) parameters.set("client_secret", config.oidc.clientSecret);
    const tokenResponse = await fetch(discovery.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: parameters });
    const tokens = await tokenResponse.json() as { id_token?: string; error?: string }; if (!tokenResponse.ok || !tokens.id_token) return reply.code(401).send({ error: tokens.error ?? "SSO token exchange failed" });
    const verified = await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL(discovery.jwks_uri)), { issuer: discovery.issuer, audience: config.oidc.clientId });
    if (verified.payload.nonce !== states[0].nonce || !verified.payload.sub || typeof verified.payload.email !== "string") return reply.code(401).send({ error: "SSO identity is incomplete" });
    const subject = verified.payload.sub; const email = verified.payload.email;
    const user = await sql.begin(async (tx) => {
      const identities = await tx<{ id: string; name: string; email: string }[]>`SELECT u.id, u.name, u.email FROM user_identities ui JOIN users u ON u.id = ui.user_id WHERE ui.issuer = ${discovery.issuer} AND ui.subject = ${subject}`;
      if (identities[0]) return identities[0];
      let users = await tx<{ id: string; name: string; email: string }[]>`SELECT id, name, email FROM users WHERE email = ${email}`;
      if (!users[0]) users = await tx`INSERT INTO users (name, email, email_verified_at) VALUES (${String(verified.payload.name ?? email)}, ${email}, now()) RETURNING id, name, email`;
      await tx`INSERT INTO user_identities (user_id, issuer, subject) VALUES (${users[0]!.id}, ${discovery.issuer}, ${subject})`;
      return users[0]!;
    });
    await createSession(user.id, reply); return reply.redirect(states[0].redirectTo);
  });

  app.get("/api/v1/workspaces/:workspaceId/members", { preHandler: authenticate }, async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string }; if (!await workspaceRole(request.user.id, workspaceId)) return reply.code(403).send({ error: "Forbidden" });
    return { members: await sql`SELECT u.id, u.name, u.email, u.avatar_url, wm.role, wm.created_at FROM workspace_members wm JOIN users u ON u.id = wm.user_id WHERE wm.workspace_id = ${workspaceId} ORDER BY wm.created_at` };
  });
  app.post("/api/v1/workspaces/:workspaceId/invitations", { preHandler: authenticate }, async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string }; if (!await manageWorkspace(request.user.id, workspaceId, reply)) return;
    const body = parse(invitationSchema, request.body, reply); if (!body) return; const token = randomBytes(32).toString("base64url");
    const rows = await sql`INSERT INTO workspace_invitations (workspace_id, email, role, token_hash, invited_by, expires_at) VALUES (${workspaceId}, ${body.email}, ${body.role}, ${sha256(token)}, ${request.user.id}, now() + interval '7 days') RETURNING id, email, role, expires_at`;
    const inviteUrl = `${config.appUrl}/invite/${token}`; const delivered = await sendMail(body.email, "You were invited to NotionLike", `${request.user.name} invited you to a workspace. Open ${inviteUrl} within seven days.`);
    await audit(request, "invitation.create", "invitation", rows[0]!.id, workspaceId, { email: body.email, role: body.role });
    return reply.code(201).send({ invitation: rows[0], delivered, ...(!delivered ? { inviteUrl } : {}) });
  });
  app.get("/api/v1/invitations/:token", async (request, reply) => {
    const { token } = request.params as { token: string }; const rows = await sql`SELECT wi.id, wi.email, wi.role, wi.expires_at, w.name AS workspace_name FROM workspace_invitations wi JOIN workspaces w ON w.id = wi.workspace_id WHERE wi.token_hash = ${sha256(token)} AND wi.accepted_at IS NULL AND wi.expires_at > now()`;
    return rows[0] ? { invitation: rows[0] } : reply.code(404).send({ error: "Invitation is invalid or expired" });
  });
  app.post("/api/v1/invitations/accept", { preHandler: authenticate }, async (request, reply) => {
    const body = parse(acceptInvitationSchema, request.body, reply); if (!body) return;
    const invitations = await sql<{ id: string; workspaceId: string; email: string; role: string }[]>`SELECT id, workspace_id, email, role FROM workspace_invitations WHERE token_hash = ${sha256(body.token)} AND accepted_at IS NULL AND expires_at > now()`;
    const invitation = invitations[0]; if (!invitation || invitation.email !== request.user.email) return reply.code(403).send({ error: "Invitation does not match this account" });
    await sql.begin(async (tx) => { await tx`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (${invitation.workspaceId}, ${request.user.id}, ${invitation.role}) ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = excluded.role`; await tx`UPDATE workspace_invitations SET accepted_at = now() WHERE id = ${invitation.id}`; });
    return { workspaceId: invitation.workspaceId };
  });
  app.patch("/api/v1/workspaces/:workspaceId/members/:userId", { preHandler: authenticate }, async (request, reply) => {
    const { workspaceId, userId } = request.params as { workspaceId: string; userId: string }; if (!await manageWorkspace(request.user.id, workspaceId, reply)) return;
    const role = (request.body as { role?: string }).role; if (!role || !["admin", "member", "guest"].includes(role)) return reply.code(400).send({ error: "Invalid role" });
    const rows = await sql`UPDATE workspace_members SET role = ${role} WHERE workspace_id = ${workspaceId} AND user_id = ${userId} AND role <> 'owner' RETURNING user_id, role`;
    await audit(request, "member.role.update", "user", userId, workspaceId, { role }); return rows[0] ? { member: rows[0] } : reply.code(404).send({ error: "Member not found" });
  });
  app.delete("/api/v1/workspaces/:workspaceId/members/:userId", { preHandler: authenticate }, async (request, reply) => {
    const { workspaceId, userId } = request.params as { workspaceId: string; userId: string }; if (!await manageWorkspace(request.user.id, workspaceId, reply)) return;
    await sql`DELETE FROM workspace_members WHERE workspace_id = ${workspaceId} AND user_id = ${userId} AND role <> 'owner'`; await audit(request, "member.remove", "user", userId, workspaceId); return reply.code(204).send();
  });

  app.get("/api/v1/pages/:pageId/permissions", { preHandler: authenticate }, async (request, reply) => {
    const { pageId } = request.params as { pageId: string }; if (await effectivePagePermission(request.user.id, pageId) !== "full_access") return reply.code(403).send({ error: "Full access required" });
    return { permissions: await sql`SELECT pp.page_id, pp.user_id, pp.workspace_role, pp.permission, u.name, u.email FROM page_permissions pp LEFT JOIN users u ON u.id = pp.user_id WHERE pp.page_id = ${pageId}` };
  });
  app.put("/api/v1/pages/:pageId/permissions", { preHandler: authenticate }, async (request, reply) => {
    const { pageId } = request.params as { pageId: string }; if (await effectivePagePermission(request.user.id, pageId) !== "full_access") return reply.code(403).send({ error: "Full access required" });
    const body = parse(pagePermissionSchema, request.body, reply); if (!body) return;
    const rows = await sql`INSERT INTO page_permissions (page_id, user_id, workspace_role, permission, granted_by) VALUES (${pageId}, ${body.userId ?? null}, ${body.workspaceRole ?? null}, ${body.permission}, ${request.user.id}) ON CONFLICT (page_id, user_id, workspace_role) DO UPDATE SET permission = excluded.permission, granted_by = excluded.granted_by RETURNING *`;
    return { permission: rows[0] };
  });
  app.delete("/api/v1/pages/:pageId/permissions", { preHandler: authenticate }, async (request, reply) => {
    const { pageId } = request.params as { pageId: string }; if (await effectivePagePermission(request.user.id, pageId) !== "full_access") return reply.code(403).send({ error: "Full access required" });
    const { userId, workspaceRole: role } = request.query as { userId?: string; workspaceRole?: string }; await sql`DELETE FROM page_permissions WHERE page_id = ${pageId} AND (user_id = ${userId ?? null} OR workspace_role::text = ${role ?? null})`; return reply.code(204).send();
  });

  app.get("/api/v1/pages/:pageId/comments", { preHandler: authenticate }, async (request, reply) => {
    const { pageId } = request.params as { pageId: string }; if (!await pageAccess(request.user.id, pageId)) return reply.code(403).send({ error: "Forbidden" });
    return { comments: await sql`SELECT c.*, u.name AS author_name, u.avatar_url AS author_avatar FROM comments c JOIN users u ON u.id = c.author_id WHERE c.page_id = ${pageId} ORDER BY c.created_at` };
  });
  app.post("/api/v1/pages/:pageId/comments", { preHandler: authenticate }, async (request, reply) => {
    const { pageId } = request.params as { pageId: string }; if (!canComment(await effectivePagePermission(request.user.id, pageId))) return reply.code(403).send({ error: "Comment access required" });
    const body = parse(commentSchema, request.body, reply); if (!body) return;
    const rows = await sql`INSERT INTO comments (page_id, parent_id, block_id, author_id, body) VALUES (${pageId}, ${body.parentId ?? null}, ${body.blockId ?? null}, ${request.user.id}, ${body.body}) RETURNING *`;
    const page = await sql<{ workspaceId: string; createdBy: string; title: string }[]>`SELECT workspace_id, created_by, title FROM pages WHERE id = ${pageId}`;
    if (page[0]?.createdBy !== request.user.id) await sql`INSERT INTO notifications (user_id, actor_id, kind, workspace_id, page_id, payload) VALUES (${page[0]!.createdBy}, ${request.user.id}, ${body.parentId ? "reply" : "comment"}, ${page[0]!.workspaceId}, ${pageId}, ${sql.json({ commentId: rows[0]!.id, pageTitle: page[0]!.title })})`;
    return reply.code(201).send({ comment: rows[0] });
  });
  app.patch("/api/v1/comments/:commentId", { preHandler: authenticate }, async (request, reply) => {
    const { commentId } = request.params as { commentId: string }; const body = parse(updateCommentSchema, request.body, reply); if (!body) return;
    const comments = await sql<{ pageId: string; authorId: string }[]>`SELECT page_id, author_id FROM comments WHERE id = ${commentId}`; if (!comments[0]) return reply.code(404).send({ error: "Comment not found" });
    const permission = await effectivePagePermission(request.user.id, comments[0].pageId); if (comments[0].authorId !== request.user.id && permission !== "full_access") return reply.code(403).send({ error: "Forbidden" });
    const rows = await sql`UPDATE comments SET body = COALESCE(${body.body ?? null}, body), edited_at = CASE WHEN ${body.body !== undefined} THEN now() ELSE edited_at END, resolved_at = CASE WHEN ${body.resolved === true} THEN now() WHEN ${body.resolved === false} THEN NULL ELSE resolved_at END, resolved_by = CASE WHEN ${body.resolved === true} THEN ${request.user.id} WHEN ${body.resolved === false} THEN NULL ELSE resolved_by END WHERE id = ${commentId} RETURNING *`;
    return { comment: rows[0] };
  });
  app.delete("/api/v1/comments/:commentId", { preHandler: authenticate }, async (request, reply) => { const { commentId } = request.params as { commentId: string }; const rows = await sql<{ pageId: string; authorId: string }[]>`SELECT page_id, author_id FROM comments WHERE id = ${commentId}`; if (!rows[0]) return reply.code(404).send({ error: "Comment not found" }); const permission = await effectivePagePermission(request.user.id, rows[0].pageId); if (rows[0].authorId !== request.user.id && permission !== "full_access") return reply.code(403).send({ error: "Forbidden" }); await sql`DELETE FROM comments WHERE id = ${commentId}`; return reply.code(204).send(); });

  app.get("/api/v1/notifications", { preHandler: authenticate }, async (request) => ({ notifications: await sql`SELECT n.*, u.name AS actor_name FROM notifications n LEFT JOIN users u ON u.id = n.actor_id WHERE n.user_id = ${request.user.id} ORDER BY n.created_at DESC LIMIT 100` }));
  app.post("/api/v1/notifications/read", { preHandler: authenticate }, async (request, reply) => { const ids = (request.body as { ids?: string[] }).ids; if (ids?.length) await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${request.user.id} AND id = ANY(${ids})`; else await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${request.user.id} AND read_at IS NULL`; return reply.code(204).send(); });

  app.get("/api/v1/workspaces/:workspaceId/audit-log", { preHandler: authenticate }, async (request, reply) => { const { workspaceId } = request.params as { workspaceId: string }; if (!await manageWorkspace(request.user.id, workspaceId, reply)) return; return { events: await sql`SELECT al.*, u.name AS actor_name FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_id WHERE al.workspace_id = ${workspaceId} ORDER BY al.created_at DESC LIMIT 500` }; });

  app.get("/api/v1/pages/:pageId/versions", { preHandler: authenticate }, async (request, reply) => { const { pageId } = request.params as { pageId: string }; if (!await pageAccess(request.user.id, pageId)) return reply.code(403).send({ error: "Forbidden" }); return { versions: await sql`SELECT pv.id, pv.name, pv.title, pv.created_at, u.name AS created_by_name FROM page_versions pv LEFT JOIN users u ON u.id = pv.created_by WHERE pv.page_id = ${pageId} ORDER BY pv.created_at DESC LIMIT 100` }; });
  app.post("/api/v1/pages/:pageId/versions", { preHandler: authenticate }, async (request, reply) => { const { pageId } = request.params as { pageId: string }; if (!await pageAccess(request.user.id, pageId, true)) return reply.code(403).send({ error: "Forbidden" }); const updates = await sql<{ updateData: Buffer }[]>`SELECT update_data FROM page_updates WHERE page_id = ${pageId} ORDER BY id`; const page = await sql<{ title: string }[]>`SELECT title FROM pages WHERE id = ${pageId}`; const merged = updates.length ? Buffer.from(Y.mergeUpdates(updates.map((row) => new Uint8Array(row.updateData)))) : Buffer.alloc(0); const rows = await sql`INSERT INTO page_versions (page_id, created_by, name, title, update_data) VALUES (${pageId}, ${request.user.id}, ${(request.body as { name?: string }).name ?? null}, ${page[0]!.title}, ${merged}) RETURNING id, name, title, created_at`; return reply.code(201).send({ version: rows[0] }); });
  app.post("/api/v1/pages/:pageId/versions/:versionId/restore", { preHandler: authenticate }, async (request, reply) => { const { pageId, versionId } = request.params as { pageId: string; versionId: string }; if (!await pageAccess(request.user.id, pageId, true)) return reply.code(403).send({ error: "Forbidden" }); const versions = await sql<{ updateData: Buffer; title: string }[]>`SELECT update_data, title FROM page_versions WHERE id = ${versionId} AND page_id = ${pageId}`; if (!versions[0]) return reply.code(404).send({ error: "Version not found" }); await sql.begin(async (tx) => { await tx`DELETE FROM page_updates WHERE page_id = ${pageId}`; await tx`INSERT INTO page_updates (page_id, client_id, sequence, update_data) VALUES (${pageId}, ${`restore:${versionId}`}, 0, ${versions[0]!.updateData})`; await tx`UPDATE pages SET title = ${versions[0]!.title}, revision = revision + 1, updated_at = now() WHERE id = ${pageId}`; }); return reply.code(204).send(); });
}
