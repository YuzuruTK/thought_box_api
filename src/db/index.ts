import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../env";
import * as schema from "./schema";

/**
 * Create a Drizzle client bound to the D1 database.
 *
 * @param db - The D1 binding from the Worker environment.
 * @returns A typed Drizzle instance including the schema for relational queries.
 */
export function getDb(env: Env) {
  return drizzle(env.DB, { schema });
}

export type Database = ReturnType<typeof getDb>;