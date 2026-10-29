import type { ImportSummary } from "@language-app/core";
import { describe, expect, it } from "vitest";
import { doneLines, doneSource, moreWords, needsName } from "../src/imports/done";
import {
  findImport,
  importFacts,
  importSubline,
  importsStatus,
  labelImports,
  nameChange,
} from "../src/imports/labels";
import { leaveRename } from "../src/imports/settingsRoutes";
import type { PastImports } from "../src/imports/usePastImports";
import { groupByDay } from "../src/words/groupByDay";

// Dates and times are the phone's (§10): these tests build local times and format them in en-GB.
const LOCALE = "en-GB";
const now = new Date(2026, 9, 16, 9, 0);
const local = (...parts: [number, number, number, number?, number?]) =>
  new Date(parts[0], parts[1], parts[2], parts[3] ?? 12, parts[4] ?? 0).toISOString();

const summary = (
  id: number,
  completedAt: string,
  name: string | null = null,
  wordCount = 9,
  source: ImportSummary["source"] = "photos",
): ImportSummary => ({ id, name, source, completedAt, wordCount, words: wordCount });

const labels = (imports: ImportSummary[]) =>
  labelImports(imports, now, LOCALE).map((item) => item.label);

describe("import labels (§10)", () => {
  it("shows the name, or without one the day the import was completed", () => {
    expect(
      labels([summary(2, local(2026, 9, 13), "Lesson 4"), summary(1, local(2026, 9, 11))]),
    ).toEqual(["Lesson 4", "11 Oct"]);
  });

  it("adds the year when it isn't this year", () => {
    expect(labels([summary(1, local(2025, 11, 30))])).toEqual(["30 Dec 2025"]);
  });

  it("adds the time when several unnamed imports share a day", () => {
    expect(
      labels([
        summary(4, local(2026, 9, 13, 18, 5)),
        summary(3, local(2026, 9, 11, 23, 49)),
        summary(2, local(2026, 9, 11, 14, 32)),
        summary(1, local(2026, 9, 11, 9, 7), "Lesson 1"),
      ]),
    ).toEqual(["13 Oct", "11 Oct, 23:49", "11 Oct, 14:32", "Lesson 1"]);
  });

  it("a named import on the same day doesn't make an unnamed one show its time", () => {
    expect(
      labels([summary(2, local(2026, 9, 11, 14, 32)), summary(1, local(2026, 9, 11, 9), "Demo")]),
    ).toEqual(["11 Oct", "Demo"]);
  });

  it("the same day in different years is not the same day", () => {
    expect(labels([summary(2, local(2026, 9, 11)), summary(1, local(2025, 9, 11))])).toEqual([
      "11 Oct",
      "11 Oct 2025",
    ]);
  });

  it("keeps the imports, their order and the day of each", () => {
    const imports = [summary(2, local(2026, 9, 13), "Lesson 4"), summary(1, local(2025, 9, 11))];
    const labelled = labelImports(imports, now, LOCALE);
    expect(labelled.map(({ id, day, wordCount }) => ({ id, day, wordCount }))).toEqual([
      { id: 2, day: "13 Oct", wordCount: 9 },
      { id: 1, day: "11 Oct 2025", wordCount: 9 },
    ]);
  });

  it("Imports' second line: the day when the label is a name, and the words", () => {
    const [named, unnamed, one] = labelImports(
      [
        summary(3, local(2026, 9, 13), "Lesson 4", 9),
        summary(2, local(2026, 9, 12), null, 54),
        summary(1, local(2026, 9, 11), null, 1),
      ],
      now,
      LOCALE,
    );
    expect([named, unnamed, one].map((item) => item && importSubline(item))).toEqual([
      "13 Oct · 9 words",
      "54 words",
      "1 word",
    ]);
  });
});

describe("My words' day headings (§10, Newest first)", () => {
  const word = (lemma: string, addedAt: string) => ({ lemma, addedAt });
  const shape = (words: Array<{ lemma: string; addedAt: string }>) =>
    groupByDay(words, now, LOCALE).map((group) => [group.heading, group.words.map((w) => w.lemma)]);

  it("splits the list by the day each word was added: Today, Yesterday, then the date", () => {
    expect(
      shape([
        word("Tisch", local(2026, 9, 16, 8, 30)),
        word("Stuhl", local(2026, 9, 16, 0, 5)),
        word("Lampe", local(2026, 9, 15, 23, 59)),
        word("Bett", local(2026, 9, 13, 18)),
        word("Zug", local(2026, 9, 13, 9)),
        word("Bahn", local(2025, 11, 1)),
      ]),
    ).toEqual([
      ["Today", ["Tisch", "Stuhl"]],
      ["Yesterday", ["Lampe"]],
      ["13 Oct", ["Bett", "Zug"]],
      ["1 Dec 2025", ["Bahn"]],
    ]);
  });

  it("keeps the server's order, starting a section only where the day changes", () => {
    const list = [
      word("Tisch", local(2026, 9, 13)),
      word("Stuhl", local(2026, 9, 14)),
      word("Lampe", local(2026, 9, 13)),
    ];
    const groups = groupByDay(list, now, LOCALE);
    expect(groups.map((group) => group.heading)).toEqual(["13 Oct", "14 Oct", "13 Oct"]);
    // The same objects, so a row still gets the whole word.
    expect(groups[0]?.words[0]).toBe(list[0]);
  });

  it("makes no sections for no words", () => {
    expect(groupByDay([], now, LOCALE)).toEqual([]);
  });
});

describe("Done (§10 screen 3)", () => {
  it("counts what was added and ignored", () => {
    expect(doneLines({ added: 8, skipped: 1, detailsPending: 0 })).toEqual({
      headline: "8 words added",
      note: "1 ignored; they won't be suggested again.",
    });
    expect(doneLines({ added: 1, skipped: 0, detailsPending: 0 })).toEqual({
      headline: "1 word added",
      note: null,
    });
  });

  it("nothing added: says why", () => {
    expect(doneLines({ added: 0, skipped: 0, detailsPending: 0 })).toEqual({
      headline: "No words added",
      note: "Every word on these pages is already in your list.",
    });
    expect(doneLines({ added: 0, skipped: 3, detailsPending: 0 })).toEqual({
      headline: "No words added",
      note: "3 ignored; they won't be suggested again.",
    });
  });

  it("a reloaded Done screen no longer has the counts", () => {
    expect(doneLines(null)).toEqual({ headline: "Import saved", note: null });
  });

  it("after a typed list, more words are typed, not photographed", () => {
    expect(moreWords("typed")).toEqual({ to: "/words/new?mode=list", label: "Type more words" });
    expect(moreWords("photos")).toEqual({ to: "/imports/new", label: "Import more pages" });
  });

  it("after PDF pages, more pages come from the PDF, starting after these", () => {
    expect(moreWords("pdf")).toEqual({ to: "/imports/new/pdf", label: "Import more pages" });
  });

  it("knows the source from the save, else from the past imports, else photos", () => {
    const imports = [
      summary(5, local(2026, 9, 13), null, 3, "typed"),
      summary(4, local(2026, 9, 12)),
    ];
    const ready: PastImports = { kind: "ready", imports };
    expect(doneSource({ added: 3, skipped: 0, detailsPending: 0, source: "typed" }, ready, 9)).toBe(
      "typed",
    );
    // A reloaded Done screen has no save result.
    expect(doneSource(null, ready, 5)).toBe("typed");
    expect(doneSource(null, ready, 4)).toBe("photos");
    expect(doneSource(null, { kind: "loading" }, 5)).toBe("photos");
  });

  it("offers a name only for a listed import without one", () => {
    const imports = [summary(5, local(2026, 9, 13)), summary(4, local(2026, 9, 12), "Lesson 4")];
    expect(needsName(imports, 5)).toBe(true);
    expect(needsName(imports, 4)).toBe(false);
    // Not among the past imports: it added nothing to learn.
    expect(needsName(imports, 6)).toBe(false);
  });
});

describe("Settings (§10 screens 10–12)", () => {
  const ready = (imports: ImportSummary[]): PastImports => ({ kind: "ready", imports });

  it("the Imports row counts the past imports, and shows nothing while there are none", () => {
    expect(
      importsStatus(ready([summary(2, local(2026, 9, 13)), summary(1, local(2026, 9, 11))])),
    ).toBe("2");
    expect(importsStatus(ready([]))).toBeNull();
    expect(importsStatus({ kind: "loading" })).toBeNull();
    expect(importsStatus({ kind: "error", message: "No connection" })).toBeNull();
  });

  it("an import's page says its words and the day it was added", () => {
    const [named, one] = labelImports(
      [summary(2, local(2026, 9, 13), "Lesson 4", 9), summary(1, local(2025, 9, 11), null, 1)],
      now,
      LOCALE,
    );
    expect(named && importFacts(named)).toBe("9 words · added 13 Oct");
    expect(one && importFacts(one)).toBe("1 word · added 11 Oct 2025");
  });

  it("finds the import among the past imports, with its label", () => {
    const imports = [summary(3, local(2026, 9, 11, 18)), summary(2, local(2026, 9, 11, 9))];
    const found = findImport(ready(imports), 2, now, LOCALE);
    expect(found.kind === "ready" && [found.item.id, found.item.label]).toEqual([
      2,
      "11 Oct, 09:00",
    ]);
  });

  it("an import that isn't listed (any more), or a mistyped id, is missing", () => {
    const imports = [summary(3, local(2026, 9, 11))];
    expect(findImport(ready(imports), 2, now, LOCALE)).toEqual({ kind: "missing" });
    expect(findImport(ready(imports), Number("abc"), now, LOCALE)).toEqual({ kind: "missing" });
    expect(findImport(ready([]), 3, now, LOCALE)).toEqual({ kind: "missing" });
  });

  it("is loading or failed while the past imports are", () => {
    expect(findImport({ kind: "loading" }, 3)).toEqual({ kind: "loading" });
    expect(findImport({ kind: "error", message: "No connection" }, 3)).toEqual({
      kind: "failed",
      message: "No connection",
    });
  });
});

describe("leaving Rename import (§10 screen 13)", () => {
  it("Save and Cancel go back to the import's page it was opened from", () => {
    expect(leaveRename(5, { fromImport: true })).toEqual({ back: 1 });
  });

  it("opened directly, they replace it with the import's page", () => {
    expect(leaveRename(5, null)).toEqual({ to: "/settings/imports/5" });
    expect(leaveRename(5, {})).toEqual({ to: "/settings/imports/5" });
  });
});

describe("renaming an import (§10 Rename import)", () => {
  it("is a change only when the trimmed text differs from the name", () => {
    expect(nameChange("Lesson 4", "  Lesson 4 ")).toBeUndefined();
    expect(nameChange(null, "   ")).toBeUndefined();
    expect(nameChange("Lesson 4", "Lesson 5 ")).toBe("Lesson 5");
    expect(nameChange(null, "Lesson 5")).toBe("Lesson 5");
  });

  it("an emptied field clears the name", () => {
    expect(nameChange("Lesson 4", "")).toBeNull();
    expect(nameChange("Lesson 4", "  ")).toBeNull();
  });
});
