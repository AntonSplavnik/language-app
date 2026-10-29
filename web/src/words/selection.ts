import { useSyncExternalStore } from "react";

// My words' selection mode (docs/design.md §10 My words): the words selected for Add to group or
// Remove from group. It lives in memory, not the URL, and is kept across My words, Filter and Add
// to group until Cancel, Add or Remove ends it; a reload, or any other screen, ends it.

export type Selection = { active: boolean; ids: ReadonlySet<number> };

const NONE: Selection = { active: false, ids: new Set() };
let current: Selection = NONE;
const listeners = new Set<() => void>();

function set(next: Selection): void {
  current = next;
  for (const listener of listeners) listener();
}

export const getSelection = (): Selection => current;

/** Select: an empty selection, shown. */
export const startSelecting = () => set({ active: true, ids: new Set() });

export const setSelected = (ids: ReadonlySet<number>) => set({ active: true, ids });

/**
 * Changes the selection from what it is now, not from what a screen last drew, so taps quicker
 * than a render all count.
 */
export const updateSelected = (change: (ids: ReadonlySet<number>) => ReadonlySet<number>) =>
  setSelected(change(current.ids));

/** Cancel, Add, Remove, or leaving for another screen. */
export const clearSelection = () => {
  if (current !== NONE) set(NONE);
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The selection, kept up to date. */
export const useSelection = (): Selection => useSyncExternalStore(subscribe, getSelection);

/** The screens selection mode goes across; on any other it ends. */
export const keepsSelection = (pathname: string) =>
  pathname === "/words" || pathname === "/words/filter" || pathname === "/words/add-to-group";

/** A tap on a word: selected, or unselected again. */
export function toggle(ids: ReadonlySet<number>, id: number): Set<number> {
  const next = new Set(ids);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** Whether every word of the list shown is selected (Select all then reads Deselect all). */
export const allSelected = (ids: ReadonlySet<number>, shown: number[]) =>
  shown.length > 0 && shown.every((id) => ids.has(id));

/**
 * Select all: adds every word of the list shown (its tab, filter and search). Once all of them
 * are selected it is Deselect all, which takes out only those; words selected elsewhere stay.
 */
export function selectAll(ids: ReadonlySet<number>, shown: number[]): Set<number> {
  const next = new Set(ids);
  if (allSelected(ids, shown)) for (const id of shown) next.delete(id);
  else for (const id of shown) next.add(id);
  return next;
}
