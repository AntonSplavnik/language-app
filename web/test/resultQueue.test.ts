import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createResultQueue } from "../src/practice/resultQueue";

/** A send function whose next calls fail or succeed on demand; records what got through. */
function fakeSend() {
  const sent: number[] = [];
  let failing = false;
  return {
    sent,
    fail: (on: boolean) => {
      failing = on;
    },
    send: async (item: number) => {
      if (failing) throw new TypeError("Failed to fetch");
      sent.push(item);
    },
  };
}

/** A stand-in for the browser's "online" event. */
function onlineEvents() {
  let listener: (() => void) | null = null;
  return {
    subscribe: (cb: () => void) => {
      listener = cb;
      return () => {
        listener = null;
      };
    },
    fire: () => listener?.(),
  };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

describe("result queue (§8.4)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends each answer right away, in order", async () => {
    const api = fakeSend();
    const queue = createResultQueue(api.send, { subscribeOnline: onlineEvents().subscribe });
    queue.push(1);
    queue.push(2);
    queue.push(3);
    await settle();
    expect(api.sent).toEqual([1, 2, 3]);
    expect(queue.size()).toBe(0);
  });

  it("keeps answers while offline and retries every few seconds, in order", async () => {
    const api = fakeSend();
    const queue = createResultQueue(api.send, {
      retryMs: 5000,
      subscribeOnline: onlineEvents().subscribe,
    });
    api.fail(true);
    queue.push(1);
    queue.push(2);
    await settle();
    expect(api.sent).toEqual([]);
    expect(queue.size()).toBe(2);

    await vi.advanceTimersByTimeAsync(5000);
    expect(queue.size()).toBe(2);

    api.fail(false);
    queue.push(3);
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.sent).toEqual([1, 2, 3]);
    expect(queue.size()).toBe(0);
  });

  it("retries as soon as the connection is back", async () => {
    const api = fakeSend();
    const online = onlineEvents();
    const queue = createResultQueue(api.send, {
      retryMs: 60_000,
      subscribeOnline: online.subscribe,
    });
    api.fail(true);
    queue.push(1);
    await settle();

    api.fail(false);
    online.fire();
    await settle();
    expect(api.sent).toEqual([1]);
  });

  it("drops an answer the server rejects for good, and carries on", async () => {
    const dropped: number[] = [];
    const queue = createResultQueue(
      async (item: number) => {
        if (item === 2) throw new Error("Word not found");
      },
      {
        isRetryable: () => false,
        onDrop: (item) => dropped.push(item),
        subscribeOnline: onlineEvents().subscribe,
      },
    );
    queue.push(1);
    queue.push(2);
    queue.push(3);
    await settle();
    expect(dropped).toEqual([2]);
    expect(queue.size()).toBe(0);
  });

  it("drain reports whether everything got through", async () => {
    const api = fakeSend();
    const queue = createResultQueue(api.send, { subscribeOnline: onlineEvents().subscribe });
    api.fail(true);
    queue.push(1);
    expect(await queue.drain()).toBe(false);
    api.fail(false);
    expect(await queue.drain()).toBe(true);
    expect(api.sent).toEqual([1]);
  });
});
