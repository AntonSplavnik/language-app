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

/** Which day it is for the daily limits: `now` in the app's zone (APP_TIME_ZONE, §11.5). */
export type Today = { now: Date; timeZone: string };

/** What the daily limits need from the app: its zone, and a clock (tests set one). */
export type DayDeps = { timeZone: string; now?: () => Date };

export const today = ({ timeZone, now }: DayDeps): Today => ({
  now: now ? now() : new Date(),
  timeZone,
});

/**
 * Attempts of one call type since midnight in the app's zone, failed ones included, for the daily
 * limits (§11.5): `extract` for photos, `describe` for Ask AI.
 */
export async function countCallsToday(
  db: Db,
  userId: number,
  callType: AiCallType,
  { now, timeZone }: Today,
): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, userId),
        eq(aiUsage.callType, callType),
        gte(aiUsage.createdAt, startOfDay(now, timeZone)),
      ),
    );
  return row?.count ?? 0;
}

/**
 * The moment the day of `now` began in `timeZone`: its midnight there, whatever zone the process
 * runs in. Summer time is taken from the zone's rules, so in Berlin the day starts at 22:00 UTC in
 * summer and 23:00 UTC in winter. (Where a clock change skips midnight itself, the day starts at
 * the first moment after the gap.)
 */
export function startOfDay(now: Date, timeZone: string): Date {
  const { year, month, day } = partsIn(now, timeZone);
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  // Midnight there is midnight-as-UTC minus the zone's offset at that moment. The offset is taken
  // first at a guess, then again at the moment found, in case summer time began or ended between.
  const guess = midnightAsUtc - offsetAt(new Date(midnightAsUtc), timeZone);
  return new Date(midnightAsUtc - offsetAt(new Date(guess), timeZone));
}

/** How far the zone's clock is ahead of UTC at that moment, in milliseconds. */
function offsetAt(moment: Date, timeZone: string): number {
  const p = partsIn(moment, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (moment.getTime() - moment.getMilliseconds());
}

const formats = new Map<string, Intl.DateTimeFormat>();

/** The calendar date and wall-clock time of a moment in a zone. */
function partsIn(moment: Date, timeZone: string) {
  let format = formats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formats.set(timeZone, format);
  }
  const parts = format.formatToParts(moment);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}
