// Dates as the phone shows them (§10): its time zone and, unless a locale is given, its language.

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Calendar days from `date` back to `now`: 0 the same day, 1 the day before. */
export function daysBefore(date: Date, now: Date): number {
  // Rounded, because a day with a clock change is 23 or 25 hours long.
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
}

/** The same calendar day, as a key: dates on one day share it. */
export const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** "13 Oct", with the year when it isn't this year ("13 Oct 2025"). */
export function dateText(date: Date, now: Date, locale?: string): string {
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/** "14:32", or however the phone writes a short time ("2:32 PM"). */
export const timeText = (date: Date, locale?: string) =>
  date.toLocaleTimeString(locale, { timeStyle: "short" });
