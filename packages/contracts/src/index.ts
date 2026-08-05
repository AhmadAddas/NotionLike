import { z } from "zod";

export const idSchema = z.string().uuid();
export const emailSchema = z.string().email().max(254).transform((value) => value.toLowerCase());
export const passwordSchema = z.string().min(10).max(128);

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

export const createWorkspaceSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const createPageSchema = z.object({
  workspaceId: idSchema,
  parentId: idSchema.nullable().optional(),
  title: z.string().trim().max(200).default("Untitled"),
  clientId: idSchema.optional(),
});

export const updatePageSchema = z.object({
  title: z.string().trim().max(200).optional(),
  icon: z.string().max(32).nullable().optional(),
  coverUrl: z.string().url().max(2048).nullable().optional(),
  parentId: idSchema.nullable().optional(),
  position: z.number().finite().optional(),
  favorite: z.boolean().optional(),
  archived: z.boolean().optional(),
  revision: z.number().int().nonnegative(),
});

export const documentUpdateSchema = z.object({
  update: z.string().base64(),
  clientId: z.string().min(1).max(100),
  sequence: z.number().int().nonnegative(),
});

export const invitationSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "member", "guest"]).default("member"),
});
export const acceptInvitationSchema = z.object({ token: z.string().min(20).max(200) });
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });
export const pagePermissionSchema = z.object({
  userId: idSchema.optional(),
  workspaceRole: z.enum(["admin", "member", "guest"]).optional(),
  permission: z.enum(["view", "comment", "edit", "full_access"]),
}).refine((value) => Boolean(value.userId) !== Boolean(value.workspaceRole), "Choose exactly one permission subject");
export const commentSchema = z.object({ body: z.string().trim().min(1).max(5000), blockId: z.string().max(100).optional(), parentId: idSchema.optional() });
export const updateCommentSchema = z.object({ body: z.string().trim().min(1).max(5000).optional(), resolved: z.boolean().optional() });
export const profileSchema = z.object({ name: z.string().trim().min(1).max(80).optional(), locale: z.string().min(2).max(16).optional(), timezone: z.string().min(1).max(64).optional() });

export const propertyTypeSchema = z.enum(["title", "text", "number", "select", "multi_select", "status", "date", "checkbox", "url", "email", "person", "files", "relation", "formula", "rollup"]);
export const viewTypeSchema = z.enum(["table", "board", "calendar", "list", "gallery"]);
export const createDatabaseSchema = z.object({ workspaceId: idSchema, pageId: idSchema.nullable().optional(), name: z.string().trim().min(1).max(200), description: z.string().max(2000).optional() });
export const createPropertySchema = z.object({ name: z.string().trim().min(1).max(100), type: propertyTypeSchema, config: z.record(z.string(), z.unknown()).optional() });
export const createViewSchema = z.object({ name: z.string().trim().min(1).max(100), type: viewTypeSchema, config: z.record(z.string(), z.unknown()).optional() });
export const databaseRowSchema = z.object({ values: z.record(z.string(), z.unknown()), position: z.number().finite().optional() });
export const databaseFormSchema = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(2000).optional(), config: z.record(z.string(), z.unknown()).optional() });
export const databaseAutomationSchema = z.object({ name: z.string().trim().min(1).max(100), trigger: z.record(z.string(), z.unknown()), actions: z.array(z.record(z.string(), z.unknown())).min(1) });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreatePageInput = z.infer<typeof createPageSchema>;
export type UpdatePageInput = z.infer<typeof updatePageSchema>;

export type User = { id: string; name: string; email: string };
export type Workspace = { id: string; name: string; role: "owner" | "admin" | "member" | "guest" };
export type Page = {
  id: string;
  workspaceId: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  coverUrl: string | null;
  position: number;
  favorite: boolean;
  archived: boolean;
  revision: number;
  updatedAt: string;
};

export const API_VERSION = "1";

export type PermissionLevel = "view" | "comment" | "edit" | "full_access";
export type Comment = { id: string; pageId: string; parentId: string | null; blockId: string | null; body: string; authorId: string; authorName: string; resolvedAt: string | null; createdAt: string };
export type Notification = { id: string; kind: "invitation" | "mention" | "comment" | "reply" | "permission" | "system"; pageId: string | null; workspaceId: string | null; payload: Record<string, unknown>; readAt: string | null; createdAt: string };
export type PropertyType = z.infer<typeof propertyTypeSchema>;
export type DatabaseProperty = { id: string; databaseId: string; name: string; type: PropertyType; config: Record<string, unknown>; position: number };
export type DatabaseRow = { id: string; databaseId: string; pageId: string | null; values: Record<string, unknown>; position: number; createdAt: string; updatedAt: string };
export type DatabaseView = { id: string; databaseId: string; name: string; type: z.infer<typeof viewTypeSchema>; config: { filters?: Array<Record<string, unknown>>; sorts?: Array<Record<string, unknown>>; groupBy?: string; dateProperty?: string; [key: string]: unknown }; position: number };
export type Database = { id: string; workspaceId: string; pageId: string | null; name: string; description: string; properties: DatabaseProperty[]; views: DatabaseView[]; rows: DatabaseRow[] };
