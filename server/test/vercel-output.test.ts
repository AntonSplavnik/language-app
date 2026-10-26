import { describe, expect, it } from "vitest";
import { FUNCTION_CONFIG, importsOf, OUTPUT_CONFIG, strayImports } from "../scripts/vercel-output";

// What `pnpm build:vercel` writes for Vercel's Build Output API (docs/design.md §18.2). The real
// build, and the bundled function answering requests, are tested by `pnpm test:bundle`.

/** Where Vercel sends a path: the first route that matches, as config.json lists them. */
function destination(path: string): string {
  for (const route of OUTPUT_CONFIG.routes) {
    if ("handle" in route) {
      if (["/index.html", "/assets/index-Bx1.js", "/manifest.webmanifest"].includes(path)) {
        return "file";
      }
      continue;
    }
    if (new RegExp(route.src).test(path)) return route.dest;
  }
  return "404";
}

describe("the routes (config.json)", () => {
  it("is version 3 of the Build Output API", () => {
    expect(OUTPUT_CONFIG.version).toBe(3);
  });

  it.each(["/api", "/api/", "/api/health", "/api/auth/callback/google", "/api/imports/12/photos"])(
    "sends %s to the function",
    (path) => {
      expect(destination(path)).toBe("/api");
    },
  );

  it.each(["/apifoo", "/api.json", "/xapi/health"])("doesn't send %s to the function", (path) => {
    expect(destination(path)).not.toBe("/api");
  });

  it("serves the web build's files as they are", () => {
    expect(destination("/assets/index-Bx1.js")).toBe("file");
    expect(destination("/manifest.webmanifest")).toBe("file");
  });

  it("answers every other path with index.html, so the app's own routes load", () => {
    expect(destination("/")).toBe("/index.html");
    expect(destination("/words")).toBe("/index.html");
    expect(destination("/imports/12/review")).toBe("/index.html");
  });
});

describe("the function (.vc-config.json)", () => {
  it("runs index.mjs on Node 24 in Frankfurt, for up to 300 s", () => {
    expect(FUNCTION_CONFIG).toEqual({
      runtime: "nodejs24.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      maxDuration: 300,
      regions: ["fra1"],
    });
  });
});

describe("the imports left in the bundle", () => {
  it("finds static imports, dynamic ones and require calls", async () => {
    const code = [
      `import { createRequire } from "node:module";`,
      `import "node:crypto";`,
      `const pgNative = __require("pg-native");`,
      `const os = require('os');`,
      `const later = await import("node:fs/promises");`,
      `export { x } from "./chunk.js";`,
    ].join("\n");

    expect((await importsOf(code)).sort()).toEqual(
      ["./chunk.js", "node:crypto", "node:fs/promises", "node:module", "os", "pg-native"].sort(),
    );
  });

  it("doesn't count code that only mentions an import", async () => {
    const code = [
      `const template = 'import { pgTable } from "drizzle-orm/pg-core";';`,
      "// require('fastify') in a comment",
      'const help = `export { x } from "./schema"`;',
    ].join("\n");

    expect(await importsOf(code)).toEqual([]);
  });

  it("allows only Node's own modules and the two left out on purpose", () => {
    expect(
      strayImports(["node:module", "crypto", "fs/promises", "pg-native", "@opentelemetry/api"]),
    ).toEqual([]);
  });

  it.each([
    "@language-app/core",
    "@language-app/core/src/index",
    "../../core/src/index",
    "./chunk.js",
    "fastify",
    "pg",
  ])("refuses %s, which Vercel's function wouldn't have", (specifier) => {
    expect(strayImports(["node:module", specifier])).toEqual([specifier]);
  });
});
