import { HealthResponse } from "@language-app/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/health" });

    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json())).toEqual({ status: "ok" });
  });
});
