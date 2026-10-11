import { describe, expect, it } from "vitest";
import { ApiClientError, createApiClient } from "../src";

const json = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const stats = {
  learning: 3,
  learned: 1,
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
