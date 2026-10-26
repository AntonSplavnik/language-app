import { ApiError } from "@language-app/core";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app";
import { useTestDb } from "../helpers/db";

const db = useTestDb();

describe("error responses (§12 General)", () => {
  it("an unexpected error answers JSON 500 with code internal and the request id", async () => {
    const app = buildTestApp(db);
    let requestId = "";
    app.get("/api/test/boom", async (request) => {
      requestId = request.id;
      throw new Error("database exploded");
    });

    const res = await app.inject({ method: "GET", url: "/api/test/boom" });

    expect(res.statusCode).toBe(500);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(requestId).not.toBe("");
    // The internal message stays in the server log; the client gets the id to look it up.
    expect(ApiError.parse(res.json())).toEqual({
      error: { code: "internal", message: `Something went wrong (request ${requestId})` },
    });
  });

  describe("on Vercel, the request id is Vercel's (§18.2)", () => {
    // Fastify's own counter restarts in every function instance; x-vercel-id finds the log line.
    const boom = () => {
      const app = buildTestApp(db);
      const ids: string[] = [];
      app.get("/api/test/boom", async (request) => {
        ids.push(request.id);
        throw new Error("database exploded");
      });
      return { app, ids };
    };
    const vercelId = "fra1::iad1::q8x2k-1792998000000-0f3c2a7b9e1d";

    it("a 500's message names x-vercel-id, and the log line has it", async () => {
      const { app, ids } = boom();
      const res = await app.inject({
        method: "GET",
        url: "/api/test/boom",
        headers: { "x-vercel-id": vercelId },
      });

      expect(res.statusCode).toBe(500);
      expect(ids).toEqual([vercelId]);
      expect(ApiError.parse(res.json()).error.message).toBe(
        `Something went wrong (request ${vercelId})`,
      );
    });

    it.each([
      ["without the header (the Mac)", undefined],
      ["for a header that isn't an id", "<script>alert(1)</script>"],
      ["for a header too long to be one", "a".repeat(200)],
    ])("Fastify's own id %s", async (_, header) => {
      const { app, ids } = boom();
      const res = await app.inject({
        method: "GET",
        url: "/api/test/boom",
        headers: header === undefined ? {} : { "x-vercel-id": header },
      });

      expect(ids[0]).toMatch(/^req-[0-9a-z]+$/);
      expect(ApiError.parse(res.json()).error.message).toBe(
        `Something went wrong (request ${ids[0]})`,
      );
    });

    it("Fastify's ids differ from one request to the next", async () => {
      const { app, ids } = boom();
      await app.inject({ method: "GET", url: "/api/test/boom" });
      await app.inject({ method: "GET", url: "/api/test/boom" });
      expect(new Set(ids).size).toBe(2);
    });
  });

  it("an unknown route answers JSON 404 with code not_found", async () => {
    const res = await buildTestApp(db).inject({ method: "GET", url: "/api/nothing-here" });
    expect(res.statusCode).toBe(404);
    expect(ApiError.parse(res.json()).error.code).toBe("not_found");
  });
});
