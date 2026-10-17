import { eq } from "drizzle-orm";
import { createClaudeAi } from "./ai/claude";
import { anthropicTransport } from "./ai/transport";
import { dbUsageSink } from "./ai/usage";
import { buildApp } from "./app";
import { loadEnvFile, parseConfig } from "./config";
import { createDb } from "./db/client";
import { users } from "./db/schema";
import { SINGLE_USER_ID } from "./user";

loadEnvFile();
const config = parseConfig(process.env);
const db = createDb(config.DATABASE_URL);

const [learner] = await db
  .select({ learnerLanguage: users.learnerLanguage })
  .from(users)
  .where(eq(users.id, SINGLE_USER_ID));
if (!learner) throw new Error("The single user is missing; run `pnpm db:migrate`");

const ai = createClaudeAi({
  transport: anthropicTransport(config.ANTHROPIC_API_KEY),
  recordUsage: dbUsageSink(db),
  models: {
    extract: config.AI_MODEL_EXTRACT,
    enrich: config.AI_MODEL_ENRICH,
    describe: config.AI_MODEL_DESCRIBE,
  },
  effort: config.AI_EFFORT,
  learnerLanguage: learner.learnerLanguage,
});

const app = buildApp(
  {
    db,
    ai,
    dailyPhotoLimit: config.DAILY_PHOTO_LIMIT,
    dailyDescribeLimit: config.DAILY_DESCRIBE_LIMIT,
  },
  { logger: true },
);
app.addHook("onClose", () => db.$client.end());

// Only Vite talks to the server (it proxies /api), so listen on localhost only.
await app.listen({ host: "127.0.0.1", port: config.SERVER_PORT });
