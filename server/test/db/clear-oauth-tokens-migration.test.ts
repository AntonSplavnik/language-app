import { readdirSync, readFileSync } from "node:fs";
import { asc, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { authAccounts, users } from "../../src/db/schema";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";

// The migration that clears the Google tokens Better Auth stored before M12.3b (docs/design.md
// §4 Accounts, §5 auth_accounts). The test database is built from every migration before any test
// runs, so this runs the migration's statement again on rows written the old way.

const db = useTestDb();

const drizzleDir = new URL("../../drizzle/", import.meta.url);
const migrationFile = readdirSync(drizzleDir).find((name) =>
  name.endsWith("_clear-oauth-tokens.sql"),
);
const migration = migrationFile ? readFileSync(new URL(migrationFile, drizzleDir), "utf8") : "";
const runMigration = () => db.execute(sql.raw(migration));

const earlier = new Date("2026-10-26T09:00:00.000Z");

/** Every column of every sign-in method, in order. */
const allRows = () => db.select().from(authAccounts).orderBy(asc(authAccounts.id));

/** As Better Auth 1.7.7 wrote them in M12.3: user 1's password and Google, another's Google. */
async function seedOldRows() {
  const other = first(
    await db
      .insert(users)
      .values({ name: "bea", learnerLanguage: "en", targetLanguage: "de", email: "bea@gmail.com" })
      .returning({ id: users.id }),
  ).id;
  const tokens = {
    accessToken: "ya29.old",
    idToken: "eyJ.old.sig",
    accessTokenExpiresAt: earlier,
    scope: "openid,https://www.googleapis.com/auth/userinfo.email",
    createdAt: earlier,
    updatedAt: earlier,
  };
  await db.insert(authAccounts).values([
    {
      userId: LEARNER_ID,
      providerId: "credential",
      accountId: String(LEARNER_ID),
      password: "a1b2c3:d4e5f6",
      createdAt: earlier,
      updatedAt: earlier,
    },
    { userId: LEARNER_ID, providerId: "google", accountId: "google-sub-1", ...tokens },
    {
      userId: other,
      providerId: "google",
      accountId: "google-sub-bea",
      ...tokens,
      refreshToken: "1//old",
      refreshTokenExpiresAt: earlier,
    },
  ]);
  return other;
}

describe("migration: Google's tokens cleared", () => {
  it("exists, and only updates auth_accounts", () => {
    expect(migrationFile).toBeDefined();
    expect(migration).toMatch(/UPDATE\s+"auth_accounts"/);
    expect(migration).not.toMatch(/DELETE|DROP|ALTER|INSERT/i);
  });

  it("empties the token columns of every Google row, and changes nothing else", async () => {
    await seedOldRows();
    const before = await allRows();

    await runMigration();

    const after = await allRows();
    const cleared = {
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    };
    expect(after).toEqual(
      before.map((row) => (row.providerId === "credential" ? row : { ...row, ...cleared })),
    );
    // Spelled out: the password row as it was, Google's ids, scope and dates kept.
    expect(after[0]).toMatchObject({ providerId: "credential", password: "a1b2c3:d4e5f6" });
    expect(after[1]).toMatchObject({
      providerId: "google",
      accountId: "google-sub-1",
      scope: "openid,https://www.googleapis.com/auth/userinfo.email",
      updatedAt: earlier,
    });
  });

  it("can run again without changing anything", async () => {
    await seedOldRows();
    await runMigration();
    const once = await allRows();
    await runMigration();
    expect(await allRows()).toEqual(once);
  });

  it("is harmless on a database without such rows (production starts fresh)", async () => {
    await expect(runMigration()).resolves.toBeDefined();
    expect(await allRows()).toEqual([]);

    // Only a password: left alone.
    await db.insert(authAccounts).values({
      userId: LEARNER_ID,
      providerId: "credential",
      accountId: String(LEARNER_ID),
      password: "a1b2c3:d4e5f6",
    });
    const passwordOnly = await allRows();
    await runMigration();
    expect(await allRows()).toEqual(passwordOnly);
  });
});
