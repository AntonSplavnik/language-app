import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { BOOK_DB, createBookStore } from "../src/device/bookStore";

const pdf = (name: string, text = "%PDF-1.7 a book") =>
  new File([text], name, { type: "application/pdf" });

/** Writes a record straight into the store, as an older or damaged version might have left it. */
async function putRaw(factory: IDBFactory, record: unknown) {
  // Let the store create its database first.
  await createBookStore(factory).load();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(BOOK_DB.name, BOOK_DB.version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BOOK_DB.store, "readwrite");
    tx.objectStore(BOOK_DB.store).put(record, BOOK_DB.key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

describe("the remembered book (§6.8)", () => {
  it("is remembered with its name, and nothing imported from it yet", async () => {
    const store = createBookStore(new IDBFactory());
    expect(await store.load()).toBeNull();

    expect(await store.remember(pdf("Menschen A1.pdf"))).toBe(true);
    const book = await store.load();
    expect(book).toMatchObject({ name: "Menschen A1.pdf", size: 15, lastRange: null });
    expect(await book?.file.text()).toBe("%PDF-1.7 a book");
  });

  it("keeps the last range imported from it", async () => {
    const store = createBookStore(new IDBFactory());
    const file = pdf("Menschen A1.pdf");
    await store.remember(file);
    await store.setLastRange(file, { from: 42, to: 45 });
    expect((await store.load())?.lastRange).toEqual({ from: 42, to: 45 });
  });

  it("is one book at a time: another PDF replaces it, with no range", async () => {
    const store = createBookStore(new IDBFactory());
    const first = pdf("Menschen A1.pdf");
    await store.remember(first);
    await store.setLastRange(first, { from: 42, to: 45 });

    await store.remember(pdf("Schritte plus 2.pdf", "%PDF-1.4 another book"));
    expect(await store.load()).toMatchObject({ name: "Schritte plus 2.pdf", lastRange: null });

    // A range from the replaced book changes nothing.
    await store.setLastRange(first, { from: 46, to: 49 });
    expect((await store.load())?.lastRange).toBeNull();
  });

  it("keeps its range when the same PDF is chosen again", async () => {
    const store = createBookStore(new IDBFactory());
    const file = pdf("Menschen A1.pdf");
    await store.remember(file, { from: 42, to: 45 });
    expect((await store.load())?.lastRange).toEqual({ from: 42, to: 45 });
  });

  it("is forgotten when asked", async () => {
    const store = createBookStore(new IDBFactory());
    await store.remember(pdf("Menschen A1.pdf"));
    await store.forget();
    expect(await store.load()).toBeNull();
  });

  it("is forgotten when its entry is broken", async () => {
    const factory = new IDBFactory();
    await putRaw(factory, { name: "Menschen A1.pdf", size: 15, lastRange: null }); // no file
    const store = createBookStore(factory);
    expect(await store.load()).toBeNull();

    // Gone for good, not just skipped.
    await putRaw(factory, { name: "Menschen A1.pdf", size: 15, file: "not a blob" });
    expect(await store.load()).toBeNull();
    const raw = await new Promise<unknown>((resolve) => {
      const request = factory.open(BOOK_DB.name, BOOK_DB.version);
      request.onsuccess = () => {
        const get = request.result
          .transaction(BOOK_DB.store)
          .objectStore(BOOK_DB.store)
          .get(BOOK_DB.key);
        get.onsuccess = () => resolve(get.result);
      };
    });
    expect(raw).toBeUndefined();
  });

  it("works without storage: nothing is remembered, nothing fails", async () => {
    for (const store of [
      createBookStore(undefined),
      createBookStore({
        open: () => {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
      } as unknown as IDBFactory),
    ]) {
      const file = pdf("Menschen A1.pdf");
      expect(await store.remember(file)).toBe(false);
      await expect(store.setLastRange(file, { from: 1, to: 2 })).resolves.toBeUndefined();
      expect(await store.load()).toBeNull();
      await expect(store.forget()).resolves.toBeUndefined();
    }
  });
});
