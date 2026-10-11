import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { newPhotoId } from "../src/state/importPhotos";

// The iPhone opens the app over plain HTTP on the home network (§14), which is not a secure
// context. These APIs are missing there; on desktop localhost they work, so nothing else catches it.
const SECURE_CONTEXT_ONLY = [
  /crypto\.randomUUID/,
  /crypto\.subtle/,
  /navigator\.clipboard/,
  /navigator\.mediaDevices/,
  /serviceWorker/,
];

const srcDir = fileURLToPath(new URL("../src", import.meta.url));
const sourceFiles = (readdirSync(srcDir, { recursive: true }) as string[])
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => join(srcDir, f));

describe("web code runs outside a secure context", () => {
  it.each(SECURE_CONTEXT_ONLY.map((p) => [p.source, p]))("does not use %s", (_, pattern) => {
    const offenders = sourceFiles.filter((file) => pattern.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("photo ids are unique without crypto", () => {
    const ids = new Set(Array.from({ length: 100 }, newPhotoId));
    expect(ids.size).toBe(100);
  });
});
