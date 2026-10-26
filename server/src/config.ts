import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const Fields = z.object({
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
  /** Vite's port: the address the browser signs in on (§4 Accounts, the trusted origins). */
  WEB_PORT: z.coerce.number().int().positive().default(5173),
  /**
   * Signs Better Auth's cookies (§4 Accounts). Optional here so the scripts that don't sign anyone in
   * run without it; the server and `user:claim` require it (`authSecret`).
   */
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters")
    .optional(),
  /**
   * Production's address (§18.3), such as `https://dingsda.vercel.app`: Better Auth's one base URL
   * and trusted origin, with Secure cookies (§4 Accounts). Never set on the Mac, whose server
   * refuses it: a Secure cookie is never sent back over the LAN's plain HTTP (§14).
   */
  BETTER_AUTH_URL: z
    .string()
    .refine(
      isAppAddress,
      "BETTER_AUTH_URL must be the app's https address, such as https://dingsda.vercel.app",
    )
    .transform((address) => new URL(address).origin)
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
  /**
   * The Google OAuth client (§4 Accounts, §14): both or neither. Without them the server starts
   * as before and Google isn't offered.
   */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});
const Config = Fields.refine(
  ({ GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret }) =>
    (id === undefined) === (secret === undefined),
  { message: "Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither" },
);
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

/** An https address with nothing after the host: `https://dingsda.vercel.app`, with or without `/`. */
function isAppAddress(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === "https:" && url.pathname === "/" && !url.search && !url.hash;
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

/**
 * What a Vercel Function can't start without (§18.3). The Mac's defaults don't apply there: its
 * own database, its addresses, and no secret at all.
 */
const REQUIRED_ON_VERCEL = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"] as const;

/** The configuration of the Vercel Function, from Vercel's production variables (no `.env`). */
export function parseVercelConfig(env: Record<string, string | undefined>): Config {
  const missing = REQUIRED_ON_VERCEL.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(
      `${missing.join(", ")} must be set in Vercel's production variables (docs/design.md §18.3)`,
    );
  }
  return parseConfig(env);
}

/** The Google OAuth client, or null when the server has none (Google isn't offered then). */
export function googleCredentials(
  config: Config,
): { clientId: string; clientSecret: string } | null {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = config;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
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
