import { describe, expect, it } from "vitest";
import { shuffle } from "../src";

/** Repeats a fixed sequence of "random" numbers so results are predictable. */
const sequence = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
};

describe("shuffle", () => {
  it("returns a permutation without changing the input", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const result = shuffle(input, sequence([0.9, 0.1, 0.5, 0.3, 0.7]));
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...result].sort()).toEqual(input);
  });

  it("is deterministic for the same random source", () => {
    const random = [0.2, 0.8, 0.4, 0.6];
    expect(shuffle([1, 2, 3, 4, 5], sequence(random))).toEqual(
      shuffle([1, 2, 3, 4, 5], sequence(random)),
    );
  });

  it("handles empty and single-item lists", () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(["a"])).toEqual(["a"]);
  });
});
