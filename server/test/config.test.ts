import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config";

describe("parseConfig", () => {
  it("fills defaults for a bare environment", () => {
    const config = parseConfig({});
    expect(config.AI_EFFORT).toBe("low");
    expect(config.DAILY_PHOTO_LIMIT).toBe(50);
    expect(config.SERVER_PORT).toBe(3000);
  });

  it("treats empty values as unset", () => {
    expect(parseConfig({ DAILY_PHOTO_LIMIT: "" }).DAILY_PHOTO_LIMIT).toBe(50);
  });

  it("coerces numbers and rejects bad values", () => {
    expect(parseConfig({ DAILY_PHOTO_LIMIT: "5" }).DAILY_PHOTO_LIMIT).toBe(5);
    expect(() => parseConfig({ AI_EFFORT: "turbo" })).toThrow();
  });
});
