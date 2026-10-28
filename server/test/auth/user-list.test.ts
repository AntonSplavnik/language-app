import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { databaseName } from "../../scripts/prompt";
import {
  type AccountSummary,
  accountTable,
  accountTotal,
  dateTimeIn,
  listAccounts,
  setAiEnabled,
} from "../../src/auth/accounts";
import { addInvite } from "../../src/auth/invites";
import { authAccounts, authSessions, users } from "../../src/db/schema";
import { giveData } from "../helpers/accounts";
import { buildTestApp } from "../helpers/app";
import { getWith, signUp } from "../helpers/auth";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";
import { testDatabaseUrl } from "../helpers/env";

// user:list (docs/design.md §14): every account, one line each, with its sign-in methods, AI,
// words, when it was created and last active; read-only, and never a secret.

const db = useTestDb();
const SERVER = fileURLToPath(new URL("../../", import.meta.url));
const app = () => buildTestApp(db, { learner: null });

const idOf = async (email: string) =>
  first(await db.select({ id: users.id }).from(users).where(eq(users.email, email))).id;

/** An account made with Google, as a Google sign-up leaves it: no password, no sign-in yet. */
async function googleOnly(email: string, username: string) {
  const id = first(
    await db
      .insert(users)
      .values({
        name: username,
        email,
        emailVerified: true,
        username,
        displayUsername: username,
        learnerLanguage: "en",
        targetLanguage: "de",
      })
      .returning({ id: users.id }),
  ).id;
  await db
    .insert(authAccounts)
    .values({ userId: id, providerId: "google", accountId: `sub-${id}` });
  return id;
}

/** User 1 unclaimed with a word, a password account, a Google-only one and one with both. */
async function fourAccounts() {
  await giveData(db, LEARNER_ID, "Tisch");
  await addInvite(db, "test@example.com");
  await signUp(app(), { email: "test@example.com", username: "Test" });
  const anna = await googleOnly("anna.schmidt@gmail.com", "anna.schmidt");
  await addInvite(db, "both@example.com");
  await signUp(app(), { email: "both@example.com", username: "Both.Ways" });
  const both = await idOf("both@example.com");
  await db.insert(authAccounts).values({ userId: both, providerId: "google", accountId: "sub-b" });
  await giveData(db, both, "Stuhl");
  await giveData(db, both, "Lampe");
  await setAiEnabled(db, "both.ways", true);
  return { test: await idOf("test@example.com"), anna, both };
}

describe("listAccounts", () => {
  it("has every account, sorted by id, with its methods, AI and words", async () => {
    const { test, anna, both } = await fourAccounts();

    const accounts = await listAccounts(db);

    expect(accounts.map(({ createdAt, lastActive, ...rest }) => rest)).toEqual([
      {
        id: LEARNER_ID,
        username: null,
        email: null,
        methods: [],
        aiEnabled: true,
        words: 1,
      },
      {
        id: test,
        username: "Test",
        email: "test@example.com",
        methods: ["password"],
        aiEnabled: false,
        words: 0,
      },
      {
        id: anna,
        username: "anna.schmidt",
        email: "anna.schmidt@gmail.com",
        methods: ["google"],
        aiEnabled: false,
        words: 0,
      },
      {
        id: both,
        username: "Both.Ways",
        email: "both@example.com",
        methods: ["password", "google"],
        aiEnabled: true,
        words: 2,
      },
    ]);
    for (const account of accounts) expect(account.createdAt).toBeInstanceOf(Date);
    // Signed up through the app, so signed in; user 1 and the Google account have no sign-in.
    expect(accounts.map((account) => account.lastActive !== null)).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });

  it("one account by its id", async () => {
    const { anna } = await fourAccounts();
    expect((await listAccounts(db, anna)).map((account) => account.username)).toEqual([
      "anna.schmidt",
    ]);
  });

  it("last active is the newest updated_at of the account's sign-ins", async () => {
    await addInvite(db, "test@example.com");
    await signUp(app(), { email: "test@example.com", username: "test" });
    const test = await idOf("test@example.com");
    // A second sign-in, on another device.
    await buildTestApp(db, { learner: test }).inject({ method: "GET", url: "/api/stats" });
    const signIns = await db
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(eq(authSessions.userId, test))
      .orderBy(authSessions.id);
    expect(signIns).toHaveLength(2);
    // The first one was refreshed later than the second.
    for (const [{ id }, day] of signIns.map((row, i) => [row, i === 0 ? 27 : 20] as const)) {
      await db
        .update(authSessions)
        .set({ updatedAt: new Date(`2026-10-${day}T08:00:00Z`) })
        .where(eq(authSessions.id, id));
    }

    const [account] = await listAccounts(db, test);
    expect(account?.lastActive).toEqual(new Date("2026-10-27T08:00:00Z"));
  });

  it("a day's use moves last active (get-session refreshes the sign-in); other requests don't", async () => {
    await addInvite(db, "test@example.com");
    const cookie = await signUp(app(), { email: "test@example.com", username: "test" });
    const test = await idOf("test@example.com");
    // As if the sign-in was last refreshed two days ago.
    await db.execute(sql`
      UPDATE auth_sessions
      SET updated_at = now() - interval '2 days', expires_at = now() + interval '58 days'
      WHERE user_id = ${test}`);
    const before = first(await listAccounts(db, test)).lastActive?.getTime() ?? 0;

    // The app's routes read the session without extending it.
    expect((await getWith(app(), "/api/stats", cookie)).statusCode).toBe(200);
    expect(first(await listAccounts(db, test)).lastActive?.getTime()).toBe(before);

    // The web app asks get-session when it starts, which extends a sign-in a day old.
    expect((await getWith(app(), "/api/auth/get-session", cookie)).statusCode).toBe(200);
    const after = first(await listAccounts(db, test)).lastActive?.getTime() ?? 0;
    expect(after - before).toBeGreaterThan(47 * 60 * 60 * 1000);
    expect(Math.abs(Date.now() - after)).toBeLessThan(60 * 1000);
  });

  it("an account whose sign-ins have ended has no last active", async () => {
    await addInvite(db, "test@example.com");
    await signUp(app(), { email: "test@example.com", username: "test" });
    const test = await idOf("test@example.com");
    await db.delete(authSessions).where(eq(authSessions.userId, test));
    expect(first(await listAccounts(db, test)).lastActive).toBeNull();
  });
});

describe("how user:list prints", () => {
  const accounts: AccountSummary[] = [
    {
      id: 1,
      username: "LazyPixel",
      email: "dev@example.com",
      methods: ["password", "google"],
      aiEnabled: true,
      words: 354,
      createdAt: new Date("2026-10-11T07:02:00Z"),
      lastActive: new Date("2026-10-28T10:21:59Z"),
    },
    {
      id: 12,
      username: "anna.schmidt",
      email: "anna.schmidt@gmail.com",
      methods: ["google"],
      aiEnabled: false,
      words: 0,
      createdAt: new Date("2026-07-01T10:21:00Z"),
      lastActive: null,
    },
    {
      id: 13,
      username: null,
      email: null,
      methods: [],
      aiEnabled: false,
      words: 7,
      createdAt: new Date("2026-12-31T23:30:00Z"),
      lastActive: new Date("2027-01-01T00:05:00Z"),
    },
  ];

  it("one aligned line per account under a header, the times in APP_TIME_ZONE", () => {
    expect(accountTable(accounts, "Europe/Berlin")).toEqual([
      "  id  username      email                   sign-in           AI   words  created           last active",
      "   1  LazyPixel     dev@example.com         password, google  on     354  2026-10-11 09:02  2026-10-28 11:21",
      "  12  anna.schmidt  anna.schmidt@gmail.com  google            off      0  2026-07-01 12:21  —",
      "  13  —             —                       none              off      7  2027-01-01 00:30  2027-01-01 01:05",
    ]);
  });

  it("a moment as the zone's date and time to the minute, summer time included", () => {
    // Summer time in Berlin ended on 2026-10-25 at 03:00.
    expect(dateTimeIn(new Date("2026-10-25T00:59:00Z"), "Europe/Berlin")).toBe("2026-10-25 02:59");
    expect(dateTimeIn(new Date("2026-10-25T01:00:00Z"), "Europe/Berlin")).toBe("2026-10-25 02:00");
    expect(dateTimeIn(new Date("2026-10-28T23:00:00Z"), "Europe/Berlin")).toBe("2026-10-29 00:00");
    expect(dateTimeIn(new Date("2026-10-28T23:00:00Z"), "UTC")).toBe("2026-10-28 23:00");
  });

  it("the total, and how many have AI on", () => {
    expect(accountTotal(accounts)).toBe("3 accounts, 1 with AI on");
    expect(accountTotal(accounts.slice(1, 2))).toBe("1 account, 0 with AI on");
    expect(accountTotal([])).toBe("No accounts.");
  });
});

describe("user:list as the script", () => {
  it("prints the database, every account and the total, and never a secret", async () => {
    const { both } = await fourAccounts();
    // As before M12.3b, when Google's tokens were kept: still never printed.
    await db
      .update(authAccounts)
      .set({ accessToken: "ya29.secret-access-token", idToken: "eyJ.secret-id-token" })
      .where(eq(authAccounts.userId, both));
    const before = await db.select().from(authAccounts);
    const sessionsBefore = await db.select().from(authSessions);

    const run = spawnSync(`${SERVER}node_modules/.bin/tsx`, ["scripts/user-list.ts"], {
      cwd: SERVER,
      env: { ...process.env, DATABASE_URL: testDatabaseUrl(), APP_TIME_ZONE: "Europe/Berlin" },
      encoding: "utf8",
    });

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    const lines = run.stdout.trimEnd().split("\n");
    expect(lines[0]).toBe(`Database: ${databaseName(testDatabaseUrl())}`);
    // The id column is right-aligned: wider ids (earlier tests' accounts) push the header right.
    expect(lines[1]).toMatch(
      /^ {2,}id {2}username +email +sign-in +AI +words +created +last active$/,
    );
    expect(lines.slice(2, 6).map((line) => line.trim().split(/ {2,}/).slice(0, 6))).toEqual([
      ["1", "—", "—", "none", "on", "1"],
      [expect.any(String), "Test", "test@example.com", "password", "off", "0"],
      [expect.any(String), "anna.schmidt", "anna.schmidt@gmail.com", "google", "off", "0"],
      [String(both), "Both.Ways", "both@example.com", "password, google", "on", "2"],
    ]);
    expect(lines[6]).toBe("4 accounts, 2 with AI on");
    expect(lines).toHaveLength(7);

    // Nothing secret: no password hash, no session token, no Google token.
    const secrets = [
      ...before.flatMap((row) => [row.password, row.accessToken, row.idToken]),
      ...sessionsBefore.map((session) => session.token),
    ].filter((secret): secret is string => typeof secret === "string" && secret !== "");
    expect(secrets.length).toBeGreaterThanOrEqual(6);
    for (const secret of secrets) expect(run.stdout).not.toContain(secret);
    // And it only read.
    expect(await db.select().from(authAccounts)).toEqual(before);
    expect(await db.select().from(authSessions)).toEqual(sessionsBefore);
  });
});
