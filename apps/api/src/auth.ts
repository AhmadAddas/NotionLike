import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import type { FastifyReply, FastifyRequest } from "fastify";
import { sql } from "./db.js";
import { config } from "./config.js";

const COOKIE = "notionlike_session";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export type SessionUser = { id: string; name: string; email: string };

export const passwordHash = (password: string) => hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const passwordMatches = (encoded: string, password: string) => verify(encoded, password);

export async function createSession(userId: string, reply: FastifyReply) {
  const token = randomBytes(32).toString("base64url");
  await sql`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (${userId}, ${digest(token)}, now() + interval '30 days')`;
  reply.setCookie(COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.secureCookies,
    maxAge: 60 * 60 * 24 * 30,
  });
  return token;
}

export async function destroySession(request: FastifyRequest, reply: FastifyReply) {
  const queryToken = (request.query as { token?: string } | undefined)?.token;
  const token = request.cookies[COOKIE] ?? request.headers.authorization?.replace(/^Bearer /, "") ?? queryToken;
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${digest(token)}`;
  reply.clearCookie(COOKIE, { path: "/" });
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[COOKIE] ?? request.headers.authorization?.replace(/^Bearer /, "");
  if (!token) return reply.code(401).send({ error: "Authentication required" });
  const users = await sql<SessionUser[]>`
    SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${digest(token)} AND s.expires_at > now()
  `;
  if (!users[0]) return reply.code(401).send({ error: "Session expired" });
  request.user = users[0];
}

declare module "fastify" {
  interface FastifyRequest { user: SessionUser }
}
