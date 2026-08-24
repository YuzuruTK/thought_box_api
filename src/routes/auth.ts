import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db";
import { UserService } from "../services/userService";
import { signJwt } from "../auth/jwt";
import { loginSchema, registerSchema } from "../schemas";
import { ConflictError, UnauthorizedError } from "../services/errors";
import type { Env } from "../env";

const auth = new Hono<{ Bindings: Env }>();

auth.post("/register", zValidator("json", registerSchema), async (c) => {
  const input = c.req.valid("json");
  const service = new UserService(getDb(c.env));
  try {
    const user = await service.register(input);
    return c.json(
      { id: user.id, email: user.email, createdAt: user.createdAt },
      201,
    );
  } catch (error) {
    if (error instanceof ConflictError) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }
});

auth.post("/login", zValidator("json", loginSchema), async (c) => {
  const input = c.req.valid("json");
  const service = new UserService(getDb(c.env));
  try {
    const user = await service.verifyCredentials(input.email, input.password);
    const token = await signJwt(c.env.JWT_SECRET, user.id);
    return c.json({ token, tokenType: "Bearer", userId: user.id });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return c.json({ error: error.message }, 401);
    }
    throw error;
  }
});

export default auth;