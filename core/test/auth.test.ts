import { describe, expect, it } from "vitest";
import { ApiClientError, AuthSession, createApiClient, SignUpRequest } from "../src";

// Accounts (docs/design.md §17.3): Better Auth's endpoints under /api/auth, called like any other.

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

describe("auth endpoints (§17.3)", () => {
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

describe("SignUpRequest (§17.3)", () => {
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
