/** The part of an `<audio>` element the player uses. */
export interface AudioElement {
  play(): Promise<void>;
  pause(): void;
  addEventListener(
    type: "ended" | "error",
    listener: () => void,
    options?: { once?: boolean },
  ): void;
}

export class PlaybackError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Couldn't play the recording", options);
    this.name = "PlaybackError";
  }
}

export type Player = {
  /**
   * Plays a recording, stopping the one playing. Resolves when it has finished or was stopped;
   * rejects with a `PlaybackError` when it can't be loaded or the browser refuses to play it.
   * Call it straight from a tap handler: iOS Safari only starts sound in response to a gesture.
   */
  play: (url: string) => Promise<void>;
  /** Stops the recording that is playing, if any. */
  stop: () => void;
};

/** A player that plays one sound at a time; `load` makes the element for a URL. */
export function createPlayer(load: (url: string) => AudioElement): Player {
  let current: { audio: AudioElement; finish: () => void } | null = null;

  const stop = () => {
    const playing = current;
    current = null;
    playing?.audio.pause();
    playing?.finish();
  };

  const play = (url: string) => {
    stop();
    const audio = load(url);
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (error?: unknown) => {
        if (settled) return;
        settled = true;
        if (current?.audio === audio) current = null;
        if (error === undefined) resolve();
        else reject(new PlaybackError({ cause: error }));
      };
      current = { audio, finish: () => settle() };
      audio.addEventListener("ended", () => settle(), { once: true });
      audio.addEventListener("error", () => settle(new Error("load failed")), { once: true });
      // Rejected when the browser refuses (no gesture, unsupported format) and, after a stop,
      // because pause() interrupted it; `settled` turns the latter into nothing.
      audio.play().catch((error: unknown) => settle(error ?? new Error("play refused")));
    });
  };

  return { play, stop };
}

/**
 * Word recordings (§8.2, §10 Word detail): streamed from Wikimedia Commons when played, never
 * stored. Plain `HTMLAudioElement`, which plays https audio on a plain-HTTP page too.
 *
 * Device-specific: a phone app replaces this file.
 */
const player = createPlayer((url) => new Audio(url));
export const playAudio = player.play;
export const stopAudio = player.stop;
