import { type ReactNode, useId } from "react";
import ui from "../styles/ui.module.css";
import styles from "./CheckList.module.css";
import { CheckIcon } from "./icons";

type CheckListProps = {
  /** The small uppercase label at the top: "Themes". */
  label: string;
  /** A short line under the label. */
  help?: ReactNode;
  /** At the right of the label, e.g. Use suggested. */
  action?: ReactNode;
  /** CheckRows. */
  children: ReactNode;
};

/**
 * A card of rows that each toggle a check (§10 Edit word's Themes card). See
 * docs/design-system/components/CheckList.md.
 */
export function CheckList({ label, help, action, children }: CheckListProps) {
  const labelId = useId();
  return (
    <section className={ui.card} aria-labelledby={labelId}>
      <div className={styles.head}>
        <h2 id={labelId} className={ui.label}>
          {label}
        </h2>
        {action}
      </div>
      {help && <p className={styles.help}>{help}</p>}
      <ul className={styles.rows}>{children}</ul>
    </section>
  );
}

type CheckRowProps = {
  label: string;
  checked: boolean;
  onToggle: () => void;
};

/** One row of a CheckList: the whole row is a toggle button, its check at the right. */
export function CheckRow({ label, checked, onToggle }: CheckRowProps) {
  return (
    <li>
      <button type="button" className={styles.row} aria-pressed={checked} onClick={onToggle}>
        <span className={styles.name}>{label}</span>
        <span className={`${styles.check} ${checked ? styles.checked : ""}`} aria-hidden>
          {checked && <CheckIcon size={14} weight={3} />}
        </span>
      </button>
    </li>
  );
}
