import type { ThemeKey } from "@language-app/core";
import { describe, expect, it } from "vitest";
import { themeChips, toggleTheme, usesOwnThemes } from "../src/words/themes";
import { changesOf, draftOf } from "../src/words/wordForm";

describe("the Themes card's choice (§10 Edit word, §19.5)", () => {
  it("a tap checks a theme, after those already checked; another tap unchecks it", () => {
    expect(toggleTheme([], "food")).toEqual({ themes: ["food"], limited: false });
    expect(toggleTheme(["food"], "home")).toEqual({ themes: ["food", "home"], limited: false });
    expect(toggleTheme(["food", "home"], "food")).toEqual({ themes: ["home"], limited: false });
  });

  it("at most 2: a third tap does nothing and says so", () => {
    expect(toggleTheme(["food", "home"], "work")).toEqual({
      themes: ["food", "home"],
      limited: true,
    });
  });

  it("Use suggested shows only when the choice differs from the word's, whatever the order", () => {
    expect(usesOwnThemes(["body", "work"], ["work", "body"])).toBe(false);
    expect(usesOwnThemes([], [])).toBe(false);
    expect(usesOwnThemes(["body"], ["body", "work"])).toBe(true);
    expect(usesOwnThemes([], ["home"])).toBe(true);
  });
});

describe("Word detail's theme chips (§10 Word detail, §19.5)", () => {
  it("the labels, and Your choice when the learner chose", () => {
    expect(themeChips({ themes: ["body", "work"], themesOwn: false })).toEqual({
      labels: ["Body & health", "Work"],
      own: false,
    });
    expect(themeChips({ themes: ["free-time"], themesOwn: true })).toEqual({
      labels: ["Free time"],
      own: true,
    });
  });

  it("nothing when there are none, even when that was the learner's choice", () => {
    expect(themeChips({ themes: [], themesOwn: false })).toBeNull();
    expect(themeChips({ themes: [], themesOwn: true })).toBeNull();
  });
});

describe("Edit word's Save with themes (§19.5)", () => {
  const saved = (themes: ThemeKey[], suggestedThemes: ThemeKey[], themesOwn: boolean) => ({
    customTranslation: null,
    note: null,
    themes,
    suggestedThemes,
    themesOwn,
  });

  it("starts from the themes shown, and has nothing to save until they change", () => {
    const word = saved(["home"], ["home"], false);
    expect(draftOf(word)).toEqual({ customTranslation: "", note: "", themes: ["home"] });
    expect(changesOf(word, draftOf(word))).toBeNull();
    // The same themes in another order are no change.
    const two = saved(["body", "work"], ["body", "work"], false);
    expect(changesOf(two, { ...draftOf(two), themes: ["work", "body"] })).toBeNull();
  });

  it("sends the learner's choice when it differs from the word's", () => {
    const word = saved(["home"], ["home"], false);
    expect(changesOf(word, { ...draftOf(word), themes: ["home", "work"] })).toEqual({
      themes: ["home", "work"],
    });
    expect(changesOf(word, { ...draftOf(word), themes: [] })).toEqual({ themes: [] });
  });

  it("sends null when an own choice goes back to the word's themes (Use suggested)", () => {
    const own = saved(["work"], ["home"], true);
    expect(changesOf(own, { ...draftOf(own), themes: ["home"] })).toEqual({ themes: null });
  });

  it("sends themes with the texts in one Save", () => {
    const word = saved(["home"], ["home"], false);
    expect(changesOf(word, { customTranslation: "desk", note: "", themes: ["work"] })).toEqual({
      customTranslation: "desk",
      themes: ["work"],
    });
  });
});
