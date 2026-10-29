import { describe, expect, it } from "vitest";
import { changesOf, draftOf } from "../src/words/wordForm";

const saved = {
  customTranslation: "desk",
  note: null,
  themes: [],
  suggestedThemes: [],
  themesOwn: false,
};

describe("word detail form", () => {
  it("starts from the saved texts, empty when unset", () => {
    expect(draftOf(saved)).toEqual({ customTranslation: "desk", note: "", themes: [] });
  });

  it("has nothing to save until a text really changes", () => {
    expect(changesOf(saved, draftOf(saved))).toBeNull();
    // The server trims, so surrounding spaces are no change.
    expect(changesOf(saved, { customTranslation: " desk  ", note: "  ", themes: [] })).toBeNull();
  });

  it("sends only the changed texts, trimmed", () => {
    expect(
      changesOf(saved, { customTranslation: "desk", note: " lesson 4\nirregular ", themes: [] }),
    ).toEqual({
      note: "lesson 4\nirregular",
    });
    expect(changesOf(saved, { customTranslation: " work table ", note: "x", themes: [] })).toEqual({
      customTranslation: "work table",
      note: "x",
    });
  });

  it("an emptied text clears the field", () => {
    expect(changesOf(saved, { customTranslation: "  ", note: "", themes: [] })).toEqual({
      customTranslation: "",
    });
  });
});
