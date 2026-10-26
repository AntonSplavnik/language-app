import { SignInMethods, UnlinkAccountResponse } from "@language-app/core";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addInvite, removeInvite } from "../../src/auth/invites";
import { authAccounts, users } from "../../src/db/schema";
import { buildTestApp, TRUSTED_ORIGIN, testAuth } from "../helpers/app";
import { authPost, cookieOf, getWith, PASSWORD, signUp } from "../helpers/auth";
import { useTestDb } from "../helpers/db";
import {
  APP_HOST,
  connectGoogle,
  fakeGoogle,
  type GoogleAccount,
  sessionCookieOf,
  signInWithGoogle,
} from "../helpers/google";

// Disconnect on Account (docs/design.md §4 Accounts, §9.4, §12): `POST /api/auth/unlink-account`
// with the Google sign-in method's id (from list-accounts). Only an account that has another way
// to sign in (a password) can disconnect Google; the password itself can't be removed. Implicit
// linking stays on, so a verified email's next Continue with Google connects Google again.

const db = useTestDb();
const app = () => buildTestApp(db, { learner: null, auth: testAuth(db, { google: true }) });

let google: ReturnType<typeof fakeGoogle>;
beforeEach(() => {
  google = fakeGoogle();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const anna: GoogleAccount = { sub: "google-sub-anna", email: "anna.schmidt@gmail.com" };
const toAccount = { callbackURL: "/settings/account", errorCallbackURL: "/settings/account" };

const userByEmail = async (email: string) =>
  (await db.select().from(users).where(eq(users.email, email)))[0];

const methodsOf = async (cookie: string) =>
  SignInMethods.parse((await getWith(app(), "/api/auth/list-accounts", cookie)).json());

const googleIdOf = async (cookie: string) =>
  (await methodsOf(cookie)).find((method) => method.providerId === "google")?.id ?? "";

const disconnect = (cookie: string | undefined, accountId: string, origin = TRUSTED_ORIGIN) =>
  authPost(app(), "/unlink-account", { accountId }, { cookie, host: APP_HOST, origin });

/** A password account with Google connected, signed in (that sign-in is fresh). */
async function passwordAccountWithGoogle({ verified = false } = {}) {
  await addInvite(db, anna.email);
  const cookie = await signUp(app(), { email: anna.email, username: "anna" });
  await removeInvite(db, anna.email);
  const id = (await userByEmail(anna.email))?.id ?? 0;
  if (verified) await db.update(users).set({ emailVerified: true }).where(eq(users.id, id));
  google.signsInAs(anna);
  await connectGoogle(app(), { ...toAccount, cookie });
  return { cookie, id, googleId: await googleIdOf(cookie) };
}

/** Makes every sign-in of the account older than a day (Better Auth's "fresh" is a day). */
const ageSignIns = (userId: number) =>
  db.execute(
    sql`UPDATE auth_sessions SET created_at = now() - interval '25 hours' WHERE user_id = ${userId}`,
  );

describe("Disconnect for an account with a password", () => {
  it("removes the Google sign-in method; list-accounts then shows only the password", async () => {
    const { cookie, id, googleId } = await passwordAccountWithGoogle();
    expect(googleId).not.toBe("");

    const res = await disconnect(cookie, googleId);
    expect(res.statusCode).toBe(200);
    expect(UnlinkAccountResponse.parse(res.json())).toEqual({ status: true });

    const rows = await db
      .select({ providerId: authAccounts.providerId })
      .from(authAccounts)
      .where(eq(authAccounts.userId, id));
    expect(rows).toEqual([{ providerId: "credential" }]);
    expect((await methodsOf(cookie)).map((m) => m.providerId)).toEqual(["credential"]);
  });

  it("keeps the session, and the password still signs in", async () => {
    const { cookie, googleId } = await passwordAccountWithGoogle();
    await disconnect(cookie, googleId);

    expect((await getWith(app(), "/api/auth/get-session", cookie)).json()).not.toBeNull();
    const signIn = await authPost(app(), "/sign-in/username", {
      username: "anna",
      password: PASSWORD,
    });
    expect(signIn.statusCode).toBe(200);
  });

  it("needs a sign-in from within the last day (403 SESSION_NOT_FRESH), and keeps Google", async () => {
    const { cookie, id, googleId } = await passwordAccountWithGoogle();
    await ageSignIns(id);

    const res = await disconnect(cookie, googleId);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: "SESSION_NOT_FRESH" });
    expect(await googleIdOf(cookie)).toBe(googleId);

    // Signing in again gives a fresh sign-in, with which it works.
    const again = await authPost(app(), "/sign-in/username", {
      username: "anna",
      password: PASSWORD,
    });
    expect((await disconnect(cookieOf(again), googleId)).statusCode).toBe(200);
  });

  it("can't remove the password: 400 CANNOT_UNLINK_PASSWORD, nothing removed", async () => {
    const { cookie, id } = await passwordAccountWithGoogle();
    const passwordId = (await methodsOf(cookie)).find((m) => m.providerId === "credential")?.id;

    const res = await disconnect(cookie, passwordId ?? "");
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "CANNOT_UNLINK_PASSWORD" });
    const rows = await db.select().from(authAccounts).where(eq(authAccounts.userId, id));
    expect(rows.map((row) => row.providerId).sort()).toEqual(["credential", "google"]);
  });

  it("another account's sign-in method is ACCOUNT_NOT_FOUND and stays", async () => {
    // Bea signs up with Google (open sign-up for brevity); Anna tries to remove Bea's Google.
    const bea: GoogleAccount = { sub: "google-sub-bea", email: "bea@gmail.com" };
    google.signsInAs(bea);
    const beaCookie = sessionCookieOf(
      (
        await signInWithGoogle(
          buildTestApp(db, {
            learner: null,
            auth: testAuth(db, { google: true, signupMode: "open" }),
          }),
        )
      ).callback,
    );
    const beasGoogle = await googleIdOf(beaCookie);
    const { cookie } = await passwordAccountWithGoogle();

    const res = await disconnect(cookie, beasGoogle);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
    expect(await googleIdOf(beaCookie)).toBe(beasGoogle);
  });

  it("from an address that isn't trusted: 403 INVALID_ORIGIN, nothing removed", async () => {
    const { cookie, googleId } = await passwordAccountWithGoogle();
    const res = await disconnect(cookie, googleId, "http://evil.example");
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: "INVALID_ORIGIN" });
    expect(await googleIdOf(cookie)).toBe(googleId);
  });
});

describe("Disconnect refused", () => {
  it("for a Google-only account: FAILED_TO_UNLINK_LAST_ACCOUNT, and it keeps Google", async () => {
    await addInvite(db, anna.email);
    google.signsInAs(anna);
    const cookie = sessionCookieOf((await signInWithGoogle(app())).callback);
    const googleId = await googleIdOf(cookie);

    const res = await disconnect(cookie, googleId);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "FAILED_TO_UNLINK_LAST_ACCOUNT" });
    expect((await methodsOf(cookie)).map((m) => m.providerId)).toEqual(["google"]);
  });

  it("without a session: 401", async () => {
    const { googleId } = await passwordAccountWithGoogle();
    const res = await disconnect(undefined, googleId);
    expect(res.statusCode).toBe(401);
    expect(
      await db
        .select()
        .from(authAccounts)
        .where(eq(authAccounts.id, Number(googleId))),
    ).toHaveLength(1);
  });
});

describe("after Disconnect", () => {
  it("Continue with Google on an account with a verified email connects Google again", async () => {
    const { cookie, id, googleId } = await passwordAccountWithGoogle({ verified: true });
    await disconnect(cookie, googleId);

    const { callback, location } = await signInWithGoogle(app());
    expect(location.pathname).toBe("/");
    expect(sessionCookieOf(callback)).not.toBe("");
    const rows = await db
      .select({ userId: authAccounts.userId, accountId: authAccounts.accountId })
      .from(authAccounts)
      .where(eq(authAccounts.providerId, "google"));
    expect(rows).toEqual([{ userId: id, accountId: anna.sub }]);
  });

  it("Continue with Google on an unverified email answers account_not_linked; Connect works again", async () => {
    const { cookie, googleId } = await passwordAccountWithGoogle();
    await disconnect(cookie, googleId);

    const { location } = await signInWithGoogle(app());
    expect(location.pathname).toBe("/signin");
    expect(location.searchParams.get("error")).toBe("account_not_linked");
    expect(await googleIdOf(cookie)).toBe("");

    const { location: back } = await connectGoogle(app(), { ...toAccount, cookie });
    expect(`${back.pathname}${back.search}`).toBe("/settings/account");
    expect(await googleIdOf(cookie)).not.toBe("");
  });
});
