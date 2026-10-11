import { describe, expect, it } from "vitest";
import {
  canReview,
  initialPhotos,
  isBusy,
  nextToPrepare,
  nextToRead,
  type PhotoAction,
  type PhotosState,
  photosReducer,
} from "../src/state/importPhotos";

const file = new Blob(["x"], { type: "image/jpeg" });
const jpeg = new Blob(["y"], { type: "image/jpeg" });

const run = (...actions: PhotoAction[]): PhotosState =>
  actions.reduce(photosReducer, initialPhotos);
const added = (...ids: string[]): PhotoAction => ({
  type: "added",
  photos: ids.map((id) => ({ id, file })),
});
const prepared = (id: string): PhotoAction => ({
  type: "prepared",
  id,
  jpeg,
  previewUrl: `blob:${id}`,
});
const status = (state: PhotosState) => state.photos.map((p) => `${p.id}:${p.status}`);

describe("photo queue (§6.2, §10 Import)", () => {
  it("new photos wait to be prepared, one at a time", () => {
    const state = run(added("a", "b"));
    expect(status(state)).toEqual(["a:queued", "b:queued"]);
    expect(nextToPrepare(state)?.id).toBe("a");

    const preparing = photosReducer(state, { type: "preparing", id: "a" });
    expect(nextToPrepare(preparing)).toBeUndefined();
  });

  it("prepared photos are read, at most two at a time", () => {
    let state = run(added("a", "b", "c"), prepared("a"), prepared("b"), prepared("c"));
    expect(nextToRead(state)?.id).toBe("a");
    state = run(
      added("a", "b", "c"),
      prepared("a"),
      prepared("b"),
      prepared("c"),
      { type: "reading", id: "a" },
      { type: "reading", id: "b" },
    );
    expect(nextToRead(state)).toBeUndefined();
    state = photosReducer(state, { type: "read", id: "a", pageQuality: "ok", wordsFound: 40 });
    expect(nextToRead(state)?.id).toBe("c");
  });

  it("a page read as poor is kept, with its words, but flagged", () => {
    const state = run(
      added("a"),
      prepared("a"),
      { type: "reading", id: "a" },
      {
        type: "read",
        id: "a",
        pageQuality: "poor",
        wordsFound: 3,
      },
    );
    expect(state.photos[0]).toMatchObject({ status: "poor", wordsFound: 3 });
  });

  it("a retryable failure goes back to the queue; it keeps its prepared JPEG", () => {
    const failed = run(
      added("a"),
      prepared("a"),
      { type: "reading", id: "a" },
      {
        type: "failed",
        id: "a",
        message: "AI is busy, try again",
        retryable: true,
      },
    );
    expect(failed.photos[0]).toMatchObject({ status: "failed", error: { retryable: true } });

    const retried = photosReducer(failed, { type: "retry", id: "a" });
    expect(retried.photos[0]).toMatchObject({ status: "ready", jpeg, error: undefined });
    expect(nextToRead(retried)?.id).toBe("a");
  });

  it("a photo that failed before it was prepared is prepared again on retry", () => {
    const failed = run(
      added("a"),
      { type: "preparing", id: "a" },
      {
        type: "failed",
        id: "a",
        message: "Couldn't open this image",
        retryable: false,
      },
    );
    expect(photosReducer(failed, { type: "retry", id: "a" }).photos[0]?.status).toBe("queued");
  });

  it("photos can be removed before upload or after a failure, but not once read", () => {
    let state = run(
      added("a", "b", "c"),
      prepared("b"),
      prepared("c"),
      { type: "reading", id: "c" },
      {
        type: "read",
        id: "c",
        pageQuality: "ok",
        wordsFound: 10,
      },
    );
    state = photosReducer(state, { type: "removed", id: "a" });
    state = photosReducer(state, { type: "removed", id: "b" });
    state = photosReducer(state, { type: "removed", id: "c" });
    expect(status(state)).toEqual(["c:done"]);
  });

  it("review is possible once a photo is read and nothing is in progress", () => {
    expect(canReview(initialPhotos, 0)).toBe(false);
    // Photos read in an earlier visit count too.
    expect(canReview(initialPhotos, 2)).toBe(true);

    const reading = run(added("a"), prepared("a"), { type: "reading", id: "a" });
    expect(isBusy(reading)).toBe(true);
    expect(canReview(reading, 1)).toBe(false);

    const failedOnly = run(added("a"), { type: "failed", id: "a", message: "x", retryable: true });
    expect(isBusy(failedOnly)).toBe(false);
    expect(canReview(failedOnly, 0)).toBe(false);
    expect(canReview(failedOnly, 1)).toBe(true);
  });
});
