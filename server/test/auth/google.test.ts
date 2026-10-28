import { AuthSession, SignInMethods, SignInOptions } from "@language-app/core";
import { asc, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addInvite, removeInvite } from "../../src/auth/invites";
import { authAccounts, authSessions, invites, users } from "../../src/db/schema";
import { buildTestApp, TEST_GOOGLE, testAuth } from "../helpers/app";
import { authPost, getWith, signUp } from "../helpers/auth";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";
import {
  APP_HOST,
  connectGoogle,
  fakeGoogle,
  type GoogleAccount,
  sessionCookieOf,
  signInWithGoogle,
  TOKEN_ENDPOINT,
} from "../helpers/google";

// Google sign-in (docs/design.md §4 Accounts, §9.4, §12): Continue with Google on Sign in and
// Create account, Connect on Account. Google's side is played by the test and its token endpoint
// answered by a fake fetch (helpers/google.ts); no request leaves the machine.

const db = useTestDb();
const auth = (options: { signupMode?: "invite" | "open" } = {}) =>
  testAuth(db, { google: true, ...options });
const app = (options: { signupMode?: "invite" | "open" } = {}) =>
  buildTestApp(db, { learner: null, auth: auth(options) });

let google: ReturnType<typeof fakeGoogle>;
beforeEach(() => {
  google = fakeGoogle();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const anna: GoogleAccount = { sub: "google-sub-anna", email: "Anna.Schmidt@gmail.com" };

const userByEmail = async (email: string) =>
  (await db.select().from(users).where(eq(users.email, email)))[0];
const googleRows = () =>
  db
    .select({ userId: authAccounts.userId, accountId: authAccounts.accountId })
    .from(authAccounts)
    .where(eq(authAccounts.providerId, "google"))
    .orderBy(asc(authAccounts.id));
const userCount = async () => (await db.select({ id: users.id }).from(users)).length;

describe("without the Google pair", () => {
  it("Google isn't offered: sign-in-options says so and sign-in/social has no Google", async () => {
    const plain = buildTestApp(db, { learner: null });

    const options = await plain.inject({ method: "GET", url: "/api/sign-in-options" });
    expect(options.statusCode).toBe(200);
    expect(SignInOptions.parse(options.json())).toEqual({ google: false, signUp: "invite" });

    const res = await authPost(plain, "/sign-in/social", {
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/signin",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: "PROVIDER_NOT_FOUND" });
  });
});

describe("Continue with Google: the address the browser is sent to", () => {
  it("sign-in-options offers Google, signed out", async () => {
    const res = await app().inject({ method: "GET", url: "/api/sign-in-options" });
    expect(SignInOptions.parse(res.json())).toEqual({ google: true, signUp: "invite" });
  });

  it("is Google's, with our client, a state, the return address and the basic scopes", async () => {
    const res = await authPost(
      app(),
      "/sign-in/social",
      { provider: "google", callbackURL: "/", errorCallbackURL: "/signin" },
      { host: APP_HOST },
    );

    expect(res.statusCode).toBe(200);
    const url = new URL(res.json<{ url: string }>().url);
    expect(`${url.origin}${url.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const params = url.searchParams;
    expect(params.get("client_id")).toBe(TEST_GOOGLE.clientId);
    expect(params.get("redirect_uri")).toBe(`http://${APP_HOST}/api/auth/callback/google`);
    expect(params.get("response_type")).toBe("code");
    expect(params.get("state")).toMatch(/^[\w-]{32}$/);
    expect(params.get("scope")?.split(" ").sort()).toEqual(["email", "openid", "profile"]);
    // PKCE, and the account chooser every time (so another Google account can be picked).
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("code_challenge")).toBeTruthy();
    expect(params.get("prompt")).toBe("select_account");
    // The state is kept in a short-lived cookie as well; nothing was fetched.
    expect(String(res.headers["set-cookie"])).toMatch(/better-auth\.state=.*Max-Age=300/);
    expect(google.requests).toEqual([]);
  });

  it("the return address follows the address the app was opened on", async () => {
    const host = "192.168.1.20:5173";
    const res = await authPost(
      app(),
      "/sign-in/social",
      { provider: "google", callbackURL: "/", errorCallbackURL: "/signin" },
      { host, origin: `http://${host}` },
    );
    const url = new URL(res.json<{ url: string }>().url);
    expect(url.searchParams.get("redirect_uri")).toBe(`http://${host}/api/auth/callback/google`);
  });

  it("refuses a return to another site", async () => {
    const res = await authPost(
      app(),
      "/sign-in/social",
      { provider: "google", callbackURL: "https://evil.example/", errorCallbackURL: "/signin" },
      { host: APP_HOST },
    );
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: "INVALID_CALLBACK_URL" });
  });

  it("is limited to 10 a minute per address, rather than Better Auth's 3 per 10 s", async () => {
    const limited = buildTestApp(db, {
      learner: null,
      auth: testAuth(db, { google: true, rateLimit: true }),
    });
    const statuses: number[] = [];
    for (let attempt = 1; attempt <= 11; attempt++) {
      const res = await authPost(
        limited,
        "/sign-in/social",
        { provider: "google", callbackURL: "/", errorCallbackURL: "/signin" },
        { host: APP_HOST, forwardedFor: "192.168.1.20" },
      );
      statuses.push(res.statusCode);
    }
    expect(statuses).toEqual([...Array(10).fill(200), 429]);
  });

  it("the code is exchanged at Google's token endpoint, the only request sent out", async () => {
    await addInvite(db, anna.email);
    google.signsInAs(anna);
    const { google: address } = await signInWithGoogle(app());

    expect(google.requests.map((r) => [r.method, r.url])).toEqual([["POST", TOKEN_ENDPOINT]]);
    const body = google.requests[0]?.body;
    expect(body?.get("grant_type")).toBe("authorization_code");
    expect(body?.get("code")).toBe("test-authorization-code");
    expect(body?.get("redirect_uri")).toBe(address.searchParams.get("redirect_uri"));
    expect(body?.get("client_id")).toBe(TEST_GOOGLE.clientId);
    expect(body?.get("client_secret")).toBe(TEST_GOOGLE.clientSecret);
    expect(body?.get("code_verifier")?.length).toBeGreaterThanOrEqual(43);
  });
});

describe("sign-up with Google", () => {
  it("an invited email gets its account: verified, a username from the email, no AI", async () => {
    await addInvite(db, "anna.schmidt@gmail.com");
    google.signsInAs({ ...anna, name: "Anna Schmidt", picture: "https://lh3.example/anna" });
    const { callback, location } = await signInWithGoogle(app(), { callbackURL: "/words" });

    expect(callback.statusCode).toBe(302);
    expect(location.pathname).toBe("/words");
    const row = await userByEmail("anna.schmidt@gmail.com");
    expect(row).toMatchObject({
      emailVerified: true,
      username: "anna.schmidt",
      displayUsername: "anna.schmidt",
      // As for a password sign-up, `name` is the username.
      name: "anna.schmidt",
      image: "https://lh3.example/anna",
      aiEnabled: false,
      learnerLanguage: "en",
      targetLanguage: "de",
    });
    expect(await googleRows()).toEqual([{ userId: row?.id, accountId: anna.sub }]);
  });

  it("is signed in on its return", async () => {
    await addInvite(db, anna.email);
    google.signsInAs(anna);
    const { callback } = await signInWithGoogle(app());

    const cookie = sessionCookieOf(callback);
    expect(cookie).not.toBe("");
    const session = AuthSession.parse(
      (await getWith(app(), "/api/auth/get-session", cookie)).json(),
    );
    expect(session?.user).toMatchObject({ email: "anna.schmidt@gmail.com", aiEnabled: false });
    expect((await getWith(app(), "/api/stats", cookie)).json()).toMatchObject({ learning: 0 });
  });

  it("marks the invite used", async () => {
    await addInvite(db, anna.email);
    google.signsInAs(anna);
    await signInWithGoogle(app());

    const account = await userByEmail("anna.schmidt@gmail.com");
    const invite = first(await db.select().from(invites));
    expect(invite.userId).toBe(account?.id);
    expect(invite.usedAt).toBeInstanceOf(Date);
  });

  it("a username already taken gets a number", async () => {
    await addInvite(db, "anna.schmidt@gmail.com");
    await addInvite(db, "anna.schmidt@example.com");
    // A password account already has the name.
    await addInvite(db, "someone@example.com");
    await signUp(app(), { email: "someone@example.com", username: "Anna.Schmidt" });

    google.signsInAs(anna);
    await signInWithGoogle(app());
    google.signsInAs({ sub: "google-sub-anna-2", email: "anna.schmidt@example.com" });
    await signInWithGoogle(app());

    expect((await userByEmail("anna.schmidt@gmail.com"))?.username).toBe("anna.schmidt2");
    expect((await userByEmail("anna.schmidt@example.com"))?.username).toBe("anna.schmidt3");
  });

  it("an email not on the list comes back to Sign in with not_invited, and no account", async () => {
    await addInvite(db, "someone.else@example.com");
    google.signsInAs(anna);
    const { callback, location } = await signInWithGoogle(app());

    expect(callback.statusCode).toBe(302);
    expect(location.pathname).toBe("/signin");
    expect(location.searchParams.get("error")).toBe("not_invited");
    expect(sessionCookieOf(callback)).toBe("");
    expect(await userCount()).toBe(1);
    expect(await googleRows()).toEqual([]);
  });

  it("the way back to Sign in keeps the page in next", async () => {
    google.signsInAs(anna);
    const { location } = await signInWithGoogle(app(), {
      callbackURL: "/words",
      errorCallbackURL: "/signin?next=%2Fwords",
    });
    expect(`${location.pathname}${location.search}`).toMatch(
      /^\/signin\?next=%2Fwords&error=not_invited/,
    );
  });

  it("with SIGNUP_MODE=open there is no check, and the new account has AI off", async () => {
    await addInvite(db, "someone.else@example.com");
    google.signsInAs(anna);
    const { callback, location } = await signInWithGoogle(app({ signupMode: "open" }));

    expect(location.pathname).toBe("/");
    expect(location.searchParams.get("error")).toBeNull();
    expect(sessionCookieOf(callback)).not.toBe("");
    expect(await userByEmail("anna.schmidt@gmail.com")).toMatchObject({
      username: "anna.schmidt",
      emailVerified: true,
      aiEnabled: false,
    });
    // The list isn't touched: the other email's invite stays unused.
    expect(await db.select({ email: invites.email, userId: invites.userId }).from(invites)).toEqual(
      [{ email: "someone.else@example.com", userId: null }],
    );
  });

  it("cancelled on Google's page: back to Sign in with access_denied, nothing fetched", async () => {
    const { location } = await signInWithGoogle(app(), {
      query: { error: "access_denied" },
    });
    expect(location.pathname).toBe("/signin");
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(google.requests).toEqual([]);
    expect(await userCount()).toBe(1);
  });
});

describe("signing in again with Google", () => {
  it("is the same account, even once its invite is gone", async () => {
    await addInvite(db, anna.email);
    google.signsInAs(anna);
    await signInWithGoogle(app());
    await removeInvite(db, anna.email);

    const { callback, location } = await signInWithGoogle(app());
    expect(location.pathname).toBe("/");
    expect(sessionCookieOf(callback)).not.toBe("");
    expect(await userCount()).toBe(2);
    expect(await googleRows()).toHaveLength(1);
  });
});

describe("an existing account with the same email", () => {
  it("a password account (its email not verified) gets account_not_linked", async () => {
    await addInvite(db, "anna.schmidt@gmail.com");
    await signUp(app(), { email: "anna.schmidt@gmail.com", username: "anna" });
    google.signsInAs(anna);
    const { callback, location } = await signInWithGoogle(app());

    expect(location.pathname).toBe("/signin");
    expect(location.searchParams.get("error")).toBe("account_not_linked");
    expect(sessionCookieOf(callback)).toBe("");
    expect(await googleRows()).toEqual([]);
  });

  it("the developer account (its email verified by user:claim) is linked and signed in", async () => {
    // As user:claim leaves user 1: an email it vouched for, and a password. Not on the invite list.
    await db
      .update(users)
      .set({ email: "anna.schmidt@gmail.com", emailVerified: true, username: "anna" })
      .where(eq(users.id, LEARNER_ID));
    google.signsInAs(anna);
    const { callback, location } = await signInWithGoogle(app());

    expect(location.pathname).toBe("/");
    expect(await googleRows()).toEqual([{ userId: LEARNER_ID, accountId: anna.sub }]);
    const session = AuthSession.parse(
      (await getWith(app(), "/api/auth/get-session", sessionCookieOf(callback))).json(),
    );
    expect(session?.user.id).toBe(String(LEARNER_ID));
    expect(await userCount()).toBe(1);
  });

  it("but not when Google hasn't verified the email", async () => {
    await db
      .update(users)
      .set({ email: "anna.schmidt@gmail.com", emailVerified: true })
      .where(eq(users.id, LEARNER_ID));
    google.signsInAs({ ...anna, emailVerified: false });
    const { location } = await signInWithGoogle(app());

    expect(location.searchParams.get("error")).toBe("account_not_linked");
    expect(await googleRows()).toEqual([]);
  });
});

describe("Connect on Account (link-social)", () => {
  const toAccount = { callbackURL: "/settings/account", errorCallbackURL: "/settings/account" };

  /** A password account, signed in; its invite is gone, so linking can't depend on it. */
  async function passwordAccount(email = "anna.schmidt@gmail.com") {
    await addInvite(db, email);
    const cookie = await signUp(app(), { email, username: "anna" });
    await removeInvite(db, email);
    const id = (await userByEmail(email))?.id;
    return { cookie, id };
  }

  it("links the Google account of the same email, with no invite check, and returns to Account", async () => {
    const { cookie, id } = await passwordAccount();
    google.signsInAs(anna);
    const { callback, location } = await connectGoogle(app(), { ...toAccount, cookie });

    expect(callback.statusCode).toBe(302);
    expect(`${location.pathname}${location.search}`).toBe("/settings/account");
    expect(await googleRows()).toEqual([{ userId: id, accountId: anna.sub }]);
    // Account then lists both ways in.
    const methods = SignInMethods.parse(
      (await getWith(app(), "/api/auth/list-accounts", cookie)).json(),
    );
    expect(methods.map((m) => m.providerId).sort()).toEqual(["credential", "google"]);
  });

  it("afterwards Continue with Google signs in to that account", async () => {
    const { cookie, id } = await passwordAccount();
    google.signsInAs(anna);
    await connectGoogle(app(), { ...toAccount, cookie });

    const { callback, location } = await signInWithGoogle(app());
    expect(location.pathname).toBe("/");
    const session = AuthSession.parse(
      (await getWith(app(), "/api/auth/get-session", sessionCookieOf(callback))).json(),
    );
    expect(session?.user.id).toBe(String(id));
  });

  it("refuses a Google account with another email", async () => {
    const { cookie } = await passwordAccount();
    google.signsInAs({ sub: "google-sub-other", email: "other.person@gmail.com" });
    const { location } = await connectGoogle(app(), { ...toAccount, cookie });

    expect(location.pathname).toBe("/settings/account");
    expect(location.searchParams.get("error")).toBe("email_does_not_match");
    expect(await googleRows()).toEqual([]);
  });

  it("refuses a Google account that belongs to another account here", async () => {
    // Anna's Google account already made an account of its own (open sign-up for brevity).
    google.signsInAs(anna);
    await signInWithGoogle(app({ signupMode: "open" }));
    const { cookie } = await passwordAccount("anna.schmidt@example.com");
    google.signsInAs({ ...anna, email: "anna.schmidt@example.com" });
    const { location } = await connectGoogle(app(), { ...toAccount, cookie });

    expect(location.searchParams.get("error")).toBe("account_already_linked_to_different_user");
    expect(await googleRows()).toHaveLength(1);
  });

  it("needs a session", async () => {
    const res = await authPost(
      app(),
      "/link-social",
      { provider: "google", ...toAccount },
      { host: APP_HOST },
    );
    expect(res.statusCode).toBe(401);
  });
});

describe("deleting a Google-only account", () => {
  it("with a sign-in more than a day old: signing in with Google again, then delete", async () => {
    await addInvite(db, anna.email);
    google.signsInAs(anna);
    const old = sessionCookieOf((await signInWithGoogle(app())).callback);
    const id = (await userByEmail("anna.schmidt@gmail.com"))?.id ?? 0;
    await db.execute(
      sql`UPDATE auth_sessions SET created_at = now() - interval '25 hours' WHERE user_id = ${id}`,
    );

    const refused = await authPost(app(), "/delete-user", {}, { cookie: old });
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ code: "SESSION_EXPIRED" });

    // Account's "Sign in with Google", while still signed in, coming back to Account.
    const again = await signInWithGoogle(app(), {
      callbackURL: "/settings/account",
      errorCallbackURL: "/settings/account",
      loginHint: "anna.schmidt@gmail.com",
      cookie: old,
    });
    expect(again.google.searchParams.get("login_hint")).toBe("anna.schmidt@gmail.com");
    expect(again.location.pathname).toBe("/settings/account");
    const fresh = sessionCookieOf(again.callback);

    const deleted = await authPost(app(), "/delete-user", {}, { cookie: fresh });
    expect(deleted.statusCode).toBe(200);
    expect(await userByEmail("anna.schmidt@gmail.com")).toBeUndefined();
    expect(await db.select().from(authAccounts).where(eq(authAccounts.userId, id))).toEqual([]);
    expect(await db.select().from(authSessions).where(eq(authSessions.userId, id))).toEqual([]);
  });
});
