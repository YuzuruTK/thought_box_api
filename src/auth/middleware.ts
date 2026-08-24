import type { Context, Next } from "hono";
import { verifyJwt } from "./jwt";
import type { Env } from "../env";

/**
 * Variables injected into the Hono context by middleware.
 */
export interface AppVariables {
  userId: number;
}

export type AppContext = Context<{ Bindings: Env; Variables: AppVariables }>;

/**
 * Bearer-token authentication middleware.
 *
 * Expects `Authorization: Bearer <jwt>`; on success sets `userId` in the
 * context. Responds 401 for missing/invalid/expired tokens.
 */
export async function requireAuth(c: AppContext, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or malformed Authorization header." }, 401);
  }
  const token = authHeader.slice("Bearer ".length).trim();
  const payload = await verifyJwt(c.env.JWT_SECRET, token);
  if (!payload) {
    return c.json({ error: "Invalid or expired token." }, 401);
  }
  c.set("userId", payload.sub);
  await next();
}