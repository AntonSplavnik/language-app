import type { AiClient } from "../../src/ai/types";
import { buildApp } from "../../src/app";
import type { Db } from "../../src/db/client";

/** An AI client for tests that must not reach the AI. */
export const unusedAi: AiClient = {
  extractWords: () => Promise.reject(new Error("AI was not expected to be called")),
  enrichWords: () => Promise.reject(new Error("AI was not expected to be called")),
  describeWord: () => Promise.reject(new Error("AI was not expected to be called")),
};

export function buildTestApp(
  db: Db,
  {
    ai = unusedAi,
    dailyPhotoLimit = 50,
    dailyDescribeLimit = 200,
  }: { ai?: AiClient; dailyPhotoLimit?: number; dailyDescribeLimit?: number } = {},
) {
  return buildApp({ db, ai, dailyPhotoLimit, dailyDescribeLimit });
}

/** A multipart/form-data body with one file, for `app.inject`. */
export function multipartFile(
  field: string,
  content: Uint8Array,
  { filename = "photo.jpg", contentType = "image/jpeg" } = {},
) {
  const boundary = "----test-boundary-7f3a";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
    ),
    Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}
