import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { count, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tableCounts } from "../../scripts/backup";
import { databaseName } from "../../scripts/prompt";
import {
  type Account,
  accountContents,
  confirmsDeletion,
  deleteAccount,
  findAccount,
  formatContents,
} from "../../src/auth/accounts";
import { claimFirstUser } from "../../src/auth/claim";
import { addInvite } from "../../src/auth/invites";
import {
  authAccounts,
  authVerifications,
  dictionaryEntries,
  invites,
  users,
  words,
  wordTranslations,
} from "../../src/db/schema";
import { loadDictionary } from "../../src/dictionary/load";
import { ACCOUNT_TABLES, giveData, NOTHING_LEFT, rowsOf } from "../helpers/accounts";
import { buildTestApp, testAuth } from "../helpers/app";
import { authPost, getWith, PASSWORD, signUp } from "../helpers/auth";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";
import { testDatabaseUrl } from "../helpers/env";
import { APP_HOST, fakeGoogle } from "../helpers/google";

// user:delete (docs/design.md §14): an account and everything it owns, deleted by script in one
// transaction, the same way Delete account deletes it (§4 Accounts), once its username is typed
// back. User 1 is an account like any other.

const db = useTestDb();
const SERVER = fileURLToPath(new URL("../../", import.meta.url));
const SAMPLE = fileURLToPath(new URL("../fixtures/kaikki-sample.jsonl", import.meta.url));
const app = () => buildTestApp(db, { learner: null });
const googleApp = () => buildTestApp(db, { learner: null, auth: testAuth(db, { google: true }) });

// Nothing here goes to Google; the fake makes sure of it.
beforeEach(() => {
  fakeGoogle();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** An invited account with a password, signed in, with data of its own. */
async function testAccount(email = "test@example.com", username = "Test") {
  await addInvite(db, email);
  const cookie = await signUp(app(), { email, username });
  const account = await findAccount(db, email);
  if (!account) throw new Error(`No account for ${email}`);
  const wordId = await giveData(db, account.id, `Stuhl${account.id}`);
  return { account, cookie, wordId };
}

/** Starts Connect on Account (the trip to Google, not finished): its state row holds the id. */
async function startConnect(cookie: string) {
  const res = await authPost(
    googleApp(),
    "/link-social",
    { provider: "google", callbackURL: "/settings/account", errorCallbackURL: "/settings/account" },
    { cookie, host: APP_HOST },
  );
  expect(res.statusCode).toBe(200);
}

const states = async () =>
  db
    .select({ value: authVerifications.value })
    .from(authVerifications)
    .orderBy(authVerifications.id);

const dictionarySize = async () => first(await db.select({ n: count() }).from(dictionaryEntries)).n;

describe("confirmsDeletion: the username typed back", () => {
  const account: Account = {
    id: 7,
    email: "test@example.com",
    username: "anna.schmidt",
    displayUsername: "Anna.Schmidt",
    aiEnabled: false,
  };

  it.each(["anna.schmidt", "Anna.Schmidt", "ANNA.SCHMIDT", "  anna.schmidt  ", "anna.schmidt\t"])(
    "takes %j (any case, spaces around ignored)",
    (typed) => {
      expect(confirmsDeletion(account, typed)).toBe(true);
    },
  );

  it.each([
    "",
    "   ",
    "anna",
    "anna.schmid",
    "anna_schmidt",
    "anna .schmidt",
    "anna.schmidt2",
    "test@example.com",
    "7",
    "yes",
  ])("refuses %j", (typed) => {
    expect(confirmsDeletion(account, typed)).toBe(false);
  });

  it("an account without a username can't be confirmed", () => {
    expect(confirmsDeletion({ ...account, username: null }, "")).toBe(false);
  });
});

describe("deleteAccount", () => {
  beforeEach(async () => {
    await loadDictionary(db, SAMPLE);
  });

  it("removes the account and everything it owns; shared words, the dictionary and others stay", async () => {
    const learnerWord = await giveData(db, LEARNER_ID, "Tisch");
    const learnerBefore = await rowsOf(db, LEARNER_ID);
    const other = await testAccount("other@example.com", "other");
    const otherBefore = await rowsOf(db, other.account.id, "other@example.com");
    const test = await testAccount();
    const dictionaryBefore = await dictionarySize();
    expect(await rowsOf(db, test.account.id, "test@example.com")).toEqual({
      imports: 1,
      user_words: 1,
      groups: 1,
      group_words: 1,
      sessions: 1,
      card_results: 2,
      ai_usage: 1,
      auth_sessions: 1,
      auth_accounts: 1,
      invites: 1,
      users: 1,
    });

    const contents = await accountContents(db, test.account);
    const deleted = await deleteAccount(db, test.account);

    expect(deleted).toEqual({
      words: 1,
      imports: 1,
      groups: 1,
      sessions: 1,
      answers: 2,
      aiUsage: 1,
      signIns: 1,
      methods: ["password"],
      invites: 1,
      connects: 0,
    });
    expect(contents).toEqual(deleted);
    expect(await rowsOf(db, test.account.id, "test@example.com")).toEqual(NOTHING_LEFT);
    expect((await getWith(app(), "/api/stats", test.cookie)).statusCode).toBe(401);

    // The shared word facts and the dictionary stay, and so does everyone else's data.
    expect(await db.select().from(words).where(eq(words.id, test.wordId))).toHaveLength(1);
    expect(
      await db.select().from(wordTranslations).where(eq(wordTranslations.wordId, test.wordId)),
    ).toHaveLength(1);
    expect(await dictionarySize()).toBe(dictionaryBefore);
    expect(await rowsOf(db, LEARNER_ID)).toEqual(learnerBefore);
    expect(await db.select().from(words).where(eq(words.id, learnerWord))).toHaveLength(1);
    expect(await rowsOf(db, other.account.id, "other@example.com")).toEqual(otherBefore);
    expect((await getWith(app(), "/api/stats", other.cookie)).statusCode).toBe(200);
  });

  it("also removes an invite for its email that was never linked to it", async () => {
    const test = await testAccount();
    // As when the invite was added again after the account existed.
    await db.update(invites).set({ userId: null, usedAt: null });
    expect((await accountContents(db, test.account)).invites).toBe(1);

    expect((await deleteAccount(db, test.account)).invites).toBe(1);
    expect(await db.select().from(invites)).toEqual([]);
  });

  it("and the state of a Connect to Google under way, which holds its id and email", async () => {
    const test = await testAccount();
    const other = await testAccount("other@example.com", "other");
    await startConnect(test.cookie);
    await startConnect(other.cookie);
    // Continue with Google from a signed-out browser: no account's.
    await authPost(
      googleApp(),
      "/sign-in/social",
      { provider: "google", callbackURL: "/", errorCallbackURL: "/signin" },
      { host: APP_HOST },
    );
    expect((await states()).map((row) => row.value)).toEqual([
      expect.stringContaining(`"userId":"${test.account.id}"`),
      expect.stringContaining(`"userId":"${other.account.id}"`),
      expect.not.stringContaining("userId"),
    ]);

    expect((await deleteAccount(db, test.account)).connects).toBe(1);
    expect((await states()).map((row) => row.value)).toEqual([
      expect.stringContaining(`"userId":"${other.account.id}"`),
      expect.not.stringContaining("userId"),
    ]);
  });

  it("deletes user 1 like any other account once it is claimed", async () => {
    await giveData(db, LEARNER_ID, "Tisch");
    await claimFirstUser(testAuth(db), {
      email: "dev@example.com",
      username: "LazyPixel",
      password: PASSWORD,
    });
    const other = await testAccount();
    const otherBefore = await rowsOf(db, other.account.id, "test@example.com");
    const developer = await findAccount(db, "lazypixel");
    expect(developer?.id).toBe(LEARNER_ID);

    expect(await deleteAccount(db, developer as Account)).toMatchObject({
      words: 1,
      methods: ["password"],
    });
    expect(await rowsOf(db, LEARNER_ID, "dev@example.com")).toEqual(NOTHING_LEFT);
    expect(await rowsOf(db, other.account.id, "test@example.com")).toEqual(otherBefore);
  });

  it("is one transaction: a failure after the invite's delete leaves the invite in place", async () => {
    const test = await testAccount();
    await db.update(invites).set({ userId: null, usedAt: null });
    const before = await tableCounts(db);
    // Fails the users row's delete, saying whether the invite was already gone by then.
    await db.execute(sql`
      CREATE FUNCTION refuse_user_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM invites WHERE email = OLD.email) THEN
          RAISE EXCEPTION 'injected failure, the invite still there';
        END IF;
        RAISE EXCEPTION 'injected failure after the invite went';
      END $$`);
    await db.execute(sql`
      CREATE TRIGGER refuse_user_delete BEFORE DELETE ON users
      FOR EACH ROW EXECUTE FUNCTION refuse_user_delete()`);
    let failure: unknown;
    try {
      failure = await deleteAccount(db, test.account).then(
        () => null,
        (error: unknown) => error,
      );
    } finally {
      await db.execute(sql`DROP TRIGGER refuse_user_delete ON users`);
      await db.execute(sql`DROP FUNCTION refuse_user_delete()`);
    }

    expect(String((failure as Error | null)?.cause)).toMatch(/after the invite went/);
    expect(await tableCounts(db)).toEqual(before);
    expect(await db.select().from(invites)).toMatchObject([{ email: "test@example.com" }]);
    expect((await getWith(app(), "/api/stats", test.cookie)).statusCode).toBe(200);
  });

  it("an account that is already gone: an error, and nothing else is deleted", async () => {
    const test = await testAccount();
    await deleteAccount(db, test.account);
    const before = await tableCounts(db);
    await expect(deleteAccount(db, test.account)).rejects.toThrow(/already gone/);
    expect(await tableCounts(db)).toEqual(before);
  });
});

describe("user:delete and Delete account", () => {
  it("leave the database the same: the same rows go from every table", async () => {
    const a = await testAccount("a@example.com", "aaa");
    const b = await testAccount("b@example.com", "bbb");
    await startConnect(a.cookie);
    await startConnect(b.cookie);
    const start = await tableCounts(db);

    const res = await authPost(app(), "/delete-user", { password: PASSWORD }, { cookie: a.cookie });
    expect(res.statusCode).toBe(200);
    const afterApp = await tableCounts(db);
    await deleteAccount(db, b.account);
    const afterScript = await tableCounts(db);

    const change = (from: typeof start, to: typeof start) =>
      from
        .map(({ table, rows }, i) => ({ table, rows: (to[i]?.rows ?? 0) - rows }))
        .filter(({ rows }) => rows !== 0);
    expect(change(afterApp, afterScript)).toEqual(change(start, afterApp));
    expect(
      change(start, afterApp)
        .map(({ table }) => table)
        .sort(),
    ).toEqual([...ACCOUNT_TABLES, "auth_verifications"].sort());
  });

  it("every table holding an account's rows hangs off users through ON DELETE CASCADE", async () => {
    const { rows } = await db.execute<{ child: string; parent: string; action: string }>(sql`
      SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent,
             confdeltype AS action
      FROM pg_constraint
      WHERE contype = 'f' AND connamespace = 'public'::regnamespace`);
    // The tables whose rows go with a users row: those it cascades to, and theirs in turn.
    const owned = new Set(["users"]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const { child, parent, action } of rows) {
        if (action === "c" && owned.has(parent) && !owned.has(child)) {
          owned.add(child);
          grew = true;
        }
      }
    }
    expect([...owned].sort()).toEqual([...ACCOUNT_TABLES].sort());
    // Nothing outside them points at an account's rows (it would block the delete, or keep a
    // reference to them); inside, an import's links are set null as its rows go too.
    expect(
      rows.filter(
        ({ child, parent, action }) => owned.has(parent) && !(action === "c" || owned.has(child)),
      ),
    ).toEqual([]);
  });
});

describe("user:delete as the script", () => {
  const run = (args: string[], input: string) =>
    spawnSync(`${SERVER}node_modules/.bin/tsx`, ["scripts/user-delete.ts", ...args], {
      cwd: SERVER,
      env: { ...process.env, DATABASE_URL: testDatabaseUrl(), APP_TIME_ZONE: "Europe/Berlin" },
      input,
      encoding: "utf8",
    });

  it("prints the account and what will go; anything but its username deletes nothing", async () => {
    const test = await testAccount();
    const before = await tableCounts(db);

    for (const answer of ["tset\n", "\n", "test@example.com\n", ""]) {
      const refused = run(["TEST@example.com"], answer);

      expect(refused.status).toBe(1);
      expect(refused.stderr).toBe("");
      const lines = refused.stdout.trimEnd().split("\n");
      expect(lines[0]).toBe(`Database: ${databaseName(testDatabaseUrl())}`);
      expect(lines[1]).toMatch(
        /^ {2}id {2}username +email +sign-in +AI +words +created +last active$/,
      );
      expect(lines[2]?.trim().split(/ {2,}/).slice(0, 6)).toEqual([
        String(test.account.id),
        "Test",
        "test@example.com",
        "password",
        "on",
        "1",
      ]);
      expect(lines.slice(3)).toEqual([
        "Deleting it deletes all of this:",
        ...formatContents(await accountContents(db, test.account)),
        "Not deleted.",
      ]);
    }
    expect(await tableCounts(db)).toEqual(before);
  });

  it("deletes once the username is typed back, then says what went and what copies remain", async () => {
    const test = await testAccount();
    const hash = first(
      await db.select({ password: authAccounts.password }).from(authAccounts),
    ).password;

    const confirmed = run(["test"], "  TEST \nmore lines\n");

    expect(confirmed.stderr).toBe("");
    expect(confirmed.status).toBe(0);
    expect(await rowsOf(db, test.account.id, "test@example.com")).toEqual(NOTHING_LEFT);
    const lines = confirmed.stdout.trimEnd().split("\n");
    const deleted = lines.indexOf(`Deleted user ${test.account.id} (Test, test@example.com):`);
    expect(deleted).toBeGreaterThan(3);
    expect(lines.slice(deleted + 1, -1)).toEqual(
      formatContents({
        words: 1,
        imports: 1,
        groups: 1,
        sessions: 1,
        answers: 2,
        aiUsage: 1,
        signIns: 1,
        methods: ["password"],
        invites: 1,
        connects: 0,
      }),
    );
    expect(lines.at(-1)).toMatch(/Neon's history .* 6 hours.*nightly backups .* 30 days.*lock/);
    expect(confirmed.stdout).not.toContain(String(hash));
  });

  it("an unknown account is an error, exit code 1, and nothing is asked or deleted", async () => {
    await testAccount();
    const before = await tableCounts(db);

    for (const login of ["nobody", "nobody@example.com"]) {
      const unknown = run([login], "nobody\n");
      expect(unknown.status).toBe(1);
      expect(unknown.stdout).toBe(`Database: ${databaseName(testDatabaseUrl())}\n`);
      expect(unknown.stderr).toMatch(/^No account with the (username|email) nobody/);
    }
    expect(await tableCounts(db)).toEqual(before);
  });

  it("has no flag that skips the question", async () => {
    await testAccount();
    const before = await tableCounts(db);
    for (const args of [["test", "--yes"], ["--force", "test"], []]) {
      const refused = run(args, "test\n");
      expect(refused.status).toBe(1);
      expect(refused.stderr).toMatch(/^Usage: user:delete <email\|username>/);
    }
    expect(await tableCounts(db)).toEqual(before);
    expect(await db.select().from(users).where(eq(users.email, "test@example.com"))).toHaveLength(
      1,
    );
  });
});
