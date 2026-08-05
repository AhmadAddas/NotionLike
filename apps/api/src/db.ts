import postgres from "postgres";
import { config } from "./config.js";

export const sql = postgres(config.databaseUrl, {
  max: 10,
  transform: postgres.camel,
  onnotice: () => undefined,
});

export type Role = "owner" | "member" | "guest";

export async function workspaceRole(userId: string, workspaceId: string): Promise<Role | null> {
  const rows = await sql<{ role: Role }[]>`
    SELECT role FROM workspace_members WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
  `;
  return rows[0]?.role ?? null;
}

export async function pageAccess(userId: string, pageId: string, write = false) {
  const rows = await sql<{ role: Role; guestAccess: boolean }[]>`
    SELECT wm.role, EXISTS(
      SELECT 1 FROM page_guests pg WHERE pg.page_id = p.id AND pg.user_id = ${userId}
    ) AS guest_access
    FROM pages p
    JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = ${userId}
    WHERE p.id = ${pageId}
  `;
  const access = rows[0];
  if (!access) return false;
  if (write) return access.role === "owner" || access.role === "member";
  return access.role !== "guest" || access.guestAccess;
}

