import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../db";
import { generatedDocuments, type GeneratedDocument } from "../db/schema";
import { NotFoundError } from "./errors";
import type { AiProviderKind } from "./ai/providers";

export type DocumentType = "summary" | "document";

export class DocumentService {
  constructor(private readonly db: Database) {}

  async upsert(userId: number, boxId: number, type: DocumentType, title: string, content: string, model: string, generationProvider?: AiProviderKind): Promise<GeneratedDocument> {
    const [existing] = await this.db.select({ id: generatedDocuments.id }).from(generatedDocuments).where(and(eq(generatedDocuments.boxId, boxId), eq(generatedDocuments.type, type))).limit(1);
    if (existing) {
      const [updated] = await this.db.update(generatedDocuments).set({ title, content, model, generationProvider, updatedAt: new Date() }).where(eq(generatedDocuments.id, existing.id)).returning();
      if (!updated) throw new Error("Failed to update generated document.");
      return updated;
    }
    const [created] = await this.db.insert(generatedDocuments).values({ userId, boxId, type, title, content, model, generationProvider }).returning();
    if (!created) throw new Error("Failed to create generated document.");
    return created;
  }

  async findLatestForBox(boxId: number): Promise<GeneratedDocument | null> {
    const [doc] = await this.db.select().from(generatedDocuments).where(eq(generatedDocuments.boxId, boxId)).orderBy(desc(generatedDocuments.updatedAt)).limit(1);
    return doc ?? null;
  }
  async findCached(boxId: number, type: DocumentType): Promise<GeneratedDocument | null> {
    const [doc] = await this.db.select().from(generatedDocuments).where(and(eq(generatedDocuments.boxId, boxId), eq(generatedDocuments.type, type))).limit(1);
    return doc ?? null;
  }
  async listForBox(userId: number, boxId: number): Promise<GeneratedDocument[]> {
    return this.db.select().from(generatedDocuments).where(and(eq(generatedDocuments.boxId, boxId), eq(generatedDocuments.userId, userId))).orderBy(desc(generatedDocuments.updatedAt));
  }
  async getOwned(userId: number, id: number): Promise<GeneratedDocument> {
    const [doc] = await this.db.select().from(generatedDocuments).where(and(eq(generatedDocuments.id, id), eq(generatedDocuments.userId, userId))).limit(1);
    if (!doc) throw new NotFoundError("Document not found.");
    return doc;
  }
}
