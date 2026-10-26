import { Password, Username } from "@language-app/core";
import { z } from "zod";
import type { Auth } from "./auth";
import { normalizeEmail } from "./invites";

/** User 1: the prototype's single learner, who owns the word list on the Mac (§17.6). */
export const FIRST_USER_ID = "1";

export type Claim = { email: string; username: string; password: string };

/** What `user:claim` changed, to print. */
export type ClaimResult = {
  name: string;
  email: string;
  username: string;
  displayUsername: string;
};

/**
 * Turns user 1 into the developer account (docs/design.md §17.6): its email, username, a
 * password, `email_verified` and AI on, through Better Auth's internal adapter so the password is
 * hashed and the username normalised as on sign-up. Refuses a user 1 that already has an email.
 * The password is set before the rest, so a failure (a taken username) leaves user 1 unclaimed
 * and the command can simply be run again.
 */
export async function claimFirstUser(auth: Auth, claim: Claim): Promise<ClaimResult> {
  const email = normalizeEmail(claim.email);
  if (!z.email().safeParse(email).success) throw new Error(`Not an email address: ${claim.email}`);
  if (!Username.safeParse(claim.username).success) {
    throw new Error("The username must be 3–30 letters, digits, . or _");
  }
  if (!Password.safeParse(claim.password).success) {
    throw new Error("The password must be 8–128 characters");
  }

  const ctx = await auth.$context;
  const adapter = ctx.internalAdapter;
  const user = await adapter.findUserById(FIRST_USER_ID);
  if (!user) throw new Error("User 1 doesn't exist; run `pnpm db:migrate` first");
  if (user.email) throw new Error(`User 1 is already claimed (${user.email})`);
  if (await adapter.findUserByEmail(email)) {
    throw new Error(`Another account already has the email ${email}`);
  }

  const hash = await ctx.password.hash(claim.password);
  if (await adapter.findCredentialAccount(FIRST_USER_ID)) {
    await adapter.updatePassword(FIRST_USER_ID, hash);
  } else {
    await adapter.linkAccount({
      userId: FIRST_USER_ID,
      providerId: "credential",
      // Better Auth's credential accounts use the user's id as the account id.
      accountId: FIRST_USER_ID,
      password: hash,
    });
  }
  // The username plugin checks the username here (rules, taken) and stores it lower-case.
  const updated = await adapter.updateUser(FIRST_USER_ID, {
    email,
    username: claim.username,
    displayUsername: claim.username,
    emailVerified: true,
    aiEnabled: true,
  });

  return {
    name: String(updated.name),
    email: String(updated.email),
    username: String(updated.username),
    displayUsername: String(updated.displayUsername),
  };
}
