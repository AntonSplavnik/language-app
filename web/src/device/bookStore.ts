import type { PageRange } from "../imports/pdfPages";

/**
 * The book remembered on this phone (§6.8): the last PDF chosen, kept in the browser's IndexedDB
 * with the range last imported from it, so the next PDF import starts there. One book at a time.
 * Storage can be missing, full or cleared (private browsing; Safari may clear it after 7 days
 * without a visit), so nothing here throws: the import works without it.
 *
 * Device-specific: a phone app replaces this file.
 */
export type StoredBook = {
  /** The file name, e.g. "Menschen A1.pdf". */
  name: string;
  size: number;
  file: Blob;
  /** The pages last imported from it, as PDF page numbers. */
  lastRange: PageRange | null;
};

export type BookStore = {
  /** The remembered book; null when there is none or no storage. A broken entry is forgotten. */
  load(): Promise<StoredBook | null>;
  /**
   * Remembers this PDF in place of any other, with no range imported yet unless one is given (the
   * same PDF chosen again). False when the browser won't store it.
   */
  remember(file: File, lastRange?: PageRange | null): Promise<boolean>;
  /** Records the pages just imported, if `book` (by name and size) is the one remembered. */
  setLastRange(book: { name: string; size: number }, range: PageRange): Promise<void>;
  forget(): Promise<void>;
};

/** Where the book is kept; exported for tests. */
export const BOOK_DB = { name: "german-words", version: 1, store: "book", key: "current" };

const isRange = (value: unknown): value is PageRange =>
  typeof value === "object" &&
  value !== null &&
  Number.isInteger((value as PageRange).from) &&
  Number.isInteger((value as PageRange).to);

/** A stored entry as this version writes it; anything else is broken. */
function asBook(value: unknown): StoredBook | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Partial<StoredBook>;
  if (typeof v.name !== "string" || typeof v.size !== "number") return null;
  if (!(v.file instanceof Blob)) return null;
  return {
    name: v.name,
    size: v.size,
    file: v.file,
    lastRange: isRange(v.lastRange) ? { from: v.lastRange.from, to: v.lastRange.to } : null,
  };
}

export function createBookStore(factory: IDBFactory | undefined): BookStore {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      if (!factory) throw new Error("No IndexedDB");
      const request = factory.open(BOOK_DB.name, BOOK_DB.version);
      request.onupgradeneeded = () => request.result.createObjectStore(BOOK_DB.store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("IndexedDB is blocked"));
    });

  /** Runs one request in its own transaction; resolves when the transaction is complete. */
  async function run<T>(
    mode: IDBTransactionMode,
    request: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(BOOK_DB.store, mode);
        const req = request(tx.objectStore(BOOK_DB.store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      });
    } finally {
      db.close();
    }
  }

  const read = () => run<unknown>("readonly", (store) => store.get(BOOK_DB.key));
  const write = (book: StoredBook) => run("readwrite", (store) => store.put(book, BOOK_DB.key));

  async function forget() {
    try {
      await run("readwrite", (store) => store.delete(BOOK_DB.key));
    } catch {
      // Nothing stored, or no storage.
    }
  }

  return {
    async load() {
      let value: unknown;
      try {
        value = await read();
      } catch {
        return null;
      }
      if (value === undefined) return null;
      const book = asBook(value);
      if (!book) await forget();
      return book;
    },

    async remember(file, lastRange = null) {
      try {
        await write({ name: file.name, size: file.size, file, lastRange });
        return true;
      } catch {
        return false;
      }
    },

    async setLastRange(book, range) {
      try {
        const stored = asBook(await read());
        if (!stored || stored.name !== book.name || stored.size !== book.size) return;
        await write({ ...stored, lastRange: { from: range.from, to: range.to } });
      } catch {
        // The range is a convenience; the import has happened anyway.
      }
    },

    forget,
  };
}

/** The browser's store; without IndexedDB nothing is remembered. */
export const bookStore = createBookStore(typeof indexedDB === "undefined" ? undefined : indexedDB);
