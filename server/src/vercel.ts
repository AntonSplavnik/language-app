// The API as one Vercel Function (docs/design.md §18.2), bundled by scripts/build-vercel.ts into
// .vercel/output/functions/api.func/index.mjs. Its configuration is Vercel's production variables
// (there is no .env). The server is set up once per function instance, as main.ts sets it up on
// the Mac but without listen(); Vercel then hands each request to the default export, which
// passes it to Fastify as it came, with its original path (/api/…).
import type { IncomingMessage, ServerResponse } from "node:http";
import { parseVercelConfig } from "./config";
import { createServer } from "./setup";

const { app } = createServer(parseVercelConfig(process.env), "vercel");
await app.ready();

export default function handler(request: IncomingMessage, response: ServerResponse): void {
  app.server.emit("request", request, response);
}
