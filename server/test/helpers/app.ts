import { makeSignature } from "better-auth/crypto";
import type { InjectOptions } from "fastify";
import type { AiClient } from "../../src/ai/types";
import { buildApp } from "../../src/app";
import { type Auth, createAuth, type SignupMode } from "../../src/auth/auth";
import type { Db } from "../../src/db/client";
import { LEARNER_ID } from "./db";

/** An AI client for tests that must not reach the AI. */
export const unusedAi: AiClient = {
  extractWords: () => Promise.reject(new Error("AI was not expected to be called")),
  enrichWords: () => Promise.reject(new Error("AI was not expected to be called")),
  describeWord: () => Promise.reject(new Error("AI was not expected to be called")),
};

export const TEST_SECRET = "a-test-secret-of-at-least-32-characters";
export const TEST_WEB_PORT = 5173;
/** Where the web app runs in tests: a trusted origin (§4 Accounts). */
export const TRUSTED_ORIGIN = `http://localhost:${TEST_WEB_PORT}`;

/** The OAuth client the test server has when Google is on (`testAuth(db, { google: true })`). */
export const TEST_GOOGLE = {
  clientId: "test-client-id.apps.googleusercontent.com",
  clientSecret: "test-client-secret",
};

type TestAuthOptions = {
  signupMode?: SignupMode;
  rateLimit?: boolean;
  google?: boolean;
  /** Production's address (BETTER_AUTH_URL); without it, the Mac's addresses (§4 Accounts). */
  baseUrl?: string;
};

const auths = new WeakMap<Db, Map<string, Auth>>();

/**
 * Better Auth as the server runs it, on the test database. Rate limiting is off unless asked for:
 * the tests share one address and sign in far more often than 5 times a minute. Google is off
 * unless asked for, as on a server without the Google pair. One instance per database and
 * options, since some test files build an app per request.
 */
export function testAuth(
  db: Db,
  { signupMode = "invite", rateLimit = false, google = false, baseUrl }: TestAuthOptions = {},
) {
  const key = `${signupMode}:${rateLimit}:${google}:${baseUrl ?? "mac"}`;
  const forDb = auths.get(db) ?? new Map<string, Auth>();
  auths.set(db, forDb);
  let auth = forDb.get(key);
  if (!auth) {
    auth = createAuth({
      db,
      secret: TEST_SECRET,
      signupMode,
      webPort: TEST_WEB_PORT,
      baseUrl,
      rateLimit,
      google: google ? TEST_GOOGLE : undefined,
      quiet: true,
    });
    forDb.set(key, auth);
  }
  return auth;
}

/**
 * The app on the test database. Its `inject` signs requests in as `learner` (user 1 by default)
 * unless they bring a cookie of their own: each gets a real session row and a signed cookie, so
 * it still passes the session hook. `learner: null` leaves them signed out. (A hook can't do it:
 * Fastify adds request hooks only after the plugins registered before them.)
 */
export function buildTestApp(
  db: Db,
  {
    ai = unusedAi,
    dailyPhotoLimit = 50,
    dailyDescribeLimit = 200,
    timeZone = "Europe/Berlin",
    now,
    auth = testAuth(db),
    learner = LEARNER_ID,
  }: {
    ai?: AiClient;
    dailyPhotoLimit?: number;
    dailyDescribeLimit?: number;
    /** The daily limits' zone (APP_TIME_ZONE). */
    timeZone?: string;
    /** The clock the daily limits read; the real one by default. */
    now?: () => Date;
    auth?: Auth;
    learner?: number | null;
  } = {},
) {
  const app = buildApp({ db, ai, auth, dailyPhotoLimit, dailyDescribeLimit, timeZone, now });
  if (learner === null) return app;
  const inject = app.inject.bind(app);
  return Object.assign(app, {
    inject: async (options: InjectOptions) =>
      options.headers?.cookie !== undefined || String(options.url).startsWith("/api/auth/")
        ? inject(options)
        : inject({
            ...options,
            headers: { ...options.headers, cookie: await sessionCookie(auth, learner) },
          }),
  });
}

/** A new session for the user and its signed cookie, as Better Auth sets it on sign-in. */
export async function sessionCookie(auth: Auth, userId: number): Promise<string> {
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(String(userId));
  const signature = await makeSignature(session.token, ctx.secret);
  return `${ctx.authCookies.sessionToken.name}=${session.token}.${signature}`;
}

/** A multipart/form-data body with one file, for `app.inject`. */
export function multipartFile(
  field: string,
  content: Uint8Array,
  { filename = "photo.jpg", contentType = "image/jpeg" } = {},
) {
  const boundary = "----test-boundary-7f3a";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
    ),
    Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}
