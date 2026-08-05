import type { FastifyRequest } from "fastify";
import { sql } from "./db.js";

export async function audit(request: FastifyRequest, action: string, targetType: string, targetId?: string, workspaceId?: string, metadata: Record<string, unknown> = {}) {
  await sql`INSERT INTO audit_logs (workspace_id, actor_id, action, target_type, target_id, ip, metadata)
    VALUES (${workspaceId ?? null}, ${request.user?.id ?? null}, ${action}, ${targetType}, ${targetId ?? null}, ${request.ip}, ${sql.json(metadata as any)})`;
}
