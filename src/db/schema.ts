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

export const thoughts = sqliteTable("thoughts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  aiTitle: text("ai_title"),
  aiSummary: text("ai_summary"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (table) => [index("thoughts_user_id_idx").on(table.userId)]);

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
}, (table) => [uniqueIndex("tags_name_unique").on(table.name)]);

export const boxes = sqliteTable("boxes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (table) => [index("boxes_user_id_idx").on(table.userId)]);

export const thoughtTags = sqliteTable("thought_tags", {
  thoughtId: integer("thought_id").notNull().references(() => thoughts.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (table) => [primaryKey({ columns: [table.thoughtId, table.tagId] }), index("thought_tags_tag_id_idx").on(table.tagId)]);

export const thoughtBoxes = sqliteTable("thought_boxes", {
  thoughtId: integer("thought_id").notNull().references(() => thoughts.id, { onDelete: "cascade" }),
  boxId: integer("box_id").notNull().references(() => boxes.id, { onDelete: "cascade" }),
}, (table) => [primaryKey({ columns: [table.thoughtId, table.boxId] }), index("thought_boxes_box_id_idx").on(table.boxId)]);

export const generatedDocuments = sqliteTable("generated_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  boxId: integer("box_id").notNull().references(() => boxes.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  generationProvider: text("generation_provider"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  model: text("model").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (table) => [uniqueIndex("generated_documents_box_type_unique").on(table.boxId, table.type)]);

export const userSettings = sqliteTable("user_settings", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  aiProvider: text("ai_provider").notNull().default("platform"),
  encryptedApiKey: text("encrypted_api_key"),
  apiKeyIv: text("api_key_iv"),
  apiKeyVersion: integer("api_key_version"),
  apiKeyHint: text("api_key_hint"),
  apiKeyStatus: text("api_key_status"),
  apiKeyVerifiedAt: integer("api_key_verified_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (table) => [index("user_settings_user_id_idx").on(table.userId)]);

/**
 * AI generation usage events. Token counts are estimates until the provider
 * response exposes native usage metadata; keeping the flag explicit prevents
 * downstream analytics from treating estimates as billing-grade measurements.
 */
export const aiUsage = sqliteTable("ai_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  generationType: text("generation_type").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  status: text("status").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  tokensEstimated: integer("tokens_estimated", { mode: "boolean" }).notNull().default(true),
  errorStatus: integer("error_status"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (table) => [
  index("ai_usage_user_id_idx").on(table.userId),
  index("ai_usage_created_at_idx").on(table.createdAt),
  index("ai_usage_provider_idx").on(table.provider),
  index("ai_usage_generation_type_idx").on(table.generationType),
]);

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
