import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../db";
import { generatedDocuments, type GeneratedDocument } from "../db/schema";
import { NotFoundError } from "./errors";

export type DocumentType = "summary" | "document";

/**
 * Document service — persistence for AI-generated documents.
 *
 * Caching semantics: at most one row per (box_id, type). Regeneration
 * updates the existing row in place via upsert.
 */
export class DocumentService {
  constructor(private readonly db: Database) {}

  /**
   * Insert or update the cached document for a box + type.
   */
  async upsert(
    userId: number,
    boxId: number,
    type: DocumentType,
    title: string,
    content: string,
    model: string,
  ): Promise<GeneratedDocument> {
    const [existing] = await this.db
      .select({ id: generatedDocuments.id })
      .from(generatedDocuments)
      .where(
        and(
          eq(generatedDocuments.boxId, boxId),
          eq(generatedDocuments.type, type),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(generatedDocuments)
        .set({ title, content, model, updatedAt: new Date() })
        .where(eq(generatedDocuments.id, existing.id))
        .returning();
      if (!updated) {
        throw new Error("Failed to update generated document.");
      }
      return updated;
    }

    const [created] = await this.db
      .insert(generatedDocuments)
      .values({ userId, boxId, type, title, content, model })
      .returning();
    if (!created) {
      throw new Error("Failed to create generated document.");
    }
    return created;
  }

  /**
   * Find the cached document of a given type for a box (no ownership check).
   */
  async findCached(boxId: number, type: DocumentType): Promise<GeneratedDocument | null> {
    const [doc] = await this.db
      .select()
      .from(generatedDocuments)
      .where(
        and(
          eq(generatedDocuments.boxId, boxId),
          eq(generatedDocuments.type, type),
        ),
      )
      .limit(1);
    return doc ?? null;
  }

  /**
   * List all cached documents for a box, owned by the user.
   */
  async listForBox(userId: number, boxId: number): Promise<GeneratedDocument[]> {
    return this.db
      .select()
      .from(generatedDocuments)
      .where(
        and(
          eq(generatedDocuments.boxId, boxId),
          eq(generatedDocuments.userId, userId),
        ),
      )
      .orderBy(desc(generatedDocuments.updatedAt));
  }

  /**
   * Fetch a single document by id, scoped to the owning user.
   */
  async getOwned(userId: number, id: number): Promise<GeneratedDocument> {
    const [doc] = await this.db
      .select()
      .from(generatedDocuments)
      .where(
        and(
          eq(generatedDocuments.id, id),
          eq(generatedDocuments.userId, userId),
        ),
      )
      .limit(1);
    if (!doc) {
      throw new NotFoundError("Document not found.");
    }
    return doc;
  }
}