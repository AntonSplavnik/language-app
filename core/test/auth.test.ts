import { describe, expect, it } from "vitest";
import {
  ApiClientError,
  AuthSession,
  createApiClient,
  DeleteAccountRequest,
  SignInOptions,
  SignUpRequest,
  SocialSignInRequest,
  UnlinkAccountRequest,
} from "../src";

// Accounts (docs/design.md §9.4): Better Auth's endpoints under /api/auth, called like any other.

const json = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** What Better Auth answers for an account: ids as strings, and more fields than we read. */
const user = {
  id: "2",
  name: "New.User",
  email: "new@example.com",
  emailVerified: false,
  image: null,
  createdAt: "2026-10-25T10:00:00.000Z",
  updatedAt: "2026-10-25T10:00:00.000Z",
  username: "new.user",
  displayUsername: "New.User",
  learnerLanguage: "en",
  targetLanguage: "de",
  aiEnabled: false,
};

/** A fetch that records what it was asked and answers with `body`. */
function recording(status: number, body: unknown) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return json(status, body)();
  };
  return { calls, api: createApiClient({ fetch }) };
}

describe("auth endpoints (§9.4)", () => {
  it("getSession reads the account, its ids as strings, and only the fields the app uses", async () => {
    const { api, calls } = recording(200, {
      session: { id: "5", userId: "2", token: "t", expiresAt: "2026-12-24T10:00:00.000Z" },
      user,
    });
    const session = await api.getSession();
    expect(calls).toEqual([{ url: "/api/auth/get-session", method: "GET", body: undefined }]);
    expect(session?.session).toEqual({
      id: "5",
      userId: "2",
      expiresAt: "2026-12-24T10:00:00.000Z",
    });
    expect(session?.user).toEqual({
      id: "2",
      email: "new@example.com",
      emailVerified: false,
      username: "new.user",
      displayUsername: "New.User",
      aiEnabled: false,
    });
  });

  it("getSession is null when signed out", async () => {
    const { api } = recording(200, null);
    expect(await api.getSession()).toBeNull();
  });

  it("ids are strings: a number is an unexpected answer", () => {
    expect(
      AuthSession.safeParse({
        session: { id: 5, userId: 2, expiresAt: "2026-12-24T10:00:00.000Z" },
        user: { ...user, id: 2 },
      }).success,
    ).toBe(false);
  });

  it("signUp posts the email, username and password", async () => {
    const { api, calls } = recording(200, { token: "t", user });
    const signedIn = await api.signUp({
      email: "new@example.com",
      username: "New.User",
      password: "long enough",
    });
    expect(calls).toEqual([
      {
        url: "/api/auth/sign-up/email",
        method: "POST",
        body: { email: "new@example.com", username: "New.User", password: "long enough" },
      },
    ]);
    expect(signedIn.user.displayUsername).toBe("New.User");
  });

  it("signs in by email or by username, each on its own path", async () => {
    const byEmail = recording(200, { redirect: false, token: "t", user });
    await byEmail.api.signInEmail({ email: "New@Example.com", password: "pw" });
    expect(byEmail.calls[0]).toEqual({
      url: "/api/auth/sign-in/email",
      method: "POST",
      body: { email: "New@Example.com", password: "pw" },
    });

    const byUsername = recording(200, { token: "t", user });
    await byUsername.api.signInUsername({ username: "NEW.user", password: "pw" });
    expect(byUsername.calls[0]).toEqual({
      url: "/api/auth/sign-in/username",
      method: "POST",
      body: { username: "NEW.user", password: "pw" },
    });
  });

  it("signOut posts to sign-out", async () => {
    const { api, calls } = recording(200, { success: true });
    expect(await api.signOut()).toEqual({ success: true });
    expect(calls).toEqual([{ url: "/api/auth/sign-out", method: "POST", body: {} }]);
  });

  it("deleteAccount posts the password to delete-user", async () => {
    const { api, calls } = recording(200, { success: true, message: "User deleted" });
    expect(await api.deleteAccount({ password: "long enough" })).toEqual({
      success: true,
      message: "User deleted",
    });
    expect(calls).toEqual([
      { url: "/api/auth/delete-user", method: "POST", body: { password: "long enough" } },
    ]);
  });

  it("deleteAccount without a password (an account that has none) sends an empty body", async () => {
    const { api, calls } = recording(200, { success: true, message: "User deleted" });
    await api.deleteAccount({});
    expect(calls[0]?.body).toEqual({});
  });

  it("a wrong password keeps Better Auth's code", async () => {
    const api = createApiClient({
      fetch: json(400, { code: "INVALID_PASSWORD", message: "Invalid password" }),
    });
    await expect(api.deleteAccount({ password: "wrong one" })).rejects.toMatchObject({
      code: "INVALID_PASSWORD",
      status: 400,
    });
  });

  it("listAccounts reads the ways the account signs in", async () => {
    const { api, calls } = recording(200, [
      {
        id: "3",
        providerId: "credential",
        accountId: "2",
        userId: "2",
        scopes: [],
        createdAt: "2026-10-25T10:00:00.000Z",
        updatedAt: "2026-10-25T10:00:00.000Z",
      },
    ]);
    expect(await api.listAccounts()).toEqual([{ id: "3", providerId: "credential" }]);
    expect(calls).toEqual([{ url: "/api/auth/list-accounts", method: "GET", body: undefined }]);
  });

  it("unlinkAccount (Disconnect) posts the sign-in method's id to unlink-account", async () => {
    const { api, calls } = recording(200, { status: true });
    expect(await api.unlinkAccount({ accountId: "4" })).toEqual({ status: true });
    expect(calls).toEqual([
      { url: "/api/auth/unlink-account", method: "POST", body: { accountId: "4" } },
    ]);
  });

  it("unlinkAccount's refusals keep Better Auth's codes", async () => {
    const last = createApiClient({
      fetch: json(400, {
        code: "FAILED_TO_UNLINK_LAST_ACCOUNT",
        message: "You can't unlink your last account",
      }),
    });
    await expect(last.unlinkAccount({ accountId: "4" })).rejects.toMatchObject({
      code: "FAILED_TO_UNLINK_LAST_ACCOUNT",
      status: 400,
    });
    const stale = createApiClient({
      fetch: json(403, { code: "SESSION_NOT_FRESH", message: "Session is not fresh" }),
    });
    const error = await stale.unlinkAccount({ accountId: "4" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ code: "SESSION_NOT_FRESH", status: 403 });
  });
});

describe("UnlinkAccountRequest (§9.4)", () => {
  it("names one sign-in method by its id (from list-accounts), not by its provider", () => {
    expect(UnlinkAccountRequest.safeParse({ accountId: "4" }).success).toBe(true);
    expect(UnlinkAccountRequest.safeParse({ accountId: "" }).success).toBe(false);
    expect(UnlinkAccountRequest.safeParse({ providerId: "google" }).success).toBe(false);
  });
});

describe("DeleteAccountRequest (§9.4)", () => {
  it("takes an optional password of at most 128 characters", () => {
    expect(DeleteAccountRequest.safeParse({}).success).toBe(true);
    expect(DeleteAccountRequest.safeParse({ password: "pw" }).success).toBe(true);
    expect(DeleteAccountRequest.safeParse({ password: "x".repeat(129) }).success).toBe(false);
  });
});

describe("auth errors", () => {
  it("Better Auth's error body becomes an ApiClientError with its code and message", async () => {
    const api = createApiClient({
      fetch: json(400, {
        code: "USERNAME_IS_ALREADY_TAKEN",
        message: "Username is already taken. Please try another.",
      }),
    });
    const error = await api
      .signUp({ email: "a@b.de", username: "taken", password: "long enough" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: "USERNAME_IS_ALREADY_TAKEN",
      message: "Username is already taken. Please try another.",
      status: 400,
    });
  });

  it("not_invited keeps its code", async () => {
    const api = createApiClient({
      fetch: json(403, { code: "not_invited", message: "This email is not on the invite list" }),
    });
    await expect(
      api.signUp({ email: "a@b.de", username: "someone", password: "long enough" }),
    ).rejects.toMatchObject({ code: "not_invited", status: 403 });
  });

  it("the rate limiter's answer, which has no code, becomes too_many_requests", async () => {
    const api = createApiClient({
      fetch: json(429, { message: "Too many requests. Please try again later." }),
    });
    await expect(api.signInEmail({ email: "a@b.de", password: "pw" })).rejects.toMatchObject({
      code: "too_many_requests",
      status: 429,
    });
  });

  it("our own 401 keeps code unauthorized", async () => {
    const api = createApiClient({
      fetch: json(401, { error: { code: "unauthorized", message: "Sign in to continue" } }),
    });
    await expect(api.stats()).rejects.toMatchObject({
      code: "unauthorized",
      message: "Sign in to continue",
      status: 401,
    });
  });

  it("a 401 without a readable body is unauthorized too", async () => {
    const api = createApiClient({ fetch: async () => new Response("", { status: 401 }) });
    await expect(api.listWords()).rejects.toMatchObject({ code: "unauthorized", status: 401 });
  });
});

describe("SignUpRequest (§9.4)", () => {
  const valid = { email: "new@example.com", username: "New.User_1", password: "12345678" };

  it("needs an email, a username and a password", () => {
    expect(SignUpRequest.safeParse(valid).success).toBe(true);
    expect(SignUpRequest.safeParse({ ...valid, username: undefined }).success).toBe(false);
    expect(SignUpRequest.safeParse({ ...valid, email: "not an email" }).success).toBe(false);
  });

  it("takes 3–30 letters, digits, . and _ as a username", () => {
    const ok = (username: string) => SignUpRequest.safeParse({ ...valid, username }).success;
    expect(ok("abc")).toBe(true);
    expect(ok("a".repeat(30))).toBe(true);
    expect(ok("ab")).toBe(false);
    expect(ok("a".repeat(31))).toBe(false);
    expect(ok("new user")).toBe(false);
    expect(ok("new-user")).toBe(false);
    expect(ok("näme")).toBe(false);
  });

  it("takes a password of 8–128 characters", () => {
    const ok = (password: string) => SignUpRequest.safeParse({ ...valid, password }).success;
    expect(ok("1234567")).toBe(false);
    expect(ok("12345678")).toBe(true);
    expect(ok("x".repeat(128))).toBe(true);
    expect(ok("x".repeat(129))).toBe(false);
  });
});

describe("Google (§9.4)", () => {
  const googleUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=x&state=s";

  it("signInSocial posts the provider and both return addresses, and reads Google's address", async () => {
    const { api, calls } = recording(200, { url: googleUrl, redirect: true });
    const answer = await api.signInSocial({
      provider: "google",
      callbackURL: "/words",
      errorCallbackURL: "/signin?next=%2Fwords",
    });
    expect(answer).toEqual({ url: googleUrl });
    expect(calls).toEqual([
      {
        url: "/api/auth/sign-in/social",
        method: "POST",
        body: {
          provider: "google",
          callbackURL: "/words",
          errorCallbackURL: "/signin?next=%2Fwords",
        },
      },
    ]);
  });

  it("signInSocial can name the Google account to preselect (signing in again)", async () => {
    const { api, calls } = recording(200, { url: googleUrl, redirect: true });
    await api.signInSocial({
      provider: "google",
      callbackURL: "/settings/account",
      errorCallbackURL: "/settings/account",
      loginHint: "anna@gmail.com",
    });
    expect(calls[0]?.body).toMatchObject({ loginHint: "anna@gmail.com" });
  });

  it("linkSocial posts to link-social", async () => {
    const { api, calls } = recording(200, { url: googleUrl, redirect: true });
    expect(
      await api.linkSocial({
        provider: "google",
        callbackURL: "/settings/account",
        errorCallbackURL: "/settings/account",
      }),
    ).toEqual({ url: googleUrl });
    expect(calls[0]).toMatchObject({ url: "/api/auth/link-social", method: "POST" });
  });

  it("an answer without an address is unexpected", async () => {
    const { api } = recording(200, { redirect: true });
    await expect(
      api.signInSocial({ provider: "google", callbackURL: "/", errorCallbackURL: "/signin" }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("Better Auth's error body becomes an ApiClientError (no Google on the server)", async () => {
    const api = createApiClient({
      fetch: json(404, { code: "PROVIDER_NOT_FOUND", message: "Provider not found" }),
    });
    await expect(
      api.signInSocial({ provider: "google", callbackURL: "/", errorCallbackURL: "/signin" }),
    ).rejects.toMatchObject({ code: "PROVIDER_NOT_FOUND", status: 404 });
  });

  it("only Google, and only addresses of this app", () => {
    const body = { provider: "google", callbackURL: "/", errorCallbackURL: "/signin" };
    const ok = (change: object) => SocialSignInRequest.safeParse({ ...body, ...change }).success;
    expect(ok({})).toBe(true);
    expect(ok({ provider: "github" })).toBe(false);
    expect(ok({ callbackURL: "https://x.example/" })).toBe(false);
    expect(ok({ errorCallbackURL: "//x.example" })).toBe(false);
  });

  it("signInOptions reads whether the server offers Google, and its sign-up mode", async () => {
    const { api, calls } = recording(200, { google: true, signUp: "invite" });
    expect(await api.signInOptions()).toEqual({ google: true, signUp: "invite" });
    expect(calls).toEqual([{ url: "/api/sign-in-options", method: "GET", body: undefined }]);
    expect(SignInOptions.safeParse({}).success).toBe(false);
  });

  it("the sign-up mode is invite or open, and nothing else", () => {
    const ok = (signUp: unknown) => SignInOptions.safeParse({ google: false, signUp }).success;
    expect(ok("invite")).toBe(true);
    expect(ok("open")).toBe(true);
    expect(ok("closed")).toBe(false);
    expect(ok("Open")).toBe(false);
    expect(ok("")).toBe(false);
    expect(ok(null)).toBe(false);
    // A server from before M12.7 sends no mode: the app treats it like a failed request.
    expect(SignInOptions.safeParse({ google: true }).success).toBe(false);
  });
});
