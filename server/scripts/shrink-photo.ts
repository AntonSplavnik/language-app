import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Shrinks a photo the way the web app does before upload (§6.2): JPEG, longest side 1600 px,
 * quality 0.85. Uses macOS `sips`; for dev scripts and live tests only.
 */
export function shrinkLikeTheBrowser(photoPath: string): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "shrink-photo-"));
  const out = join(dir, "photo.jpg");
  try {
    execFileSync(
      "sips",
      ["-Z", "1600", "-s", "format", "jpeg", "-s", "formatOptions", "85", photoPath, "--out", out],
      { stdio: "ignore" },
    );
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
