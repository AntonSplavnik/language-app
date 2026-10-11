import { describe, expect, it } from "vitest";
import { countExtractCallsToday, type UsageRecord } from "../../src/ai/usage";
import { aiUsage, users } from "../../src/db/schema";
import { SINGLE_USER_ID } from "../../src/user";
import { first, useTestDb } from "../helpers/db";

const db = useTestDb();

// Local times: the daily limit resets at the server's local midnight.
const now = new Date(2026, 9, 11, 15, 0);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);

const row = (overrides: Partial<UsageRecord>): UsageRecord => ({
  userId: SINGLE_USER_ID,
  callType: "extract",
  model: "claude-opus-5-5",
  ok: true,
  ...overrides,
});

describe("countExtractCallsToday (§11.5)", () => {
  it("counts today's extract attempts, failed ones included", async () => {
    await db.insert(aiUsage).values([
      row({ createdAt: at(11, 0, 30) }),
      row({ createdAt: at(11, 14), ok: false }),
      row({ createdAt: at(10, 23, 59) }), // yesterday
      row({ createdAt: at(11, 9), callType: "enrich" }), // not a photo
    ]);
    expect(await countExtractCallsToday(db, SINGLE_USER_ID, now)).toBe(2);
  });

  it("counts only the given learner", async () => {
    const other = first(
      await db
        .insert(users)
        .values({ name: "Other", learnerLanguage: "en", targetLanguage: "de" })
        .returning({ id: users.id }),
    );
    await db.insert(aiUsage).values([row({ userId: other.id, createdAt: at(11, 10) })]);
    expect(await countExtractCallsToday(db, SINGLE_USER_ID, now)).toBe(0);
  });
});
