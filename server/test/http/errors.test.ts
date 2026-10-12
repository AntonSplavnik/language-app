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

  it("an unknown route answers JSON 404 with code not_found", async () => {
    const res = await buildTestApp(db).inject({ method: "GET", url: "/api/nothing-here" });
    expect(res.statusCode).toBe(404);
    expect(ApiError.parse(res.json()).error.code).toBe("not_found");
  });
});
