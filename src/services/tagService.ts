import { asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../db";
import { tags, type Tag } from "../db/schema";
import { ConflictError } from "./errors";
import type { CreateTagInput } from "../schemas";

/**
 * Tag service — creation and listing of tags.
 */
export class TagService {
  constructor(private readonly db: Database) {}

  async create(input: CreateTagInput): Promise<Tag> {
    const existing = await this.db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.name, input.name))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictError(`Tag '${input.name}' already exists.`);
    }
    const [created] = await this.db.insert(tags).values({ name: input.name }).returning();
    if (!created) {
      throw new Error("Failed to create tag.");
    }
    return created;
  }

  async list(): Promise<Tag[]> {
    return this.db.select().from(tags).orderBy(asc(tags.name));
  }

  /** Returns the ids that exist among `ids` (used to validate references). */
  async filterExistingIds(ids: number[]): Promise<Set<number>> {
    if (ids.length === 0) {
      return new Set();
    }
    const rows = await this.db.select({ id: tags.id }).from(tags).where(inArray(tags.id, ids));
    return new Set(rows.map((row) => row.id));
  }
}
