import { describe, expect, it } from "vitest";
import { fitWithin } from "../src/device/fitWithin";

describe("fitWithin (§6.2: longest side 1600 px)", () => {
  it("scales a landscape photo down by its width", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it("scales a portrait photo down by its height", () => {
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("never scales up a small image", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("rounds to whole pixels and never returns zero", () => {
    expect(fitWithin(3000, 1001, 1600)).toEqual({ width: 1600, height: 534 });
    expect(fitWithin(10_000, 1, 1600)).toEqual({ width: 1600, height: 1 });
  });
});
