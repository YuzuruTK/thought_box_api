import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../db";
import {
  thoughts,
  thoughtTags,
  thoughtBoxes,
  tags,
  boxes,
  type Thought,
  type Tag,
  type Box,
} from "../db/schema";
import { NotFoundError } from "./errors";
import type { CreateThoughtInput, ListThoughtsQuery, UpdateThoughtInput } from "../schemas";

/** A thought together with its associated tags and boxes. */
export interface ThoughtWithRelations {
  thought: Thought;
  tags: Tag[];
  boxes: Box[];
}

/**
 * Thought service — user-scoped CRUD with tag/box associations.
 */
export class ThoughtService {
  constructor(private readonly db: Database) {}

  async create(userId: number, input: CreateThoughtInput): Promise<ThoughtWithRelations> {
    const tagIds = [...new Set(input.tagIds ?? [])];
    const boxIds = [...new Set(input.boxIds ?? [])];

    await this.assertTagsExist(tagIds);
    await this.assertBoxesOwned(userId, boxIds);

    const [created] = await this.db
      .insert(thoughts)
      .values({ userId, content: input.content })
      .returning();
    if (!created) {
      throw new Error("Failed to create thought.");
    }

    if (tagIds.length > 0) {
      await this.db
        .insert(thoughtTags)
        .values(tagIds.map((tagId) => ({ thoughtId: created.id, tagId })));
    }
    if (boxIds.length > 0) {
      await this.db
        .insert(thoughtBoxes)
        .values(boxIds.map((boxId) => ({ thoughtId: created.id, boxId })));
    }

    return {
      thought: created,
      tags: await this.listTagsFor(created.id),
      boxes: await this.listBoxesFor(created.id),
    };
  }

  async get(userId: number, id: number): Promise<ThoughtWithRelations> {
    const thought = await this.findOwned(userId, id);
    return {
      thought,
      tags: await this.listTagsFor(id),
      boxes: await this.listBoxesFor(id),
    };
  }

  async list(userId: number, query: ListThoughtsQuery): Promise<ThoughtWithRelations[]> {
    const conditions = [eq(thoughts.userId, userId)];
    if (query.tagId !== undefined) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM thought_tags tt WHERE tt.thought_id = ${thoughts.id} AND tt.tag_id = ${query.tagId})`,
      );
    }
    if (query.boxId !== undefined) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM thought_boxes tb WHERE tb.thought_id = ${thoughts.id} AND tb.box_id = ${query.boxId})`,
      );
    }

    const rows = await this.db
      .select()
      .from(thoughts)
      .where(and(...conditions))
      .orderBy(desc(thoughts.createdAt), desc(thoughts.id))
      .limit(query.limit)
      .offset(query.offset);

    return Promise.all(
      rows.map(async (thought) => ({
        thought,
        tags: await this.listTagsFor(thought.id),
        boxes: await this.listBoxesFor(thought.id),
      })),
    );
  }

  async update(userId: number, id: number, input: UpdateThoughtInput): Promise<ThoughtWithRelations> {
    const existing = await this.findOwned(userId, id);

    if (input.content !== undefined) {
      await this.db
        .update(thoughts)
        .set({ content: input.content, updatedAt: new Date() })
        .where(eq(thoughts.id, id));
    }

    if (input.tagIds !== undefined) {
      const tagIds = [...new Set(input.tagIds)];
      await this.assertTagsExist(tagIds);
      await this.db.delete(thoughtTags).where(eq(thoughtTags.thoughtId, id));
      if (tagIds.length > 0) {
        await this.db
          .insert(thoughtTags)
          .values(tagIds.map((tagId) => ({ thoughtId: id, tagId })));
      }
    }

    if (input.boxIds !== undefined) {
      const boxIds = [...new Set(input.boxIds)];
      await this.assertBoxesOwned(userId, boxIds);
      await this.db.delete(thoughtBoxes).where(eq(thoughtBoxes.thoughtId, id));
      if (boxIds.length > 0) {
        await this.db
          .insert(thoughtBoxes)
          .values(boxIds.map((boxId) => ({ thoughtId: id, boxId })));
      }
    }

    const [updated] = await this.db.select().from(thoughts).where(eq(thoughts.id, id)).limit(1);
    return {
      thought: updated ?? existing,
      tags: await this.listTagsFor(id),
      boxes: await this.listBoxesFor(id),
    };
  }

  async delete(userId: number, id: number): Promise<void> {
    await this.findOwned(userId, id);
    await this.db.delete(thoughts).where(eq(thoughts.id, id));
  }

  /** Load all thoughts belonging to a box (for AI generation). */
  async listForBox(boxId: number): Promise<Thought[]> {
    return this.db
      .select({
        id: thoughts.id,
        userId: thoughts.userId,
        content: thoughts.content,
        aiTitle: thoughts.aiTitle,
        aiSummary: thoughts.aiSummary,
        createdAt: thoughts.createdAt,
        updatedAt: thoughts.updatedAt,
      })
      .from(thoughtBoxes)
      .innerJoin(thoughts, eq(thoughtBoxes.thoughtId, thoughts.id))
      .where(eq(thoughtBoxes.boxId, boxId))
      .orderBy(thoughts.createdAt);
  }

  // ---- internals ----------------------------------------------------------

  private async findOwned(userId: number, id: number): Promise<Thought> {
    const [thought] = await this.db
      .select()
      .from(thoughts)
      .where(and(eq(thoughts.id, id), eq(thoughts.userId, userId)))
      .limit(1);
    if (!thought) {
      throw new NotFoundError("Thought not found.");
    }
    return thought;
  }

  private async listTagsFor(thoughtId: number): Promise<Tag[]> {
    return this.db
      .select({
        id: tags.id,
        name: tags.name,
      })
      .from(thoughtTags)
      .innerJoin(tags, eq(thoughtTags.tagId, tags.id))
      .where(eq(thoughtTags.thoughtId, thoughtId))
      .orderBy(tags.name);
  }

  private async listBoxesFor(thoughtId: number): Promise<Box[]> {
    return this.db
      .select({
        id: boxes.id,
        userId: boxes.userId,
        name: boxes.name,
        description: boxes.description,
        createdAt: boxes.createdAt,
      })
      .from(thoughtBoxes)
      .innerJoin(boxes, eq(thoughtBoxes.boxId, boxes.id))
      .where(eq(thoughtBoxes.thoughtId, thoughtId))
      .orderBy(boxes.name);
  }

  private async assertTagsExist(tagIds: number[]): Promise<void> {
    if (tagIds.length === 0) {
      return;
    }
    const rows = await this.db
      .select({ id: tags.id })
      .from(tags)
      .where(inArray(tags.id, tagIds));
    const found = new Set(rows.map((row) => row.id));
    const missing = tagIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new NotFoundError(`Tag(s) not found: ${missing.join(", ")}.`);
    }
  }

  private async assertBoxesOwned(userId: number, boxIds: number[]): Promise<void> {
    if (boxIds.length === 0) {
      return;
    }
    const rows = await this.db
      .select({ id: boxes.id })
      .from(boxes)
      .where(and(eq(boxes.userId, userId), inArray(boxes.id, boxIds)));
    const found = new Set(rows.map((row) => row.id));
    const missing = boxIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new NotFoundError(`Box(es) not found: ${missing.join(", ")}.`);
    }
  }
}