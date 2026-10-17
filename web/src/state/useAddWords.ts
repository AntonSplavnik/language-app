import { useCallback, useRef, useState } from "react";
import { type AddWordsState, loadState, saveState } from "./addWords";

/**
 * Add words' and Confirm word's state, kept in the tab (§6.7). A change is written at once, so a
 * screen can navigate right after changing it and the next screen reads the new state.
 */
export function useAddWords() {
  const [state, setState] = useState<AddWordsState>(loadState);
  const latest = useRef(state);

  const update = useCallback((change: (current: AddWordsState) => AddWordsState) => {
    const next = change(latest.current);
    latest.current = next;
    saveState(next);
    setState(next);
  }, []);

  return [state, update] as const;
}
