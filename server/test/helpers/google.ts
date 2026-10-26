import type { FastifyInstance } from "fastify";
import { vi } from "vitest";
import { TEST_GOOGLE, TEST_WEB_PORT } from "./app";
import { authPost, cookieOf } from "./auth";

// Google at the network edge, for the Google sign-in tests (docs/design.md §13): the browser's
// trips to Google are played by the test, and Google's token endpoint, the one address Better
// Auth's server fetches, is answered by a fake `fetch`. Nothing leaves the machine.

type Injector = Pick<FastifyInstance, "inject">;

export const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
/** Where the browser opens the app in these tests, and so the host of Google's return address. */
export const APP_HOST = `localhost:${TEST_WEB_PORT}`;

/** The Google account the fake Google signs in. */
export type GoogleAccount = {
  /** Google's account id (`sub`), stored as the sign-in method's `account_id`. */
  sub: string;
  email: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
};

/**
 * An id token as Google's token endpoint answers it. Better Auth 1.7.7 reads the one it got from
 * the token endpoint without checking its signature (it came from Google itself, over TLS), so
 * the signature is a placeholder; a version that checked it would fetch Google's keys, which the
 * fake refuses, and the tests would say so.
 */
export function idToken(account: GoogleAccount, clientId = TEST_GOOGLE.clientId): string {
  const now = Math.floor(Date.now() / 1000);
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return [
    part({ alg: "RS256", kid: "test-key", typ: "JWT" }),
    part({
      iss: "https://accounts.google.com",
      azp: clientId,
      aud: clientId,
      sub: account.sub,
      email: account.email,
      email_verified: account.emailVerified ?? true,
      name: account.name ?? "Test Person",
      picture: account.picture ?? `https://lh3.googleusercontent.com/a/${account.sub}`,
      iat: now,
      exp: now + 3600,
    }),
    "c2lnbmF0dXJl",
  ].join(".");
}

/** A request the server tried to send out, and its form body. */
export type OutgoingRequest = { url: string; method: string; body: URLSearchParams };

/**
 * Replaces `fetch` for the test (undone by `vi.unstubAllGlobals()`): Google's token endpoint
 * answers with tokens for the account `signsInAs` names; any other address throws. Every request
 * is recorded, so a test can check what was sent and that nothing else was. Google sends a
 * refresh token only when asked for offline access, which the app doesn't; `refreshToken` adds
 * one anyway (with its expiry), to show that none would be kept.
 */
export function fakeGoogle({ refreshToken = false }: { refreshToken?: boolean } = {}) {
  const requests: OutgoingRequest[] = [];
  let account: GoogleAccount | null = null;

  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const raw = init?.body;
    const body = raw instanceof URLSearchParams ? raw : new URLSearchParams(String(raw ?? ""));
    requests.push({ url, method: init?.method ?? "GET", body });
    if (url !== TOKEN_ENDPOINT) throw new Error(`No request may leave the machine: ${url}`);
    if (!account) throw new Error("fakeGoogle: no account to sign in (call signsInAs first)");
    return Response.json({
      access_token: `ya29.test-${account.sub}`,
      expires_in: 3599,
      scope:
        "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
      token_type: "Bearer",
      id_token: idToken(account),
      ...(refreshToken
        ? { refresh_token: `1//test-refresh-${account.sub}`, refresh_token_expires_in: 604799 }
        : {}),
    });
  });

  return {
    requests,
    /** The Google account the next sign-in comes back with. */
    signsInAs(next: GoogleAccount) {
      account = next;
    },
  };
}

/** Where a redirect goes, read against the app's address. */
export const locationOf = (res: { headers: Record<string, unknown> }) =>
  new URL(String(res.headers.location), `http://${APP_HOST}`);

type Flow = {
  callbackURL?: string;
  errorCallbackURL?: string;
  loginHint?: string;
  /** The browser's session cookie, if it is signed in. */
  cookie?: string;
  /** What Google adds to the return address: a code, or an error such as `access_denied`. */
  query?: Record<string, string>;
};

/** Continue with Google (`/sign-in/social`), the whole trip. */
export const signInWithGoogle = (app: Injector, flow: Flow = {}) =>
  throughGoogle(app, "/sign-in/social", flow);

/** Connect on Account (`/link-social`), the whole trip; needs the session cookie. */
export const connectGoogle = (app: Injector, flow: Flow & { cookie: string }) =>
  throughGoogle(app, "/link-social", flow);

/**
 * The browser's whole trip: the app asks for Google's address, Google sends the browser back to
 * the callback with a code (or an error) and the state, and the server answers with a redirect.
 */
async function throughGoogle(
  app: Injector,
  path: "/sign-in/social" | "/link-social",
  {
    callbackURL = "/",
    errorCallbackURL = "/signin",
    loginHint,
    cookie,
    query = { code: "test-authorization-code" },
  }: Flow,
) {
  const start = await authPost(
    app,
    path,
    { provider: "google", callbackURL, errorCallbackURL, ...(loginHint ? { loginHint } : {}) },
    { cookie, host: APP_HOST },
  );
  if (start.statusCode !== 200) {
    throw new Error(`${path} failed: ${start.statusCode} ${start.body}`);
  }
  const google = new URL(start.json<{ url: string }>().url);
  const state = google.searchParams.get("state") ?? "";
  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/callback/google?${new URLSearchParams({ ...query, state })}`,
    headers: {
      host: APP_HOST,
      // The browser sends back the state cookie from the start, and its session if it has one.
      cookie: [cookie, cookieOf(start)].filter(Boolean).join("; "),
    },
  });
  return { start, google, callback, location: locationOf(callback) };
}

/** The session cookie a Google sign-in left (`""` when it set none). */
export function sessionCookieOf(res: { headers: Record<string, unknown> }): string {
  return cookieOf(res)
    .split("; ")
    .filter((cookie) => cookie.startsWith("better-auth.session_token="))
    .join("; ");
}
