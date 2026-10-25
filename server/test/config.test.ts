import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config";

describe("parseConfig", () => {
  it("fills defaults for a bare environment", () => {
    const config = parseConfig({});
    expect(config.AI_EFFORT).toBe("medium");
    expect(config.DAILY_PHOTO_LIMIT).toBe(50);
    expect(config.SERVER_PORT).toBe(3000);
    expect(config.AI_MODEL_EXTRACT).toBe("claude-haiku-5-5");
    expect(config.AI_MODEL_ENRICH).toBe("claude-haiku-5-5");
    // Ask AI (§11.5, §11.6).
    expect(config.AI_MODEL_DESCRIBE).toBe("claude-haiku-5-5");
    expect(config.DAILY_DESCRIBE_LIMIT).toBe(200);
  });

  it("treats empty values as unset", () => {
    expect(parseConfig({ DAILY_PHOTO_LIMIT: "" }).DAILY_PHOTO_LIMIT).toBe(50);
  });

  it("coerces numbers and rejects bad values", () => {
    expect(parseConfig({ DAILY_PHOTO_LIMIT: "5" }).DAILY_PHOTO_LIMIT).toBe(5);
    expect(parseConfig({ DAILY_DESCRIBE_LIMIT: "10" }).DAILY_DESCRIBE_LIMIT).toBe(10);
    expect(() => parseConfig({ AI_EFFORT: "turbo" })).toThrow();
    expect(() => parseConfig({ DAILY_DESCRIBE_LIMIT: "0" })).toThrow();
  });
});
