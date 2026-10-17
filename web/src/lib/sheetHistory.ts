import { useCallback } from "react";
import { useNavigate } from "react-router";

/** Go back a number of history entries, or replace the current entry with another screen. */
export type HistoryStep = { back: number } | { to: string; state?: { from: string } };

/**
 * Save and Cancel on a screen that looks like a sheet (Edit word, Rename import, §10) return to
 * the screen it belongs to without adding a history entry: back to that screen when the sheet was
 * opened from it, or (opened directly, e.g. a typed URL) replaced by it. `state` goes with the
 * replacing screen, e.g. the list Word detail's Back returns to.
 */
export function leaveSheet(
  parent: string,
  openedFromParent: boolean,
  state?: { from: string },
): HistoryStep {
  if (openedFromParent) return { back: 1 };
  return state ? { to: parent, state } : { to: parent };
}

/** Takes a history step with the router. */
export function useHistoryStep() {
  const navigate = useNavigate();
  return useCallback(
    (step: HistoryStep) =>
      "back" in step
        ? navigate(-step.back)
        : navigate(step.to, { replace: true, state: step.state }),
    [navigate],
  );
}
