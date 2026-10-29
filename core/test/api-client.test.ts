import { describe, expect, it } from "vitest";
import {
  ApiClientError,
  CreateSessionRequest,
  createApiClient,
  DescribeRequest,
  LookupQuery,
  SuggestQuery,
  TYPED_IMPORT_MAX,
  TYPED_LIST_MAX,
  TYPED_WORDS_MAX,
  TypedImportRequest,
  TypedWord,
} from "../src";

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
    source: "photos",
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

  it("createImport sends where the pages come from (§6.8)", async () => {
    const pdf = { ...importView, name: "Pages 42–45", source: "pdf" };
    const { calls, api } = recording(pdf);
    expect(await api.createImport({ name: "Pages 42–45", source: "pdf" })).toEqual(pdf);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      name: "Pages 42–45",
      source: "pdf",
    });
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

  it("listImports reads the past imports", async () => {
    const past = {
      imports: [
        {
          id: 5,
          name: null,
          source: "photos",
          completedAt: "2026-10-13T12:50:30.720Z",
          wordCount: 9,
          words: 11,
        },
        {
          id: 6,
          name: null,
          source: "typed",
          completedAt: "2026-10-14T12:50:30.720Z",
          wordCount: 3,
          words: 3,
        },
      ],
    };
    const { calls, api } = recording(past);
    expect(await api.listImports()).toEqual(past);
    expect(`${calls[0]?.init?.method ?? "GET"} ${calls[0]?.url}`).toBe("GET /api/imports");
  });

  it("listImports rejects an import without its word counts", async () => {
    const item = { id: 5, name: null, source: "photos", completedAt: "2026-10-13T12:50:30.720Z" };
    for (const counts of [{ words: 9 }, { wordCount: 9 }]) {
      const { api } = recording({ imports: [{ ...item, ...counts }] });
      await expect(api.listImports()).rejects.toMatchObject({ code: "invalid_response" });
    }
  });

  it("renameImport patches the name, or null to clear it", async () => {
    const { calls, api } = recording({ id: 3, name: "Lesson 4" });
    expect(await api.renameImport(3, "Lesson 4")).toEqual({ id: 3, name: "Lesson 4" });
    await api.renameImport(3, null);
    expect(calls.map((c) => `${c.init?.method} ${c.url}`)).toEqual([
      "PATCH /api/imports/3",
      "PATCH /api/imports/3",
    ]);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ name: "Lesson 4" });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ name: null });
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

  it("createSession sends the import to practise", async () => {
    let body: unknown;
    const api = createApiClient({
      fetch: async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ id: 9, source: "import", cards: [] }));
      },
    });
    expect(await api.createSession({ source: "import", importId: 5 })).toEqual({
      id: 9,
      source: "import",
      cards: [],
    });
    expect(body).toEqual({ source: "import", importId: 5 });
  });

  it("createSession sends the theme to practise (§19.9)", async () => {
    let body: unknown;
    const api = createApiClient({
      fetch: async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ id: 9, source: "theme", cards: [] }));
      },
    });
    expect((await api.createSession({ source: "theme", theme: "home" })).source).toBe("theme");
    expect(body).toEqual({ source: "theme", theme: "home" });
  });

  it("listThemes reads the learner's themes with their counts (§19.9)", async () => {
    const themes = { themes: [{ key: "home", words: 34, practisable: 20 }] };
    const calls: string[] = [];
    const api = createApiClient({
      fetch: async (input, init) => {
        calls.push(`${init?.method ?? "GET"} ${String(input)}`);
        return new Response(JSON.stringify(themes));
      },
    });
    expect(await api.listThemes()).toEqual(themes);
    expect(calls).toEqual(["GET /api/themes"]);
  });
});

describe("CreateSessionRequest (§9)", () => {
  it("needs an importId for import, and allows none for the other sources", () => {
    expect(CreateSessionRequest.safeParse({ source: "import", importId: 5 }).success).toBe(true);
    expect(CreateSessionRequest.safeParse({ source: "not_learned" }).success).toBe(true);
    expect(CreateSessionRequest.safeParse({ source: "import" }).success).toBe(false);
    expect(CreateSessionRequest.safeParse({ source: "last_7_days", importId: 5 }).success).toBe(
      false,
    );
    expect(CreateSessionRequest.safeParse({ source: "last_import" }).success).toBe(false);
  });

  it("needs a known theme for theme, and no other source takes one (§19.9)", () => {
    expect(CreateSessionRequest.safeParse({ source: "theme", theme: "home" }).success).toBe(true);
    for (const body of [
      { source: "theme" },
      { source: "theme", theme: "health" },
      { source: "theme", theme: null },
      { source: "theme", theme: "home", importId: 5 },
      { source: "import", importId: 5, theme: "home" },
      { source: "not_learned", theme: "home" },
    ]) {
      expect(CreateSessionRequest.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
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
    themes: ["home", "work"],
    suggestedThemes: ["home"],
    themesOwn: true,
  };
  const listed = {
    words: [
      {
        ...tisch,
        status: "learning",
        timesSeen: 2,
        correctStreak: 1,
        addedAt: "2026-10-10T09:00:00.000Z",
        themes: ["home"],
      },
    ],
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

  it("listWords sends the import and the order", async () => {
    const { calls, api } = recording();
    await api.listWords({ status: "learning", importId: 5 });
    await api.listWords({ sort: "newest", q: "tisch" });
    expect(calls.map((c) => c.url)).toEqual([
      "/api/words?status=learning&importId=5",
      "/api/words?sort=newest&q=tisch",
    ]);
  });

  it("listWords sends the theme (§19.9)", async () => {
    const { calls, api } = recording();
    await api.listWords({ status: "learned", q: "tisch", theme: "free-time" });
    expect(calls.map((c) => c.url)).toEqual(["/api/words?status=learned&q=tisch&theme=free-time"]);
  });

  it("getWord, updateWord and deleteWord use the right methods, paths and bodies", async () => {
    const { calls, api } = recording();
    expect(await api.getWord(4)).toEqual(detail);
    expect(await api.updateWord(4, { customTranslation: "desk", status: "learning" })).toEqual(
      detail,
    );
    await api.updateWord(4, { themes: null });
    expect(await api.deleteWord(4)).toEqual({ deleted: true });

    expect(calls.map((c) => `${c.init?.method ?? "GET"} ${c.url}`)).toEqual([
      "GET /api/words/4",
      "PATCH /api/words/4",
      "PATCH /api/words/4",
      "DELETE /api/words/4",
    ]);
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      customTranslation: "desk",
      status: "learning",
    });
    expect(new Headers(calls[1]?.init?.headers).get("content-type")).toBe("application/json");
    // Back to the word's themes: null is sent, not left out.
    expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({ themes: null });
    // A DELETE without a body must not claim to send JSON (Fastify rejects an empty JSON body).
    expect(calls[3]?.init?.body).toBeUndefined();
    expect(new Headers(calls[3]?.init?.headers).get("content-type")).toBeNull();
  });
});

describe("typed word endpoints (§9.3)", () => {
  const regenschirm = {
    entryId: 12657,
    lemma: "Regenschirm",
    pos: "noun",
    article: "der",
    plural: "Regenschirme",
    forms: null,
    glosses: ["umbrella (used for protection against rain)"],
    ipa: null,
    audioUrl: null,
    inMyWords: null,
  };

  function recording(answers: Record<string, unknown>) {
    const calls: Array<{ method: string; url: string; body: unknown }> = [];
    const api = createApiClient({
      fetch: async (input, init) => {
        const method = init?.method ?? "GET";
        const url = String(input);
        calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
        const path = url.split("?")[0];
        return new Response(JSON.stringify(answers[`${method} ${path}`]), { status: 200 });
      },
    });
    return { calls, api };
  }

  it("suggest and lookup send the typed text in the query string", async () => {
    const { calls, api } = recording({
      "GET /api/dictionary/suggest": { suggestions: [regenschirm] },
      "GET /api/dictionary/lookup": { entries: [], forms: [], similar: [regenschirm] },
    });
    expect(await api.suggest("Regensch")).toEqual({ suggestions: [regenschirm] });
    expect((await api.lookup("Regen schrim & co")).similar).toEqual([regenschirm]);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /api/dictionary/suggest?q=Regensch",
      "GET /api/dictionary/lookup?q=Regen%20schrim%20%26%20co",
    ]);
  });

  it("lookup rejects an entry without its inMyWords", async () => {
    const { inMyWords: _, ...withoutIt } = regenschirm;
    const { api } = recording({
      "GET /api/dictionary/lookup": { entries: [withoutIt], forms: [], similar: [] },
    });
    await expect(api.lookup("Regenschirm")).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("describeWord, addWords and saveTypedImport post JSON to their paths", async () => {
    const word = {
      lemma: "Regenschirm",
      pos: "noun" as const,
      article: "der" as const,
      translation: "umbrella",
    };
    const added = {
      added: [{ userWordId: 7, lemma: "Regenschirm", article: "der" }],
      alreadyInList: 0,
      detailsPending: 0,
    };
    const { calls, api } = recording({
      "POST /api/words/describe": {
        lemma: "Regenschirm",
        pos: "noun",
        article: "der",
        translation: "umbrella",
      },
      "POST /api/words": added,
      "POST /api/imports/typed": { ...added, importId: 9 },
    });

    expect(await api.describeWord({ text: "Regenschrim" })).toMatchObject({
      lemma: "Regenschirm",
    });
    await api.describeWord({ text: "Bank", entryId: 1901 });
    expect(await api.addWords([word])).toEqual(added);
    expect((await api.saveTypedImport([{ ...word, entryId: 12657 }])).importId).toBe(9);

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/words/describe",
      "POST /api/words/describe",
      "POST /api/words",
      "POST /api/imports/typed",
    ]);
    expect(calls.map((c) => c.body)).toEqual([
      { text: "Regenschrim" },
      { text: "Bank", entryId: 1901 },
      { words: [word] },
      { words: [{ ...word, entryId: 12657 }] },
    ]);
  });

  it("a typed list that added nothing has no import", async () => {
    const { api } = recording({
      "POST /api/imports/typed": { added: [], alreadyInList: 2, detailsPending: 0, importId: null },
    });
    expect(
      await api.saveTypedImport([
        { lemma: "See", pos: "noun", article: "der", translation: "lake" },
      ]),
    ).toEqual({ added: [], alreadyInList: 2, detailsPending: 0, importId: null });
  });
});

describe("typed word schemas (§9.3)", () => {
  const word = { lemma: " Regenschirm ", pos: "noun", article: "der", translation: " umbrella " };

  it("a typed word is trimmed and needs a lemma and a translation of at most 200 characters", () => {
    expect(TypedWord.parse(word)).toEqual({
      lemma: "Regenschirm",
      pos: "noun",
      article: "der",
      translation: "umbrella",
    });
    expect(TypedWord.safeParse({ ...word, lemma: "  " }).success).toBe(false);
    expect(TypedWord.safeParse({ ...word, translation: " " }).success).toBe(false);
    expect(TypedWord.safeParse({ ...word, translation: "x".repeat(200) }).success).toBe(true);
    expect(TypedWord.safeParse({ ...word, translation: "x".repeat(201) }).success).toBe(false);
    expect(TypedWord.safeParse({ ...word, article: "den" }).success).toBe(false);
  });

  it("a typed list holds 1 to 150 words: 30 texts with up to 5 entries chosen for each", () => {
    expect(TYPED_IMPORT_MAX).toBe(TYPED_LIST_MAX * TYPED_WORDS_MAX);
    expect(TYPED_IMPORT_MAX).toBe(150);
    expect(TypedImportRequest.safeParse({ words: [] }).success).toBe(false);
    expect(TypedImportRequest.safeParse({ words: Array(150).fill(word) }).success).toBe(true);
    expect(TypedImportRequest.safeParse({ words: Array(151).fill(word) }).success).toBe(false);
  });

  it("the search and Ask AI take a trimmed text of at most 50 characters", () => {
    expect(SuggestQuery.parse({})).toEqual({ q: "" });
    expect(SuggestQuery.parse({ q: "  Re " })).toEqual({ q: "Re" });
    expect(SuggestQuery.safeParse({ q: "x".repeat(51) }).success).toBe(false);
    expect(LookupQuery.safeParse({ q: "   " }).success).toBe(false);
    expect(LookupQuery.parse({ q: ` ${"x".repeat(50)} ` }).q).toHaveLength(50);
    expect(DescribeRequest.safeParse({ text: "" }).success).toBe(false);
    expect(DescribeRequest.parse({ text: " ging ", entryId: 3 })).toEqual({
      text: "ging",
      entryId: 3,
    });
  });
});
