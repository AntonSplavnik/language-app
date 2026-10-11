import { createApiClient } from "@language-app/core";

/** Same-origin client: Vite proxies /api to the server. */
export const api = createApiClient({ fetch: (input, init) => fetch(input, init) });
