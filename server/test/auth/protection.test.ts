import { count } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { addInvite } from "../../src/auth/invites";
import { authRateLimits } from "../../src/db/schema";
import { buildTestApp, TEST_WEB_PORT, testAuth } from "../helpers/app";
import { authPost, cookieOf, getWith, PASSWORD, signUp } from "../helpers/auth";
import { first, useTestDb } from "../helpers/db";

// Trusted origins and rate limits (docs/design.md §4 Accounts).

const db = useTestDb();
const app = () => buildTestApp(db, { learner: null });
const alice = { email: "alice@example.com", password: PASSWORD };

beforeEach(async () => {
  await addInvite(db, alice.email);
  await signUp(app(), { email: alice.email, username: "alice" });
});

describe("trusted origins", () => {
  it.each([
    ["by email", "/sign-in/email", alice],
    // The username plugin's endpoint lacks Better Auth's own check; ours adds it (§4 Accounts).
    ["by username", "/sign-in/username", { username: "alice", password: PASSWORD }],
    [
      "a sign-up",
      "/sign-up/email",
      { email: "bob@example.com", username: "bob", password: PASSWORD },
    ],
  ])("a sign-in %s from another site gets 403, without a cookie too", async (_, path, body) => {
    const res = await authPost(app(), path, body, { origin: "http://evil.example" });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: "INVALID_ORIGIN" });
    expect(cookieOf(res)).toBe("");
  });

  it("a browser's cross-site navigation to sign in by username gets 403", async () => {
    const res = await app().inject({
      method: "POST",
      url: "/api/auth/sign-in/username",
      payload: { username: "alice", password: PASSWORD },
      headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("a client that sends no origin at all (a script such as demo:import) still signs in", async () => {
    const res = await app().inject({
      method: "POST",
      url: "/api/auth/sign-in/username",
      payload: { username: "alice", password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
  });

  it("a POST with the cookie from another site gets 403 and changes nothing", async () => {
    const cookie = cookieOf(await authPost(app(), "/sign-in/email", alice));
    const res = await authPost(app(), "/sign-out", {}, { cookie, origin: "http://evil.example" });

    expect(res.statusCode).toBe(403);
    expect((await getWith(app(), "/api/stats", cookie)).statusCode).toBe(200);
  });

  it.each([
    ["localhost", `localhost:${TEST_WEB_PORT}`],
    ["the LAN address", `192.168.1.20:${TEST_WEB_PORT}`],
    ["a .local name", `mac.local:${TEST_WEB_PORT}`],
  ])("the app opened on %s is trusted", async (_, host) => {
    const res = await authPost(app(), "/sign-in/email", alice, { host, origin: `http://${host}` });
    expect(res.statusCode).toBe(200);
  });

  it("the right address on another port is not", async () => {
    const host = "192.168.1.20:8080";
    const res = await authPost(app(), "/sign-in/email", alice, { host, origin: `http://${host}` });
    expect(res.statusCode).toBe(403);
  });
});

describe("rate limits", () => {
  const limited = () =>
    buildTestApp(db, { learner: null, auth: testAuth(db, { rateLimit: true }) });

  it("the 6th sign-in attempt within a minute gets 429, even with the right password", async () => {
    const wrong = { ...alice, password: "wrong password" };
    const statuses: number[] = [];
    for (let attempt = 1; attempt <= 5; attempt++) {
      statuses.push((await authPost(limited(), "/sign-in/email", wrong)).statusCode);
    }
    const sixth = await authPost(limited(), "/sign-in/email", alice);

    expect(statuses).toEqual([401, 401, 401, 401, 401]);
    expect(sixth.statusCode).toBe(429);
    expect(cookieOf(sixth)).toBe("");
    // Kept in the database, so every server instance sees them.
    const counters = first(await db.select({ n: count() }).from(authRateLimits));
    expect(counters.n).toBeGreaterThan(0);
  });

  it("counts each path on its own", async () => {
    const wrong = { ...alice, password: "wrong password" };
    for (let attempt = 1; attempt <= 5; attempt++) {
      await authPost(limited(), "/sign-in/email", wrong);
    }
    const byUsername = await authPost(limited(), "/sign-in/username", {
      username: "alice",
      password: PASSWORD,
    });
    expect(byUsername.statusCode).toBe(200);
  });

  it("counts each device on its own, by the address Vite passes on", async () => {
    const wrong = { ...alice, password: "wrong password" };
    const from = (forwardedFor: string, body = alice) =>
      authPost(limited(), "/sign-in/email", body, { forwardedFor });
    for (let attempt = 1; attempt <= 5; attempt++) await from("192.168.1.20", wrong);

    expect((await from("192.168.1.20")).statusCode).toBe(429);
    expect((await from("192.168.1.21")).statusCode).toBe(200);
    // An address the device made up itself comes before the one Vite added: it doesn't help.
    expect((await from("192.168.1.21, 192.168.1.20")).statusCode).toBe(429);
    // Through a loopback hop (Vite) the device's own address still counts.
    expect((await from("192.168.1.20, 127.0.0.1")).statusCode).toBe(429);
  });
});
