import type { SaveResponse } from "@language-app/core";
import { Link, useLocation } from "react-router";
import { Page } from "../components/Page";
import ui from "../styles/ui.module.css";
import styles from "./DoneScreen.module.css";

/** After saving (§10 Done). The counts come from the save response; a reload just says "saved". */
export function DoneScreen() {
  const result = useLocation().state as SaveResponse | null;

  return (
    <Page
      title="Done"
      footer={
        <div className={styles.actions}>
          <Link to="/imports/new" className={`${ui.button} ${ui.secondary} ${ui.block}`}>
            Import more pages
          </Link>
          <Link to="/" className={`${ui.button} ${ui.primary} ${ui.block}`}>
            Home
          </Link>
        </div>
      }
    >
      <div className={styles.result}>
        <span className={styles.check} aria-hidden>
          ✓
        </span>
        {result ? (
          <>
            <p className={styles.headline}>
              {result.added} {result.added === 1 ? "word" : "words"} added
            </p>
            {result.skipped > 0 && (
              <p className={styles.detail}>
                {result.skipped} skipped; they won't be suggested again.
              </p>
            )}
          </>
        ) : (
          <p className={styles.headline}>Import saved</p>
        )}
      </div>
    </Page>
  );
}
