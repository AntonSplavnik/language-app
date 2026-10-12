// Answers are sent as soon as they are given; when a request fails they wait here, in order, and
// are retried every few seconds and whenever the connection comes back (§8.4). The queue lives in
// memory: leaving the page loses only answers that never reached the server.

export type ResultQueue<T> = {
  push: (item: T) => void;
  /** Tries to send everything now; true when nothing is left waiting. */
  drain: () => Promise<boolean>;
  size: () => number;
  dispose: () => void;
};

type Options<T> = {
  retryMs?: number;
  /** False for errors that will never succeed (e.g. the word was deleted); the item is dropped. */
  isRetryable?: (error: unknown) => boolean;
  onDrop?: (item: T, error: unknown) => void;
  /** Calls back when the device is online again; returns an unsubscribe function. */
  subscribeOnline?: (callback: () => void) => () => void;
};

const browserOnline = (callback: () => void) => {
  window.addEventListener("online", callback);
  return () => window.removeEventListener("online", callback);
};

export function createResultQueue<T>(
  send: (item: T) => Promise<void>,
  {
    retryMs = 5000,
    isRetryable = () => true,
    onDrop,
    subscribeOnline = browserOnline,
  }: Options<T> = {},
): ResultQueue<T> {
  const waiting: T[] = [];
  let sending: Promise<void> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleRetry = () => {
    retryTimer ??= setTimeout(() => {
      retryTimer = null;
      void flush();
    }, retryMs);
  };

  async function sendAll() {
    while (waiting.length > 0) {
      const item = waiting[0] as T;
      try {
        await send(item);
        waiting.shift();
      } catch (error) {
        if (isRetryable(error)) {
          scheduleRetry();
          return;
        }
        waiting.shift();
        onDrop?.(item, error);
      }
    }
  }

  function flush(): Promise<void> {
    sending ??= sendAll().finally(() => {
      sending = null;
    });
    return sending;
  }

  const unsubscribe = subscribeOnline(() => void flush());

  return {
    push(item) {
      waiting.push(item);
      void flush();
    },
    async drain() {
      await flush();
      return waiting.length === 0;
    },
    size: () => waiting.length,
    dispose() {
      unsubscribe();
      if (retryTimer) clearTimeout(retryTimer);
    },
  };
}
