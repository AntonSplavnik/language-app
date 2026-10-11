import { describe, expect, it } from "vitest";
import { checkServer } from "../src/health";

const respond = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), { status });

describe("checkServer", () => {
  it("is ok when the server says so", async () => {
    expect(await checkServer(respond(200, { status: "ok" }))).toBe("ok");
  });

  it("is unreachable on an error status, a wrong body or a network failure", async () => {
    expect(await checkServer(respond(502, {}))).toBe("unreachable");
    expect(await checkServer(respond(200, { status: "nope" }))).toBe("unreachable");
    const failing = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await checkServer(failing)).toBe("unreachable");
  });
});
