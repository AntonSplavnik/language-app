// Small per-device conveniences (review decisions in progress, the current practice session).
// Storage can be missing or full (private browsing), so every access is guarded and failures
// are ignored.

/** `local` survives closing the tab; `session` lasts as long as the tab. */
type Area = "local" | "session";
const store = (area: Area) => (area === "local" ? localStorage : sessionStorage);

export function readJson<T>(key: string, area: Area = "local"): T | undefined {
  try {
    const raw = store(area).getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function writeJson(key: string, value: unknown, area: Area = "local"): void {
  try {
    store(area).setItem(key, JSON.stringify(value));
  } catch {
    // Not worth interrupting the learner for.
  }
}

export function removeItem(key: string, area: Area = "local"): void {
  try {
    store(area).removeItem(key);
  } catch {
    // Ignore.
  }
}
