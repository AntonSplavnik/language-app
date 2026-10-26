import { SignedInResponse } from "@language-app/core";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { findAccount, setAiEnabled, setPassword } from "../../src/auth/accounts";
import { claimFirstUser } from "../../src/auth/claim";
import { addInvite, isInvited, listInvites, removeInvite } from "../../src/auth/invites";
import { authAccounts, authSessions, invites, users, userWords, words } from "../../src/db/schema";
import { buildTestApp, testAuth } from "../helpers/app";
import { authPost, cookieOf, getWith, PASSWORD, signUp } from "../helpers/auth";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";

// The account scripts (docs/design.md §14): user:claim, user:set-password, user:ai and the invite
// list.

const db = useTestDb();
const app = () => buildTestApp(db, { learner: null });
const claim = { email: " Anton@Example.com ", username: "Anton", password: PASSWORD };
const learner = async () => first(await db.select().from(users).where(eq(users.id, LEARNER_ID)));

describe("user:claim", () => {
  it("gives user 1 its email, username, password, email_verified and AI", async () => {
    const result = await claimFirstUser(testAuth(db), claim);

    expect(result).toEqual({
      name: "Learner",
      email: "anton@example.com",
      username: "anton",
      displayUsername: "Anton",
    });
    expect(await learner()).toMatchObject({
      name: "Learner",
      email: "anton@example.com",
      username: "anton",
      displayUsername: "Anton",
      emailVerified: true,
      aiEnabled: true,
      learnerLanguage: "en",
    });
    const [account, ...more] = await db.select().from(authAccounts);
    expect(more).toEqual([]);
    expect(account).toMatchObject({ userId: LEARNER_ID, providerId: "credential", accountId: "1" });
    expect(account?.password).not.toContain(PASSWORD);
  });

  it("after which user 1 signs in, by email or username, and sees its words", async () => {
    const word = first(
      await db
        .insert(words)
        .values({
          language: "de",
          lemma: "Tisch",
          pos: "noun",
          article: "der",
          checkStatus: "match",
        })
        .returning({ id: words.id }),
    );
    await db.insert(userWords).values({ userId: LEARNER_ID, wordId: word.id, status: "learning" });
    await claimFirstUser(testAuth(db), claim);

    const byEmail = await authPost(app(), "/sign-in/email", {
      email: "anton@example.com",
      password: PASSWORD,
    });
    const byUsername = await authPost(app(), "/sign-in/username", {
      username: "ANTON",
      password: PASSWORD,
    });
    expect([byEmail.statusCode, byUsername.statusCode]).toEqual([200, 200]);
    expect(SignedInResponse.parse(byUsername.json()).user).toMatchObject({
      id: "1",
      aiEnabled: true,
    });
    const list = await getWith(app(), "/api/words", cookieOf(byUsername));
    expect(list.json()).toMatchObject({ words: [{ lemma: "Tisch" }] });
  });

  it("refuses a user 1 that already has an email, changing nothing", async () => {
    await claimFirstUser(testAuth(db), claim);
    await expect(
      claimFirstUser(testAuth(db), { ...claim, email: "other@example.com", username: "other" }),
    ).rejects.toThrow("User 1 is already claimed (anton@example.com)");
    expect(await learner()).toMatchObject({ email: "anton@example.com", username: "anton" });
  });

  it("refuses a username or an email another account has; user 1 stays unclaimed", async () => {
    await db.update(users).set({ aiEnabled: false }).where(eq(users.id, LEARNER_ID));
    await addInvite(db, "taken@example.com");
    await signUp(app(), { email: "taken@example.com", username: "Taken" });

    await expect(claimFirstUser(testAuth(db), { ...claim, username: "TAKEN" })).rejects.toThrow(
      /already taken/,
    );
    await expect(
      claimFirstUser(testAuth(db), { ...claim, email: "Taken@example.com" }),
    ).rejects.toThrow(/Another account already has the email taken@example.com/);
    expect(await learner()).toMatchObject({ email: null, username: null, aiEnabled: false });

    // And it can be run again.
    await claimFirstUser(testAuth(db), claim);
    const signedIn = await authPost(app(), "/sign-in/username", {
      username: "anton",
      password: PASSWORD,
    });
    expect(signedIn.statusCode).toBe(200);
  });

  it.each([
    ["an email that isn't one", { email: "anton" }, /Not an email address/],
    ["a short username", { username: "an" }, /3–30 letters/],
    ["a username with a space", { username: "an ton" }, /3–30 letters/],
    ["a short password", { password: "1234567" }, /8–128 characters/],
  ])("refuses %s", async (_, change, message) => {
    await expect(claimFirstUser(testAuth(db), { ...claim, ...change })).rejects.toThrow(message);
    expect(await learner()).toMatchObject({ email: null });
  });
});

describe("user:set-password", () => {
  const NEW_PASSWORD = "a brand new password";
  const signIn = (username: string, password: string) =>
    authPost(app(), "/sign-in/username", { username, password });

  async function account() {
    await addInvite(db, "test@example.com");
    const cookie = await signUp(app(), { email: "test@example.com", username: "Test" });
    return cookie;
  }

  it("sets the new password; the old one stops working", async () => {
    await account();
    const result = await setPassword(testAuth(db), db, "test", NEW_PASSWORD);

    expect(result).toMatchObject({
      account: { email: "test@example.com", username: "test", displayUsername: "Test" },
      added: false,
      sessionsEnded: 1,
    });
    expect((await signIn("test", NEW_PASSWORD)).statusCode).toBe(200);
    expect((await signIn("test", PASSWORD)).statusCode).toBe(401);
  });

  it("ends the account's sessions, and only its own", async () => {
    const cookie = await account();
    const second = cookieOf(await signIn("test", PASSWORD));
    const learnerApp = buildTestApp(db);
    await learnerApp.inject({ method: "GET", url: "/api/stats" });
    const learnerSessions = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.userId, LEARNER_ID));

    expect(
      (await setPassword(testAuth(db), db, "test@example.com", NEW_PASSWORD)).sessionsEnded,
    ).toBe(2);
    for (const old of [cookie, second]) {
      expect((await getWith(app(), "/api/stats", old)).statusCode).toBe(401);
    }
    expect(
      await db.select().from(authSessions).where(eq(authSessions.userId, LEARNER_ID)),
    ).toHaveLength(learnerSessions.length);
  });

  it("finds the account by email or username, in any case and with spaces around", async () => {
    await account();
    for (const login of [" TEST@example.com ", "tEsT"]) {
      expect((await setPassword(testAuth(db), db, login, NEW_PASSWORD)).account.username).toBe(
        "test",
      );
    }
  });

  it("gives an account without a password one (a Google-only account)", async () => {
    const id = first(
      await db
        .insert(users)
        .values({
          name: "g",
          email: "g@example.com",
          username: "g.user",
          learnerLanguage: "en",
          targetLanguage: "de",
        })
        .returning({ id: users.id }),
    ).id;
    await db.insert(authAccounts).values({ userId: id, providerId: "google", accountId: "sub-1" });

    expect((await setPassword(testAuth(db), db, "g.user", NEW_PASSWORD)).added).toBe(true);
    expect((await signIn("g.user", NEW_PASSWORD)).statusCode).toBe(200);
  });

  it.each([
    ["a short password", "1234567", /8–128 characters/],
    ["a long password", "x".repeat(129), /8–128 characters/],
  ])("refuses %s, changing nothing", async (_, password, message) => {
    await account();
    await expect(setPassword(testAuth(db), db, "test", password)).rejects.toThrow(message);
    expect((await signIn("test", PASSWORD)).statusCode).toBe(200);
  });

  it("refuses an unknown account", async () => {
    await expect(setPassword(testAuth(db), db, "nobody", NEW_PASSWORD)).rejects.toThrow(
      "No account with the username nobody",
    );
    await expect(setPassword(testAuth(db), db, "no@example.com", NEW_PASSWORD)).rejects.toThrow(
      "No account with the email no@example.com",
    );
  });
});

describe("user:ai", () => {
  async function account() {
    await addInvite(db, "test@example.com");
    return signUp(app(), { email: "test@example.com", username: "Test" });
  }

  it("switches AI on and off, saying what it was", async () => {
    await account();
    expect(await setAiEnabled(db, "test", true)).toMatchObject({
      account: { username: "test", aiEnabled: true },
      was: false,
    });
    expect((await findAccount(db, "test@example.com"))?.aiEnabled).toBe(true);
    expect(await setAiEnabled(db, "TEST@example.com", false)).toMatchObject({
      account: { aiEnabled: false },
      was: true,
    });
    expect(await setAiEnabled(db, "test", false)).toMatchObject({ was: false });
  });

  it("the switch reaches the account's next request", async () => {
    const cookie = await account();
    const ask = () =>
      app().inject({
        method: "POST",
        url: "/api/words/enrich-pending",
        payload: {},
        headers: { cookie },
      });
    expect((await ask()).statusCode).toBe(403);
    await setAiEnabled(db, "test", true);
    expect((await ask()).statusCode).toBe(200);
  });

  it("refuses an unknown account", async () => {
    await expect(setAiEnabled(db, "nobody", true)).rejects.toThrow(
      "No account with the username nobody",
    );
  });
});

describe("the invite list", () => {
  it("invite:add trims and lower-cases the email", async () => {
    expect(await addInvite(db, "  New.Person@Example.COM ")).toEqual({
      email: "new.person@example.com",
      added: true,
    });
    expect(await isInvited(db, "new.person@example.com")).toBe(true);
    expect(await isInvited(db, "NEW.person@example.com ")).toBe(true);
  });

  it("adding the same email again is harmless", async () => {
    await addInvite(db, "new@example.com");
    expect(await addInvite(db, "NEW@example.com")).toEqual({
      email: "new@example.com",
      added: false,
    });
    expect(await listInvites(db)).toHaveLength(1);
  });

  it("invite:list shows each email and whether it was used", async () => {
    await addInvite(db, "b@example.com");
    await addInvite(db, "a@example.com");
    await signUp(app(), { email: "a@example.com", username: "first" });

    const list = await listInvites(db);
    expect(list.map((invite) => [invite.email, invite.usedAt !== null])).toEqual([
      ["b@example.com", false],
      ["a@example.com", true],
    ]);
  });

  it("invite:remove takes the email off the list; an account made from it stays", async () => {
    await addInvite(db, "gone@example.com");
    const cookie = await signUp(app(), { email: "gone@example.com", username: "gone" });

    expect(await removeInvite(db, " Gone@Example.com")).toBe(true);
    expect(await removeInvite(db, "gone@example.com")).toBe(false);
    expect(await db.select().from(invites).orderBy(asc(invites.email))).toEqual([]);
    expect((await getWith(app(), "/api/stats", cookie)).statusCode).toBe(200);
    const again = await authPost(app(), "/sign-in/email", {
      email: "gone@example.com",
      password: PASSWORD,
    });
    expect(again.statusCode).toBe(200);
  });
});
