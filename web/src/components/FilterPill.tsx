import { Link } from "react-router";
import ui from "../styles/ui.module.css";
import styles from "./FilterPill.module.css";
import { CloseIcon, FilterIcon } from "./icons";

type FilterPillProps = {
  /** The Filter screen, with the list's query. */
  to: string;
  /** Stored in the Filter screen's history entry: it was opened from My words. */
  state?: unknown;
  /** The filter's name ("Hard ones", "Home", "One import"), or null without a filter. */
  chosen: string | null;
  /** Clears the filter in one tap (the close button), keeping the tab, search and sort. */
  onClear: () => void;
};

/**
 * My words' Filter pill (§10 screen 7): a link to the Filter screen, a filter icon and "Filter";
 * with a filter chosen, the Selected look, the filter's name alone and a close button that clears
 * it.
 * See docs/design-system/components/FilterPill.md.
 */
export function FilterPill({ to, state, chosen, onClear }: FilterPillProps) {
  return (
    <span className={`${styles.pill} ${chosen ? styles.chosen : ""}`}>
      <Link to={to} state={state} className={styles.open}>
        {/* Chosen, the name takes the icon's place: a long one keeps more of itself. */}
        {!chosen && <FilterIcon size={16} className={styles.icon} />}
        <span className={styles.text}>
          {chosen ? (
            <>
              <span className={ui.srOnly}>Filter: </span>
              {chosen}
            </>
          ) : (
            "Filter"
          )}
        </span>
      </Link>
      {chosen && (
        <button type="button" className={styles.clear} aria-label="Clear filter" onClick={onClear}>
          <CloseIcon size={16} />
        </button>
      )}
    </span>
  );
}
