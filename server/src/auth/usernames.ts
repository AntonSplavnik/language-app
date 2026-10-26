import { USERNAME_MAX, USERNAME_MIN } from "@language-app/core";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { users } from "../db/schema";

// The username of an account made with Google (docs/design.md §4 Accounts): Google gives no
// username, so one is made from the email, following the username rules (3–30 characters, letters,
// digits, `.` and `_`, lower-case) and unique. The learner can't change it yet (plan, M12).

/** Used when nothing of the email's local part is left. */
const FALLBACK = "user";

/**
 * The part of the email before `@` (and before a `+tag`), lower-case, accents dropped and `ß`
 * written out; every run of other characters becomes one `_`, none is left at either end, and it
 * is cut to 30 characters.
 */
export function usernameBase(email: string): string {
  const local = (email.split("@")[0] ?? "").split("+")[0] ?? "";
  const cleaned = local
    .toLowerCase()
    .replaceAll("ß", "ss")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9_.]+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, USERNAME_MAX)
    .replace(/[._]+$/, "");
  return cleaned || FALLBACK;
}

/**
 * The names to try, in order: the base, then with 2, 3, … (the base shortened so the name stays
 * within 30 characters). A name shorter than 3 characters is skipped, so a short base gets a
 * number at once ("jo2").
 */
export function* usernameCandidates(base: string): Generator<string> {
  if (base.length >= USERNAME_MIN) yield base;
  for (let n = 2; ; n++) {
    const suffix = String(n);
    const name = `${base.slice(0, USERNAME_MAX - suffix.length)}${suffix}`;
    if (name.length >= USERNAME_MIN) yield name;
  }
}

/** Tries before giving up: far more than two accounts from one email's local part. */
const MAX_TRIES = 1000;

/** The first of the candidates no account has (usernames are stored lower-case). */
export async function uniqueUsername(db: Db, email: string): Promise<string> {
  let tries = 0;
  for (const name of usernameCandidates(usernameBase(email))) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, name))
      .limit(1);
    if (!taken) return name;
    if (++tries >= MAX_TRIES) break;
  }
  throw new Error(`No free username for ${email}`);
}
