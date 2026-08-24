import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db";
import { BoxService } from "../services/boxService";
import { DocumentService } from "../services/documentService";
import { AiGenerator } from "../services/ai/generator";
import { AiProviderError, AiTimeoutError } from "../services/ai/openrouter";
import { requireAuth, type AppVariables } from "../auth/middleware";
import { createBoxSchema } from "../schemas";
import { NotFoundError, ValidationError } from "../services/errors";
import type { Env } from "../env";
import type { GeneratedDocument } from "../db/schema";

const boxes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

boxes.use("*", requireAuth);

/** Parse and validate an id path parameter. */
function parseId(value: string | undefined): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Serialize a generated document into an API response shape. */
function serializeDocument(doc: GeneratedDocument) {
  return {
    id: doc.id,
    boxId: doc.boxId,
    type: doc.type,
    title: doc.title,
    content: doc.content,
    model: doc.model,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Map AI/domain errors to HTTP responses for generation endpoints. */
function handleGenerationError(
  c: { json: (body: unknown, status: number) => Response },
  error: unknown,
): Response {
  if (error instanceof NotFoundError) {
    return c.json({ error: error.message }, 404);
  }
  if (error instanceof ValidationError) {
    return c.json({ error: error.message }, 400);
  }
  if (error instanceof AiTimeoutError) {
    return c.json({ error: error.message }, 504);
  }
  if (error instanceof AiProviderError) {
    return c.json({ error: error.message }, 502);
  }
  throw error;
}

boxes.post("/", zValidator("json", createBoxSchema), async (c) => {
  const userId = c.get("userId");
  const input = c.req.valid("json");
  const service = new BoxService(getDb(c.env));
  const box = await service.create(userId, input);
  return c.json(
    {
      id: box.id,
      name: box.name,
      description: box.description,
      createdAt: box.createdAt,
    },
    201,
  );
});

boxes.get("/", async (c) => {
  const userId = c.get("userId");
  const service = new BoxService(getDb(c.env));
  const all = await service.list(userId);
  return c.json({
    boxes: all.map((box) => ({
      id: box.id,
      name: box.name,
      description: box.description,
      createdAt: box.createdAt,
    })),
  });
});

boxes.post("/:id/generate-summary", async (c) => {
  const userId = c.get("userId");
  const id = parseId(c.req.param("id"));
  if (id === null) {
    return c.json({ error: "Invalid box id." }, 400);
  }
  try {
    const generator = new AiGenerator(c.env);
    const doc = await generator.generateSummary(userId, id);
    return c.json(serializeDocument(doc), 201);
  } catch (error) {
    return handleGenerationError(c, error);
  }
});

boxes.post("/:id/generate-document", async (c) => {
  const userId = c.get("userId");
  const id = parseId(c.req.param("id"));
  if (id === null) {
    return c.json({ error: "Invalid box id." }, 400);
  }
  try {
    const generator = new AiGenerator(c.env);
    const doc = await generator.generateDocument(userId, id);
    return c.json(serializeDocument(doc), 201);
  } catch (error) {
    return handleGenerationError(c, error);
  }
});

boxes.get("/:id/documents", async (c) => {
  const userId = c.get("userId");
  const id = parseId(c.req.param("id"));
  if (id === null) {
    return c.json({ error: "Invalid box id." }, 400);
  }
  try {
    // Verify the box exists and is owned by the user.
    const boxService = new BoxService(getDb(c.env));
    await boxService.getOwned(userId, id);

    const documentService = new DocumentService(getDb(c.env));
    const docs = await documentService.listForBox(userId, id);
    return c.json({ documents: docs.map(serializeDocument) });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    throw error;
  }
});

export default boxes;