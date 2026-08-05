import postgres from "postgres";
import { config } from "./config.js";

export const sql = postgres(config.databaseUrl, {
  max: 10,
  transform: postgres.camel,
  onnotice: () => undefined,
});

export type Role = "owner" | "admin" | "member" | "guest";
export type Permission = "view" | "comment" | "edit" | "full_access";

export async function workspaceRole(userId: string, workspaceId: string): Promise<Role | null> {
  const rows = await sql<{ role: Role }[]>`
    SELECT role FROM workspace_members WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
  `;
  return rows[0]?.role ?? null;
}

export async function effectivePagePermission(userId: string, pageId: string): Promise<Permission | null> {
  const rows = await sql<{ role: Role; permission: Permission | null; legacyGuest: boolean }[]>`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, 0 AS depth FROM pages WHERE id = ${pageId}
      UNION ALL
      SELECT p.id, p.parent_id, a.depth + 1 FROM pages p JOIN ancestors a ON a.parent_id = p.id
    )
    SELECT wm.role,
      (SELECT pp.permission FROM ancestors a JOIN page_permissions pp ON pp.page_id = a.id
       WHERE pp.user_id = ${userId} OR pp.workspace_role = wm.role
       ORDER BY a.depth ASC, CASE pp.permission WHEN 'full_access' THEN 4 WHEN 'edit' THEN 3 WHEN 'comment' THEN 2 ELSE 1 END DESC LIMIT 1) AS permission,
      EXISTS(SELECT 1 FROM page_guests pg WHERE pg.page_id = ${pageId} AND pg.user_id = ${userId}) AS legacy_guest
    FROM pages target JOIN workspace_members wm ON wm.workspace_id = target.workspace_id AND wm.user_id = ${userId}
    WHERE target.id = ${pageId}
  `;
  const access = rows[0];
  if (!access) return null;
  if (access.permission) return access.permission;
  if (access.role === "owner" || access.role === "admin") return "full_access";
  if (access.role === "member") return "edit";
  return access.legacyGuest ? "view" : null;
}

export async function pageAccess(userId: string, pageId: string, write = false) {
  const permission = await effectivePagePermission(userId, pageId);
  return permission !== null && (!write || permission === "edit" || permission === "full_access");
}
