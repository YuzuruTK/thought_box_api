import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db";
import { TagService } from "../services/tagService";
import { requireAuth, type AppVariables } from "../auth/middleware";
import { createTagSchema } from "../schemas";
import { ConflictError } from "../services/errors";
import type { Env } from "../env";

const tags = new Hono<{ Bindings: Env; Variables: AppVariables }>();

tags.use("*", requireAuth);

tags.post("/", zValidator("json", createTagSchema), async (c) => {
  const input = c.req.valid("json");
  const service = new TagService(getDb(c.env));
  try {
    const tag = await service.create(input);
    return c.json({ id: tag.id, name: tag.name }, 201);
  } catch (error) {
    if (error instanceof ConflictError) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }
});

tags.get("/", async (c) => {
  const service = new TagService(getDb(c.env));
  const all = await service.list();
  return c.json({ tags: all.map((tag) => ({ id: tag.id, name: tag.name })) });
});

export default tags;