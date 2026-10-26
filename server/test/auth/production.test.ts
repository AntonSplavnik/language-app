import { SocialRedirectResponse } from "@language-app/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuth } from "../../src/auth/auth";
import { addInvite } from "../../src/auth/invites";
import { authRateLimits } from "../../src/db/schema";
import { buildTestApp, TEST_SECRET, TEST_WEB_PORT, testAuth } from "../helpers/app";
import { authPost, cookieOf, getWith, PASSWORD, setCookies } from "../helpers/auth";
import { useTestDb } from "../helpers/db";
import { fakeGoogle } from "../helpers/google";

// Better Auth in production (docs/design.md §4 Accounts, §18.3): with BETTER_AUTH_URL, one static
// https address that is also the one trusted origin, Secure cookies with the __Secure- prefix,
// and the rate limits counting by Vercel's client-IP header. The Mac's behaviour, without it, is
// what every other auth test runs.

const PRODUCTION = "https://dingsda.vercel.app";
/** The header Vercel sets to the client's address (§16). */
const CLIENT_IP = "x-vercel-forwarded-for";

const db = useTestDb();
const app = (options: { rateLimit?: boolean; google?: boolean } = {}) =>
  buildTestApp(db, { learner: null, auth: testAuth(db, { baseUrl: PRODUCTION, ...options }) });

/** A POST to Better Auth as the web app sends it in production, through Vercel. */
const post = (
  target: ReturnType<typeof app>,
  path: string,
  body: object,
  { origin = PRODUCTION, ip = "203.0.113.7", headers = {} as Record<string, string> } = {},
) =>
  authPost(target, path, body, {
    origin,
    host: "dingsda.vercel.app",
    headers: { [CLIENT_IP]: ip, "x-forwarded-proto": "https", ...headers },
  });

const alice = { email: "alice@example.com", password: PASSWORD };

beforeEach(async () => {
  await addInvite(db, alice.email);
  const res = await post(app(), "/sign-up/email", { ...alice, username: "alice" });
  if (res.statusCode !== 200) throw new Error(`sign-up failed: ${res.statusCode} ${res.body}`);
});

describe("the session cookie", () => {
  it("is __Secure-better-auth.session_token, Secure, HttpOnly, SameSite=Lax", async () => {
    const res = await post(app(), "/sign-in/username", { username: "alice", password: PASSWORD });

    expect(res.statusCode).toBe(200);
    const [cookie, ...others] = setCookies(res);
    expect(others).toEqual([]);
    expect(cookie).toMatch(/^__Secure-better-auth\.session_token=/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
  });

  it("opens the API, as on the Mac", async () => {
    const cookie = cookieOf(await post(app(), "/sign-in/email", alice));

    expect((await getWith(app(), "/api/stats", cookie)).statusCode).toBe(200);
    expect((await getWith(app(), "/api/stats", "")).statusCode).toBe(401);
  });

  it("the Mac's cookie name means nothing here", async () => {
    const cookie = cookieOf(await post(app(), "/sign-in/email", alice)).replace("__Secure-", "");
    expect((await getWith(app(), "/api/stats", cookie)).statusCode).toBe(401);
  });
});

describe("the one trusted origin", () => {
  const byUsername = { username: "alice", password: PASSWORD };

  it("signs in from the production address, by email and by username", async () => {
    expect((await post(app(), "/sign-in/email", alice)).statusCode).toBe(200);
    expect((await post(app(), "/sign-in/username", byUsername)).statusCode).toBe(200);
  });

  it.each([
    ["the Mac's localhost", `http://localhost:${TEST_WEB_PORT}`],
    ["the LAN", `http://192.168.1.20:${TEST_WEB_PORT}`],
    ["plain http", "http://dingsda.vercel.app"],
    ["a deployment's own address", "https://dingsda-a1b2c3d4e-lazy-pixel.vercel.app"],
    ["another site", "https://evil.example"],
  ])("refuses %s with 403", async (_, origin) => {
    for (const [path, body] of [
      ["/sign-in/email", alice],
      ["/sign-in/username", byUsername],
    ] as const) {
      const res = await post(app(), path, body, { origin });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: "INVALID_ORIGIN" });
      expect(cookieOf(res)).toBe("");
    }
  });

  describe("Google", () => {
    beforeEach(() => {
      fakeGoogle();
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns to production's callback, whatever host the request came in on", async () => {
      const res = await authPost(
        app({ google: true }),
        "/sign-in/social",
        { provider: "google", callbackURL: "/", errorCallbackURL: "/signin" },
        { origin: PRODUCTION, host: "dingsda-a1b2c3d4e-lazy-pixel.vercel.app" },
      );

      expect(res.statusCode).toBe(200);
      const url = new URL(SocialRedirectResponse.parse(res.json()).url);
      expect(url.searchParams.get("redirect_uri")).toBe(
        "https://dingsda.vercel.app/api/auth/callback/google",
      );
      // Its state cookie is a Secure one too.
      expect(setCookies(res).join("\n")).toMatch(/^__Secure-better-auth\.state=.*; Secure/m);
    });
  });
});

describe("rate limits by Vercel's client-IP header", () => {
  const limited = () => app({ rateLimit: true });
  const wrong = { ...alice, password: "wrong password" };

  it("counts each client address on its own", async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      await post(limited(), "/sign-in/email", wrong, { ip: "203.0.113.10" });
    }

    expect(
      (await post(limited(), "/sign-in/email", alice, { ip: "203.0.113.10" })).statusCode,
    ).toBe(429);
    expect(
      (await post(limited(), "/sign-in/email", alice, { ip: "203.0.113.11" })).statusCode,
    ).toBe(200);
    const keys = (await db.select({ key: authRateLimits.key }).from(authRateLimits)).map(
      (row) => row.key,
    );
    expect(keys).toContain("203.0.113.10|/sign-in/email");
  });

  it("an x-forwarded-for the client sends itself doesn't help", async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      await post(limited(), "/sign-in/email", wrong, {
        ip: "203.0.113.10",
        headers: { "x-forwarded-for": `198.51.100.${attempt}` },
      });
    }

    const sixth = await post(limited(), "/sign-in/email", alice, {
      ip: "203.0.113.10",
      headers: { "x-forwarded-for": "198.51.100.99" },
    });
    expect(sixth.statusCode).toBe(429);
  });
});

describe("on the Mac (without BETTER_AUTH_URL)", () => {
  it("Vercel's header means nothing: the address comes from Vite's x-forwarded-for", async () => {
    const mac = () => buildTestApp(db, { learner: null, auth: testAuth(db, { rateLimit: true }) });
    const from = (ip: string, body: object) =>
      authPost(mac(), "/sign-in/email", body, {
        forwardedFor: "192.168.1.20",
        headers: { [CLIENT_IP]: ip },
      });
    for (let attempt = 1; attempt <= 5; attempt++) {
      await from(`203.0.113.${attempt}`, { ...alice, password: "wrong password" });
    }

    expect((await from("203.0.113.99", alice)).statusCode).toBe(429);
  });
});

describe("the production address itself", () => {
  it.each(["http://dingsda.vercel.app", "http://localhost:5173"])(
    "must be https: %s is refused",
    (baseUrl) => {
      expect(() =>
        createAuth({ db, secret: TEST_SECRET, signupMode: "invite", webPort: 5173, baseUrl }),
      ).toThrow(/https/);
    },
  );
});
