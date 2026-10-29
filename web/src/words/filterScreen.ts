// The Filter screen's sections (docs/design.md §10 Filter).

/** The imports shown before "All 23 imports" when there are more than one more than these. */
export const IMPORTS_FIRST = 5;

/**
 * The Imports section's rows: every import when there are at most 6; otherwise the 5 newest and
 * `more`, the number for the row that shows the rest in place ("All 23 imports"). Open from the
 * start when the chosen import is not among the 5.
 */
export function importRows<T extends { id: number }>(
  imports: T[],
  chosenId: number | null,
  expanded: boolean,
): { rows: T[]; more: number | null } {
  const first = imports.slice(0, IMPORTS_FIRST);
  const chosenHidden = chosenId !== null && !first.some((item) => item.id === chosenId);
  if (imports.length <= IMPORTS_FIRST + 1 || expanded || chosenHidden) {
    return { rows: imports, more: null };
  }
  return { rows: first, more: imports.length };
}
