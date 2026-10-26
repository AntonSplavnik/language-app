import { AuthSession, SignedInResponse } from "@language-app/core";
import { beforeEach, describe, expect, it } from "vitest";
import { addInvite } from "../../src/auth/invites";
import { buildTestApp } from "../helpers/app";
import { authPost, cookieOf, getWith, PASSWORD, signUp } from "../helpers/auth";
import { useTestDb } from "../helpers/db";

// Sign in by email or username, sign out (docs/design.md §9.4).

const db = useTestDb();
const app = () => buildTestApp(db, { learner: null });

beforeEach(async () => {
  await addInvite(db, "alice@example.com");
  await signUp(app(), { email: "alice@example.com", username: "Alice" });
});

const signIn = (path: "/sign-in/email" | "/sign-in/username", body: object) =>
  authPost(app(), path, body);

describe("sign-in", () => {
  it.each([
    ["by email", "/sign-in/email", { email: "alice@example.com" }],
    ["by email in another case", "/sign-in/email", { email: "ALICE@Example.COM" }],
    ["by username", "/sign-in/username", { username: "Alice" }],
    ["by username in another case", "/sign-in/username", { username: "aLiCe" }],
  ] as const)("%s", async (_, path, login) => {
    const res = await signIn(path, { ...login, password: PASSWORD });

    expect(res.statusCode).toBe(200);
    expect(SignedInResponse.parse(res.json()).user).toMatchObject({
      email: "alice@example.com",
      username: "alice",
      displayUsername: "Alice",
    });
    const stats = await getWith(app(), "/api/stats", cookieOf(res));
    expect(stats.statusCode).toBe(200);
  });

  it("a wrong password gets 401, the same answer as an unknown email", async () => {
    const wrong = await signIn("/sign-in/email", { email: "alice@example.com", password: "nope" });
    const unknown = await signIn("/sign-in/email", { email: "bob@example.com", password: "nope" });

    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toMatchObject({ code: "INVALID_EMAIL_OR_PASSWORD" });
    expect(unknown.json()).toEqual(wrong.json());
    expect(cookieOf(wrong)).toBe("");
  });

  it("a wrong password gets 401, the same answer as an unknown username", async () => {
    const wrong = await signIn("/sign-in/username", { username: "alice", password: "wrong pw" });
    const unknown = await signIn("/sign-in/username", { username: "bob", password: "wrong pw" });

    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toMatchObject({ code: "INVALID_USERNAME_OR_PASSWORD" });
    expect(unknown.json()).toEqual(wrong.json());
  });
});

describe("sign-out", () => {
  it("ends this sign-in: its cookie no longer opens the API", async () => {
    const cookie = cookieOf(
      await signIn("/sign-in/username", { username: "alice", password: PASSWORD }),
    );
    const res = await authPost(app(), "/sign-out", {}, { cookie });

    expect(res.statusCode).toBe(200);
    expect((await getWith(app(), "/api/stats", cookie)).statusCode).toBe(401);
    const session = await getWith(app(), "/api/auth/get-session", cookie);
    expect(AuthSession.parse(session.json())).toBeNull();
  });

  it("leaves the account's other sign-ins (another browser) signed in", async () => {
    const phone = cookieOf(
      await signIn("/sign-in/username", { username: "alice", password: PASSWORD }),
    );
    const mac = cookieOf(
      await signIn("/sign-in/email", { email: "alice@example.com", password: PASSWORD }),
    );
    await authPost(app(), "/sign-out", {}, { cookie: phone });

    expect((await getWith(app(), "/api/stats", mac)).statusCode).toBe(200);
  });
});
