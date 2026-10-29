import { type ReactNode, useId } from "react";
import ui from "../styles/ui.module.css";
import styles from "./CheckList.module.css";
import { CheckIcon, ChevronDownIcon, PlusIcon } from "./icons";

type CheckListProps = {
  /** The small uppercase label at the top: "Themes". Left out for a card of rows alone. */
  label?: string;
  /** A short line under the label ("Loading…" while its rows load). */
  help?: ReactNode;
  /** At the right of the label, e.g. Use suggested, Edit: a pill with `checkListAction`. */
  action?: ReactNode;
  /** CheckRows (or MoreRow, AddRow); none while they load. */
  children?: ReactNode;
};

/** The action pill at the right of a CheckList's label (Use suggested, Edit). */
export const checkListAction = `${ui.pill} ${ui.pillSecondary} ${styles.action}`;

/**
 * A card of rows that each toggle a check (§10 Edit word's Themes card, the Filter screen's
 * sections, Add to group's groups). See docs/design-system/components/CheckList.md.
 */
export function CheckList({ label, help, action, children }: CheckListProps) {
  const labelId = useId();
  return (
    <section
      className={`${ui.card} ${label ? "" : styles.bare} ${children ? "" : styles.empty}`}
      aria-labelledby={label ? labelId : undefined}
    >
      {label && (
        <div className={styles.head}>
          <h2 id={labelId} className={ui.label}>
            {label}
          </h2>
          {action}
        </div>
      )}
      {help && <p className={styles.help}>{help}</p>}
      {children && <ul className={styles.rows}>{children}</ul>}
    </section>
  );
}

type CheckRowProps = {
  label: string;
  checked: boolean;
  onToggle: () => void;
  /** A count before the check, e.g. a theme's words on the Filter screen. */
  count?: number;
};

/** One row of a CheckList: the whole row is a toggle button, its check at the right. */
export function CheckRow({ label, checked, onToggle, count }: CheckRowProps) {
  return (
    <li>
      <button type="button" className={styles.row} aria-pressed={checked} onClick={onToggle}>
        <span className={styles.name}>{label}</span>
        {count !== undefined && <span className={styles.count}>{count}</span>}
        <span className={`${styles.check} ${checked ? styles.checked : ""}`} aria-hidden>
          {checked && <CheckIcon size={14} weight={3} />}
        </span>
      </button>
    </li>
  );
}

/** A last row that shows the rest of a long list in place: "All 23 imports" over a chevron. */
export function MoreRow({ label, onShow }: { label: string; onShow: () => void }) {
  return (
    <li>
      <button type="button" className={styles.row} aria-expanded={false} onClick={onShow}>
        <span className={styles.name}>{label}</span>
        <ChevronDownIcon className={styles.mark} />
      </button>
    </li>
  );
}

type AddRowProps = {
  label: string;
  count: number;
  onAdd: () => void;
  /** Adding to this row now: a spinner in place of the plus. */
  busy: boolean;
  /** The screen is busy: nothing can be tapped meanwhile. */
  disabled: boolean;
};

/** A row that adds to it, CheckRow's look with a plus in place of the check (Add to group). */
export function AddRow({ label, count, onAdd, busy, disabled }: AddRowProps) {
  return (
    <li>
      <button type="button" className={styles.row} disabled={disabled} onClick={onAdd}>
        <span className={styles.name}>{label}</span>
        <span className={styles.count}>{count}</span>
        {busy ? (
          <span className={`${ui.spinner} ${styles.spinner}`} />
        ) : (
          <PlusIcon className={styles.mark} />
        )}
      </button>
    </li>
  );
}
