// Vercel's Build Output API folder, .vercel/output (docs/design.md §18.2): the web build as static
// files, the API bundled with esbuild into one Vercel Function, and the routes between them.
// Vercel's own packer can't run the server (it compiles each file on its own and leaves our
// extensionless imports, which Node's ES module loader can't find), so the bundle is ours.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isBuiltin } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

/** The repo's root, where Vercel looks for `.vercel/output`. */
export const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The function's folder inside the output: it answers `/api`, and the routes send it `/api/…`. */
export const FUNCTION_DIR = "functions/api.func";

/** `.vc-config.json`: Node 24 (Vercel's newest), in Frankfurt like Neon, for up to 300 s. */
export const FUNCTION_CONFIG = {
  runtime: "nodejs24.x",
  handler: "index.mjs",
  launcherType: "Nodejs",
  maxDuration: 300,
  regions: ["fra1"],
} as const;

/**
 * `config.json`: `/api` and everything under it to the function (which sees the original path),
 * then the web build's files as they are, then `index.html` for every other path, so the app's
 * own routes (`/words`) load.
 */
export const OUTPUT_CONFIG = {
  version: 3,
  routes: [
    { src: "^/api(?:/.*)?$", dest: "/api" },
    { handle: "filesystem" },
    { src: "^/(.*)$", dest: "/index.html" },
  ],
} as const;

/** CommonJS libraries inside the ES module bundle call require(); this gives them Node's own. */
const CREATE_REQUIRE =
  'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);';

/** Left outside the bundle on purpose: imports that are only tried, or only made when asked for. */
const LEFT_OUT = [
  // node-postgres requires it only for `pg.native`, which the app never uses.
  "pg-native",
  // Better Auth tries it for tracing (`try { await import(…) } catch {}`), and uses a no-op without.
  "@opentelemetry/api",
];

/** How esbuild's bundle calls require() for a CommonJS library's import it left outside. */
const BUNDLE_REQUIRE = /\b__require\(\s*"([^"]+)"\s*\)/g;

/**
 * The modules a built bundle still loads at run time: its imports and require() calls, as
 * esbuild's own parser reads them (so code that merely mentions an import, such as a schema
 * generator's template, doesn't count), plus esbuild's `__require("…")` calls.
 */
export async function importsOf(code: string): Promise<string[]> {
  const result = await build({
    stdin: { contents: code, loader: "js", sourcefile: "bundle.mjs" },
    bundle: true,
    write: false,
    metafile: true,
    platform: "node",
    format: "esm",
    external: ["*"],
    logLevel: "silent",
  });
  const parsed = Object.values(result.metafile.inputs).flatMap((input) =>
    input.imports.map((entry) => entry.path),
  );
  const required = [...code.matchAll(BUNDLE_REQUIRE)].map((match) => String(match[1]));
  return [...new Set([...parsed, ...required])];
}

/**
 * Imports a Vercel Function can't resolve: anything but Node's own modules and what is left out on
 * purpose. A workspace package (`@language-app/*`), a `src/` path or a library left outside would
 * fail there with ERR_MODULE_NOT_FOUND.
 */
export function strayImports(specifiers: string[]): string[] {
  return specifiers.filter((specifier) => !isBuiltin(specifier) && !LEFT_OUT.includes(specifier));
}

export type BuildReport = {
  outputDir: string;
  /** The function's one file. */
  bundleBytes: number;
  staticFiles: number;
  seconds: number;
};

/** Writes `.vercel/output` from scratch. The web build (`web/dist`) must have run first. */
export async function buildVercelOutput({ root = ROOT } = {}): Promise<BuildReport> {
  const started = performance.now();
  const webDist = join(root, "web/dist");
  if (!existsSync(join(webDist, "index.html"))) {
    throw new Error("web/dist/index.html is missing: run the web build first (pnpm build:vercel)");
  }
  const outputDir = join(root, ".vercel/output");
  const functionDir = join(outputDir, FUNCTION_DIR);
  rmSync(outputDir, { recursive: true, force: true });
  cpSync(webDist, join(outputDir, "static"), { recursive: true });
  mkdirSync(functionDir, { recursive: true });

  const bundle = join(functionDir, FUNCTION_CONFIG.handler);
  const result = await build({
    entryPoints: [join(root, "server/src/vercel.ts")],
    outfile: bundle,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    external: LEFT_OUT,
    banner: { js: CREATE_REQUIRE },
    metafile: true,
    logLevel: "warning",
  });
  const external = Object.values(result.metafile.outputs).flatMap((output) =>
    output.imports.filter((entry) => entry.external).map((entry) => entry.path),
  );
  const stray = strayImports([...new Set(external)]);
  if (stray.length > 0) {
    throw new Error(`The bundle would import ${stray.join(", ")}, which Vercel's function lacks`);
  }

  writeJson(join(functionDir, ".vc-config.json"), FUNCTION_CONFIG);
  writeJson(join(outputDir, "config.json"), OUTPUT_CONFIG);

  return {
    outputDir: relative(root, outputDir),
    bundleBytes: statSync(bundle).size,
    staticFiles: countFiles(join(outputDir, "static")),
    seconds: (performance.now() - started) / 1000,
  };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function countFiles(dir: string): number {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((entry) =>
    entry.isFile(),
  ).length;
}
