import type { CardResult } from "@language-app/core";

/** Pixels a card must travel to count as a swipe. */
export const SWIPE_DISTANCE = 100;
/** A quick flick (px/ms in the drag direction) counts after only {@link FLICK_DISTANCE} px. */
export const FLICK_VELOCITY = 0.5;
export const FLICK_DISTANCE = 24;

/**
 * What a released drag means (§8.3): right is "knew", left "didn't know", up "skip"; anything
 * else snaps the card back. The larger of the two movements decides the direction. Velocities are
 * signed, in px/ms.
 */
export function decideSwipe({
  dx,
  dy,
  vx,
  vy,
}: {
  dx: number;
  dy: number;
  vx: number;
  vy: number;
}): CardResult | null {
  const far = (move: number) => Math.abs(move) > SWIPE_DISTANCE;
  const flicked = (move: number, velocity: number) =>
    Math.abs(move) > FLICK_DISTANCE &&
    Math.sign(velocity) === Math.sign(move) &&
    Math.abs(velocity) > FLICK_VELOCITY;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (!far(dx) && !flicked(dx, vx)) return null;
    return dx > 0 ? "knew" : "didnt_know";
  }
  if (dy < 0 && (far(dy) || flicked(dy, vy))) return "skipped";
  return null;
}
