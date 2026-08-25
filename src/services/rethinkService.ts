import { eq, sql } from "drizzle-orm";
import type { Env } from "../env";
import { getDb, type Database } from "../db";
import { boxes, thoughts, thoughtBoxes, generatedDocuments } from "../db/schema";
import { AiGenerator } from "./ai/generator";

/** Maximum number of boxes rethought per cron run (bounds hourly cost). */
const MAX_BOXES_PER_RUN = 50;

/** Skip boxes regenerated within the last 20 minutes (quiet period). */
const QUIET_PERIOD_MS = 20 * 60 * 1_000;

interface StaleBox {
  id: number;
  userId: number;
}

/**
 * Rethink service — the hourly cron that refreshes box syntheses.
 *
 * A box qualifies when ALL of the following hold:
 *  - it has thoughts,
 *  - the most recent thought activity is newer than the last regeneration
 *    of ANY kind (summary or document — unified synthesis writes both),
 *  - it hasn't been regenerated in the last 20 minutes (quiet period).
 */
export class RethinkService {
  private readonly db: Database;
  private readonly generator: AiGenerator;

  constructor(env: Env) {
    this.db = getDb(env);
    this.generator = new AiGenerator(env);
  }

  /** Boxes that need a fresh synthesis (stale AND past the quiet period). */
  async findStaleBoxes(): Promise<StaleBox[]> {
    return this.db
      .select({ id: boxes.id, userId: boxes.userId })
      .from(boxes)
      .innerJoin(thoughtBoxes, eq(thoughtBoxes.boxId, boxes.id))
      .innerJoin(thoughts, eq(thoughtBoxes.thoughtId, thoughts.id))
      .groupBy(boxes.id, boxes.userId)
      .having(
        sql`coalesce(max(${thoughts.updatedAt}), 0) >
              coalesce(
                (select max(gd.updated_at) from ${generatedDocuments} gd
                 where gd.box_id = ${boxes.id}),
                0
              )
              AND
              coalesce(
                (select max(gd.updated_at) from ${generatedDocuments} gd
                 where gd.box_id = ${boxes.id}),
                0
              ) < ${Date.now()} - ${QUIET_PERIOD_MS}`,
      )
      .orderBy(sql`max(${thoughts.updatedAt}) desc`)
      .limit(MAX_BOXES_PER_RUN);
  }

  /**
   * Synthesize every stale box (blended resume + document). Failures are
   * isolated per box so one failing model call doesn't stop the rest.
   */
  async run(): Promise<{ processed: number; failed: number }> {
    const stale = await this.findStaleBoxes();
    let processed = 0;
    let failed = 0;

    for (const box of stale) {
      try {
        await this.generator.synthesize(box.userId, box.id);
        processed++;
      } catch (error) {
        failed++;
        console.error(`[rethink] failed to synthesize box ${box.id}:`, error);
      }
    }

    return { processed, failed };
  }
}