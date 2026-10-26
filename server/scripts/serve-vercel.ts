// Serves the built Vercel Function (.vercel/output/functions/api.func/index.mjs) with node:http,
// handing it each request as Vercel's Node launcher does, for the bundle test (`pnpm test:bundle`)
// and a rehearsal on the Mac (docs/design.md §18.2). Plain Node runs it, as on Vercel; the function
// reads its configuration from the environment, as there (no .env):
//
//   DATABASE_URL=… BETTER_AUTH_SECRET=… BETTER_AUTH_URL=https://dingsda.vercel.app \
//     pnpm --filter server serve:vercel [port]
//
// When it listens it prints one JSON line, { listening, port, startMs }: startMs is the function's
// start (loading the bundle and setting up the server), what a cold start adds to a request.
// Static files aren't its job; Vercel serves those itself.
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";

const bundle = fileURLToPath(
  new URL("../../.vercel/output/functions/api.func/index.mjs", import.meta.url),
);
const port = Number(process.argv[2] ?? 0);

const started = performance.now();
const { default: handler } = await import(pathToFileURL(bundle).href);
const startMs = Math.round(performance.now() - started);

const server = createServer(handler);
server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const listening = typeof address === "object" && address ? address.port : port;
  console.log(JSON.stringify({ listening: true, port: listening, startMs }));
});
