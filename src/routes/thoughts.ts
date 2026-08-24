import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db";
import { ThoughtService, type ThoughtWithRelations } from "../services/thoughtService";
import { requireAuth, type AppVariables } from "../auth/middleware";
import {
  createThoughtSchema,
  updateThoughtSchema,
  listThoughtsQuerySchema,
} from "../schemas";
import { NotFoundError } from "../services/errors";
import type { Env } from "../env";

const thoughts = new Hono<{ Bindings: Env; Variables: AppVariables }>();

thoughts.use("*", requireAuth);

/** Serialize a thought with its relations into an API response shape. */
function serializeThought({ thought, tags, boxes }: ThoughtWithRelations) {
  return {
    id: thought.id,
    content: thought.content,
    aiTitle: thought.aiTitle,
    aiSummary: thought.aiSummary,
    tags: tags.map((tag) => ({ id: tag.id, name: tag.name })),
    boxes: boxes.map((box) => ({
      id: box.id,
      name: box.name,
      description: box.description,
    })),
    createdAt: thought.createdAt,
    updatedAt: thought.updatedAt,
  };
}

thoughts.post("/", zValidator("json", createThoughtSchema), async (c) => {
  const userId = c.get("userId");
  const input = c.req.valid("json");
  const service = new ThoughtService(getDb(c.env));
  try {
    const result = await service.create(userId, input);
    return c.json(serializeThought(result), 201);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    throw error;
  }
});

thoughts.get("/", zValidator("query", listThoughtsQuerySchema), async (c) => {
  const userId = c.get("userId");
  const query = c.req.valid("query");
  const service = new ThoughtService(getDb(c.env));
  const results = await service.list(userId, query);
  return c.json({ thoughts: results.map(serializeThought) });
});

thoughts.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Invalid thought id." }, 400);
  }
  const service = new ThoughtService(getDb(c.env));
  try {
    const result = await service.get(userId, id);
    return c.json(serializeThought(result));
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    throw error;
  }
});

thoughts.patch("/:id", zValidator("json", updateThoughtSchema), async (c) => {
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Invalid thought id." }, 400);
  }
  const input = c.req.valid("json");
  const service = new ThoughtService(getDb(c.env));
  try {
    const result = await service.update(userId, id, input);
    return c.json(serializeThought(result));
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    throw error;
  }
});

thoughts.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Invalid thought id." }, 400);
  }
  const service = new ThoughtService(getDb(c.env));
  try {
    await service.delete(userId, id);
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    throw error;
  }
});

export default thoughts;