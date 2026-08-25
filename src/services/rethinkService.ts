import { eq, sql } from "drizzle-orm";
import type { Env } from "../env";
import { getDb, type Database } from "../db";
import { boxes, thoughts, thoughtBoxes, generatedDocuments } from "../db/schema";
import { AiGenerator } from "./ai/generator";

/** Maximum number of boxes rethought per cron run (bounds hourly cost). */
const MAX_BOXES_PER_RUN = 50;

interface StaleBox {
  id: number;
  userId: number;
}

/**
 * Rethink service — the hourly cron that refreshes summaries.
 *
 * Only boxes whose thoughts changed since the last summary are processed:
 *  - no cached summary yet, or
 *  - the most recent thought activity is newer than the summary.
 */
export class RethinkService {
  private readonly db: Database;
  private readonly generator: AiGenerator;

  constructor(env: Env) {
    this.db = getDb(env);
    this.generator = new AiGenerator(env);
  }

  /** Boxes whose distilled summary is stale (missing or older than a thought). */
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
            (select gd.updated_at from ${generatedDocuments} gd
             where gd.box_id = ${boxes.id} and gd.type = 'summary'),
            0
          )`,
      )
      .orderBy(sql`max(${thoughts.updatedAt}) desc`)
      .limit(MAX_BOXES_PER_RUN);
  }

  /**
   * Refresh every stale box summary. Failures are isolated per box so one
   * failing model call doesn't stop the rest.
   */
  async run(): Promise<{ processed: number; failed: number }> {
    const stale = await this.findStaleBoxes();
    let processed = 0;
    let failed = 0;

    for (const box of stale) {
      try {
        await this.generator.generateSummary(box.userId, box.id);
        processed++;
      } catch (error) {
        failed++;
        console.error(`[rethink] failed to distill box ${box.id}:`, error);
      }
    }

    return { processed, failed };
  }
}