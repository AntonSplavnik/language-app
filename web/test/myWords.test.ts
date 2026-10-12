import { LEARNED_STREAK } from "@language-app/core";
import { describe, expect, it } from "vitest";
import { checkLabel, dayText, progressLabel } from "../src/words/labels";
import { parseListQuery, wordsUrl } from "../src/words/listQuery";

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
    });
  });

  it("counts right answers in a row towards learned", () => {
    expect(progressLabel({ status: "learning", timesSeen: 4, correctStreak: 2 })).toEqual({
      kind: "streak",
      text: `2/${LEARNED_STREAK}`,
      spoken: `2 of ${LEARNED_STREAK} right in a row`,
    });
    expect(progressLabel({ status: "learning", timesSeen: 1, correctStreak: 0 })?.text).toBe(
      `0/${LEARNED_STREAK}`,
    );
  });

  it("never counts past the streak that makes a word learned", () => {
    expect(progressLabel({ status: "learning", timesSeen: 9, correctStreak: 7 })?.text).toBe(
      `${LEARNED_STREAK}/${LEARNED_STREAK}`,
    );
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
