import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../db";
import { boxes, type Box } from "../db/schema";
import { NotFoundError } from "./errors";
import type { CreateBoxInput } from "../schemas";

/**
 * Box service — user-scoped box creation and listing.
 */
export class BoxService {
  constructor(private readonly db: Database) {}

  async create(userId: number, input: CreateBoxInput): Promise<Box> {
    const [created] = await this.db
      .insert(boxes)
      .values({
        userId,
        name: input.name,
        description: input.description ?? null,
      })
      .returning();
    if (!created) {
      throw new Error("Failed to create box.");
    }
    return created;
  }

  async list(userId: number): Promise<Box[]> {
    return this.db
      .select()
      .from(boxes)
      .where(eq(boxes.userId, userId))
      .orderBy(asc(boxes.name));
  }

  /** Fetch a box owned by the user, or throw NotFoundError. */
  async getOwned(userId: number, boxId: number): Promise<Box> {
    const [box] = await this.db
      .select()
      .from(boxes)
      .where(and(eq(boxes.id, boxId), eq(boxes.userId, userId)))
      .limit(1);
    if (!box) {
      throw new NotFoundError("Box not found.");
    }
    return box;
  }

  /** Returns the ids among `ids` that belong to `userId`. */
  async filterOwnedIds(userId: number, ids: number[]): Promise<Set<number>> {
    if (ids.length === 0) {
      return new Set();
    }
    const rows = await this.db
      .select({ id: boxes.id })
      .from(boxes)
      .where(and(eq(boxes.userId, userId), inArray(boxes.id, ids)));
    return new Set(rows.map((row) => row.id));
  }
}
