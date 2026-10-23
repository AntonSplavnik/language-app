// Choosing pages of a PDF (§6.8, §10 screen 16): page labels, the range, its automatic name and
// the pages suggested next. Pages are counted from 1 as in the PDF; a label is the number printed
// in the book when the PDF carries page labels, else the PDF's own number.

/** At most this many pages per import (§6.8). */
export const PDF_PAGES_MAX = 10;

/** What the range needs to know about a book. `labels` is null when the PDF has none. */
export type BookPages = { pageCount: number; labels: string[] | null };

/** One page of an import: its number in the PDF and the label the learner sees. */
export type PdfPage = { number: number; label: string };

/** A range of PDF page numbers, From–To. */
export type PageRange = { from: number; to: number };

/**
 * The PDF's page labels (pdf.js `getPageLabels`) when they say something: none when the PDF has
 * none, when they don't cover every page, or when they only repeat the PDF's own numbers.
 */
export function pageLabels(labels: string[] | null, pageCount: number): string[] | null {
  if (!labels || labels.length !== pageCount) return null;
  const trimmed = labels.map((label) => label.trim());
  return trimmed.every((label, i) => label === String(i + 1)) ? null : trimmed;
}

/** The label the learner sees for a page; a page without one shows its number. */
export const pageLabel = (book: BookPages, pageNumber: number): string =>
  book.labels?.[pageNumber - 1] || String(pageNumber);

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The pages whose label is `text`, in order. Without labels: the number, when it is a page. */
function pagesLabelled(book: BookPages, text: string): number[] {
  if (book.labels) {
    return book.labels.flatMap((label, i) => (label && same(label, text) ? [i + 1] : []));
  }
  const n = /^\d+$/.test(text.trim()) ? Number(text) : Number.NaN;
  return Number.isInteger(n) && n >= 1 && n <= book.pageCount ? [n] : [];
}

const outside = (book: BookPages, text: string) =>
  book.labels
    ? `The book has no page ${text.trim()}`
    : `The book has ${book.pageCount} ${book.pageCount === 1 ? "page" : "pages"}`;

export type RangeCheck = { ok: true; pages: PdfPage[] } | { ok: false; reason: string };

/**
 * The pages From–To as typed (§10 screen 16), or the reason they can't be imported. When a printed
 * number occurs more than once (a course book and its workbook in one PDF), From is the one
 * nearest `near` (the page suggested), and To is looked for from From onwards.
 */
export function checkRange(
  book: BookPages,
  fromText: string,
  toText: string,
  near = 1,
): RangeCheck {
  if (!fromText.trim() || !toText.trim()) {
    return { ok: false, reason: "Enter the first and the last page" };
  }
  const froms = pagesLabelled(book, fromText);
  const from = froms.reduce<number | undefined>(
    (best, n) => (best === undefined || Math.abs(n - near) < Math.abs(best - near) ? n : best),
    undefined,
  );
  if (from === undefined) return { ok: false, reason: outside(book, fromText) };
  const tos = pagesLabelled(book, toText);
  if (tos.length === 0) return { ok: false, reason: outside(book, toText) };
  const to = tos.find((n) => n >= from);
  if (to === undefined) return { ok: false, reason: "From must not be after To" };
  if (to - from + 1 > PDF_PAGES_MAX) {
    return { ok: false, reason: `At most ${PDF_PAGES_MAX} pages at a time` };
  }
  const pages: PdfPage[] = [];
  for (let n = from; n <= to; n++) pages.push({ number: n, label: pageLabel(book, n) });
  return { ok: true, pages };
}

/** "4 pages" under the fields (§10 screen 16). */
export const pagesText = (count: number) => (count === 1 ? "1 page" : `${count} pages`);

/** An import's name when none is typed (§6.8): "Pages 42–45", or "Page 42" for one page. */
export function autoName(pages: PdfPage[]): string {
  const first = pages[0];
  const last = pages.at(-1);
  if (!first || !last) return "";
  return first === last ? `Page ${first.label}` : `Pages ${first.label}–${last.label}`;
}

/**
 * The pages offered next (§6.8): as many as last time, straight after them (46–49 after 42–45),
 * kept inside the book; a new book starts at 1–1.
 */
export function suggestRange(book: BookPages, last: PageRange | null): PageRange {
  if (!last) return { from: 1, to: 1 };
  const from = Math.min(last.to + 1, book.pageCount);
  const size = Math.min(Math.max(last.to - last.from + 1, 1), PDF_PAGES_MAX);
  return { from, to: Math.min(from + size - 1, book.pageCount) };
}

/** The From and To fields for a range, in the book's own numbers. */
export const rangeFields = (book: BookPages, range: PageRange) => ({
  from: pageLabel(book, range.from),
  to: pageLabel(book, range.to),
});
