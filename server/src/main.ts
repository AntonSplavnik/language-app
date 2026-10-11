import { buildApp } from "./app";
import { loadEnvFile, parseConfig } from "./config";
import { createDb } from "./db/client";

loadEnvFile();
const config = parseConfig(process.env);
const db = createDb(config.DATABASE_URL);
const app = buildApp({ db }, { logger: true });
app.addHook("onClose", () => db.$client.end());

// Only Vite talks to the server (it proxies /api), so listen on localhost only.
await app.listen({ host: "127.0.0.1", port: config.SERVER_PORT });
