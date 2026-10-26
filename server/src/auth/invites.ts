import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { invites } from "../db/schema";

// The invite list (docs/design.md §17.4): while SIGNUP_MODE=invite, only these emails can create
// an account. Edited with the invite:* scripts; nothing in the app shows it.

/** How emails are stored and compared: trimmed and lower-case, as Better Auth stores them. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export type Invite = typeof invites.$inferSelect;

export async function isInvited(db: Db, email: string): Promise<boolean> {
  const [row] = await db
    .select({ email: invites.email })
    .from(invites)
    .where(eq(invites.email, normalizeEmail(email)));
  return row !== undefined;
}

/** Adds an email; adding one that is already on the list changes nothing. */
export async function addInvite(db: Db, email: string): Promise<{ email: string; added: boolean }> {
  const normalized = normalizeEmail(email);
  const inserted = await db
    .insert(invites)
    .values({ email: normalized })
    .onConflictDoNothing()
    .returning({ email: invites.email });
  return { email: normalized, added: inserted.length > 0 };
}

export async function listInvites(db: Db): Promise<Invite[]> {
  return db.select().from(invites).orderBy(asc(invites.createdAt), asc(invites.email));
}

/** Removes an email from the list. An account made from it stays (§17.4). */
export async function removeInvite(db: Db, email: string): Promise<boolean> {
  const removed = await db
    .delete(invites)
    .where(eq(invites.email, normalizeEmail(email)))
    .returning({ email: invites.email });
  return removed.length > 0;
}

/** Marks the email's invite used by the account just created for it, if there is one. */
export async function markInviteUsed(db: Db, email: string, userId: number): Promise<void> {
  await db
    .update(invites)
    .set({ usedAt: new Date(), userId })
    .where(eq(invites.email, normalizeEmail(email)));
}
