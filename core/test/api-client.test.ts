import { describe, expect, it } from "vitest";
import { ApiClientError, createApiClient } from "../src";

const json = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const stats = {
  learning: 3,
  learned: 1,
  detailsPending: 2,
  unfinishedImports: [
    {
      id: 7,
      name: "Lesson 4",
      status: "reviewing",
      photoCount: 2,
      createdAt: "2026-10-11T09:00:00.000Z",
    },
  ],
};

describe("createApiClient", () => {
  it("calls the right URL and returns the validated body", async () => {
    let calledWith = "";
    const api = createApiClient({
      baseUrl: "http://mac.local:5173",
      fetch: async (input) => {
        calledWith = String(input);
        return json(200, stats)();
      },
    });

    expect(await api.stats()).toEqual(stats);
    expect(calledWith).toBe("http://mac.local:5173/api/stats");
  });

  it("rejects a response that does not match the schema", async () => {
    const api = createApiClient({ fetch: json(200, { learning: "three" }) });
    await expect(api.stats()).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("turns an API error body into an ApiClientError with its code and message", async () => {
    const api = createApiClient({
      fetch: json(429, { error: { code: "daily_limit", message: "Daily photo limit reached" } }),
    });
    const error = await api.stats().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: "daily_limit",
      message: "Daily photo limit reached",
      status: 429,
    });
  });

  it("uses a generic error when the error body is not JSON", async () => {
    const api = createApiClient({
      fetch: async () => new Response("Bad Gateway", { status: 502 }),
    });
    await expect(api.stats()).rejects.toMatchObject({ code: "http_error", status: 502 });
  });

  it("reports network failures as code network", async () => {
    const api = createApiClient({
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await expect(api.stats()).rejects.toMatchObject({ code: "network", status: null });
  });
});

describe("import endpoints", () => {
  const importView = {
    id: 3,
    name: "Lesson 4",
    status: "collecting",
    photoCount: 0,
    candidates: [],
    createdAt: "2026-10-11T09:00:00.000Z",
    completedAt: null,
  };

  /** A fetch that records each request and answers with the given body. */
  function recording(body: unknown) {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetch = async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(body), { status: 200 });
    };
    return { calls, api: createApiClient({ fetch }) };
  }

  it("createImport posts the name as JSON", async () => {
    const { calls, api } = recording(importView);
    expect(await api.createImport({ name: "Lesson 4" })).toEqual(importView);
    expect(calls[0]?.url).toBe("/api/imports");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ name: "Lesson 4" });
    expect(new Headers(calls[0]?.init?.headers).get("content-type")).toBe("application/json");
  });

  it("uploadPhoto sends one JPEG as multipart form data", async () => {
    const { calls, api } = recording({ pageQuality: "ok", wordsFound: 0, import: importView });
    const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });

    await api.uploadPhoto(3, photo);

    expect(calls[0]?.url).toBe("/api/imports/3/photos");
    const body = calls[0]?.init?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("photo")).toBeInstanceOf(Blob);
  });

  it("getImport, startReview and saveImport use the right paths", async () => {
    const view = recording(importView);
    await view.api.getImport(3);
    await view.api.startReview(3);
    expect(view.calls.map((c) => `${c.init?.method ?? "GET"} ${c.url}`)).toEqual([
      "GET /api/imports/3",
      "POST /api/imports/3/review",
    ]);

    const save = recording({ added: 1, skipped: 1, detailsPending: 1 });
    const decisions = [
      { key: "Tisch|noun|die", action: "add" as const, article: "der" as const },
      { key: "und|conjunction|", action: "skip" as const },
    ];
    expect(await save.api.saveImport(3, decisions)).toEqual({
      added: 1,
      skipped: 1,
      detailsPending: 1,
    });
    expect(save.calls[0]?.url).toBe("/api/imports/3/save");
    expect(JSON.parse(String(save.calls[0]?.init?.body))).toEqual({ decisions });
  });
});

describe("session endpoints", () => {
  it("use the right paths and bodies", async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const answers: Record<string, unknown> = {
      "GET /api/sessions/options": { options: [{ source: "not_learned", count: 3 }] },
      "POST /api/sessions": { id: 9, source: "not_learned", cards: [] },
      "POST /api/sessions/9/results": { recorded: true },
      "POST /api/sessions/9/finish": { knew: 1, didntKnow: 0, skipped: 0, missed: [] },
    };
    const api = createApiClient({
      fetch: async (input, init) => {
        const method = init?.method ?? "GET";
        calls.push({
          url: String(input),
          method,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return new Response(JSON.stringify(answers[`${method} ${String(input)}`]), { status: 200 });
      },
    });

    await api.sessionOptions();
    await api.createSession({ source: "not_learned" });
    const result = {
      userWordId: 4,
      result: "knew" as const,
      flipped: true,
      flipMs: 900,
      answerMs: 2100,
    };
    expect(await api.recordResult(9, result)).toEqual({ recorded: true });
    expect((await api.finishSession(9)).knew).toBe(1);

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(Object.keys(answers));
    expect(calls[1]?.body).toEqual({ source: "not_learned" });
    expect(calls[2]?.body).toEqual(result);
  });
});

describe("word endpoints", () => {
  const tisch = {
    userWordId: 4,
    lemma: "Tisch",
    pos: "noun",
    article: "der",
    plural: "Tische",
    forms: null,
    translation: "table",
    customTranslation: "desk",
    exampleDe: null,
    exampleTranslation: null,
    note: null,
    enriched: false,
    ipa: "/tɪʃ/",
    audioFile: "De-Tisch2.ogg",
    audioUrl:
      "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/de/De-Tisch2.ogg/De-Tisch2.ogg.mp3",
  };
  const detail = {
    ...tisch,
    status: "learning",
    formsSource: null,
    checkStatus: "match",
    timesSeen: 2,
    timesCorrect: 1,
    correctStreak: 1,
    lastResult: "knew",
    lastPracticedAt: "2026-10-11T09:00:00.000Z",
    addedAt: "2026-10-10T09:00:00.000Z",
  };
  const listed = {
    words: [{ ...tisch, status: "learning", timesSeen: 2, correctStreak: 1 }],
    counts: { learning: 1, learned: 0, ignored: 0 },
  };

  function recording() {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const api = createApiClient({
      fetch: async (input, init) => {
        calls.push({ url: String(input), init });
        const body =
          init?.method === "DELETE"
            ? { deleted: true }
            : String(input).startsWith("/api/words/")
              ? detail
              : listed;
        return new Response(JSON.stringify(body), { status: 200 });
      },
    });
    return { calls, api };
  }

  it("listWords puts status and search in the query string, leaving out empty ones", async () => {
    const { calls, api } = recording();
    expect(await api.listWords({ status: "learned", q: "der Tisch & co" })).toEqual(listed);
    await api.listWords({ status: "ignored", q: "" });
    await api.listWords();
    expect(calls.map((c) => c.url)).toEqual([
      "/api/words?status=learned&q=der%20Tisch%20%26%20co",
      "/api/words?status=ignored",
      "/api/words",
    ]);
  });

  it("getWord, updateWord and deleteWord use the right methods, paths and bodies", async () => {
    const { calls, api } = recording();
    expect(await api.getWord(4)).toEqual(detail);
    expect(await api.updateWord(4, { customTranslation: "desk", status: "learning" })).toEqual(
      detail,
    );
    expect(await api.deleteWord(4)).toEqual({ deleted: true });

    expect(calls.map((c) => `${c.init?.method ?? "GET"} ${c.url}`)).toEqual([
      "GET /api/words/4",
      "PATCH /api/words/4",
      "DELETE /api/words/4",
    ]);
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      customTranslation: "desk",
      status: "learning",
    });
    expect(new Headers(calls[1]?.init?.headers).get("content-type")).toBe("application/json");
    // A DELETE without a body must not claim to send JSON (Fastify rejects an empty JSON body).
    expect(calls[2]?.init?.body).toBeUndefined();
    expect(new Headers(calls[2]?.init?.headers).get("content-type")).toBeNull();
  });
});
