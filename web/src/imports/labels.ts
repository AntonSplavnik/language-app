import type { ImportSummary } from "@language-app/core";
import { dateText, dayKey, timeText } from "../lib/dates";
import type { PastImports } from "./usePastImports";

/** A past import with how screens show it (§10, import labels). */
export type LabelledImport = ImportSummary & {
  /** Its name; without one the day it was completed, plus the time when that is not enough. */
  label: string;
  /** The day it was completed: "13 Oct", with the year when it isn't this year. */
  day: string;
};

/**
 * Labels for a list of past imports (Practice setup, My words, Settings): the name, or without one
 * the day the import was completed. When several unnamed imports share a day, each of them also
 * shows its time ("11 Oct, 14:32"). Dates and times are the phone's.
 */
export function labelImports(
  imports: ImportSummary[],
  now: Date = new Date(),
  locale?: string,
): LabelledImport[] {
  const unnamedPerDay = new Map<string, number>();
  for (const item of imports) {
    if (item.name) continue;
    const key = dayKey(new Date(item.completedAt));
    unnamedPerDay.set(key, (unnamedPerDay.get(key) ?? 0) + 1);
  }

  return imports.map((item) => {
    const completed = new Date(item.completedAt);
    const day = dateText(completed, now, locale);
    const sharesDay = (unnamedPerDay.get(dayKey(completed)) ?? 0) > 1;
    const label = item.name || (sharesDay ? `${day}, ${timeText(completed, locale)}` : day);
    return { ...item, label, day };
  });
}

const wordsText = (count: number) => `${count} ${count === 1 ? "word" : "words"}`;

/** Imports' grey line under a label: the day when the label is a name, and the words. */
export function importSubline(item: LabelledImport): string {
  const words = wordsText(item.wordCount);
  return item.name ? `${item.day} · ${words}` : words;
}

/** The muted line under an import's title on its page: "9 words · added 13 Oct". */
export const importFacts = (item: LabelledImport) =>
  `${wordsText(item.wordCount)} · added ${item.day}`;

/** Settings' Imports row: the number of past imports, nothing while there are none. */
export const importsStatus = (state: PastImports): string | null =>
  state.kind === "ready" && state.imports.length > 0 ? String(state.imports.length) : null;

/** One past import as its page and Rename import hold it while the list loads. */
export type PastImport =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "missing" }
  | { kind: "ready"; item: LabelledImport };

/**
 * Finds an import among the past imports, labelled among all of them (so an unnamed one that
 * shares its day shows its time). One that isn't listed (any more, or a mistyped id) is missing.
 */
export function findImport(
  state: PastImports,
  id: number,
  now: Date = new Date(),
  locale?: string,
): PastImport {
  if (state.kind === "loading") return { kind: "loading" };
  if (state.kind === "error") return { kind: "failed", message: state.message };
  const item = labelImports(state.imports, now, locale).find((each) => each.id === id);
  return item ? { kind: "ready", item } : { kind: "missing" };
}

/**
 * What saving the typed text would change: the new name, null to clear it (an emptied field), or
 * undefined when the trimmed text is the name already.
 */
export function nameChange(current: string | null, typed: string): string | null | undefined {
  const next = typed.trim() || null;
  return next === current ? undefined : next;
}
