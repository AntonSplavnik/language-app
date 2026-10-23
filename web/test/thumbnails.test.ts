import { describe, expect, it } from "vitest";
import { ThumbnailQueue } from "../src/imports/thumbnails";

/** A renderer whose pages finish when the test says so. */
function fakeRenderer() {
  const started: number[] = [];
  const cancelled: number[] = [];
  const pending = new Map<number, { resolve: (url: string) => void; reject: (e: Error) => void }>();
  const released: string[] = [];
  let changes = 0;
  const queue = new ThumbnailQueue(
    (page, signal) =>
      new Promise<string>((resolve, reject) => {
        started.push(page);
        pending.set(page, { resolve, reject });
        signal.addEventListener("abort", () => {
          cancelled.push(page);
          reject(new DOMException("Cancelled", "AbortError"));
        });
      }),
    () => changes++,
    (url) => released.push(url),
  );
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return {
    queue,
    started,
    cancelled,
    released,
    changes: () => changes,
    async finish(page: number) {
      pending.get(page)?.resolve(`blob:${page}`);
      await tick();
    },
    async fail(page: number) {
      pending.get(page)?.reject(new Error("Couldn't render this page"));
      await tick();
    },
    tick,
  };
}

describe("thumbnails on PDF pages (§10 screen 16)", () => {
  it("are drawn one at a time, in order", async () => {
    const r = fakeRenderer();
    r.queue.want([42, 43, 44]);
    await r.tick();
    expect(r.started).toEqual([42]);

    await r.finish(42);
    expect(r.queue.url(42)).toBe("blob:42");
    expect(r.started).toEqual([42, 43]);
    await r.finish(43);
    await r.finish(44);
    expect(r.started).toEqual([42, 43, 44]);
    expect(r.changes()).toBe(3);
  });

  it("cancel a page no longer chosen, and go on with the new pages", async () => {
    const r = fakeRenderer();
    r.queue.want([42, 43]);
    await r.tick();
    r.queue.want([50, 51]);
    await r.tick();
    expect(r.cancelled).toEqual([42]);
    expect(r.started).toEqual([42, 50]);
  });

  it("finish a page that is still chosen when the range changes", async () => {
    const r = fakeRenderer();
    r.queue.want([42, 43]);
    await r.tick();
    r.queue.want([41, 42]);
    await r.tick();
    expect(r.cancelled).toEqual([]);
    await r.finish(42);
    expect(r.started).toEqual([42, 41]);
  });

  it("are drawn once: a page drawn earlier is shown again at once", async () => {
    const r = fakeRenderer();
    r.queue.want([42]);
    await r.finish(42);
    r.queue.want([43]);
    await r.finish(43);
    r.queue.want([42, 43]);
    await r.tick();
    expect(r.started).toEqual([42, 43]);
    expect(r.queue.url(42)).toBe("blob:42");
  });

  it("leave a page that can't be drawn as a placeholder, without trying it again", async () => {
    const r = fakeRenderer();
    r.queue.want([42, 43]);
    await r.fail(42);
    expect(r.queue.url(42)).toBeUndefined();
    expect(r.queue.failedToDraw(42)).toBe(true);
    expect(r.queue.failedToDraw(43)).toBe(false);
    expect(r.started).toEqual([42, 43]);
    r.queue.want([42, 43]);
    await r.finish(43);
    expect(r.started).toEqual([42, 43]);
  });

  it("are all released when the screen closes, and nothing more is drawn", async () => {
    const r = fakeRenderer();
    r.queue.want([42, 43]);
    await r.finish(42);
    r.queue.close();
    await r.tick();
    expect(r.cancelled).toEqual([43]);
    expect(r.released).toEqual(["blob:42"]);
    r.queue.want([44]);
    await r.tick();
    expect(r.started).toEqual([42, 43]);
  });
});
