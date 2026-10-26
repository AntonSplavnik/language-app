import type { IncomingMessage } from "node:http";

/** Vercel's id for a request, such as `fra1::iad1::q8x2k-1792998000000-0f3c2a7b9e1d`. */
const VERCEL_ID = /^[\w.:-]{1,128}$/;

/**
 * Fastify's request ids (`genReqId`): the id a 500's "Something went wrong (request …)" names and
 * every log line carries (§12 General). On Vercel it is Vercel's own (`x-vercel-id`), which finds
 * the request in Vercel's logs, since Fastify's counter restarts in every function instance
 * (§18.2). Without one (the Mac), or for a header that can't be an id, Fastify's kind: `req-1`,
 * `req-2`…
 */
export function requestIds(): (request: IncomingMessage) => string {
  let count = 0;
  return (request) => {
    const vercel = request.headers["x-vercel-id"];
    if (typeof vercel === "string" && VERCEL_ID.test(vercel)) return vercel;
    count += 1;
    return `req-${count.toString(36)}`;
  };
}
