import { SESSION_SIZE } from "@language-app/core";
import { describe, expect, it } from "vitest";
import { countParts } from "../src/practice/sources";

describe("Practice setup counts (§8.1)", () => {
  it("splits a source's count into the number and the rest, on two lines", () => {
    expect(countParts(1)).toEqual({ number: 1, rest: "word" });
    expect(countParts(2)).toEqual({ number: 2, rest: "words" });
  });

  it("says how many a session takes out of a larger source", () => {
    expect(countParts(SESSION_SIZE)).toEqual({ number: SESSION_SIZE, rest: "words" });
    expect(countParts(SESSION_SIZE + 1)).toEqual({
      number: SESSION_SIZE,
      rest: `of ${SESSION_SIZE + 1} words`,
    });
    expect(countParts(149)).toEqual({ number: SESSION_SIZE, rest: "of 149 words" });
  });

  it("a source without words has no number, just one line", () => {
    expect(countParts(0)).toEqual({ number: null, rest: "No words" });
  });

  it("reads as before when the two parts are put together", () => {
    const text = (count: number) => {
      const { number, rest } = countParts(count);
      return number === null ? rest : `${number} ${rest}`;
    };
    expect([0, 1, 2, 20, 94].map(text)).toEqual([
      "No words",
      "1 word",
      "2 words",
      "20 words",
      "20 of 94 words",
    ]);
  });
});
