import { Password } from "@language-app/core";
import { count, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { authSessions, users } from "../db/schema";
import type { Auth } from "./auth";
import { normalizeEmail } from "./invites";

// The account scripts beside user:claim (docs/design.md §14): user:set-password, while there is no
// password reset by email, and user:ai, the AI switch.

/** An account as the scripts name it and print it. */
export type Account = {
  id: number;
  email: string | null;
  username: string | null;
  displayUsername: string | null;
  aiEnabled: boolean;
};

const columns = {
  id: users.id,
  email: users.email,
  username: users.username,
  displayUsername: users.displayUsername,
  aiEnabled: users.aiEnabled,
};

/**
 * The account with this email or username, as Sign in finds it: with an `@` it is an email; both
 * are stored lower-case, and spaces around are ignored.
 */
export async function findAccount(db: Db, login: string): Promise<Account | null> {
  const name = normalizeEmail(login);
  const [found] = await db
    .select(columns)
    .from(users)
    .where(name.includes("@") ? eq(users.email, name) : eq(users.username, name));
  return found ?? null;
}

async function accountOf(db: Db, login: string): Promise<Account> {
  const found = await findAccount(db, login);
  if (found) return found;
  const name = normalizeEmail(login);
  throw new Error(`No account with the ${name.includes("@") ? "email" : "username"} ${name}`);
}

/** What `user:set-password` did, to print. */
export type PasswordResult = {
  account: Account;
  /** True when the account had no password before (one that signs in with Google only). */
  added: boolean;
  /** Its sign-ins that were ended, on every device. */
  sessionsEnded: number;
};

/**
 * Sets a new password through Better Auth, hashed as sign-up hashes it (8–128 characters), and
 * ends every sign-in of the account, so a device that knew the old one has to sign in again.
 */
export async function setPassword(
  auth: Auth,
  db: Db,
  login: string,
  password: string,
): Promise<PasswordResult> {
  if (!Password.safeParse(password).success) {
    throw new Error("The password must be 8–128 characters");
  }
  const account = await accountOf(db, login);
  const ctx = await auth.$context;
  const adapter = ctx.internalAdapter;
  const userId = String(account.id);

  const hash = await ctx.password.hash(password);
  const credential = await adapter.findCredentialAccount(userId);
  if (credential) {
    await adapter.updatePassword(userId, hash);
  } else {
    // Better Auth's credential accounts use the user's id as the account id.
    await adapter.linkAccount({
      userId,
      providerId: "credential",
      accountId: userId,
      password: hash,
    });
  }

  const [sessions] = await db
    .select({ n: count() })
    .from(authSessions)
    .where(eq(authSessions.userId, account.id));
  await adapter.deleteUserSessions(userId);
  return { account, added: !credential, sessionsEnded: sessions?.n ?? 0 };
}

/** Switches the account's AI features on or off; `was` is the switch before. */
export async function setAiEnabled(
  db: Db,
  login: string,
  enabled: boolean,
): Promise<{ account: Account; was: boolean }> {
  const before = await accountOf(db, login);
  const [account] = await db
    .update(users)
    .set({ aiEnabled: enabled, updatedAt: new Date() })
    .where(eq(users.id, before.id))
    .returning(columns);
  if (!account) throw new Error(`The account ${before.id} disappeared`);
  return { account, was: before.aiEnabled };
}
