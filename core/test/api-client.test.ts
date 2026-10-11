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
