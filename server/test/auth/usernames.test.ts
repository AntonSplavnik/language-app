import { Username } from "@language-app/core";
import { describe, expect, it } from "vitest";
import { uniqueUsername, usernameBase, usernameCandidates } from "../../src/auth/usernames";
import { users } from "../../src/db/schema";
import { useTestDb } from "../helpers/db";

// The username of an account made with Google (docs/design.md §4 Accounts): the part of the email
// before `@`, cleaned to the username rules and made unique with a number.

const db = useTestDb();
/** The first names `usernameCandidates` tries. */
function first(base: string, count: number): string[] {
  const names: string[] = [];
  for (const name of usernameCandidates(base)) {
    names.push(name);
    if (names.length === count) break;
  }
  return names;
}

describe("the part of the email it is made from", () => {
  it.each([
    ["anna.schmidt@gmail.com", "anna.schmidt"],
    ["Anna.Schmidt@GMAIL.com", "anna.schmidt"],
    // A tag after + is no part of the name.
    ["anna+books@gmail.com", "anna"],
    ["anna_s.1990@example.com", "anna_s.1990"],
    // Letters with accents lose them; ß is written out.
    ["jörg.müller@example.de", "jorg.muller"],
    ["groß@example.de", "gross"],
    // Anything else becomes _ (once per run), and none is left at either end.
    ["anna-lena@example.de", "anna_lena"],
    ["o'brien--x@example.com", "o_brien_x"],
    ["-anna-@example.com", "anna"],
    ["._anna_.@example.com", "anna"],
    // Nothing usable left: a plain "user".
    ["+books@example.com", "user"],
    ["---@example.com", "user"],
  ])("%s → %s", (email, base) => {
    expect(usernameBase(email)).toBe(base);
  });

  it("is cut to 30 characters", () => {
    expect(usernameBase(`${"a".repeat(40)}@example.com`)).toBe("a".repeat(30));
  });
});

describe("the names tried, in order", () => {
  it("the base, then with 2, 3, …", () => {
    expect(first("anna", 4)).toEqual(["anna", "anna2", "anna3", "anna4"]);
  });

  it("a base shorter than 3 characters gets a number at once", () => {
    expect(first("jo", 2)).toEqual(["jo2", "jo3"]);
    expect(first("j", 2)).toEqual(["j10", "j11"]);
  });

  it("the number fits within 30 characters", () => {
    const long = "a".repeat(30);
    expect(first(long, 2)).toEqual([long, `${"a".repeat(29)}2`]);
  });

  it("every name follows the username rules", () => {
    for (const base of ["anna", "jo", "j", "a".repeat(30), "user"]) {
      for (const name of first(base, 120)) {
        expect(Username.safeParse(name).success, name).toBe(true);
        expect(name).toBe(name.toLowerCase());
      }
    }
  });
});

describe("uniqueUsername", () => {
  async function taken(...names: string[]) {
    for (const name of names) {
      await db.insert(users).values({
        name,
        learnerLanguage: "en",
        targetLanguage: "de",
        email: `${name}@taken.example`,
        username: name,
        displayUsername: name,
      });
    }
  }

  it("is the base when nobody has it", async () => {
    expect(await uniqueUsername(db, "anna@gmail.com")).toBe("anna");
  });

  it("adds the first number nobody has", async () => {
    await taken("anna", "anna2");
    expect(await uniqueUsername(db, "Anna@gmail.com")).toBe("anna3");
  });
});
