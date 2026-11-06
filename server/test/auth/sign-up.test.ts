import { AuthSession, SignedInResponse, SignInOptions } from "@language-app/core";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Auth } from "../../src/auth/auth";
import { addInvite } from "../../src/auth/invites";
import { invites, users } from "../../src/db/schema";
import { buildTestApp, testAuth } from "../helpers/app";
import { authPost, cookieOf, getWith, PASSWORD, setCookies } from "../helpers/auth";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";

// Create account (docs/design.md §4 Accounts, §9.4): email, username and password, invite-only
// unless SIGNUP_MODE=open (M12.7).

const db = useTestDb();
const app = () => buildTestApp(db, { learner: null });
const signUp = (body: object) => authPost(app(), "/sign-up/email", body);
const errorOf = (res: { json: () => unknown }) => res.json() as { code?: string; message: string };
const accounts = () => db.select().from(users).orderBy(asc(users.id));

const newUser = { email: "New@Example.com", username: "New.User", password: PASSWORD };

describe("sign-up of an invited email", () => {
  it("creates the account: username lower-case and as typed, AI on, en / de", async () => {
    await addInvite(db, "new@example.com");
    const res = await signUp(newUser);

    expect(res.statusCode).toBe(200);
    const row = first(await db.select().from(users).where(eq(users.email, "new@example.com")));
    expect(row).toMatchObject({
      name: "New.User",
      username: "new.user",
      displayUsername: "New.User",
      emailVerified: false,
      aiEnabled: true,
      learnerLanguage: "en",
      targetLanguage: "de",
    });
    expect(row.id).not.toBe(LEARNER_ID);
    expect(SignedInResponse.parse(res.json()).user).toEqual({
      id: String(row.id),
      email: "new@example.com",
      emailVerified: false,
      username: "new.user",
      displayUsername: "New.User",
      aiEnabled: true,
    });
  });

  it("signs the new account in", async () => {
    await addInvite(db, "new@example.com");
    const cookie = cookieOf(await signUp(newUser));

    const session = AuthSession.parse(
      (await getWith(app(), "/api/auth/get-session", cookie)).json(),
    );
    expect(session?.user).toMatchObject({ email: "new@example.com", username: "new.user" });
    // The empty word list of the new account.
    const stats = await getWith(app(), "/api/stats", cookie);
    expect(stats.statusCode).toBe(200);
    expect(stats.json()).toMatchObject({ learning: 0, learned: 0 });
  });

  it("sets an HttpOnly, SameSite=Lax cookie, without Secure over the Mac's plain HTTP", async () => {
    await addInvite(db, "new@example.com");
    const [cookie, ...others] = setCookies(await signUp(newUser));

    expect(others).toEqual([]);
    expect(cookie).toMatch(/^better-auth\.session_token=/);
    expect(cookie).toMatch(/; HttpOnly/i);
    expect(cookie).toMatch(/; SameSite=Lax/i);
    expect(cookie).not.toMatch(/Secure/i);
    // 60 days (§4 Accounts, Sessions).
    expect(cookie).toMatch(/; Max-Age=5184000/);
  });

  it("marks the invite used by the new account", async () => {
    await addInvite(db, "new@example.com");
    await signUp(newUser);

    const account = first(await db.select().from(users).where(eq(users.email, "new@example.com")));
    const invite = first(await db.select().from(invites));
    expect(invite).toMatchObject({ email: "new@example.com", userId: account.id });
    expect(invite.usedAt).toBeInstanceOf(Date);
  });

  it("can't switch its AI off or choose its languages", async () => {
    await addInvite(db, "new@example.com");
    const res = await signUp({ ...newUser, aiEnabled: false, learnerLanguage: "ko" });

    // Fields no client may set are left out silently.
    expect(res.statusCode).toBe(200);
    const row = (await accounts()).find((u) => u.email === "new@example.com");
    expect(row).toMatchObject({ aiEnabled: true, learnerLanguage: "en" });
  });
});

describe("sign-up of an email not on the list", () => {
  it("gets 403 not_invited and no account", async () => {
    await addInvite(db, "someone.else@example.com");
    const res = await signUp(newUser);

    expect(res.statusCode).toBe(403);
    expect(errorOf(res).code).toBe("not_invited");
    expect(setCookies(res)).toEqual([]);
    expect((await accounts()).map((u) => u.id)).toEqual([LEARNER_ID]);
  });

  it("is accepted with SIGNUP_MODE=open, without any check, and has AI on", async () => {
    await addInvite(db, "someone.else@example.com");
    const open = buildTestApp(db, { learner: null, auth: testAuth(db, { signupMode: "open" }) });
    const res = await authPost(open, "/sign-up/email", newUser);

    expect(res.statusCode).toBe(200);
    expect(SignedInResponse.parse(res.json()).user).toMatchObject({
      email: "new@example.com",
      aiEnabled: true,
    });
    expect((await accounts()).map((u) => [u.email, u.aiEnabled])).toEqual([
      [null, true],
      ["new@example.com", true],
    ]);
    // The list isn't touched: the other email's invite stays unused.
    expect(await db.select({ email: invites.email, userId: invites.userId }).from(invites)).toEqual(
      [{ email: "someone.else@example.com", userId: null }],
    );
  });
});

describe("sign-in-options tells the app the sign-up mode (M12.7)", () => {
  const optionsOf = async (auth: Auth) => {
    const res = await buildTestApp(db, { learner: null, auth }).inject({
      method: "GET",
      url: "/api/sign-in-options",
    });
    expect(res.statusCode).toBe(200);
    return SignInOptions.parse(res.json());
  };

  it.each([
    ["invite", false],
    ["invite", true],
    ["open", false],
    ["open", true],
  ] as const)("SIGNUP_MODE=%s, Google %s, signed out", async (signupMode, google) => {
    expect(await optionsOf(testAuth(db, { signupMode, google }))).toEqual({
      google,
      signUp: signupMode,
    });
  });

  it("invite is the default", async () => {
    expect(await optionsOf(testAuth(db))).toEqual({ google: false, signUp: "invite" });
  });
});

describe("refused sign-ups", () => {
  async function withAccount() {
    await addInvite(db, "first@example.com");
    await addInvite(db, "second@example.com");
    expect((await signUp({ ...newUser, email: "first@example.com" })).statusCode).toBe(200);
  }

  it("a username taken in any case", async () => {
    await withAccount();
    const res = await signUp({ ...newUser, email: "second@example.com", username: "NEW.user" });
    expect(res.statusCode).toBe(400);
    expect(errorOf(res).code).toBe("USERNAME_IS_ALREADY_TAKEN");
    expect(await accounts()).toHaveLength(2);
  });

  it("an email taken in any case", async () => {
    await withAccount();
    const res = await signUp({ ...newUser, email: "FIRST@example.com", username: "other" });
    expect(res.statusCode).toBe(422);
    expect(errorOf(res).code).toBe("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL");
    expect(await accounts()).toHaveLength(2);
  });

  it.each([
    ["too short", "ab", "USERNAME_TOO_SHORT"],
    ["too long", "a".repeat(31), "USERNAME_TOO_LONG"],
    ["with a space", "new user", "INVALID_USERNAME"],
    ["with a dash", "new-user", "INVALID_USERNAME"],
    ["missing", undefined, "USERNAME_REQUIRED"],
    ["blank", "   ", "USERNAME_REQUIRED"],
  ])("a username %s", async (_, username, code) => {
    await addInvite(db, "new@example.com");
    const res = await signUp({ ...newUser, username });
    expect(res.statusCode).toBe(400);
    expect(errorOf(res).code).toBe(code);
    expect(await accounts()).toHaveLength(1);
  });

  it.each([
    ["7 characters", "1234567", "PASSWORD_TOO_SHORT"],
    ["129 characters", "x".repeat(129), "PASSWORD_TOO_LONG"],
  ])("a password of %s", async (_, password, code) => {
    await addInvite(db, "new@example.com");
    const res = await signUp({ ...newUser, password });
    expect(res.statusCode).toBe(400);
    expect(errorOf(res).code).toBe(code);
    expect(await accounts()).toHaveLength(1);
  });

  it("accepts the shortest and longest allowed username and password", async () => {
    await addInvite(db, "a@example.com");
    await addInvite(db, "b@example.com");
    const short = await signUp({ email: "a@example.com", username: "abc", password: "12345678" });
    const long = await signUp({
      email: "b@example.com",
      username: "a".repeat(30),
      password: "x".repeat(128),
    });
    expect([short.statusCode, long.statusCode]).toEqual([200, 200]);
  });
});
