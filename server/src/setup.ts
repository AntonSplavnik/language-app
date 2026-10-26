import { attachDatabasePool } from "@vercel/functions/db-connections";
import { createClaudeAi } from "./ai/claude";
import { anthropicTransport } from "./ai/transport";
import { dbUsageSink } from "./ai/usage";
import { buildApp } from "./app";
import { createAuth } from "./auth/auth";
import { authSecret, type Config, googleCredentials } from "./config";
import { createDb, type PoolOptions } from "./db/client";

/** Where the server runs (§18.1): `pnpm dev` on the Mac, or one Vercel Function in production. */
export type Platform = "mac" | "vercel";

/**
 * A Vercel Function's pool, on Neon's pooled connection (§18.2): a few connections per instance
 * (Neon's PgBouncer pools them again), idle ones closed after 5 s so `attachDatabasePool` lets
 * the instance be frozen soon after a request, and 10 s to connect while Neon wakes up (Neon's
 * advice for node-postgres).
 */
export const VERCEL_POOL = {
  max: 3,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 10_000,
} as const satisfies PoolOptions;

/** The Mac keeps node-postgres's defaults. */
export function poolOptions(platform: Platform): PoolOptions {
  return platform === "vercel" ? { ...VERCEL_POOL } : {};
}

/**
 * The server as `main.ts` (the Mac) and `vercel.ts` (production) both start it, so the two can't
 * drift: the database pool, Better Auth, the AI client and the app, from the configuration. The
 * app closes the pool when it closes. It logs each request (`logger: false` for tests).
 */
export function createServer(
  config: Config,
  platform: Platform,
  { logger = true }: { logger?: boolean } = {},
) {
  checkPlatform(config, platform);

  const db = createDb(config.DATABASE_URL, poolOptions(platform));
  // Lets Vercel close idle connections before it freezes an instance (Fluid compute). Outside a
  // Vercel Function (VERCEL_URL and VERCEL_REGION unset) it does nothing.
  if (platform === "vercel") attachDatabasePool(db.$client);

  // The learner's language comes with each request's session, so the AI client needs none.
  const ai = createClaudeAi({
    transport: anthropicTransport(config.ANTHROPIC_API_KEY),
    recordUsage: dbUsageSink(db),
    models: {
      extract: config.AI_MODEL_EXTRACT,
      enrich: config.AI_MODEL_ENRICH,
      describe: config.AI_MODEL_DESCRIBE,
    },
    effort: config.AI_EFFORT,
  });

  const auth = createAuth({
    db,
    secret: authSecret(config),
    signupMode: config.SIGNUP_MODE,
    webPort: config.WEB_PORT,
    // Production's static https address; the Mac's addresses without it (§4 Accounts).
    baseUrl: config.BETTER_AUTH_URL,
    // Continue with Google and Connect, only with the Google pair (§14).
    google: googleCredentials(config) ?? undefined,
  });

  const app = buildApp(
    {
      db,
      ai,
      auth,
      dailyPhotoLimit: config.DAILY_PHOTO_LIMIT,
      dailyDescribeLimit: config.DAILY_DESCRIBE_LIMIT,
      timeZone: config.APP_TIME_ZONE,
    },
    { logger },
  );
  app.addHook("onClose", () => db.$client.end());

  return { app, db };
}

/**
 * Production's address belongs to Vercel only. On the Mac it would make the cookies Secure, which
 * the iPhone never sends back over the LAN's plain HTTP; on Vercel, without it, every sign-in
 * would come from an address Better Auth doesn't trust.
 */
function checkPlatform(config: Config, platform: Platform): void {
  if (platform === "mac" && config.BETTER_AUTH_URL) {
    throw new Error(
      "BETTER_AUTH_URL is production's address (Vercel): remove it from the Mac's .env, whose server signs in over plain HTTP (docs/design.md §14)",
    );
  }
  if (platform === "vercel" && !config.BETTER_AUTH_URL) {
    throw new Error("BETTER_AUTH_URL must be set on Vercel (docs/design.md §18.3)");
  }
}
