import { LEARNED_STREAK } from "@language-app/core";
import { describe, expect, it } from "vitest";
import { wordCount } from "../src/words/counts";
import { groupByLetter } from "../src/words/groupByLetter";
import { checkLabel, dayText, progressLabel } from "../src/words/labels";
import { parseListQuery, wordsUrl } from "../src/words/listQuery";

describe("letter sections of the list (§10)", () => {
  const words = (...lemmas: string[]) => lemmas.map((lemma, id) => ({ id, lemma }));
  const shape = (groups: ReturnType<typeof groupByLetter<{ lemma: string }>>) =>
    groups.map((group) => [group.letter, group.words.map((word) => word.lemma)]);

  it("groups the words under their first letter, keeping their order", () => {
    const list = words("ab", "Anruf", "Balkon", "bei", "Cent");
    const groups = groupByLetter(list);
    expect(shape(groups)).toEqual([
      ["A", ["ab", "Anruf"]],
      ["B", ["Balkon", "bei"]],
      ["C", ["Cent"]],
    ]);
    // The same objects, so a row still gets the whole word.
    expect(groups[0]?.words[1]).toBe(list[1]);
  });

  it("puts umlauts and other accented letters under their base letter", () => {
    expect(shape(groupByLetter(words("alt", "Ärger", "Öl", "oben", "über", "Übung")))).toEqual([
      ["A", ["alt", "Ärger"]],
      ["O", ["Öl", "oben"]],
      ["U", ["über", "Übung"]],
    ]);
  });

  it("gathers words that don't start with a letter under #", () => {
    expect(shape(groupByLetter(words("3D-Drucker", "(sich) freuen", "Abend")))).toEqual([
      ["#", ["3D-Drucker", "(sich) freuen"]],
      ["A", ["Abend"]],
    ]);
  });

  it("starts a new group only where the letter changes, never reordering", () => {
    expect(shape(groupByLetter(words("Zug", "Ärger", "Apfel")))).toEqual([
      ["Z", ["Zug"]],
      ["A", ["Ärger", "Apfel"]],
    ]);
    expect(shape(groupByLetter(words("Apfel", "Zug", "Ärger")))).toEqual([
      ["A", ["Apfel"]],
      ["Z", ["Zug"]],
      ["A", ["Ärger"]],
    ]);
  });

  it("makes one group when every word starts alike, and none for no words", () => {
    expect(shape(groupByLetter(words("Tisch", "tun", "Tür")))).toEqual([
      ["T", ["Tisch", "tun", "Tür"]],
    ]);
    expect(groupByLetter([])).toEqual([]);
  });
});

describe("word count in the header (§10)", () => {
  it("adds up every tab", () => {
    expect(wordCount({ learning: 149, learned: 3, ignored: 12 })).toBe("164 words");
  });

  it("says word for one", () => {
    expect(wordCount({ learning: 0, learned: 1, ignored: 0 })).toBe("1 word");
    expect(wordCount({ learning: 0, learned: 0, ignored: 0 })).toBe("0 words");
  });
});

describe("My words URL (§10)", () => {
  it("reads the tab and the search, Learning by default", () => {
    expect(parseListQuery(new URLSearchParams(""))).toEqual({ status: "learning", q: "" });
    expect(parseListQuery(new URLSearchParams("status=ignored&q=+tisch+"))).toEqual({
      status: "ignored",
      q: "tisch",
    });
    expect(parseListQuery(new URLSearchParams("status=nonsense")).status).toBe("learning");
  });

  it("builds the URL of a tab, with the search only when there is one", () => {
    expect(wordsUrl({ status: "learned", q: "" })).toBe("/words?status=learned");
    expect(wordsUrl({ status: "learning", q: " der Tisch " })).toBe(
      "/words?status=learning&q=der+Tisch",
    );
    const url = wordsUrl({ status: "ignored", q: "über & co" });
    expect(parseListQuery(new URL(url, "http://x").searchParams)).toEqual({
      status: "ignored",
      q: "über & co",
    });
  });
});

describe("progress label on a list row", () => {
  it("marks learning words that were never practised as new", () => {
    expect(progressLabel({ status: "learning", timesSeen: 0, correctStreak: 0 })).toEqual({
      kind: "new",
      text: "new",
      spoken: "Not practised yet",
      filled: 0,
    });
  });

  it("counts right answers in a row towards learned, one filled dot each", () => {
    expect(progressLabel({ status: "learning", timesSeen: 4, correctStreak: 2 })).toEqual({
      kind: "streak",
      text: `2/${LEARNED_STREAK}`,
      spoken: `2 of ${LEARNED_STREAK} right in a row`,
      filled: 2,
    });
    expect(progressLabel({ status: "learning", timesSeen: 1, correctStreak: 0 })).toMatchObject({
      text: `0/${LEARNED_STREAK}`,
      filled: 0,
    });
  });

  it("never counts past the streak that makes a word learned", () => {
    expect(progressLabel({ status: "learning", timesSeen: 9, correctStreak: 7 })).toMatchObject({
      text: `${LEARNED_STREAK}/${LEARNED_STREAK}`,
      filled: LEARNED_STREAK,
    });
  });

  it("shows nothing for learned or ignored words", () => {
    expect(progressLabel({ status: "learned", timesSeen: 9, correctStreak: 7 })).toBeNull();
    expect(progressLabel({ status: "learned", timesSeen: 0, correctStreak: 0 })).toBeNull();
    expect(progressLabel({ status: "ignored", timesSeen: 3, correctStreak: 1 })).toBeNull();
    expect(progressLabel({ status: "ignored", timesSeen: 0, correctStreak: 0 })).toBeNull();
  });
});

describe("dictionary check in plain words", () => {
  it("flags only an article the dictionary disagrees with", () => {
    expect(checkLabel("match")).toEqual({ text: "Found in Wiktionary", warning: false });
    expect(checkLabel("mismatch_fixed").warning).toBe(false);
    expect(checkLabel("mismatch_kept")).toMatchObject({ warning: true });
    expect(checkLabel("not_in_dictionary").text).toMatch(/not in Wiktionary/i);
  });
});

describe("dayText", () => {
  const now = new Date(2026, 9, 12, 9, 0);

  it("says today, yesterday or how many days ago for the last week", () => {
    expect(dayText(new Date(2026, 9, 12, 0, 5).toISOString(), now)).toBe("today");
    expect(dayText(new Date(2026, 9, 11, 23, 50).toISOString(), now)).toBe("yesterday");
    expect(dayText(new Date(2026, 9, 9, 12, 0).toISOString(), now)).toBe("3 days ago");
  });

  it("gives the date for anything older, with the year only when it differs", () => {
    expect(dayText(new Date(2026, 8, 1).toISOString(), now)).not.toMatch(/ago|2026/);
    expect(dayText(new Date(2025, 8, 1).toISOString(), now)).toMatch(/2025/);
  });
});
