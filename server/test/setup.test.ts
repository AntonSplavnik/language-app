import { HealthResponse } from "@language-app/core";
import { afterEach, describe, expect, it } from "vitest";
import { type Config, parseConfig } from "../src/config";
import { createServer, type Platform, poolOptions, VERCEL_POOL } from "../src/setup";
import { TEST_SECRET } from "./helpers/app";
import { testDatabaseUrl } from "./helpers/env";

// The one setup main.ts (the Mac) and vercel.ts (production) both start the server with
// (docs/design.md §18.2), so the two can't drift.

const PRODUCTION = "https://dingsda.vercel.app";
const config = (env: Record<string, string> = {}) =>
  parseConfig({ DATABASE_URL: testDatabaseUrl(), BETTER_AUTH_SECRET: TEST_SECRET, ...env });

const started: { app: { close(): Promise<unknown> } }[] = [];
const start = (configured: Config, platform: Platform) => {
  const server = createServer(configured, platform, { logger: false });
  started.push(server);
  return server;
};
afterEach(async () => {
  await Promise.all(started.splice(0).map(({ app }) => app.close()));
});

describe("the database pool", () => {
  it("on Vercel: a few connections to Neon's pooler, idle ones closed after 5 s", () => {
    expect(poolOptions("vercel")).toEqual({
      max: 3,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
    });
    expect(VERCEL_POOL).toEqual(poolOptions("vercel"));

    const { db } = start(config({ BETTER_AUTH_URL: PRODUCTION }), "vercel");
    expect(db.$client.options).toMatchObject(VERCEL_POOL);
  });

  it("on Vercel, attachDatabasePool watches the pool's released connections", () => {
    const { db } = start(config({ BETTER_AUTH_URL: PRODUCTION }), "vercel");
    expect(db.$client.listenerCount("release")).toBe(1);
  });

  it("on the Mac: node-postgres's defaults, as before", () => {
    expect(poolOptions("mac")).toEqual({});

    const { db } = start(config(), "mac");
    expect(db.$client.options).toMatchObject({ max: 10, idleTimeoutMillis: 10_000 });
    expect(db.$client.options.connectionTimeoutMillis).toBeUndefined();
    expect(db.$client.listenerCount("release")).toBe(0);
  });
});

describe("the platform and BETTER_AUTH_URL go together", () => {
  it("Vercel needs production's address", () => {
    expect(() => createServer(config(), "vercel")).toThrow(/BETTER_AUTH_URL/);
  });

  it("the Mac refuses it: Secure cookies would end sign-in over the LAN's plain HTTP", () => {
    expect(() => createServer(config({ BETTER_AUTH_URL: PRODUCTION }), "mac")).toThrow(
      /BETTER_AUTH_URL/,
    );
  });
});

describe("the app it builds", () => {
  it.each([
    ["the Mac", "mac", {}],
    ["Vercel", "vercel", { BETTER_AUTH_URL: PRODUCTION }],
  ] as const)("answers on %s", async (_, platform, env) => {
    const { app } = start(config(env), platform);
    const res = await app.inject({ method: "GET", url: "/api/health" });

    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json())).toEqual({ status: "ok" });
  });

  it("closes its pool with the app", async () => {
    const { app, db } = createServer(config(), "mac", { logger: false });
    await db.$client.query("select 1");
    await app.close();
    expect(db.$client.ended).toBe(true);
  });
});
