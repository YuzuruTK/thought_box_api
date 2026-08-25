import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../db";
import { boxes, thoughts, thoughtBoxes, type Box } from "../db/schema";
import { NotFoundError } from "./errors";
import type { CreateBoxInput } from "../schemas";

/** A box enriched with grid-card stats (computed in SQL, no extra queries). */
export interface BoxWithStats extends Box {
  /** Number of thoughts linked to the box. */
  thoughtCount: number;
  /** Most recent thought activity in the box (ms epoch), or null if empty. */
  lastActivityAt: number | null;
  /** Brief plain-text resume of the cached AI summary, or null if none. */
  summaryPreview: string | null;
}

/**
 * Reduce a summary snippet to a clean plain-text resume for grid cards.
 * Handles stale structured summaries too (drops headings, strips markdown).
 * Returns null when nothing usable remains.
 */
function toResume(snippet: string | null): string | null {
  if (!snippet) return null;
  const text = snippet
    .split("\n")
    .filter((line) => !line.trim().startsWith("#")) // drop title/section headings
    .join(" ")
    .replace(/\*\*([^*]*)\*\*/g, "$1") // **bold**
    .replace(/\*([^*]*)\*/g, "$1") // *italic*
    .replace(/^[-*]\s+/gm, "") // bullet markers
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length === 0) return null;
  if (text.length <= 140) return text;
  const cut = text.slice(0, 140);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

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

  async list(userId: number): Promise<BoxWithStats[]> {
    const rows = await this.db
      .select({
        id: boxes.id,
        userId: boxes.userId,
        name: boxes.name,
        description: boxes.description,
        createdAt: boxes.createdAt,
        thoughtCount: sql<number>`count(distinct ${thoughts.id})`,
        lastActivityAt: sql<number | null>`max(${thoughts.updatedAt})`,
        // UNIQUE(box_id, type) guarantees at most one summary per box, so this
        // correlated subquery is 1:1-safe and never ships full documents.
        summarySnippet: sql<string | null>`(
          select substr(gd.content, 1, 400)
          from generated_documents gd
          where gd.box_id = ${boxes.id} and gd.type = 'summary'
        )`,
      })
      .from(boxes)
      .leftJoin(thoughtBoxes, eq(thoughtBoxes.boxId, boxes.id))
      .leftJoin(thoughts, eq(thoughtBoxes.thoughtId, thoughts.id))
      .where(eq(boxes.userId, userId))
      .groupBy(boxes.id)
      .orderBy(asc(boxes.name));

    return rows.map((row) => ({
      ...row,
      summaryPreview: toResume(row.summarySnippet),
    }));
  }

  /** Delete a box owned by the user, or throw NotFoundError. Cascades via FKs. */
  async delete(userId: number, boxId: number): Promise<void> {
    await this.getOwned(userId, boxId);
    await this.db.delete(boxes).where(and(eq(boxes.id, boxId), eq(boxes.userId, userId)));
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
