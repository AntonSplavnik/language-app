import { createClaudeAi } from "./ai/claude";
import { anthropicTransport } from "./ai/transport";
import { dbUsageSink } from "./ai/usage";
import { buildApp } from "./app";
import { createAuth } from "./auth/auth";
import { authSecret, loadEnvFile, parseConfig } from "./config";
import { createDb } from "./db/client";

loadEnvFile();
const config = parseConfig(process.env);
const db = createDb(config.DATABASE_URL);

// The learner's language comes with each request's session, so the AI client needs none (§17.3).
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
  { logger: true },
);
app.addHook("onClose", () => db.$client.end());

// Only Vite talks to the server (it proxies /api), so listen on localhost only.
await app.listen({ host: "127.0.0.1", port: config.SERVER_PORT });
