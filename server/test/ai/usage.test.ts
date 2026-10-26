import { describe, expect, it } from "vitest";
import { countCallsToday, type UsageRecord } from "../../src/ai/usage";
import { aiUsage, users } from "../../src/db/schema";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";

const db = useTestDb();

// Local times: the daily limit resets at the server's local midnight.
const now = new Date(2026, 9, 11, 15, 0);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);

const row = (overrides: Partial<UsageRecord>): UsageRecord => ({
  userId: LEARNER_ID,
  callType: "extract",
  model: "claude-opus-5-5",
  ok: true,
  ...overrides,
});

describe("countCallsToday (§11.5)", () => {
  it("counts today's extract attempts, failed ones included", async () => {
    await db.insert(aiUsage).values([
      row({ createdAt: at(11, 0, 30) }),
      row({ createdAt: at(11, 14), ok: false }),
      row({ createdAt: at(10, 23, 59) }), // yesterday
      row({ createdAt: at(11, 9), callType: "enrich" }), // not a photo
      row({ createdAt: at(11, 9), callType: "describe" }), // Ask AI
    ]);
    expect(await countCallsToday(db, LEARNER_ID, "extract", now)).toBe(2);
  });

  it("counts Ask AI calls on their own: the Ask AI limit is separate from the photo limit", async () => {
    await db.insert(aiUsage).values([
      row({ createdAt: at(11, 8), callType: "describe" }),
      row({ createdAt: at(11, 9), callType: "describe", ok: false }),
      row({ createdAt: at(10, 22), callType: "describe" }), // yesterday
      row({ createdAt: at(11, 10) }), // a photo
    ]);
    expect(await countCallsToday(db, LEARNER_ID, "describe", now)).toBe(2);
  });

  it("counts only the given learner", async () => {
    const other = first(
      await db
        .insert(users)
        .values({ name: "Other", learnerLanguage: "en", targetLanguage: "de" })
        .returning({ id: users.id }),
    );
    await db.insert(aiUsage).values([row({ userId: other.id, createdAt: at(11, 10) })]);
    expect(await countCallsToday(db, LEARNER_ID, "extract", now)).toBe(0);
  });
});
