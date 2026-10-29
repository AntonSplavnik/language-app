import { describe, expect, it } from "vitest";
import {
  CreateGroupRequest,
  CreateSessionRequest,
  createApiClient,
  GROUP_NAME_MAX,
  GROUP_WORDS_MAX,
  GroupListResponse,
  GroupWordsRequest,
  RenameGroupRequest,
  WordListQuery,
} from "../src";

// The learner's own groups (docs/design.md §9.5, M13.2).

const group = {
  id: 7,
  name: "Hard ones",
  words: 8,
  practisable: 6,
  createdAt: "2026-10-29T09:00:00.000Z",
};

describe("group schemas", () => {
  it("trims a name and takes 1–40 characters", () => {
    expect(CreateGroupRequest.parse({ name: "  Hard ones " })).toEqual({ name: "Hard ones" });
    expect(RenameGroupRequest.parse({ name: " Lesson 4" })).toEqual({ name: "Lesson 4" });
    expect(GROUP_NAME_MAX).toBe(40);
    expect(CreateGroupRequest.safeParse({ name: "x".repeat(40) }).success).toBe(true);
    // Counted after trimming.
    expect(CreateGroupRequest.safeParse({ name: ` ${"x".repeat(40)} ` }).success).toBe(true);
    for (const name of ["", "   ", "x".repeat(41), null, 5]) {
      expect(CreateGroupRequest.safeParse({ name }).success, String(name)).toBe(false);
      expect(RenameGroupRequest.safeParse({ name }).success, String(name)).toBe(false);
    }
  });

  it("takes 1–5,000 distinct word ids, made with or without them", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
    expect(GROUP_WORDS_MAX).toBe(5000);
    expect(CreateGroupRequest.parse({ name: "A", userWordIds: [3, 1] }).userWordIds).toEqual([
      3, 1,
    ]);
    expect(GroupWordsRequest.safeParse({ userWordIds: ids(5000) }).success).toBe(true);
    for (const userWordIds of [[], ids(5001), [1, 2, 1], [0], [-3], [1.5], ["4"], undefined]) {
      const body = JSON.stringify(userWordIds);
      expect(GroupWordsRequest.safeParse({ userWordIds }).success, body).toBe(false);
    }
    expect(CreateGroupRequest.safeParse({ name: "A", userWordIds: [] }).success).toBe(false);
    expect(CreateGroupRequest.safeParse({ name: "A", userWordIds: [2, 2] }).success).toBe(false);
  });

  it("lists groups with their counts; an empty group has 0", () => {
    const empty = { ...group, id: 8, words: 0, practisable: 0 };
    expect(GroupListResponse.parse({ groups: [group, empty] }).groups).toHaveLength(2);
    expect(GroupListResponse.safeParse({ groups: [{ ...group, words: undefined }] }).success).toBe(
      false,
    );
  });

  it("filters the word list by a group id from the query string", () => {
    expect(WordListQuery.parse({ groupId: "7", sort: "newest" })).toEqual({
      groupId: 7,
      sort: "newest",
    });
    for (const groupId of ["abc", "0", "-1", "1.5"]) {
      expect(WordListQuery.safeParse({ groupId }).success, groupId).toBe(false);
    }
  });

  it("needs a groupId for the group source, and no other source takes one", () => {
    expect(CreateSessionRequest.safeParse({ source: "group", groupId: 7 }).success).toBe(true);
    for (const body of [
      { source: "group" },
      { source: "group", groupId: 0 },
      { source: "group", groupId: "7" },
      { source: "group", groupId: 7, importId: 5 },
      { source: "group", groupId: 7, theme: "home" },
      { source: "import", importId: 5, groupId: 7 },
      { source: "theme", theme: "home", groupId: 7 },
      { source: "not_learned", groupId: 7 },
    ]) {
      expect(CreateSessionRequest.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });
});

describe("group endpoints", () => {
  /** A fetch that records each request and answers as the server would. */
  function recording() {
    const calls: Array<{ method: string; url: string; init: RequestInit | undefined }> = [];
    const answers: Record<string, { status: number; body?: unknown }> = {
      "GET /api/groups": { status: 200, body: { groups: [group] } },
      "POST /api/groups": { status: 201, body: { group: { ...group, words: 2 }, added: 2 } },
      "PATCH /api/groups/7": { status: 200, body: { ...group, name: "Harder ones" } },
      "DELETE /api/groups/7": { status: 204 },
      "POST /api/groups/7/words": { status: 200, body: { added: 1 } },
      "DELETE /api/groups/7/words": { status: 200, body: { removed: 2 } },
    };
    const api = createApiClient({
      fetch: async (input, init) => {
        const method = init?.method ?? "GET";
        calls.push({ method, url: String(input), init });
        const answer = answers[`${method} ${String(input)}`];
        if (!answer) return new Response(null, { status: 404 });
        return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
          status: answer.status,
        });
      },
    });
    return { calls, api };
  }

  const bodyOf = (init: RequestInit | undefined) => JSON.parse(String(init?.body));
  const typeOf = (init: RequestInit | undefined) => new Headers(init?.headers).get("content-type");

  it("list, create, rename and delete use the right methods, paths and bodies", async () => {
    const { calls, api } = recording();
    expect(await api.listGroups()).toEqual({ groups: [group] });
    expect(await api.createGroup({ name: "Hard ones", userWordIds: [4, 5] })).toEqual({
      group: { ...group, words: 2 },
      added: 2,
    });
    expect((await api.renameGroup(7, "Harder ones")).name).toBe("Harder ones");
    // 204: no body to read.
    expect(await api.deleteGroup(7)).toBeUndefined();

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /api/groups",
      "POST /api/groups",
      "PATCH /api/groups/7",
      "DELETE /api/groups/7",
    ]);
    expect(bodyOf(calls[1]?.init)).toEqual({ name: "Hard ones", userWordIds: [4, 5] });
    expect(bodyOf(calls[2]?.init)).toEqual({ name: "Harder ones" });
    // A DELETE without a body must not claim to send JSON (Fastify rejects an empty JSON body).
    expect(calls[3]?.init?.body).toBeUndefined();
    expect(typeOf(calls[3]?.init)).toBeNull();
  });

  it("adds words with a POST and removes them with a DELETE that carries JSON", async () => {
    const { calls, api } = recording();
    expect(await api.addToGroup(7, [4])).toEqual({ added: 1 });
    expect(await api.removeFromGroup(7, [4, 5])).toEqual({ removed: 2 });

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/groups/7/words",
      "DELETE /api/groups/7/words",
    ]);
    expect(bodyOf(calls[0]?.init)).toEqual({ userWordIds: [4] });
    expect(bodyOf(calls[1]?.init)).toEqual({ userWordIds: [4, 5] });
    expect(typeOf(calls[1]?.init)).toBe("application/json");
  });

  it("turns a taken name into its error code", async () => {
    const api = createApiClient({
      fetch: async () =>
        new Response(
          JSON.stringify({ error: { code: "group_exists", message: "Group already exists" } }),
          { status: 409 },
        ),
    });
    await expect(api.createGroup({ name: "hard ones" })).rejects.toMatchObject({
      code: "group_exists",
      status: 409,
    });
  });

  it("listWords sends the group, and createSession the group to practise", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const api = createApiClient({
      fetch: async (input, init) => {
        calls.push({ url: String(input), body: init?.body ? bodyOf(init) : null });
        const body = String(input).startsWith("/api/words")
          ? { words: [], counts: { learning: 0, learned: 0, ignored: 0 } }
          : { id: 9, source: "group", cards: [] };
        return new Response(JSON.stringify(body));
      },
    });
    await api.listWords({ status: "learned", q: "tisch", groupId: 7, sort: "newest" });
    expect((await api.createSession({ source: "group", groupId: 7 })).source).toBe("group");
    expect(calls).toEqual([
      { url: "/api/words?status=learned&q=tisch&groupId=7&sort=newest", body: null },
      { url: "/api/sessions", body: { source: "group", groupId: 7 } },
    ]);
  });
});
