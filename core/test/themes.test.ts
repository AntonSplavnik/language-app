import { describe, expect, it } from "vitest";
import {
  EnrichedWord,
  knownThemes,
  sameThemes,
  THEME_KEYS,
  THEMES,
  ThemeKey,
  ThemeListResponse,
  ThemesOutput,
  themeLabel,
  UpdateWordRequest,
  WordDetail,
  WordListItem,
  WordListQuery,
} from "../src";

describe("THEMES (docs/design.md §19.2)", () => {
  it("are the 22 themes, keys stable: they are stored in the database", () => {
    expect(THEMES.map((theme) => theme.key)).toEqual([
      "family",
      "body",
      "food",
      "home",
      "clothes",
      "shopping",
      "town",
      "travel",
      "work",
      "school",
      "culture",
      "free-time",
      "sport",
      "nature",
      "weather",
      "time",
      "numbers",
      "colours",
      "feelings",
      "communication",
      "offices",
      "technology",
    ]);
    expect(THEME_KEYS).toEqual(THEMES.map((theme) => theme.key));
  });

  it("have unique keys and labels, and a description for the AI", () => {
    expect(new Set(THEMES.map((t) => t.key)).size).toBe(THEMES.length);
    expect(new Set(THEMES.map((t) => t.label)).size).toBe(THEMES.length);
    for (const theme of THEMES) {
      expect(theme.key).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(theme.about.length, theme.key).toBeGreaterThan(10);
    }
  });

  it("show their English label", () => {
    expect(themeLabel("body")).toBe("Body & health");
    expect(themeLabel("free-time")).toBe("Free time");
    expect(themeLabel("offices")).toBe("Offices & paperwork");
  });
});

describe("knownThemes: an answer checked against THEMES (§19.4)", () => {
  it("keeps known keys in order, at most 2", () => {
    expect(knownThemes(["body", "work"])).toEqual(["body", "work"]);
    expect(knownThemes(["food", "shopping", "home"])).toEqual(["food", "shopping"]);
  });

  it("drops unknown keys and repeats before counting", () => {
    expect(knownThemes(["medicine", "body", "body", "health", "work"])).toEqual(["body", "work"]);
    expect(knownThemes(["Body", " work"])).toEqual([]);
  });

  it("keeps none as none", () => {
    expect(knownThemes([])).toEqual([]);
  });
});

describe("sameThemes", () => {
  it("compares as sets: the order doesn't matter, the members do", () => {
    expect(sameThemes(["body", "work"], ["work", "body"])).toBe(true);
    expect(sameThemes([], [])).toBe(true);
    expect(sameThemes(["body"], ["body", "work"])).toBe(false);
    expect(sameThemes(["food"], ["home"])).toBe(false);
  });
});

describe("the schemas with themes (§19.6)", () => {
  it("ThemeKey takes only the list's keys", () => {
    expect(ThemeKey.safeParse("work").success).toBe(true);
    expect(ThemeKey.safeParse("health").success).toBe(false);
  });

  it("PATCH accepts 0–2 known keys, or null to go back to the word's", () => {
    for (const themes of [[], ["body"], ["body", "work"], null]) {
      expect(UpdateWordRequest.safeParse({ themes }).success, JSON.stringify(themes)).toBe(true);
    }
    expect(UpdateWordRequest.parse({})).toEqual({});
  });

  it("PATCH refuses unknown keys, more than 2 and a key twice", () => {
    for (const themes of [["health"], ["body", "work", "food"], ["body", "body"], "body"]) {
      expect(UpdateWordRequest.safeParse({ themes }).success, JSON.stringify(themes)).toBe(false);
    }
  });

  it("word list items and the detail carry known keys only", () => {
    expect(WordListItem.shape.themes.safeParse(["body", "work"]).success).toBe(true);
    expect(WordListItem.shape.themes.safeParse(["health"]).success).toBe(false);
    expect(WordDetail.shape.suggestedThemes.safeParse(["food"]).success).toBe(true);
    expect(WordDetail.shape.themesOwn.safeParse(true).success).toBe(true);
  });

  it("the AI's answers take any text, so an unknown key is dropped, not a failed call", () => {
    expect(EnrichedWord.shape.themes.safeParse(["body", "medicine", "work", "food"]).success).toBe(
      true,
    );
    expect(
      ThemesOutput.safeParse({ words: [{ ref: 0, lemma: "Arzt", themes: ["body", "x"] }] }).success,
    ).toBe(true);
  });
});

describe("filtering and practising by theme (§19.9)", () => {
  it("GET /words takes one known theme", () => {
    expect(WordListQuery.parse({ status: "learning", theme: "home" })).toEqual({
      status: "learning",
      theme: "home",
    });
    expect(WordListQuery.parse({})).toEqual({});
    for (const theme of ["health", "", "Home"]) {
      expect(WordListQuery.safeParse({ theme }).success, theme).toBe(false);
    }
  });

  it("GET /themes: known keys, each with its words and the practisable ones", () => {
    const themes = [
      { key: "home", words: 34, practisable: 20 },
      { key: "work", words: 3, practisable: 0 },
    ];
    expect(ThemeListResponse.parse({ themes })).toEqual({ themes });
    for (const bad of [
      { key: "health", words: 3, practisable: 1 },
      { key: "home", words: -1, practisable: 0 },
      { key: "home", words: 2, practisable: 1.5 },
      { key: "home", words: 2 },
    ]) {
      expect(ThemeListResponse.safeParse({ themes: [bad] }).success, JSON.stringify(bad)).toBe(
        false,
      );
    }
  });
});
