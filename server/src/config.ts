import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const Config = z.object({
  DATABASE_URL: z.url().default("postgres://app:app@localhost:5432/language_app"),
  TEST_DATABASE_URL: z.url().default("postgres://app:app@localhost:5432/language_app_test"),
  ANTHROPIC_API_KEY: z.string().default(""),
  AI_MODEL_EXTRACT: z.string().min(1).default("claude-haiku-5-5"),
  AI_MODEL_ENRICH: z.string().min(1).default("claude-haiku-5-5"),
  AI_MODEL_DESCRIBE: z.string().min(1).default("claude-haiku-5-5"),
  AI_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  DAILY_PHOTO_LIMIT: z.coerce.number().int().positive().default(50),
  /** Ask AI calls per user per day (§11.5): a safety net, not a budget. */
  DAILY_DESCRIBE_LIMIT: z.coerce.number().int().positive().default(200),
  SERVER_PORT: z.coerce.number().int().positive().default(3000),
  /** Vite's port: the address the browser signs in on (§17.3, trusted origins). */
  WEB_PORT: z.coerce.number().int().positive().default(5173),
  /**
   * Signs Better Auth's cookies (§17.3). Optional here so the scripts that don't sign anyone in
   * run without it; the server and `user:claim` require it (`authSecret`).
   */
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters")
    .optional(),
  /** `invite`: only emails on the invite list can create an account (§4 Accounts). */
  SIGNUP_MODE: z.enum(["invite", "open"]).default("invite"),
  /**
   * The zone whose midnight starts the daily limits' day (§11.5), not the server's own: Vercel
   * runs in UTC and `TZ` can't be set there.
   */
  APP_TIME_ZONE: z
    .string()
    .default("Europe/Berlin")
    .refine(isTimeZone, "APP_TIME_ZONE must be an IANA time zone, such as Europe/Berlin"),
});
export type Config = z.infer<typeof Config>;

/**
 * A name from the IANA time zone database (`Europe/Berlin`, `UTC`), as `Intl` knows them. Offsets
 * (`+02:00`), which `Intl` also takes, are refused: they have no summer time.
 */
function isTimeZone(zone: string): boolean {
  if (!/^[A-Za-z]/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Loads the repo-root `.env` into `process.env`, if it exists. Values already set win. */
export function loadEnvFile(): void {
  const path = fileURLToPath(new URL("../../.env", import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}

export function parseConfig(env: Record<string, string | undefined>): Config {
  // Treat empty strings as unset, so `KEY=` in .env falls back to the default.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ""));
  return Config.parse(cleaned);
}

/** The Better Auth secret, which the server can't start without. */
export function authSecret(config: Config): string {
  if (!config.BETTER_AUTH_SECRET) {
    throw new Error(
      "BETTER_AUTH_SECRET is missing: add one to .env (`openssl rand -base64 32`), see .env.example",
    );
  }
  return config.BETTER_AUTH_SECRET;
}
