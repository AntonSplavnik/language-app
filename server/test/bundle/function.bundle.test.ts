import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { type IncomingHttpHeaders, request } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiError, HealthResponse, StatsResponse } from "@language-app/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FUNCTION_CONFIG,
  FUNCTION_DIR,
  importsOf,
  OUTPUT_CONFIG,
  strayImports,
} from "../../scripts/vercel-output";
import { addInvite } from "../../src/auth/invites";
import { authRateLimits } from "../../src/db/schema";
import { TEST_SECRET } from "../helpers/app";
import { PASSWORD } from "../helpers/auth";
import { useTestDb } from "../helpers/db";
import { testDatabaseUrl } from "../helpers/env";

// The Vercel build as it is deployed (docs/design.md §13, §18.2): what `pnpm build:vercel` wrote
// to .vercel/output, and the bundled function itself, run by plain Node behind node:http as
// Vercel's launcher runs it, with production's configuration, against the test database.
// `pnpm test:bundle` builds first.

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const OUTPUT = join(ROOT, ".vercel/output");
const BUNDLE = join(OUTPUT, FUNCTION_DIR, FUNCTION_CONFIG.handler);
const SERVE = join(ROOT, "server/scripts/serve-vercel.ts");
const PRODUCTION = "https://dingsda.vercel.app";

const db = useTestDb();

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

describe("the build output (.vercel/output)", () => {
  beforeAll(() => {
    if (!existsSync(BUNDLE)) throw new Error("No .vercel/output: run `pnpm test:bundle`");
  });

  it("has the routes and the function's config", () => {
    expect(readJson(join(OUTPUT, "config.json"))).toEqual(OUTPUT_CONFIG);
    expect(readJson(join(OUTPUT, FUNCTION_DIR, ".vc-config.json"))).toEqual(FUNCTION_CONFIG);
  });

  it("has the web build as static files: index.html and the hashed assets it loads", () => {
    const html = readFileSync(join(OUTPUT, "static/index.html"), "utf8");
    const scripts = [...html.matchAll(/src="\/(assets\/[\w.-]+-[\w-]{8}\.js)"/g)].map((m) => m[1]);

    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts)
      expect(existsSync(join(OUTPUT, "static", String(script)))).toBe(true);
    expect(existsSync(join(OUTPUT, "static/manifest.webmanifest"))).toBe(true);
    // pdf.js's decoders, copied by the web build (§6.8).
    expect(readdirSync(join(OUTPUT, "static/pdfjs/wasm")).length).toBeGreaterThan(0);
  });

  it("the function is one file that imports nothing but Node's own modules", async () => {
    expect(readdirSync(join(OUTPUT, FUNCTION_DIR)).sort()).toEqual([
      ".vc-config.json",
      "index.mjs",
    ]);
    const code = readFileSync(BUNDLE, "utf8");
    const imports = await importsOf(code);

    expect(imports).toContain("node:module");
    expect(strayImports(imports)).toEqual([]);
    expect(imports.filter((specifier) => specifier.includes("@language-app/"))).toEqual([]);
  });
});

type Answer = { status: number; headers: IncomingHttpHeaders; body: string };

type Running = {
  port: number;
  startMs: number;
  call(path: string, options?: CallOptions): Promise<Answer>;
  stop(): void;
};

type CallOptions = { method?: string; headers?: Record<string, string>; json?: object };

/** Starts the bundle with plain Node and only these variables, as Vercel would (no .env). */
function startFunction(variables: Record<string, string>): Promise<Running> {
  const child = spawn(process.execPath, [SERVE, "0"], {
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "production", ...variables },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output: string[] = [];
  child.stderr.on("data", (chunk) => output.push(String(chunk)));

  return new Promise((resolve, reject) => {
    child.on("exit", (code) => reject(new Error(`exited with ${code}:\n${output.join("")}`)));
    child.stdout.on("data", (chunk: Buffer) => {
      for (const line of String(chunk).split("\n")) {
        output.push(line);
        if (!line.startsWith('{"listening"')) continue;
        const { port, startMs } = JSON.parse(line) as { port: number; startMs: number };
        resolve({
          port,
          startMs,
          call: (path, options) => call(port, path, options),
          stop: () => child.kill(),
        });
      }
    });
  });
}

/** Runs the bundle until it exits, for a start that should fail. */
function runToExit(
  variables: Record<string, string>,
): Promise<{ code: number | null; stderr: string }> {
  const child = spawn(process.execPath, [SERVE, "0"], {
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "production", ...variables },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  return new Promise((resolve) => {
    const timer = setTimeout(() => child.kill(), 10_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

function call(
  port: number,
  path: string,
  { method = "GET", headers = {}, json }: CallOptions = {},
) {
  const body = json === undefined ? undefined : JSON.stringify(json);
  return new Promise<Answer>((resolve, reject) => {
    const outgoing = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          // As Vercel passes requests on: the production host, https, the client's address.
          host: "dingsda.vercel.app",
          "x-forwarded-proto": "https",
          "x-vercel-forwarded-for": "203.0.113.20",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...headers,
        },
      },
      (incoming) => {
        let text = "";
        incoming.on("data", (chunk) => {
          text += String(chunk);
        });
        incoming.on("end", () =>
          resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers, body: text }),
        );
      },
    );
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

const cookiesOf = (answer: Answer) => answer.headers["set-cookie"] ?? [];
const cookieHeader = (answer: Answer) =>
  cookiesOf(answer)
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

describe("the bundled function, with production's configuration", () => {
  let fn: Running;
  beforeAll(async () => {
    fn = await startFunction({
      DATABASE_URL: testDatabaseUrl(),
      BETTER_AUTH_SECRET: TEST_SECRET,
      BETTER_AUTH_URL: PRODUCTION,
    });
  });
  afterAll(() => fn?.stop());

  it("answers /api/health", async () => {
    const res = await fn.call("/api/health");

    expect(res.status).toBe(200);
    expect(HealthResponse.parse(JSON.parse(res.body))).toEqual({ status: "ok" });
  });

  it("refuses a request without a session: 401", async () => {
    const res = await fn.call("/api/stats");

    expect(res.status).toBe(401);
    expect(ApiError.parse(JSON.parse(res.body)).error.code).toBe("unauthorized");
  });

  it("answers an unknown /api path with its own 404", async () => {
    const res = await fn.call("/api/nothing-here");

    expect(res.status).toBe(404);
    expect(ApiError.parse(JSON.parse(res.body)).error.code).toBe("not_found");
  });

  it("signs up an invited email with a Secure cookie, which then opens the API", async () => {
    await addInvite(db, "bundle@example.com");
    const signUp = await fn.call("/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin: PRODUCTION },
      json: { email: "bundle@example.com", username: "bundler", password: PASSWORD },
    });

    expect(signUp.status).toBe(200);
    const [cookie] = cookiesOf(signUp);
    expect(cookie).toMatch(/^__Secure-better-auth\.session_token=[^;]+;.*; Secure/);

    const stats = await fn.call("/api/stats", { headers: { cookie: cookieHeader(signUp) } });
    expect(stats.status).toBe(200);
    expect(StatsResponse.parse(JSON.parse(stats.body))).toMatchObject({ learning: 0, learned: 0 });

    // The rate limits counted the client's address from Vercel's header.
    const keys = (await db.select({ key: authRateLimits.key }).from(authRateLimits)).map(
      (row) => row.key,
    );
    expect(keys).toContain("203.0.113.20|/sign-up/email");
  });

  it("refuses a sign-in from any other origin than production's", async () => {
    const res = await fn.call("/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: "http://localhost:5173" },
      json: { email: "bundle@example.com", password: PASSWORD },
    });

    expect(res.status).toBe(403);
  });
});

describe("the bundled function without its variables", () => {
  it("refuses to start, naming what is missing", async () => {
    const { code, stderr } = await runToExit({ DATABASE_URL: testDatabaseUrl() });

    expect(code).not.toBe(0);
    expect(stderr).toMatch(/BETTER_AUTH_SECRET, BETTER_AUTH_URL must be set/);
  });
});
