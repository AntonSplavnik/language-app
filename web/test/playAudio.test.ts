import { describe, expect, it } from "vitest";
import { createPlayer, PlaybackError } from "../src/device/playAudio";

/** A stand-in for an <audio> element: plays on request, then ends or fails when told to. */
class FakeAudio extends EventTarget {
  paused = true;
  private start = { reject: (_error: Error) => {} };
  /** What play() returns: browsers settle it once playback has started or was refused. */
  private readonly started = new Promise<void>((_resolve, reject) => {
    this.start = { reject };
  });

  constructor(readonly url: string) {
    super();
  }
  play() {
    this.paused = false;
    return this.started;
  }
  pause() {
    this.paused = true;
  }
  end() {
    this.dispatchEvent(new Event("ended"));
  }
  fail() {
    this.dispatchEvent(new Event("error"));
  }
  /** NotAllowedError: no user gesture. AbortError: pause() interrupted the start. */
  refuse(name: "NotAllowedError" | "AbortError") {
    this.start.reject(new DOMException(name, name));
  }
}

function setup() {
  const loaded: FakeAudio[] = [];
  const player = createPlayer((url) => {
    const audio = new FakeAudio(url);
    loaded.push(audio);
    return audio;
  });
  return { player, loaded };
}

/** Whether a promise has settled, without waiting for it. */
async function state(promise: Promise<void>): Promise<"pending" | "resolved" | "rejected"> {
  const pending = Symbol();
  const result = await Promise.race([
    promise.then(
      () => "resolved" as const,
      () => "rejected" as const,
    ),
    new Promise<typeof pending>((resolve) => setTimeout(() => resolve(pending), 0)),
  ]);
  return result === pending ? "pending" : result;
}

describe("playAudio (§8.2, §10 Word detail)", () => {
  it("plays the recording and resolves once it has finished", async () => {
    const { player, loaded } = setup();
    const playing = player.play("https://upload.wikimedia.org/De-Tisch2.ogg.mp3");

    expect(loaded.map((a) => [a.url, a.paused])).toEqual([
      ["https://upload.wikimedia.org/De-Tisch2.ogg.mp3", false],
    ]);
    expect(await state(playing)).toBe("pending");
    loaded[0]?.end();
    expect(await state(playing)).toBe("resolved");
  });

  it("rejects with a message for the learner when the recording can't be loaded", async () => {
    const { player, loaded } = setup();
    const playing = player.play("https://upload.wikimedia.org/missing.mp3");
    loaded[0]?.fail();
    await expect(playing).rejects.toThrow(new PlaybackError());
    expect(new PlaybackError().message).toBe("Couldn't play the recording");
  });

  it("rejects when the browser refuses to play", async () => {
    const { player, loaded } = setup();
    const playing = player.play("https://upload.wikimedia.org/a.mp3");
    loaded[0]?.refuse("NotAllowedError");
    await expect(playing).rejects.toBeInstanceOf(PlaybackError);
  });

  it("plays one sound at a time: a new one stops the one playing", async () => {
    const { player, loaded } = setup();
    const first = player.play("https://upload.wikimedia.org/a.mp3");
    const second = player.play("https://upload.wikimedia.org/b.mp3");

    expect(loaded.map((a) => a.paused)).toEqual([true, false]);
    expect(await state(first)).toBe("resolved");
    expect(await state(second)).toBe("pending");
    loaded[1]?.end();
    expect(await state(second)).toBe("resolved");
  });

  it("stop() ends the sound that is playing; an interrupted start is not an error", async () => {
    const { player, loaded } = setup();
    player.stop(); // nothing playing: nothing happens

    const playing = player.play("https://upload.wikimedia.org/a.mp3");
    player.stop();
    loaded[0]?.refuse("AbortError");
    loaded[0]?.fail();

    expect(loaded[0]?.paused).toBe(true);
    expect(await state(playing)).toBe("resolved");
  });
});
