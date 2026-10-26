import { AuthSession } from "@language-app/core";
import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addInvite, removeInvite } from "../../src/auth/invites";
import { authAccounts, users } from "../../src/db/schema";
import { buildTestApp, testAuth } from "../helpers/app";
import { authPost, getWith, PASSWORD, setCookies, signUp } from "../helpers/auth";
import { useTestDb } from "../helpers/db";
import {
  APP_HOST,
  connectGoogle,
  fakeGoogle,
  type GoogleAccount,
  sessionCookieOf,
  signInWithGoogle,
  TOKEN_ENDPOINT,
} from "../helpers/google";

// Google's tokens are not kept (docs/design.md §4 Accounts, §5 auth_accounts): the app never
// calls Google after sign-in, so every write of a Google sign-in method leaves the token columns
// empty. Google's side is played by the test (helpers/google.ts), which hands out an access token,
// an id token and, here, a refresh token too.

const db = useTestDb();
const app = (options: { signupMode?: "invite" | "open" } = {}) =>
  buildTestApp(db, { learner: null, auth: testAuth(db, { google: true, ...options }) });

let google: ReturnType<typeof fakeGoogle>;
beforeEach(() => {
  google = fakeGoogle({ refreshToken: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const anna: GoogleAccount = { sub: "google-sub-anna", email: "anna.schmidt@gmail.com" };

/** Nothing of Google's tokens: what every Google sign-in method keeps. */
const NO_TOKENS = {
  accessToken: null,
  refreshToken: null,
  idToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
};

/** Each Google sign-in method's token columns, and what is kept of it. */
const googleRows = () =>
  db
    .select({
      userId: authAccounts.userId,
      accountId: authAccounts.accountId,
      scope: authAccounts.scope,
      accessToken: authAccounts.accessToken,
      refreshToken: authAccounts.refreshToken,
      idToken: authAccounts.idToken,
      accessTokenExpiresAt: authAccounts.accessTokenExpiresAt,
      refreshTokenExpiresAt: authAccounts.refreshTokenExpiresAt,
    })
    .from(authAccounts)
    .where(eq(authAccounts.providerId, "google"))
    .orderBy(asc(authAccounts.id));

const userByEmail = async (email: string) =>
  (await db.select().from(users).where(eq(users.email, email)))[0];

/** The token columns as Better Auth wrote them before M12.3b, on every Google row. */
const plantTokens = () =>
  db
    .update(authAccounts)
    .set({
      accessToken: "ya29.old",
      refreshToken: "1//old",
      idToken: "eyJ.old.sig",
      accessTokenExpiresAt: new Date(),
      refreshTokenExpiresAt: new Date(),
    })
    .where(eq(authAccounts.providerId, "google"));

/** A password account, signed in (unverified email, as every password sign-up). */
async function passwordAccount(email = anna.email) {
  await addInvite(db, email);
  const cookie = await signUp(app(), { email, username: "anna" });
  await removeInvite(db, email);
  return { cookie, id: (await userByEmail(email))?.id };
}

describe("Google's tokens are not kept", () => {
  it("a Google sign-up keeps Google's account id and scope, and no token", async () => {
    await addInvite(db, anna.email);
    google.signsInAs(anna);
    await signInWithGoogle(app());

    // Google did hand out tokens: the exchange happened.
    expect(google.requests.map((r) => r.url)).toEqual([TOKEN_ENDPOINT]);
    const id = (await userByEmail(anna.email))?.id;
    const [row] = await googleRows();
    expect(row).toEqual({
      userId: id,
      accountId: anna.sub,
      // What Google granted (the basic scopes), not a credential: kept.
      scope: expect.stringContaining("openid"),
      ...NO_TOKENS,
    });
  });

  it("signing in again (Better Auth updates the row) stores none, and clears old ones", async () => {
    await addInvite(db, anna.email);
    google.signsInAs(anna);
    await signInWithGoogle(app());
    await plantTokens();

    const { callback, location } = await signInWithGoogle(app());
    expect(location.pathname).toBe("/");
    expect(sessionCookieOf(callback)).not.toBe("");
    expect(await googleRows()).toEqual([expect.objectContaining(NO_TOKENS)]);
  });

  it("a Google sign-in works with nothing stored", async () => {
    await addInvite(db, anna.email);
    google.signsInAs(anna);
    await signInWithGoogle(app());
    expect(await googleRows()).toEqual([expect.objectContaining(NO_TOKENS)]);

    const { callback } = await signInWithGoogle(app());
    const session = AuthSession.parse(
      (await getWith(app(), "/api/auth/get-session", sessionCookieOf(callback))).json(),
    );
    expect(session?.user.email).toBe(anna.email);
  });

  it("Connect (link-social) stores none", async () => {
    const { cookie, id } = await passwordAccount();
    google.signsInAs(anna);
    await connectGoogle(app(), {
      callbackURL: "/settings/account",
      errorCallbackURL: "/settings/account",
      cookie,
    });

    expect(await googleRows()).toEqual([
      expect.objectContaining({ userId: id, accountId: anna.sub, ...NO_TOKENS }),
    ]);
  });

  it("Connect again, for a Google account already connected (Better Auth updates it), stores none", async () => {
    const { cookie } = await passwordAccount();
    google.signsInAs(anna);
    const toAccount = { callbackURL: "/settings/account", errorCallbackURL: "/settings/account" };
    await connectGoogle(app(), { ...toAccount, cookie });
    await plantTokens();

    const { location } = await connectGoogle(app(), { ...toAccount, cookie });
    expect(location.search).toBe("");
    expect(await googleRows()).toEqual([expect.objectContaining(NO_TOKENS)]);
  });

  it("the implicit link of an account with a verified email stores none", async () => {
    const { id } = await passwordAccount();
    // As user:claim leaves the developer account: its email verified.
    await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, id ?? 0));
    google.signsInAs(anna);
    const { location } = await signInWithGoogle(app());

    expect(location.pathname).toBe("/");
    expect(await googleRows()).toEqual([
      expect.objectContaining({ userId: id, accountId: anna.sub, ...NO_TOKENS }),
    ]);
  });

  it("the password stays as it was when Google is added", async () => {
    const { cookie, id } = await passwordAccount();
    const passwordOf = async () =>
      (
        await db
          .select({ password: authAccounts.password })
          .from(authAccounts)
          .where(eq(authAccounts.userId, id ?? 0))
      ).find((row) => row.password !== null)?.password;
    const before = await passwordOf();
    google.signsInAs(anna);
    await connectGoogle(app(), {
      callbackURL: "/settings/account",
      errorCallbackURL: "/settings/account",
      cookie,
    });

    expect(before).toEqual(expect.any(String));
    expect(await passwordOf()).toBe(before);
    const signIn = await authPost(app(), "/sign-in/username", {
      username: "anna",
      password: PASSWORD,
    });
    expect(signIn.statusCode).toBe(200);
  });

  it("nor do they go into a cookie: the return sets only the session (and clears the state)", async () => {
    await addInvite(db, anna.email);
    google.signsInAs(anna);
    const { callback } = await signInWithGoogle(app());

    const names = setCookies(callback).map((cookie) => cookie.split("=")[0]);
    expect(names.sort()).toEqual(["better-auth.session_token", "better-auth.state"]);
    expect(String(callback.headers["set-cookie"])).not.toMatch(/ya29|1\/\/test-refresh|eyJ/);
  });
});

describe("Better Auth's endpoints that hand out or use Google's tokens are switched off", () => {
  async function signedInWithGoogle() {
    await addInvite(db, anna.email);
    google.signsInAs(anna);
    const cookie = sessionCookieOf((await signInWithGoogle(app())).callback);
    const methods = (await getWith(app(), "/api/auth/list-accounts", cookie)).json<
      Array<{ id: string; providerId: string }>
    >();
    const googleId = methods.find((m) => m.providerId === "google")?.id ?? "";
    return { cookie, googleId };
  }

  it("get-access-token and refresh-token answer 404", async () => {
    const { cookie, googleId } = await signedInWithGoogle();
    for (const path of ["/get-access-token", "/refresh-token"]) {
      const res = await authPost(app(), path, { accountId: googleId }, { cookie, host: APP_HOST });
      expect(res.statusCode, path).toBe(404);
    }
  });

  it("account-info answers 404, and nothing is fetched from Google", async () => {
    const { cookie, googleId } = await signedInWithGoogle();
    const before = google.requests.length;
    const res = await app().inject({
      method: "GET",
      url: `/api/auth/account-info?accountId=${googleId}`,
      headers: { cookie, host: APP_HOST },
    });
    expect(res.statusCode).toBe(404);
    expect(google.requests).toHaveLength(before);
  });

  it("is-username-available stays off too", async () => {
    const res = await authPost(app(), "/is-username-available", { username: "anna" });
    expect(res.statusCode).toBe(404);
  });

  it("list-accounts still answers, without any token", async () => {
    const { cookie } = await signedInWithGoogle();
    const res = await getWith(app(), "/api/auth/list-accounts", cookie);
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toMatch(/accessToken|idToken|refreshToken|ya29/);
  });
});
