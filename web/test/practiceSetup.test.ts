import { SESSION_SIZE, type ThemeKey } from "@language-app/core";
import { describe, expect, it } from "vitest";
import { countParts, themeMenu } from "../src/practice/sources";

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

describe("Practice setup's Theme card (§10 screen 4)", () => {
  const summary = (key: ThemeKey, words: number, practisable: number) => ({
    key,
    words,
    practisable,
  });

  it("offers the themes with words to practise, in THEMES order, by their labels", () => {
    const menu = themeMenu([summary("body", 3, 0), summary("home", 34, 34), summary("work", 5, 2)]);
    expect(menu.themes.map((theme) => [theme.key, theme.label])).toEqual([
      ["home", "Home"],
      ["work", "Work"],
    ]);
  });

  it("starts on the theme with the most words to practise, the first of equals", () => {
    expect(
      themeMenu([summary("body", 3, 2), summary("home", 9, 9), summary("work", 9, 9)]).start,
    ).toBe("home");
    expect(themeMenu([summary("body", 3, 3), summary("work", 9, 1)]).start).toBe("body");
  });

  it("counts the chosen theme's words to practise", () => {
    const { themes } = themeMenu([summary("home", 40, 34)]);
    expect(countParts(themes[0]?.practisable ?? 0)).toEqual({ number: 20, rest: "of 34 words" });
  });

  it("without a theme to practise, the card has no menu and no words", () => {
    for (const list of [[], [summary("home", 3, 0)]]) {
      expect(themeMenu(list)).toEqual({ themes: [], start: null });
    }
    expect(countParts(0)).toEqual({ number: null, rest: "No words" });
  });
});
