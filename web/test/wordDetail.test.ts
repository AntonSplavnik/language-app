import { LEARNED_STREAK, type WordDetail } from "@language-app/core";
import { describe, expect, it } from "vitest";
import { afterDelete, leaveEdit } from "../src/words/editHistory";
import { dayText, historyLine, sourceNote, streakLabel } from "../src/words/labels";

const tisch: WordDetail = {
  userWordId: 7,
  lemma: "Tisch",
  pos: "noun",
  article: "der",
  plural: "Tische",
  forms: null,
  translation: "table",
  customTranslation: null,
  exampleDe: "Der Tisch steht in der Küche.",
  exampleTranslation: "The table is in the kitchen.",
  note: null,
  enriched: true,
  ipa: "/tɪʃ/",
  audioFile: null,
  audioUrl: null,
  status: "learning",
  formsSource: "dictionary",
  checkStatus: "match",
  timesSeen: 0,
  timesCorrect: 0,
  correctStreak: 0,
  lastResult: null,
  lastPracticedAt: null,
  addedAt: "2026-10-01T10:00:00.000Z",
};

describe("source note on Word detail (§10)", () => {
  it("says nothing for a word found in Wiktionary with its forms from there", () => {
    expect(sourceNote(tisch)).toBeNull();
  });

  it("warns when the AI's article was kept against Wiktionary", () => {
    expect(sourceNote({ ...tisch, checkStatus: "mismatch_kept" })).toEqual({
      text: "Wiktionary gives a different article; the AI's was kept",
      warning: true,
    });
  });

  it("mentions a corrected article or a word Wiktionary doesn't have, without warning", () => {
    expect(sourceNote({ ...tisch, checkStatus: "mismatch_fixed" })).toEqual({
      text: "Article corrected to match Wiktionary",
      warning: false,
    });
    expect(sourceNote({ ...tisch, checkStatus: "not_in_dictionary", formsSource: "ai" })).toEqual({
      text: "Not in Wiktionary, so the grammar comes from the AI",
      warning: false,
    });
  });

  it("points out forms from the AI only when forms are shown", () => {
    expect(sourceNote({ ...tisch, formsSource: "ai" })).toEqual({
      text: "Forms from AI",
      warning: false,
    });
    expect(sourceNote({ ...tisch, formsSource: "ai", plural: null })).toBeNull();
    const adjective = { ...tisch, pos: "adjective" as const, article: null, plural: null };
    expect(sourceNote({ ...adjective, formsSource: "ai" })).toBeNull();
  });

  it("says nothing before the details were added", () => {
    expect(sourceNote({ ...tisch, enriched: false, plural: null, formsSource: null })).toBeNull();
  });
});

describe("history line on Word detail (§10)", () => {
  const now = new Date(2026, 9, 12, 9, 0);
  const yesterday = new Date(2026, 9, 11, 18, 0).toISOString();
  const twoWeeksAgo = new Date(2026, 8, 28, 12, 0).toISOString();

  it("a word never practised: seen 0 times and when it was added", () => {
    expect(historyLine({ ...tisch, addedAt: yesterday }, now)).toBe(
      "Seen 0 times · Added yesterday",
    );
  });

  it("a practised word: how often, the last answer and when, and when it was added", () => {
    const practised = {
      ...tisch,
      timesSeen: 4,
      lastResult: "didnt_know" as const,
      lastPracticedAt: yesterday,
      addedAt: twoWeeksAgo,
    };
    expect(historyLine(practised, now)).toBe(
      `Seen 4 times · Last: didn't know, yesterday · Added ${dayText(twoWeeksAgo, now)}`,
    );
  });

  it("says knew it, and time for a word seen once", () => {
    const once = {
      ...tisch,
      timesSeen: 1,
      lastResult: "knew" as const,
      lastPracticedAt: new Date(2026, 9, 12, 8, 0).toISOString(),
      addedAt: yesterday,
    };
    expect(historyLine(once, now)).toBe("Seen 1 time · Last: knew it, today · Added yesterday");
  });
});

describe("streak on Word detail (§10)", () => {
  it("shows the empty streak for a learning word never practised", () => {
    expect(streakLabel(tisch)).toEqual({
      filled: 0,
      text: `0/${LEARNED_STREAK}`,
      spoken: `0 of ${LEARNED_STREAK} right in a row`,
    });
  });

  it("fills one segment per right answer in a row, never more than make it learned", () => {
    expect(streakLabel({ ...tisch, correctStreak: 2 })).toMatchObject({
      filled: 2,
      text: `2/${LEARNED_STREAK}`,
    });
    expect(streakLabel({ ...tisch, correctStreak: 7 })?.filled).toBe(LEARNED_STREAK);
  });

  it("shows nothing for learned or ignored words", () => {
    expect(streakLabel({ ...tisch, status: "learned", correctStreak: 3 })).toBeNull();
    expect(streakLabel({ ...tisch, status: "ignored" })).toBeNull();
  });
});

describe("leaving Edit word (§10)", () => {
  const list = "/words?status=learned&q=tisch";

  it("Save and Cancel go back to the detail it was opened from", () => {
    expect(leaveEdit(7, { from: list, fromDetail: true })).toEqual({ back: 1 });
    expect(leaveEdit(7, { fromDetail: true })).toEqual({ back: 1 });
  });

  it("opened directly, they replace it with the detail, keeping the list to go back to", () => {
    expect(leaveEdit(7, null)).toEqual({ to: "/words/7", state: undefined });
    expect(leaveEdit(7, { from: list })).toEqual({ to: "/words/7", state: { from: list } });
  });

  it("after deleting, list → detail → edit goes back to that list entry", () => {
    expect(afterDelete(list, { from: list, fromDetail: true })).toEqual({ back: 2 });
  });

  it("otherwise deleting replaces Edit word with the list", () => {
    expect(afterDelete(list, null)).toEqual({ to: list });
    expect(afterDelete(list, { fromDetail: true })).toEqual({ to: list });
    expect(afterDelete(list, { from: list })).toEqual({ to: list });
  });
});
