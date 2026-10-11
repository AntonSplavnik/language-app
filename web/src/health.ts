import { HealthResponse } from "@language-app/core";

export type ServerState = "ok" | "unreachable";

/** Asks the server whether it is up. Never throws. */
export async function checkServer(fetchFn: typeof fetch = fetch): Promise<ServerState> {
  try {
    const res = await fetchFn("/api/health");
    if (!res.ok) return "unreachable";
    return HealthResponse.safeParse(await res.json()).success ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  }
}
