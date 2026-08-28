import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Users — foundation for multi-user support.
 * Authentication is JWT-based (register/login); password_hash stores
 * PBKDF2-SHA256 hashes (salt embedded, see src/auth/password.ts).
 */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
}, (table) => [
  uniqueIndex("users_email_unique").on(table.email),
]);

/**
 * Thoughts — the core unit of the second brain.
 * `aiTitle` / `aiSummary` are nullable placeholders for future AI features.
 */
export const thoughts = sqliteTable("thoughts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  aiTitle: text("ai_title"),
  aiSummary: text("ai_summary"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
}, (table) => [
  index("thoughts_user_id_idx").on(table.userId),
]);

/**
 * Tags — cross-cutting topics. Global (not per-user) for now,
 * matching the target data model (`tags: id, name`).
 */
export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
}, (table) => [
  uniqueIndex("tags_name_unique").on(table.name),
]);

/**
 * Boxes — user-scoped containers for thoughts (e.g. "Protein TCC").
 */
export const boxes = sqliteTable("boxes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
}, (table) => [
  index("boxes_user_id_idx").on(table.userId),
]);

/** thought_tags — many-to-many between thoughts and tags. */
export const thoughtTags = sqliteTable("thought_tags", {
  thoughtId: integer("thought_id")
    .notNull()
    .references(() => thoughts.id, { onDelete: "cascade" }),
  tagId: integer("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.thoughtId, table.tagId] }),
  index("thought_tags_tag_id_idx").on(table.tagId),
]);

/** thought_boxes — many-to-many between thoughts and boxes. */
export const thoughtBoxes = sqliteTable("thought_boxes", {
  thoughtId: integer("thought_id")
    .notNull()
    .references(() => thoughts.id, { onDelete: "cascade" }),
  boxId: integer("box_id")
    .notNull()
    .references(() => boxes.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.thoughtId, table.boxId] }),
  index("thought_boxes_box_id_idx").on(table.boxId),
]);

/**
 * generated_documents — AI-generated summaries and documents, cached per box.
 * At most one row per (box_id, type): regeneration updates in place.
 */
export const generatedDocuments = sqliteTable("generated_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  boxId: integer("box_id")
    .notNull()
    .references(() => boxes.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** 'summary' | 'document' */
  type: text("type").notNull(),
  /**
   * JSON-encoded synthesis metadata ({ coreTheme, confidence, questions })
   * attached to the 'summary' row. Null for legacy rows and when metadata
   * parsing failed — the UI must handle its absence gracefully.
   */
  metadata: text("metadata"),
  /** Which provider generated this doc: 'platform' | 'byok' | 'workers-ai' (provenance metadata). */
  generationProvider: text("generation_provider"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  model: text("model").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
}, (table) => [
  uniqueIndex("generated_documents_box_type_unique").on(table.boxId, table.type),
]);

// ---------------------------------------------------------------------------
// Users settings — BYOK configuration (Issue #1)
// ---------------------------------------------------------------------------

/**
 * user_settings — per-user AI configuration (Bring Your Own OpenRouter Key).
 *
 * API keys are stored envelope-encrypted (AES-256-GCM) with a master key held
 * as a Worker secret (`BYOK_KEK`). Plaintext keys never touch the database.
 */
export const userSettings = sqliteTable("user_settings", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Which provider generations run on: 'platform' | 'byok'. */
  aiProvider: text("ai_provider").notNull().default("platform"),
  /** AES-256-GCM ciphertext of the user's OpenRouter key (base64). */
  encryptedApiKey: text("encrypted_api_key"),
  /** 12-byte random IV used for encryption (base64). */
  apiKeyIv: text("api_key_iv"),
  /** Master-key version used to encrypt (enables future rotation). */
  apiKeyVersion: integer("api_key_version"),
  /** Masked, non-secret hint, e.g. 'sk-or-v1-…91cd'. */
  apiKeyHint: text("api_key_hint"),
  /** 'valid' | 'invalid' | 'revoked'. */
  apiKeyStatus: text("api_key_status"),
  apiKeyVerifiedAt: integer("api_key_verified_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
}, (table) => [
  index("user_settings_user_id_idx").on(table.userId),
]);

/**
 * AI generation usage events. Token counts are estimates until provider
 * usage metadata is exposed by the current client; this keeps analytics
 * explicitly separate from billing-grade measurements.
 */
export const aiUsage = sqliteTable("ai_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** 'summary' | 'document' | 'synthesis'. */
  generationType: text("generation_type").notNull(),
  /** 'platform' | 'byok' | 'workers-ai' | 'unknown'. */
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  /** 'success' | 'failed'. */
  status: text("status").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  tokensEstimated: integer("tokens_estimated", { mode: "boolean" }).notNull().default(true),
  errorStatus: integer("error_status"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
}, (table) => [
  index("ai_usage_user_id_idx").on(table.userId),
  index("ai_usage_created_at_idx").on(table.createdAt),
  index("ai_usage_provider_idx").on(table.provider),
  index("ai_usage_generation_type_idx").on(table.generationType),
]);

// ---- Inferred types -------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Thought = typeof thoughts.$inferSelect;
export type NewThought = typeof thoughts.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type Box = typeof boxes.$inferSelect;
export type NewBox = typeof boxes.$inferInsert;
export type GeneratedDocument = typeof generatedDocuments.$inferSelect;
export type NewGeneratedDocument = typeof generatedDocuments.$inferInsert;
export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
export type AiUsage = typeof aiUsage.$inferSelect;
export type NewAiUsage = typeof aiUsage.$inferInsert;
