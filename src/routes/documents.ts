import { Hono } from "hono";
import { getDb } from "../db";
import { DocumentService } from "../services/documentService";
import { requireAuth, type AppVariables } from "../auth/middleware";
import { NotFoundError } from "../services/errors";
import type { Env } from "../env";

const documents = new Hono<{ Bindings: Env; Variables: AppVariables }>();

documents.use("*", requireAuth);

documents.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Invalid document id." }, 400);
  }
  const service = new DocumentService(getDb(c.env));
  try {
    const doc = await service.getOwned(userId, id);
    return c.json({
      id: doc.id,
      boxId: doc.boxId,
      type: doc.type,
      title: doc.title,
      content: doc.content,
      model: doc.model,
      /** Raw JSON string of synthesis metadata ({coreTheme, confidence, questions}) or null. */
      metadata: doc.metadata,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    throw error;
  }
});

export default documents;