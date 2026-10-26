import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_NAME } from "@language-app/core";
import { describe, expect, it } from "vitest";

// The app's name lives in one constant (core/src/app.ts). The browser reads index.html and the
// manifest before any code runs, so they hold the name as text; this keeps them equal to the
// constant, and keeps the name out of the web code itself, so a rename is one change.

const webDir = fileURLToPath(new URL("..", import.meta.url));
const read = (file: string) => readFileSync(join(webDir, file), "utf8");

describe("the app's name", () => {
  it("is the title and the Home Screen label in index.html", () => {
    const html = read("index.html");
    expect(html).toContain(`<title>${APP_NAME}</title>`);
    expect(html).toContain(`<meta name="apple-mobile-web-app-title" content="${APP_NAME}" />`);
  });

  it("is the manifest's name and short name", () => {
    const manifest = JSON.parse(read("public/manifest.webmanifest"));
    expect(manifest.name).toBe(APP_NAME);
    expect(manifest.short_name).toBe(APP_NAME);
  });

  it("appears in the web code only through the constant", () => {
    const srcDir = join(webDir, "src");
    const literal = (readdirSync(srcDir, { recursive: true }) as string[])
      .filter((f) => /\.(tsx?|css)$/.test(f))
      .filter((f) => readFileSync(join(srcDir, f), "utf8").includes(APP_NAME));
    expect(literal).toEqual([]);
  });
});
