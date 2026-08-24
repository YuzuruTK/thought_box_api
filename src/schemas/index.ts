import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const idSchema = z.number().int().positive();

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("A valid email address is required.")
  .max(255, "Email must be at most 255 characters.");

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.");

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(100, "Name must be at most 100 characters.");

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Thoughts
// ---------------------------------------------------------------------------

export const createThoughtSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Content must not be empty.")
    .max(10_000, "Content must be at most 10,000 characters."),
  tagIds: z.array(idSchema).max(50, "At most 50 tags per thought.").optional(),
  boxIds: z.array(idSchema).max(50, "At most 50 boxes per thought.").optional(),
});

export const updateThoughtSchema = z
  .object({
    content: z.string().trim().min(1).max(10_000).optional(),
    tagIds: z.array(idSchema).max(50).optional(),
    boxIds: z.array(idSchema).max(50).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const listThoughtsQuerySchema = z.object({
  // Query params arrive as strings; coerce before validating.
  tagId: z.coerce.number().int().positive().optional(),
  boxId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateThoughtInput = z.infer<typeof createThoughtSchema>;
export type UpdateThoughtInput = z.infer<typeof updateThoughtSchema>;
export type ListThoughtsQuery = z.infer<typeof listThoughtsQuerySchema>;

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export const createTagSchema = z.object({
  name: nameSchema,
});

export type CreateTagInput = z.infer<typeof createTagSchema>;

// ---------------------------------------------------------------------------
// Boxes
// ---------------------------------------------------------------------------

export const createBoxSchema = z.object({
  name: nameSchema,
  description: z
    .string()
    .trim()
    .max(2_000, "Description must be at most 2,000 characters.")
    .optional(),
});

export type CreateBoxInput = z.infer<typeof createBoxSchema>;