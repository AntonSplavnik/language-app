import { closePdf, type PdfDocument } from "../device/pdf";
import type { PageRange, PdfPage } from "./pdfPages";

// The PDF open in this tab and the pages handed from PDF pages to Import (§10 screens 16 → 2).
// Both live in memory only: a pdf.js document can't go into the history or storage, and a reload
// simply starts over (the book itself is remembered in IndexedDB, device/bookStore.ts).

/** The book open in this tab, kept while the learner goes between PDF pages and Import. */
export type OpenBook = {
  name: string;
  size: number;
  doc: PdfDocument;
  /** The pages last imported from it, as PDF page numbers. */
  lastRange: PageRange | null;
};

let openBook: OpenBook | null = null;

export const currentBook = (): OpenBook | null => openBook;

/** Makes `book` the open one, closing the one before. */
export function setCurrentBook(book: OpenBook | null): void {
  if (openBook && openBook !== book) closePdf(openBook.doc);
  openBook = book;
}

/** Pages on their way to Import, with the import's name (typed, or "Pages 42–45"). */
export type PdfImport = { id: number; book: OpenBook; pages: PdfPage[]; name: string };

let pending: PdfImport | null = null;
let lastId = 0;

/** Hands pages to Import; the id goes into the navigation's state. */
export function handOver(book: OpenBook, pages: PdfPage[], name: string): number {
  pending = { id: ++lastId, book, pages, name };
  return pending.id;
}

/** The pages handed over under this id, if they are still in memory. */
export const handedOver = (id: unknown): PdfImport | null =>
  pending && pending.id === id ? pending : null;
