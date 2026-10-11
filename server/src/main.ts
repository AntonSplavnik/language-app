import { buildApp } from "./app";
import { loadEnvFile, parseConfig } from "./config";

loadEnvFile();
const config = parseConfig(process.env);
const app = buildApp({ logger: true });

// Only Vite talks to the server (it proxies /api), so listen on localhost only.
await app.listen({ host: "127.0.0.1", port: config.SERVER_PORT });
