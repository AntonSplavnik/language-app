import { describe, expect, it } from "vitest";
import { decideSwipe, SWIPE_DISTANCE } from "../src/practice/swipe";

const still = { vx: 0, vy: 0 };

describe("decideSwipe (§8.3)", () => {
  it("a long enough swipe right is 'knew', left is 'didn't know', up is 'skip'", () => {
    expect(decideSwipe({ dx: SWIPE_DISTANCE + 1, dy: 10, ...still })).toBe("knew");
    expect(decideSwipe({ dx: -(SWIPE_DISTANCE + 1), dy: -10, ...still })).toBe("didnt_know");
    expect(decideSwipe({ dx: 10, dy: -(SWIPE_DISTANCE + 1), ...still })).toBe("skipped");
  });

  it("a short, slow swipe snaps back", () => {
    expect(decideSwipe({ dx: 60, dy: 0, ...still })).toBeNull();
    expect(decideSwipe({ dx: 0, dy: -60, ...still })).toBeNull();
  });

  it("a short but fast flick counts", () => {
    expect(decideSwipe({ dx: 40, dy: 5, vx: 0.8, vy: 0 })).toBe("knew");
    expect(decideSwipe({ dx: -40, dy: 5, vx: -0.8, vy: 0 })).toBe("didnt_know");
    expect(decideSwipe({ dx: 5, dy: -40, vx: 0, vy: -0.8 })).toBe("skipped");
  });

  it("a flick against the drag direction or a tiny jitter does not count", () => {
    expect(decideSwipe({ dx: 40, dy: 0, vx: -0.8, vy: 0 })).toBeNull();
    expect(decideSwipe({ dx: 8, dy: 0, vx: 2, vy: 0 })).toBeNull();
  });

  it("the main direction decides: mostly sideways is never a skip", () => {
    expect(decideSwipe({ dx: 150, dy: -120, ...still })).toBe("knew");
    expect(decideSwipe({ dx: 90, dy: -130, ...still })).toBe("skipped");
  });

  it("swiping down does nothing", () => {
    expect(decideSwipe({ dx: 0, dy: 200, vx: 0, vy: 2 })).toBeNull();
  });
});
