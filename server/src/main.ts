// The server on the Mac (`pnpm dev`, docs/design.md §14). Production runs the same setup as a
// Vercel Function (vercel.ts).
import { loadEnvFile, parseConfig } from "./config";
import { createServer } from "./setup";

loadEnvFile();
const config = parseConfig(process.env);
const { app } = createServer(config, "mac");

// Only Vite talks to the server (it proxies /api), so listen on localhost only.
await app.listen({ host: "127.0.0.1", port: config.SERVER_PORT });
