import { Link } from "react-router";
import styles from "./SegmentedTabs.module.css";

export type Tab = {
  key: string;
  label: string;
  /** Where the tab goes; it replaces the URL, so Back skips tab changes. */
  to: string;
  /** A count pill after the label, e.g. My words' words per status. */
  count?: number;
};

/**
 * A segmented control of links (§10): My words' Learning / Learned / Ignored, Add words' One word
 * / A list. The current tab is a high-contrast pill (`aria-current`).
 */
export function SegmentedTabs({
  tabs,
  current,
  label,
}: {
  tabs: Tab[];
  current: string;
  /** What the tabs choose, for screen readers: "Word status". */
  label: string;
}) {
  return (
    <nav className={styles.tabs} aria-label={label}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          replace
          className={`${styles.tab} ${tab.key === current ? styles.active : ""}`}
          aria-current={tab.key === current ? "page" : undefined}
        >
          {tab.label}
          {tab.count !== undefined && <span className={styles.count}>{tab.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
