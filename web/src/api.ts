import { createApiClient } from "@language-app/core";

const unauthorizedListeners = new Set<() => void>();

/**
 * Called when one of our routes answers 401: the session has ended (expired, or signed out in
 * another tab), so the app goes to Sign in (§10, Signed in or not). Better Auth's own endpoints are left out: a
 * wrong password is also a 401. Returns the unsubscribe function.
 */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

/** Same-origin client: Vite proxies /api to the server, and the session cookie goes along. */
export const api = createApiClient({
  fetch: async (input, init) => {
    const res = await fetch(input, init);
    if (res.status === 401 && !String(input).startsWith("/api/auth/")) {
      for (const listener of unauthorizedListeners) listener();
    }
    return res;
  },
});
