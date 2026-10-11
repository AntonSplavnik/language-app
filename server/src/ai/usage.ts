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

/** Extract attempts since local midnight, for the daily photo limit (§11.5). */
export async function countExtractCallsToday(
  db: Db,
  userId: number,
  now: Date = new Date(),
): Promise<number> {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [row] = await db
    .select({ count: count() })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, userId),
        eq(aiUsage.callType, "extract"),
        gte(aiUsage.createdAt, startOfDay),
      ),
    );
  return row?.count ?? 0;
}
