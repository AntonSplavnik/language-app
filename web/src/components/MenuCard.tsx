import type { ReactNode } from "react";
import { Link } from "react-router";
import ui from "../styles/ui.module.css";
import { ChevronRightIcon } from "./icons";
import styles from "./MenuCard.module.css";

/**
 * A card of rows that each open a screen (§10: Settings' sections, an import's actions), a
 * hairline between them. Holds MenuRows.
 */
export function MenuCard({ children }: { children: ReactNode }) {
  return <ul className={`${ui.card} ${styles.menu}`}>{children}</ul>;
}

type MenuRowProps = {
  to: string;
  /** Stored in the opened screen's history entry, e.g. Rename import's `fromImport`. */
  state?: unknown;
  /** The section or action: "Imports", "Rename". */
  name: string;
  /** A short status at the right in grey, e.g. the number of past imports. */
  status?: string | null;
};

/** One row of a MenuCard: the name, the status and a chevron; the whole row is the link. */
export function MenuRow({ to, state, name, status }: MenuRowProps) {
  return (
    <li>
      <Link to={to} state={state} className={styles.row}>
        <span className={styles.name}>{name}</span>
        {status && <span className={styles.status}>{status}</span>}
        <ChevronRightIcon className={styles.chevron} />
      </Link>
    </li>
  );
}
