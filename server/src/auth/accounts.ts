import { Password } from "@language-app/core";
import { and, asc, count, eq, inArray, isNull, like, max, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, Executor } from "../db/client";
import {
  aiUsage,
  authAccounts,
  authSessions,
  authVerifications,
  cardResults,
  imports,
  invites,
  sessions,
  users,
  userWords,
} from "../db/schema";
import type { Auth } from "./auth";
import { normalizeEmail, removeUnusedInvite } from "./invites";

// The account scripts beside user:claim (docs/design.md §14): user:set-password, while there is no
// password reset by email; user:ai, the AI switch; user:list; and user:delete, which deletes an
// account as Delete account does (§4 Accounts) and shares with it what the cascades don't cover.

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

/** The account with this email or username; otherwise an error saying which wasn't found. */
export async function accountOf(db: Db, login: string): Promise<Account> {
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

/**
 * A line of user:list (§14): an account and what it has, never a password hash, a token or a
 * session id.
 */
export type AccountSummary = {
  id: number;
  /** As the app shows it (`display_username`); null for user 1 before `user:claim`. */
  username: string | null;
  email: string | null;
  /** How it signs in: `password` (Better Auth's `credential`), then `google`. */
  methods: string[];
  aiEnabled: boolean;
  /** The words in its list, in every tab of My words. */
  words: number;
  createdAt: Date;
  /**
   * The newest `updated_at` of its sign-ins: a sign-in sets it, and get-session moves it when the
   * app starts, once it is a day old (§4 Accounts, Sessions). Null without a sign-in.
   */
  lastActive: Date | null;
};

/** Every account, sorted by id, or the one with `id`. */
export async function listAccounts(db: Executor, id?: number): Promise<AccountSummary[]> {
  // Subqueries as query builders, which name their tables (a plain `sql` one wouldn't here).
  const providers = db
    .select({
      list: sql`string_agg(${authAccounts.providerId}, ','
        ORDER BY ${authAccounts.providerId} <> 'credential', ${authAccounts.providerId})`,
    })
    .from(authAccounts)
    .where(eq(authAccounts.userId, users.id));
  const lastSignIn = db
    .select({ at: max(authSessions.updatedAt) })
    .from(authSessions)
    .where(eq(authSessions.userId, users.id));
  const rows = await db
    .select({
      id: users.id,
      displayUsername: users.displayUsername,
      username: users.username,
      email: users.email,
      providers: sql<string | null>`${providers}`,
      aiEnabled: users.aiEnabled,
      words: db.$count(userWords, eq(userWords.userId, users.id)),
      createdAt: users.createdAt,
      lastActive: sql<Date | null>`${lastSignIn}`.mapWith(authSessions.updatedAt),
    })
    .from(users)
    .where(id === undefined ? undefined : eq(users.id, id))
    .orderBy(asc(users.id));
  return rows.map(({ displayUsername, username, providers, ...account }) => ({
    ...account,
    username: displayUsername ?? username,
    methods: methodNames(providers),
  }));
}

/** Better Auth's provider ids as the scripts name them: `credential` is the password. */
function methodNames(providers: string | null): string[] {
  if (!providers) return [];
  return providers
    .split(",")
    .map((provider) => (provider === "credential" ? "password" : provider));
}

const NONE = "—";

/** A moment as the zone's date and time to the minute: `2026-10-28 11:21`. */
export function dateTimeIn(moment: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(moment);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((found) => found.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

type Column = { title: string; right?: boolean; cell: (account: AccountSummary) => string };

const listColumns = (timeZone: string): Column[] => [
  { title: "id", right: true, cell: (account) => String(account.id) },
  { title: "username", cell: (account) => account.username ?? NONE },
  { title: "email", cell: (account) => account.email ?? NONE },
  { title: "sign-in", cell: (account) => account.methods.join(", ") || "none" },
  { title: "AI", cell: (account) => (account.aiEnabled ? "on" : "off") },
  { title: "words", right: true, cell: (account) => String(account.words) },
  { title: "created", cell: (account) => dateTimeIn(account.createdAt, timeZone) },
  {
    title: "last active",
    cell: (account) => (account.lastActive ? dateTimeIn(account.lastActive, timeZone) : NONE),
  },
];

/** user:list's lines (§14): a header, then one aligned line per account, the times in the zone. */
export function accountTable(accounts: AccountSummary[], timeZone: string): string[] {
  const table = listColumns(timeZone);
  const rows = [
    table.map((column) => column.title),
    ...accounts.map((account) => table.map((column) => column.cell(account))),
  ];
  const widths = table.map((_, i) => Math.max(...rows.map((row) => row[i]?.length ?? 0)));
  return rows.map((row) => {
    const cells = row.map((text, i) =>
      table[i]?.right ? text.padStart(widths[i] ?? 0) : text.padEnd(widths[i] ?? 0),
    );
    return `  ${cells.join("  ")}`.trimEnd();
  });
}

/** user:list's last line: "3 accounts, 1 with AI on". */
export function accountTotal(accounts: AccountSummary[]): string {
  if (accounts.length === 0) return "No accounts.";
  const withAi = accounts.filter((account) => account.aiEnabled).length;
  return `${accounts.length} account${accounts.length === 1 ? "" : "s"}, ${withAi} with AI on`;
}

/** What deleting an account deletes (§14 user:delete), counted. */
export type AccountContents = {
  /** The words in its list (`user_words`); the shared words stay. */
  words: number;
  imports: number;
  /** Practice sessions, and the answers given (`card_results`). */
  sessions: number;
  answers: number;
  aiUsage: number;
  /** Its sign-ins (`auth_sessions`), on every device. */
  signIns: number;
  /** Its ways to sign in, named as user:list names them. */
  methods: string[];
  /** The invite it was made from, and one for its email no account was made from. */
  invites: number;
  /** Connects to Google under way, whose state holds its id and email (§16). */
  connects: number;
};

export async function accountContents(
  db: Executor,
  account: Pick<Account, "id" | "email">,
): Promise<AccountContents> {
  const { id, email } = account;
  const [summary] = await listAccounts(db, id);
  return {
    words: await db.$count(userWords, eq(userWords.userId, id)),
    imports: await db.$count(imports, eq(imports.userId, id)),
    sessions: await db.$count(sessions, eq(sessions.userId, id)),
    // An answer goes with its session or with its word in the list, whichever is the account's.
    answers: await db.$count(
      cardResults,
      or(
        inArray(
          cardResults.sessionId,
          db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, id)),
        ),
        inArray(
          cardResults.userWordId,
          db.select({ id: userWords.id }).from(userWords).where(eq(userWords.userId, id)),
        ),
      ),
    ),
    aiUsage: await db.$count(aiUsage, eq(aiUsage.userId, id)),
    signIns: await db.$count(authSessions, eq(authSessions.userId, id)),
    methods: summary?.methods ?? [],
    invites: await db.$count(
      invites,
      or(
        eq(invites.userId, id),
        email ? and(eq(invites.email, normalizeEmail(email)), isNull(invites.userId)) : undefined,
      ),
    ),
    connects: (await connectsOf(db, id)).length,
  };
}

/** What deleting the account deletes, one aligned line each, the sign-in methods named. */
export function formatContents(contents: AccountContents): string[] {
  const lines: Array<[string, number, string?]> = [
    ["words in its list", contents.words],
    ["imports", contents.imports],
    ["practice sessions", contents.sessions],
    ["practice answers", contents.answers],
    ["AI usage records", contents.aiUsage],
    ["sign-ins", contents.signIns],
    ["sign-in methods", contents.methods.length, contents.methods.join(", ")],
    ["invites", contents.invites],
  ];
  if (contents.connects > 0) lines.push(["Connects to Google under way", contents.connects]);
  const label = Math.max(...lines.map(([text]) => text.length));
  const digits = Math.max(...lines.map(([, n]) => String(n).length));
  return lines.map(
    ([text, n, names]) =>
      `  ${text.padEnd(label)}  ${String(n).padStart(digits)}${names ? `  (${names})` : ""}`,
  );
}

/**
 * Whether the answer to user:delete's question confirms it (§14): the account's username typed
 * back, in any case and with spaces around ignored, as Sign in compares usernames. Nothing else
 * counts, not its email or id; an account without a username (user 1 before `user:claim`) can't be
 * confirmed.
 */
export function confirmsDeletion(account: Pick<Account, "username">, typed: string): boolean {
  return account.username !== null && typed.trim().toLowerCase() === account.username.toLowerCase();
}

/**
 * Deletes the account by script (§14 user:delete) as Delete account does (§4 Accounts), in one
 * transaction: its row locked first, so nothing can be added to it meanwhile; what the cascades
 * don't cover (`removeLeftovers`); then the users row, whose cascades (§5) take everything else it
 * owns. Returns what went, counted inside the transaction.
 */
export async function deleteAccount(
  db: Db,
  account: Pick<Account, "id">,
): Promise<AccountContents> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, account.id))
      .for("update");
    if (!row) throw new Error(`User ${account.id} is already gone; nothing was deleted`);
    const contents = await accountContents(tx, row);
    await removeLeftovers(tx, row);
    await tx.delete(users).where(eq(users.id, row.id));
    return contents;
  });
}

/**
 * What deleting an account removes besides the users row and its cascades (§4 Accounts): an invite
 * for its email that no account was made from (added again after the account existed), which
 * would let the email sign up again, and its Connects to Google under way, whose state rows hold
 * its id and email (§16). Delete account runs it after Better Auth's delete (`afterDelete`),
 * user:delete inside its transaction, before the users row.
 */
export async function removeLeftovers(
  db: Executor,
  account: { id: number; email: string | null },
): Promise<void> {
  if (account.email) await removeUnusedInvite(db, account.email);
  const connects = await connectsOf(db, account.id);
  if (connects.length > 0) {
    await db.delete(authVerifications).where(inArray(authVerifications.id, connects));
  }
}

/** What Connect adds to a Google trip's state: the signed-in account (§16). */
const ConnectState = z.object({ link: z.object({ userId: z.coerce.string() }) });

/**
 * The ids of the account's Connects to Google under way. Better Auth keeps a trip's state as JSON
 * in `auth_verifications` (`auth-state:<state>`, for 10 minutes or until the next lookup after
 * that), and Connect's carries `link: { email, userId }`.
 */
async function connectsOf(db: Executor, userId: number): Promise<number[]> {
  const states = await db
    .select({ id: authVerifications.id, value: authVerifications.value })
    .from(authVerifications)
    .where(like(authVerifications.identifier, "auth-state:%"));
  return states
    .filter(({ value }) => {
      try {
        return ConnectState.safeParse(JSON.parse(value)).data?.link.userId === String(userId);
      } catch {
        return false;
      }
    })
    .map(({ id }) => id);
}
