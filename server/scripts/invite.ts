// The invite list (docs/design.md §4 Accounts, §14): while SIGNUP_MODE=invite, only these emails can
// create an account. Emails are trimmed and lower-cased; adding one twice changes nothing.
//
//   pnpm --filter server invite:add <email>
//   pnpm --filter server invite:list
//   pnpm --filter server invite:remove <email>
//
// Works on DATABASE_URL from .env (or the environment).
import { z } from "zod";
import { addInvite, listInvites, normalizeEmail, removeInvite } from "../src/auth/invites";
import { loadEnvFile, parseConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { databaseName } from "./prompt";

const COMMANDS = ["add", "list", "remove"] as const;
const [command, email] = process.argv.slice(2);
if (!COMMANDS.includes(command as (typeof COMMANDS)[number]) || (command !== "list" && !email)) {
  console.error("Usage: invite:add <email> | invite:list | invite:remove <email>");
  process.exit(1);
}

loadEnvFile();
const config = parseConfig(process.env);
const db = createDb(config.DATABASE_URL);

const day = (date: Date) => date.toISOString().slice(0, 10);

try {
  console.log(`Database: ${databaseName(config.DATABASE_URL)}`);
  if (command === "list") {
    const invites = await listInvites(db);
    if (invites.length === 0) console.log("No invites.");
    for (const invite of invites) {
      const used = invite.usedAt
        ? `used ${day(invite.usedAt)} by user ${invite.userId ?? "(deleted)"}`
        : "not used yet";
      console.log(`${invite.email}  added ${day(invite.createdAt)}, ${used}`);
    }
  } else if (command === "add" && email) {
    if (!z.email().safeParse(normalizeEmail(email)).success) {
      throw new Error(`Not an email address: ${email}`);
    }
    const { email: added, added: isNew } = await addInvite(db, email);
    console.log(isNew ? `Invited ${added}` : `${added} was already invited; nothing changed`);
  } else if (command === "remove" && email) {
    const removed = await removeInvite(db, email);
    console.log(
      removed
        ? `Removed the invite for ${normalizeEmail(email)} (an account made from it stays)`
        : `${normalizeEmail(email)} isn't on the invite list`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
