import {
  AddToGroupResponse,
  CreateGroupResponse,
  GroupListResponse,
  GroupSummary,
  RemoveFromGroupResponse,
  SessionOptionsResponse,
  SessionResponse,
  WordListResponse,
  type WordStatus,
} from "@language-app/core";
import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { groups, groupWords, sessions, users, userWords, words } from "../../src/db/schema";
import { buildTestApp } from "../helpers/app";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";

// The learner's own groups (docs/design.md §5, §8.1, §9.1, §9.5; M13.2).

const db = useTestDb();
const app = () => buildTestApp(db);
const at = (day: number, hour = 12) => new Date(Date.UTC(2026, 9, day, hour));

/** A word in a learner's list. Returns its user_words id. */
async function seedWord(
  lemma: string,
  {
    status = "learning",
    userId = LEARNER_ID,
    translation = `${lemma.toLowerCase()}-en`,
    addedAt,
  }: { status?: WordStatus; userId?: number; translation?: string; addedAt?: Date } = {},
) {
  const word = first(
    await db
      .insert(words)
      .values({ language: "de", lemma, pos: "noun", article: "der", checkStatus: "match" })
      .returning({ id: words.id }),
  );
  await db.execute(
    sql`INSERT INTO word_translations (word_id, language, translation) VALUES (${word.id}, 'en', ${translation})`,
  );
  return first(
    await db
      .insert(userWords)
      .values({ userId, wordId: word.id, status, addedAt })
      .returning({ id: userWords.id }),
  ).id;
}

/** A group made directly in the database, with these words, made at `createdAt`. */
async function seedGroup(
  name: string,
  userWordIds: number[] = [],
  { userId = LEARNER_ID, createdAt }: { userId?: number; createdAt?: Date } = {},
) {
  const group = first(
    await db.insert(groups).values({ userId, name, createdAt }).returning({ id: groups.id }),
  );
  if (userWordIds.length > 0) {
    await db
      .insert(groupWords)
      .values(userWordIds.map((userWordId) => ({ groupId: group.id, userWordId })));
  }
  return group.id;
}

async function otherLearner() {
  return first(
    await db
      .insert(users)
      .values({ name: "Other", learnerLanguage: "en", targetLanguage: "de" })
      .returning({ id: users.id }),
  ).id;
}

const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
  app().inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }) });

async function listGroups() {
  const res = await call("GET", "/api/groups");
  expect(res.statusCode).toBe(200);
  return GroupListResponse.parse(res.json()).groups;
}

/** The user_words ids in the group, sorted. */
const membersOf = async (groupId: number) =>
  (
    await db
      .select({ id: groupWords.userWordId })
      .from(groupWords)
      .where(eq(groupWords.groupId, groupId))
  )
    .map((row) => row.id)
    .sort((a, b) => a - b);

const errorCode = (res: { json: () => unknown }) =>
  (res.json() as { error: { code: string } }).error.code;

describe("POST /api/groups (§9.5)", () => {
  it("makes an empty group, its name trimmed", async () => {
    const res = await call("POST", "/api/groups", { name: "  Hard ones " });

    expect(res.statusCode).toBe(201);
    const { group, added } = CreateGroupResponse.parse(res.json());
    expect(added).toBe(0);
    expect(group).toMatchObject({ name: "Hard ones", words: 0, practisable: 0 });
    expect(await listGroups()).toEqual([group]);
  });

  it("makes a group with the selected words in it, counting them", async () => {
    const tisch = await seedWord("Tisch");
    const stuhl = await seedWord("Stuhl", { status: "learned" });
    const bett = await seedWord("Bett", { status: "ignored" });
    await seedWord("Lampe");

    const res = await call("POST", "/api/groups", {
      name: "Hard ones",
      userWordIds: [bett, tisch, stuhl],
    });

    expect(res.statusCode).toBe(201);
    const { group, added } = CreateGroupResponse.parse(res.json());
    expect(added).toBe(3);
    expect(group).toMatchObject({ words: 3, practisable: 2 });
    expect(await membersOf(group.id)).toEqual([tisch, stuhl, bett].sort((a, b) => a - b));
  });

  it("a name the learner already has, ignoring case, is 409; another learner's is free", async () => {
    await seedGroup("Hard ones");
    const other = await otherLearner();
    await seedGroup("Lesson 4", [], { userId: other });

    for (const name of ["Hard ones", "hard ONES", " Hard ones "]) {
      const res = await call("POST", "/api/groups", { name });
      expect(res.statusCode, name).toBe(409);
      expect(errorCode(res)).toBe("group_exists");
    }
    expect((await call("POST", "/api/groups", { name: "Lesson 4" })).statusCode).toBe(201);
    expect((await listGroups()).map((group) => group.name)).toEqual(["Lesson 4", "Hard ones"]);
  });

  it("refuses a bad name or word list with 400, making nothing", async () => {
    const tisch = await seedWord("Tisch");
    for (const payload of [
      {},
      { name: "" },
      { name: "   " },
      { name: "x".repeat(41) },
      { name: "A", userWordIds: [] },
      { name: "A", userWordIds: [tisch, tisch] },
      { name: "A", userWordIds: [0] },
      { name: "A", userWordIds: Array.from({ length: 5001 }, (_, i) => i + 1) },
    ]) {
      const res = await call("POST", "/api/groups", payload);
      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe("invalid_request");
    }
    expect(await db.select().from(groups)).toEqual([]);
  });

  it("a word that isn't the learner's is 404, and nothing is made", async () => {
    const tisch = await seedWord("Tisch");
    const other = await otherLearner();
    const theirs = await seedWord("Sofa", { userId: other });

    for (const userWordIds of [
      [tisch, theirs],
      [tisch, 999],
    ]) {
      const res = await call("POST", "/api/groups", { name: "Hard ones", userWordIds });
      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe("word_not_found");
    }
    expect(await db.select().from(groups)).toEqual([]);
    expect(await db.select().from(groupWords)).toEqual([]);
  });
});

describe("GET /api/groups (§9.5)", () => {
  it("lists every group of the learner's, newest first, with its words and those to practise", async () => {
    const tisch = await seedWord("Tisch");
    const stuhl = await seedWord("Stuhl", { status: "learned" });
    const bett = await seedWord("Bett", { status: "ignored" });
    const older = await seedGroup("Lesson 4", [tisch, stuhl, bett], { createdAt: at(10) });
    const sameTimeA = await seedGroup("Empty", [], { createdAt: at(12) });
    const sameTimeB = await seedGroup("Ignored", [bett], { createdAt: at(12) });
    const other = await otherLearner();
    await seedGroup("Theirs", [await seedWord("Sofa", { userId: other })], { userId: other });

    expect(await listGroups()).toEqual([
      // Made at the same moment: the newer row first.
      { id: sameTimeB, name: "Ignored", words: 1, practisable: 0, createdAt: at(12).toISOString() },
      { id: sameTimeA, name: "Empty", words: 0, practisable: 0, createdAt: at(12).toISOString() },
      { id: older, name: "Lesson 4", words: 3, practisable: 2, createdAt: at(10).toISOString() },
    ]);
  });

  it("is empty without groups", async () => {
    expect(await listGroups()).toEqual([]);
  });
});

describe("PATCH /api/groups/:id (§9.5)", () => {
  it("renames the group, trimmed, and answers with it", async () => {
    const tisch = await seedWord("Tisch");
    const id = await seedGroup("Hard ones", [tisch]);

    const res = await call("PATCH", `/api/groups/${id}`, { name: " Harder ones " });

    expect(res.statusCode).toBe(200);
    expect(GroupSummary.parse(res.json())).toMatchObject({
      id,
      name: "Harder ones",
      words: 1,
      practisable: 1,
    });
  });

  it("a name another group has, ignoring case, is 409; a change of case of its own is allowed", async () => {
    const id = await seedGroup("Hard ones");
    await seedGroup("Lesson 4");

    const taken = await call("PATCH", `/api/groups/${id}`, { name: "LESSON 4" });
    expect(taken.statusCode).toBe(409);
    expect(errorCode(taken)).toBe("group_exists");

    for (const name of ["hard Ones", "Hard ones"]) {
      const res = await call("PATCH", `/api/groups/${id}`, { name });
      expect(res.statusCode, name).toBe(200);
      expect(GroupSummary.parse(res.json()).name).toBe(name);
    }
  });

  it("refuses a bad name with 400 and leaves the group as it was", async () => {
    const id = await seedGroup("Hard ones");
    for (const payload of [{}, { name: "" }, { name: "x".repeat(41) }, { name: null }]) {
      const res = await call("PATCH", `/api/groups/${id}`, payload);
      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe("invalid_request");
    }
    expect((await listGroups())[0]?.name).toBe("Hard ones");
  });
});

describe("DELETE /api/groups/:id (§9.5)", () => {
  it("deletes the group; its words stay in the list, and its sessions forget it", async () => {
    const tisch = await seedWord("Tisch");
    const id = await seedGroup("Hard ones", [tisch]);
    const keep = await seedGroup("Lesson 4", [tisch]);
    const started = await call("POST", "/api/sessions", { source: "group", groupId: id });
    expect(started.statusCode).toBe(200);
    const sessionId = SessionResponse.parse(started.json()).id;

    const res = await call("DELETE", `/api/groups/${id}`);

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    expect((await listGroups()).map((group) => group.id)).toEqual([keep]);
    expect(await db.select().from(userWords).where(eq(userWords.id, tisch))).toHaveLength(1);
    expect(await membersOf(keep)).toEqual([tisch]);
    // The session and its answers stay, without the group.
    expect(first(await db.select().from(sessions).where(eq(sessions.id, sessionId)))).toMatchObject(
      { source: "group", groupId: null },
    );
  });
});

describe("POST /api/groups/:id/words (§9.5)", () => {
  it("adds the words, skipping and not counting those already in it", async () => {
    const tisch = await seedWord("Tisch");
    const stuhl = await seedWord("Stuhl");
    const bett = await seedWord("Bett", { status: "ignored" });
    const id = await seedGroup("Hard ones", [tisch]);

    const res = await call("POST", `/api/groups/${id}/words`, {
      userWordIds: [tisch, stuhl, bett],
    });

    expect(res.statusCode).toBe(200);
    expect(AddToGroupResponse.parse(res.json())).toEqual({ added: 2 });
    expect(await membersOf(id)).toEqual([tisch, stuhl, bett].sort((a, b) => a - b));
    const again = await call("POST", `/api/groups/${id}/words`, { userWordIds: [stuhl] });
    expect(again.json()).toEqual({ added: 0 });
  });

  it("a word that isn't the learner's is 404, and nothing changes", async () => {
    const tisch = await seedWord("Tisch");
    const stuhl = await seedWord("Stuhl");
    const other = await otherLearner();
    const theirs = await seedWord("Sofa", { userId: other });
    const id = await seedGroup("Hard ones", [tisch]);

    for (const userWordIds of [
      [stuhl, theirs],
      [stuhl, 999],
    ]) {
      const res = await call("POST", `/api/groups/${id}/words`, { userWordIds });
      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe("word_not_found");
    }
    expect(await membersOf(id)).toEqual([tisch]);
  });

  it("refuses an empty, repeated or missing list with 400", async () => {
    const tisch = await seedWord("Tisch");
    const id = await seedGroup("Hard ones");
    for (const payload of [{}, { userWordIds: [] }, { userWordIds: [tisch, tisch] }]) {
      const res = await call("POST", `/api/groups/${id}/words`, payload);
      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe("invalid_request");
    }
  });
});

describe("DELETE /api/groups/:id/words (§9.5)", () => {
  it("removes the words, skipping and not counting those not in it; they stay in the list", async () => {
    const tisch = await seedWord("Tisch");
    const stuhl = await seedWord("Stuhl");
    const bett = await seedWord("Bett");
    const id = await seedGroup("Hard ones", [tisch, stuhl]);
    const other = await seedGroup("Lesson 4", [tisch]);

    const res = await call("DELETE", `/api/groups/${id}/words`, { userWordIds: [tisch, bett] });

    expect(res.statusCode).toBe(200);
    expect(RemoveFromGroupResponse.parse(res.json())).toEqual({ removed: 1 });
    expect(await membersOf(id)).toEqual([stuhl]);
    expect(await membersOf(other)).toEqual([tisch]);
    expect(await db.select().from(userWords)).toHaveLength(3);
  });

  it("a word that isn't the learner's is 404, and nothing changes; a body is needed", async () => {
    const tisch = await seedWord("Tisch");
    const theirs = await seedWord("Sofa", { userId: await otherLearner() });
    const id = await seedGroup("Hard ones", [tisch]);

    const res = await call("DELETE", `/api/groups/${id}/words`, { userWordIds: [tisch, theirs] });
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe("word_not_found");
    expect(await membersOf(id)).toEqual([tisch]);

    const empty = await call("DELETE", `/api/groups/${id}/words`);
    expect(empty.statusCode).toBe(400);
    expect(await membersOf(id)).toEqual([tisch]);
  });
});

describe("another learner's group (§9.5)", () => {
  it("is 404 group_not_found for every route, and stays as it was", async () => {
    const other = await otherLearner();
    const sofa = await seedWord("Sofa", { userId: other });
    const theirs = await seedGroup("Theirs", [sofa], { userId: other });
    const tisch = await seedWord("Tisch");

    for (const id of [theirs, 999]) {
      for (const res of [
        await call("PATCH", `/api/groups/${id}`, { name: "Mine" }),
        await call("DELETE", `/api/groups/${id}`),
        await call("POST", `/api/groups/${id}/words`, { userWordIds: [tisch] }),
        await call("DELETE", `/api/groups/${id}/words`, { userWordIds: [tisch] }),
        await call("POST", "/api/sessions", { source: "group", groupId: id }),
      ]) {
        expect(res.statusCode).toBe(404);
        expect(errorCode(res)).toBe("group_not_found");
      }
    }
    expect(first(await db.select().from(groups).where(eq(groups.id, theirs))).name).toBe("Theirs");
    expect(await membersOf(theirs)).toEqual([sofa]);
    expect(await listGroups()).toEqual([]);
  });

  it("a malformed id is 400", async () => {
    for (const url of ["/api/groups/abc", "/api/groups/0"]) {
      const res = await call("PATCH", url, { name: "Mine" });
      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe("invalid_request");
    }
  });
});

describe("a group's words in the list (§9.1)", () => {
  async function list(query: string) {
    const res = await call("GET", `/api/words${query}`);
    expect(res.statusCode).toBe(200);
    return WordListResponse.parse(res.json());
  }
  const lemmas = (body: WordListResponse) => body.words.map((word) => word.lemma);

  it("keeps only the group's words, in any status, and counts only those", async () => {
    const tisch = await seedWord("Tisch");
    const stuhl = await seedWord("Stuhl", { status: "learned" });
    const bett = await seedWord("Bett", { status: "ignored" });
    await seedWord("Lampe");
    const id = await seedGroup("Hard ones", [tisch, stuhl, bett]);

    const all = await list(`?groupId=${id}`);
    expect(lemmas(all)).toEqual(["Bett", "Stuhl", "Tisch"]);
    expect(all.counts).toEqual({ learning: 1, learned: 1, ignored: 1 });
    const learned = await list(`?status=learned&groupId=${id}`);
    expect(lemmas(learned)).toEqual(["Stuhl"]);
    expect(learned.counts).toEqual({ learning: 1, learned: 1, ignored: 1 });
  });

  it("combines with the search and both orders", async () => {
    const tisch = await seedWord("Tisch", { addedAt: at(11) });
    const schreibtisch = await seedWord("Schreibtisch", { addedAt: at(13) });
    const nachttisch = await seedWord("Nachttisch", { addedAt: at(12), status: "ignored" });
    const stuhl = await seedWord("Stuhl", { addedAt: at(14) });
    await seedWord("Esstisch", { addedAt: at(15) });
    const id = await seedGroup("Furniture", [tisch, schreibtisch, nachttisch, stuhl]);

    const found = await list(`?status=learning&q=tisch&groupId=${id}`);
    expect(lemmas(found)).toEqual(["Schreibtisch", "Tisch"]);
    expect(found.counts).toEqual({ learning: 2, learned: 0, ignored: 1 });
    expect(lemmas(await list(`?groupId=${id}&sort=newest`))).toEqual([
      "Stuhl",
      "Schreibtisch",
      "Nachttisch",
      "Tisch",
    ]);
    expect(lemmas(await list(`?groupId=${id}&sort=az&q=tisch`))).toEqual([
      "Nachttisch",
      "Schreibtisch",
      "Tisch",
    ]);
  });

  it("a group that isn't the learner's, or no longer exists, matches nothing", async () => {
    const other = await otherLearner();
    const theirs = await seedGroup("Theirs", [await seedWord("Sofa", { userId: other })], {
      userId: other,
    });
    await seedWord("Tisch");
    const gone = await seedGroup("Gone", [await seedWord("Stuhl")]);
    await call("DELETE", `/api/groups/${gone}`);

    for (const id of [theirs, gone, 999]) {
      const body = await list(`?groupId=${id}`);
      expect(body.words).toEqual([]);
      expect(body.counts).toEqual({ learning: 0, learned: 0, ignored: 0 });
    }
  });

  it("deleting a word from the list takes it out of its groups", async () => {
    const tisch = await seedWord("Tisch");
    const stuhl = await seedWord("Stuhl");
    const id = await seedGroup("Hard ones", [tisch, stuhl]);

    expect((await call("DELETE", `/api/words/${tisch}`)).statusCode).toBe(200);

    expect(await membersOf(id)).toEqual([stuhl]);
    expect((await listGroups())[0]).toMatchObject({ words: 1, practisable: 1 });
  });
});

describe("group sessions (§8.1)", () => {
  async function options() {
    const res = await call("GET", "/api/sessions/options");
    expect(res.statusCode).toBe(200);
    return SessionOptionsResponse.parse(res.json()).options;
  }
  async function session(groupId: number) {
    const res = await call("POST", "/api/sessions", { source: "group", groupId });
    expect(res.statusCode).toBe(200);
    return SessionResponse.parse(res.json());
  }
  const lemmas = (s: SessionResponse) => s.cards.map((card) => card.lemma);

  it("options list the group second and count the newest group with words to practise", async () => {
    const tisch = await seedWord("Tisch");
    const stuhl = await seedWord("Stuhl", { status: "learned" });
    const bett = await seedWord("Bett", { status: "ignored" });
    await seedGroup("Older", [tisch, stuhl], { createdAt: at(10) });
    await seedGroup("Ignored only", [bett], { createdAt: at(11) });
    await seedGroup("Empty", [], { createdAt: at(12) });
    await seedGroup("Newest", [tisch], { createdAt: at(9) });

    const listed = await options();
    expect(listed.map((option) => option.source)).toEqual([
      "import",
      "group",
      "theme",
      "last_7_days",
      "not_learned",
    ]);
    // "Older" is the newest group with words to practise: the empty and the ignored are skipped.
    expect(listed.find((option) => option.source === "group")?.count).toBe(2);
  });

  it("options count 0 without a group to practise", async () => {
    await seedGroup("Empty");
    expect((await options()).find((option) => option.source === "group")?.count).toBe(0);
  });

  it("takes the group's learning and learned words, never ignored ones, and records the group", async () => {
    const tisch = await seedWord("Tisch");
    const stuhl = await seedWord("Stuhl", { status: "learned" });
    const bett = await seedWord("Bett", { status: "ignored" });
    await seedWord("Lampe");
    const id = await seedGroup("Hard ones", [tisch, stuhl, bett]);

    const started = await session(id);

    expect(started.source).toBe("group");
    expect(lemmas(started).sort()).toEqual(["Stuhl", "Tisch"]);
    expect(
      first(await db.select().from(sessions).where(eq(sessions.id, started.id))),
    ).toMatchObject({ source: "group", groupId: id, importId: null, theme: null });
  });

  it("takes at most 20, a different shuffle each session", async () => {
    const ids: number[] = [];
    for (let i = 0; i < 25; i++) ids.push(await seedWord(`Wort${i}`));
    await seedWord("Draußen");
    const id = await seedGroup("Big", ids);

    const orders: string[] = [];
    for (let i = 0; i < 5; i++) {
      const cards = lemmas(await session(id));
      expect(cards).toHaveLength(20);
      expect(new Set(cards).size).toBe(20);
      expect(cards.every((lemma) => lemma.startsWith("Wort"))).toBe(true);
      orders.push(cards.join());
    }
    // Five equal draws of 20 out of 25 would be next to impossible.
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it("group needs a groupId, and no other source takes one", async () => {
    const id = await seedGroup("Hard ones", [await seedWord("Tisch")]);
    for (const payload of [
      { source: "group" },
      { source: "group", groupId: "abc" },
      { source: "group", groupId: id, theme: "home" },
      { source: "not_learned", groupId: id },
      { source: "theme", theme: "home", groupId: id },
    ]) {
      const res = await call("POST", "/api/sessions", payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(errorCode(res)).toBe("invalid_request");
    }
    expect(await db.select().from(sessions)).toEqual([]);
  });

  it("no_words for a group without learning or learned words", async () => {
    const empty = await seedGroup("Empty");
    const ignored = await seedGroup("Ignored", [await seedWord("Bett", { status: "ignored" })]);
    for (const groupId of [empty, ignored]) {
      const res = await call("POST", "/api/sessions", { source: "group", groupId });
      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe("no_words");
    }
    expect(await db.select().from(sessions)).toEqual([]);
  });
});

describe("the groups migration (0010_groups)", () => {
  it("names are unique per account ignoring case, not across accounts", async () => {
    await seedGroup("Hard ones");
    await expect(seedGroup("HARD ONES")).rejects.toThrow();
    const other = await otherLearner();
    await seedGroup("hard ones", [], { userId: other });
    expect(await db.select().from(groups)).toHaveLength(2);
  });

  it("a word is in a group once; deleting the group or the word takes its rows", async () => {
    const tisch = await seedWord("Tisch");
    const stuhl = await seedWord("Stuhl");
    const id = await seedGroup("Hard ones", [tisch, stuhl]);
    const other = await seedGroup("Lesson 4", [tisch]);
    await expect(
      db.insert(groupWords).values({ groupId: id, userWordId: tisch }),
    ).rejects.toThrow();

    await db.delete(userWords).where(eq(userWords.id, stuhl));
    expect(await membersOf(id)).toEqual([tisch]);
    await db.delete(groups).where(eq(groups.id, id));
    expect(await db.select().from(groupWords)).toEqual([
      expect.objectContaining({ groupId: other, userWordId: tisch }),
    ]);
    expect(
      await db
        .select()
        .from(groupWords)
        .where(and(eq(groupWords.groupId, id), eq(groupWords.userWordId, tisch))),
    ).toEqual([]);
  });
});
