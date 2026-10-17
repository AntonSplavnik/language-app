import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const Config = z.object({
  DATABASE_URL: z.url().default("postgres://app:app@localhost:5432/language_app"),
  TEST_DATABASE_URL: z.url().default("postgres://app:app@localhost:5432/language_app_test"),
  ANTHROPIC_API_KEY: z.string().default(""),
  AI_MODEL_EXTRACT: z.string().min(1).default("claude-opus-5-5"),
  AI_MODEL_ENRICH: z.string().min(1).default("claude-opus-5-5"),
  AI_MODEL_DESCRIBE: z.string().min(1).default("claude-opus-5-5"),
  AI_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),
  DAILY_PHOTO_LIMIT: z.coerce.number().int().positive().default(50),
  /** Ask AI calls per user per day (§11.5): a safety net, not a budget. */
  DAILY_DESCRIBE_LIMIT: z.coerce.number().int().positive().default(200),
  SERVER_PORT: z.coerce.number().int().positive().default(3000),
});
export type Config = z.infer<typeof Config>;

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
