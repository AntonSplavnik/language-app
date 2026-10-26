import type { FastifyInstance } from "fastify";
import { TRUSTED_ORIGIN } from "./app";

type Injector = Pick<FastifyInstance, "inject">;
type Answer = { headers: Record<string, unknown> };

export const PASSWORD = "correct horse battery";

/** A POST to Better Auth's endpoints as the web app sends it: JSON, from the app's address. */
export function authPost(
  app: Injector,
  path: string,
  payload: object = {},
  {
    origin = TRUSTED_ORIGIN,
    cookie,
    host,
    forwardedFor,
    headers = {},
  }: {
    origin?: string;
    cookie?: string;
    host?: string;
    forwardedFor?: string;
    /** Any other headers, such as the ones Vercel adds in production. */
    headers?: Record<string, string>;
  } = {},
) {
  return app.inject({
    method: "POST",
    url: `/api/auth${path}`,
    payload,
    headers: {
      origin,
      ...(cookie ? { cookie } : {}),
      ...(host ? { host } : {}),
      // As Vite's proxy adds it on the Mac.
      ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
      ...headers,
    },
  });
}

/** The Cookie header a browser sends back after this answer. */
export function cookieOf(res: Answer): string {
  return setCookies(res)
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

export function setCookies(res: Answer): string[] {
  const header = res.headers["set-cookie"];
  if (Array.isArray(header)) return header.map(String);
  return header === undefined ? [] : [String(header)];
}

/** Signs up through the API (the email must be invited) and returns the session cookie. */
export async function signUp(
  app: Injector,
  { email, username, password = PASSWORD }: { email: string; username: string; password?: string },
): Promise<string> {
  const res = await authPost(app, "/sign-up/email", { email, username, password });
  if (res.statusCode !== 200) throw new Error(`sign-up failed: ${res.statusCode} ${res.body}`);
  return cookieOf(res);
}

/** A GET of one of our routes with this cookie. */
export function getWith(app: Injector, url: string, cookie: string) {
  return app.inject({ method: "GET", url, headers: { cookie } });
}
