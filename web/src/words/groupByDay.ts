import { dateText, dayKey, daysBefore } from "../lib/dates";

/** A day heading of My words' Newest first view and the words added that day (§10). */
export type DayGroup<T> = { heading: string; words: T[] };

/**
 * Splits the list, already sorted newest first by the server, by the day each word was added:
 * "Today", "Yesterday", then the date ("13 Oct", with the year when it isn't this year), by the
 * phone's clock. A new section starts only where the day changes, so the order is never changed.
 */
export function groupByDay<T extends { addedAt: string }>(
  words: T[],
  now: Date = new Date(),
  locale?: string,
): DayGroup<T>[] {
  const groups: Array<DayGroup<T> & { key: string }> = [];
  for (const word of words) {
    const added = new Date(word.addedAt);
    const key = dayKey(added);
    const last = groups.at(-1);
    if (last?.key === key) last.words.push(word);
    else groups.push({ key, heading: dayHeading(added, now, locale), words: [word] });
  }
  return groups.map(({ heading, words }) => ({ heading, words }));
}

function dayHeading(date: Date, now: Date, locale?: string): string {
  const days = daysBefore(date, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return dateText(date, now, locale);
}
