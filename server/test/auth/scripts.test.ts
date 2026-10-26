import { SignedInResponse } from "@language-app/core";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { claimFirstUser } from "../../src/auth/claim";
import { addInvite, isInvited, listInvites, removeInvite } from "../../src/auth/invites";
import { authAccounts, invites, users, userWords, words } from "../../src/db/schema";
import { buildTestApp, testAuth } from "../helpers/app";
import { authPost, cookieOf, getWith, PASSWORD, signUp } from "../helpers/auth";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";

// The account scripts (docs/design.md §17.6): user:claim and the invite list.

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
