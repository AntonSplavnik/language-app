import type { AiCallType } from "@language-app/core";
import { and, count, eq, gte } from "drizzle-orm";
import type { Db } from "../db/client";
import { aiUsage } from "../db/schema";

/** One row of `ai_usage`: a single API attempt, successful or not. */
export type UsageRecord = typeof aiUsage.$inferInsert;

export type UsageSink = (record: UsageRecord) => Promise<void>;

export function dbUsageSink(db: Db): UsageSink {
  return async (record) => {
    await db.insert(aiUsage).values(record);
  };
}

/**
 * Attempts of one call type since local midnight, failed ones included, for the daily limits
 * (§11.5): `extract` for photos, `describe` for Ask AI.
 */
export async function countCallsToday(
  db: Db,
  userId: number,
  callType: AiCallType,
  now: Date = new Date(),
): Promise<number> {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [row] = await db
    .select({ count: count() })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, userId),
        eq(aiUsage.callType, callType),
        gte(aiUsage.createdAt, startOfDay),
      ),
    );
  return row?.count ?? 0;
}
