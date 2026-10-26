import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClaudeAi } from "../../src/ai/claude";
import { countCallsToday, dbUsageSink, startOfDay, type UsageRecord } from "../../src/ai/usage";
import { aiUsage, users } from "../../src/db/schema";
import { loadAiFixture, replayTransport } from "../helpers/ai";
import { buildTestApp } from "../helpers/app";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";

// The daily limits count their day in APP_TIME_ZONE (docs/design.md §11.5), not in the server's
// zone: Vercel runs in UTC. The process runs in UTC here too, whatever the machine's zone, and every
// moment is written as a UTC instant.

const db = useTestDb();
const BERLIN = "Europe/Berlin";

const processZone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  if (processZone === undefined) delete process.env.TZ;
  else process.env.TZ = processZone;
});

const utc = (iso: string) => new Date(`${iso}Z`);

const row = (overrides: Partial<UsageRecord>): UsageRecord => ({
  userId: LEARNER_ID,
  callType: "extract",
  model: "claude-haiku-5-5",
  ok: true,
  ...overrides,
});

it("the process really runs in UTC here", () => {
  expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(0);
});

describe("startOfDay", () => {
  it("is midnight in the zone, as a UTC instant, in summer and in winter", () => {
    // 15:00 in Berlin on 11 October (CEST, UTC+2) → midnight was 22:00 UTC the day before.
    expect(startOfDay(utc("2026-10-11T13:00:00"), BERLIN)).toEqual(utc("2026-10-10T22:00:00"));
    // 15:00 in Berlin on 11 December (CET, UTC+1) → 23:00 UTC the day before.
    expect(startOfDay(utc("2026-12-11T14:00:00"), BERLIN)).toEqual(utc("2026-12-10T23:00:00"));
  });

  it("23:30 and 00:30 in Berlin are different days, though the same day in UTC", () => {
    const lateEvening = utc("2026-10-11T21:30:00"); // 23:30 CEST on the 11th
    const afterMidnight = utc("2026-10-11T22:30:00"); // 00:30 CEST on the 12th
    expect(startOfDay(lateEvening, BERLIN)).toEqual(utc("2026-10-10T22:00:00"));
    expect(startOfDay(afterMidnight, BERLIN)).toEqual(utc("2026-10-11T22:00:00"));
  });

  it("handles the days the clocks change", () => {
    // 25 October 2026: summer time ends at 03:00 CEST. The day began at 00:00 CEST (22:00 UTC).
    expect(startOfDay(utc("2026-10-25T20:00:00"), BERLIN)).toEqual(utc("2026-10-24T22:00:00"));
    // The next day begins at 00:00 CET (23:00 UTC).
    expect(startOfDay(utc("2026-10-25T23:30:00"), BERLIN)).toEqual(utc("2026-10-25T23:00:00"));
    // 29 March 2026: summer time starts at 02:00 CET. The day began at 00:00 CET (23:00 UTC).
    expect(startOfDay(utc("2026-03-29T12:00:00"), BERLIN)).toEqual(utc("2026-03-28T23:00:00"));
    expect(startOfDay(utc("2026-03-29T22:30:00"), BERLIN)).toEqual(utc("2026-03-29T22:00:00"));
  });

  it("works for other zones and for UTC itself", () => {
    expect(startOfDay(utc("2026-10-11T03:00:00"), "America/New_York")).toEqual(
      utc("2026-10-10T04:00:00"),
    );
    expect(startOfDay(utc("2026-10-11T03:00:00"), "UTC")).toEqual(utc("2026-10-11T00:00:00"));
  });
});

describe("countCallsToday (§11.5)", () => {
  const today = { timeZone: BERLIN, now: utc("2026-10-11T13:00:00") }; // 15:00 in Berlin

  it("counts today's extract attempts, failed ones included", async () => {
    await db.insert(aiUsage).values([
      row({ createdAt: utc("2026-10-10T22:30:00") }), // 00:30 today in Berlin
      row({ createdAt: utc("2026-10-11T12:00:00"), ok: false }),
      row({ createdAt: utc("2026-10-10T21:59:00") }), // 23:59 yesterday in Berlin
      row({ createdAt: utc("2026-10-11T07:00:00"), callType: "enrich" }), // not a photo
      row({ createdAt: utc("2026-10-11T07:00:00"), callType: "describe" }), // Ask AI
    ]);
    expect(await countCallsToday(db, LEARNER_ID, "extract", today)).toBe(2);
  });

  it("counts Ask AI calls on their own: the Ask AI limit is separate from the photo limit", async () => {
    await db.insert(aiUsage).values([
      row({ createdAt: utc("2026-10-11T06:00:00"), callType: "describe" }),
      row({ createdAt: utc("2026-10-11T07:00:00"), callType: "describe", ok: false }),
      row({ createdAt: utc("2026-10-10T20:00:00"), callType: "describe" }), // yesterday
      row({ createdAt: utc("2026-10-11T08:00:00") }), // a photo
    ]);
    expect(await countCallsToday(db, LEARNER_ID, "describe", today)).toBe(2);
  });

  it("a call at 23:30 Berlin time is yesterday's at 00:30", async () => {
    await db.insert(aiUsage).values([row({ createdAt: utc("2026-10-11T21:30:00") })]);
    const at = (iso: string) => ({ timeZone: BERLIN, now: utc(iso) });
    expect(await countCallsToday(db, LEARNER_ID, "extract", at("2026-10-11T21:45:00"))).toBe(1);
    // 00:30 in Berlin, still 22:30 on the same day in UTC.
    expect(await countCallsToday(db, LEARNER_ID, "extract", at("2026-10-11T22:30:00"))).toBe(0);
  });

  it("counts only the given learner", async () => {
    const other = first(
      await db
        .insert(users)
        .values({ name: "Other", learnerLanguage: "en", targetLanguage: "de" })
        .returning({ id: users.id }),
    );
    await db
      .insert(aiUsage)
      .values([row({ userId: other.id, createdAt: utc("2026-10-11T08:00:00") })]);
    expect(await countCallsToday(db, LEARNER_ID, "extract", today)).toBe(0);
  });
});

describe("the limits on the routes use APP_TIME_ZONE", () => {
  const answer = loadAiFixture("describe-misspelt-noun").response;
  const ask = (now: Date, timeZone = BERLIN) => {
    const ai = createClaudeAi({
      transport: replayTransport(answer).transport,
      recordUsage: dbUsageSink(db),
      models: {
        extract: "claude-haiku-5-5",
        enrich: "claude-haiku-5-5",
        describe: "claude-haiku-5-5",
      },
      effort: "medium",
    });
    return buildTestApp(db, { ai, dailyDescribeLimit: 1, timeZone, now: () => now }).inject({
      method: "POST",
      url: "/api/words/describe",
      payload: { text: "Regenschrim" },
    });
  };

  it("one Ask AI at 23:30 Berlin time leaves the next day's free at 00:30", async () => {
    // Yesterday's call at 23:30 CEST.
    await db
      .insert(aiUsage)
      .values([row({ callType: "describe", createdAt: utc("2026-10-11T21:30:00") })]);

    // 23:40 the same evening: the day's one call is used.
    expect((await ask(utc("2026-10-11T21:40:00"))).statusCode).toBe(429);
    // 00:30 in Berlin: a new day, though UTC is still on the 11th.
    expect((await ask(utc("2026-10-11T22:30:00"))).statusCode).toBe(200);
  });

  it("with the zone set to UTC, the day would turn only at 02:00 Berlin time", async () => {
    await db
      .insert(aiUsage)
      .values([row({ callType: "describe", createdAt: utc("2026-10-11T21:30:00") })]);
    expect((await ask(utc("2026-10-11T22:30:00"), "UTC")).statusCode).toBe(429);
  });
});
