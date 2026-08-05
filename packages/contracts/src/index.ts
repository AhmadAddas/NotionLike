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

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreatePageInput = z.infer<typeof createPageSchema>;
export type UpdatePageInput = z.infer<typeof updatePageSchema>;

export type User = { id: string; name: string; email: string };
export type Workspace = { id: string; name: string; role: "owner" | "member" | "guest" };
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

