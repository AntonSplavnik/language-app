// Writes .vercel/output for Vercel (docs/design.md §18.2): the web build as static files, the API
// bundled into one function, and the routes. Run after the web build:
//
//   pnpm build:vercel        (at the root: the web build, then this)
//
// vercel.json makes it the build command, so `vercel build` runs it too, and
// `vercel deploy --prebuilt` uploads what it wrote.
import { buildVercelOutput } from "./vercel-output";

const report = await buildVercelOutput();
const megabytes = (report.bundleBytes / 1024 / 1024).toFixed(1);
console.log(
  `Wrote ${report.outputDir}: ${report.staticFiles} static files and the function ` +
    `(index.mjs, ${megabytes} MB) in ${report.seconds.toFixed(1)} s`,
);
