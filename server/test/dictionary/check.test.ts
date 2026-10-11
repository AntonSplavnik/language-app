import { describe, expect, it } from "vitest";
import { checkWord } from "../../src/dictionary/check";

const entry = (...genders: Array<"der" | "die" | "das">) => ({ genders });

describe("checkWord (§6.3)", () => {
  it("not in the dictionary", () => {
    expect(checkWord({ pos: "noun", article: "der" }, [])).toEqual({ status: "not_found" });
  });

  it("noun whose article is one of the dictionary genders", () => {
    expect(checkWord({ pos: "noun", article: "der" }, [entry("der")])).toEqual({ status: "match" });
  });

  it("genders are merged across entries: der See and die See both match", () => {
    const see = [entry("der"), entry("die")];
    expect(checkWord({ pos: "noun", article: "die" }, see)).toEqual({ status: "match" });
    expect(checkWord({ pos: "noun", article: "das" }, see)).toEqual({
      status: "mismatch",
      genders: ["der", "die"],
    });
  });

  it("noun with a different article: mismatch with the dictionary genders", () => {
    expect(checkWord({ pos: "noun", article: "die" }, [entry("der")])).toEqual({
      status: "mismatch",
      genders: ["der"],
    });
  });

  it("noun without an article from the AI: mismatch, so the learner can apply one", () => {
    expect(checkWord({ pos: "noun", article: null }, [entry("das")])).toEqual({
      status: "mismatch",
      genders: ["das"],
    });
  });

  it("the dictionary has no gender (plural-only nouns like Eltern): nothing contradicts, match", () => {
    expect(checkWord({ pos: "noun", article: "die" }, [entry()])).toEqual({ status: "match" });
  });

  it("any other part of speech only has to be found", () => {
    expect(checkWord({ pos: "adjective", article: null }, [entry()])).toEqual({ status: "match" });
  });
});
