import { DeleteAccountResponse } from "@language-app/core";
import { count, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
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
import { giveData, NOTHING_LEFT, rowsOf as rowsOfIn } from "../helpers/accounts";
import { buildTestApp, sessionCookie, testAuth } from "../helpers/app";
import { authPost, getWith, PASSWORD, setCookies, signUp } from "../helpers/auth";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";
import { APP_HOST } from "../helpers/google";

// Deleting an account (docs/design.md §4 Accounts, §5, §9.4): POST /api/auth/delete-user, and
// the cascades that take the learner's data with the users row. user:delete deletes the same rows
// (user-delete.test.ts), held to the same list (helpers/accounts.ts).

const db = useTestDb();
const SAMPLE = new URL("../fixtures/kaikki-sample.jsonl", import.meta.url).pathname;
const app = () => buildTestApp(db, { learner: null });

beforeEach(async () => {
  await loadDictionary(db, SAMPLE);
});

const deleteAccount = (cookie: string, body: object = { password: PASSWORD }) =>
  authPost(app(), "/delete-user", body, { cookie });
const rowsOf = (userId: number) => rowsOfIn(db, userId);

const dictionarySize = async () => first(await db.select({ n: count() }).from(dictionaryEntries)).n;

/** An invited account with a password, signed in, with data of its own. */
async function testAccount() {
  await addInvite(db, "test@example.com");
  const cookie = await signUp(app(), { email: "test@example.com", username: "test" });
  const id = first(await db.select().from(users).where(eq(users.email, "test@example.com"))).id;
  const wordId = await giveData(db, id, "Stuhl");
  return { id, cookie, wordId };
}

describe("POST /api/auth/delete-user", () => {
  it("with the right password removes the account and everything it owns", async () => {
    const learnerWord = await giveData(db, LEARNER_ID, "Tisch");
    const learnerBefore = await rowsOf(LEARNER_ID);
    const test = await testAccount();
    expect(await rowsOf(test.id)).toEqual({
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
    const dictionaryBefore = await dictionarySize();

    const res = await deleteAccount(test.cookie);

    expect(res.statusCode).toBe(200);
    expect(DeleteAccountResponse.parse(res.json())).toEqual({
      success: true,
      message: "User deleted",
    });
    // The cookie is cleared, and the old one no longer signs anyone in.
    expect(setCookies(res).join("\n")).toMatch(/better-auth\.session_token=;/);
    expect((await getWith(app(), "/api/stats", test.cookie)).statusCode).toBe(401);

    expect(await rowsOf(test.id)).toEqual(NOTHING_LEFT);
    // The shared word facts and the dictionary stay, and so does everyone else's data.
    const shared = await db.select().from(words).where(eq(words.id, test.wordId));
    expect(shared).toHaveLength(1);
    expect(
      await db.select().from(wordTranslations).where(eq(wordTranslations.wordId, test.wordId)),
    ).toHaveLength(1);
    expect(await dictionarySize()).toBe(dictionaryBefore);
    expect(await rowsOf(LEARNER_ID)).toEqual(learnerBefore);
    expect(await db.select().from(words).where(eq(words.id, learnerWord))).toHaveLength(1);
  });

  it("also removes an invite for its email that was never linked to it", async () => {
    const test = await testAccount();
    // As when the invite was added again after the account existed.
    await db.update(invites).set({ userId: null, usedAt: null });
    expect(await deleteAccount(test.cookie)).toMatchObject({ statusCode: 200 });
    expect(await db.select().from(invites)).toEqual([]);
  });

  it("also removes the state of a Connect to Google under way, which holds its id and email", async () => {
    const test = await testAccount();
    const google = buildTestApp(db, { learner: null, auth: testAuth(db, { google: true }) });
    const connect = (cookie?: string) =>
      authPost(
        google,
        cookie ? "/link-social" : "/sign-in/social",
        { provider: "google", callbackURL: "/settings/account", errorCallbackURL: "/signin" },
        { cookie, host: APP_HOST },
      );
    expect((await connect(test.cookie)).statusCode).toBe(200);
    // A signed-out browser's Continue with Google is no account's, and stays.
    expect((await connect()).statusCode).toBe(200);
    const states = () => db.select({ value: authVerifications.value }).from(authVerifications);
    expect((await states()).map((row) => row.value)).toEqual([
      expect.stringContaining(`"link":{"userId":"${test.id}","email":"test@example.com"}`),
      expect.not.stringContaining('"link"'),
    ]);

    expect(await deleteAccount(test.cookie)).toMatchObject({ statusCode: 200 });
    expect((await states()).map((row) => row.value)).toEqual([
      expect.not.stringContaining('"link"'),
    ]);
  });

  it("refuses a wrong password and deletes nothing", async () => {
    const test = await testAccount();
    const res = await deleteAccount(test.cookie, { password: "not the password" });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "INVALID_PASSWORD" });
    expect((await rowsOf(test.id)).users).toBe(1);
    expect((await getWith(app(), "/api/stats", test.cookie)).statusCode).toBe(200);
  });

  it("an account with a password must give it, even right after signing in", async () => {
    const test = await testAccount();
    for (const body of [{}, { password: "" }]) {
      const res = await deleteAccount(test.cookie, body);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: "PASSWORD_REQUIRED" });
    }
    expect((await rowsOf(test.id)).users).toBe(1);
  });

  it("needs a session, from a trusted address", async () => {
    const test = await testAccount();
    expect((await authPost(app(), "/delete-user", { password: PASSWORD })).statusCode).toBe(401);
    const untrusted = await authPost(
      app(),
      "/delete-user",
      { password: PASSWORD },
      { cookie: test.cookie, origin: "http://evil.example" },
    );
    expect(untrusted.statusCode).toBe(403);
    expect((await rowsOf(test.id)).users).toBe(1);
  });

  describe("a Google-only account (no password)", () => {
    async function googleAccount() {
      const id = first(
        await db
          .insert(users)
          .values({
            name: "g",
            email: "g@example.com",
            emailVerified: true,
            username: "g",
            learnerLanguage: "en",
            targetLanguage: "de",
          })
          .returning({ id: users.id }),
      ).id;
      await db
        .insert(authAccounts)
        .values({ userId: id, providerId: "google", accountId: "google-sub-123" });
      await giveData(db, id, "Lampe");
      return { id, cookie: await sessionCookie(testAuth(db), id) };
    }

    it("is deleted from a sign-in of the last day, without a password", async () => {
      const google = await googleAccount();
      const res = await deleteAccount(google.cookie, {});
      expect(res.statusCode).toBe(200);
      expect(await rowsOf(google.id)).toMatchObject({ users: 0, user_words: 0, auth_accounts: 0 });
    });

    it("is refused when its sign-in is more than a day old", async () => {
      const google = await googleAccount();
      await db.execute(
        sql`UPDATE auth_sessions SET created_at = now() - interval '25 hours' WHERE user_id = ${google.id}`,
      );
      const res = await deleteAccount(google.cookie, {});

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: "SESSION_EXPIRED" });
      expect((await rowsOf(google.id)).users).toBe(1);
    });
  });
});
