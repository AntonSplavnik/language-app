import type { SaveResponse } from "@language-app/core";
import { Link, useLocation } from "react-router";
import { CheckIcon, PlayIcon, SparkleIcon } from "../components/icons";
import { Page } from "../components/Page";
import { PendingDetails } from "../components/PendingDetails";
import { useStartSession } from "../practice/useStartSession";
import ui from "../styles/ui.module.css";
import styles from "./DoneScreen.module.css";

/** After saving (§10 Done). The counts come from the save response; a reload just says "saved". */
export function DoneScreen() {
  const result = useLocation().state as SaveResponse | null;
  const { start, starting } = useStartSession();

  return (
    <Page
      // Small: the result below is the big text.
      title={<span className={styles.eyebrow}>Done</span>}
      footer={
        <div className={styles.actions}>
          {result && result.added > 0 && (
            <button
              type="button"
              className={`${ui.button} ${ui.primary} ${ui.cta}`}
              disabled={starting}
              onClick={() => start("last_import")}
            >
              {starting && <span className={ui.spinner} />}
              Practice these now
              <PlayIcon size={18} />
            </button>
          )}
          <Link
            to="/imports/new"
            className={`${ui.button} ${ui.secondary} ${ui.large} ${ui.block}`}
          >
            Import more pages
          </Link>
          <Link to="/" className={`${ui.button} ${ui.block} ${styles.home}`}>
            Home
          </Link>
        </div>
      }
    >
      <div className={styles.result}>
        <span className={styles.badge} aria-hidden>
          <span className={styles.check}>
            <CheckIcon size={44} weight={2.6} />
          </span>
        </span>
        <div className={styles.text}>
          {result ? (
            <>
              <p className={styles.headline}>
                {result.added} {result.added === 1 ? "word" : "words"} added
              </p>
              {(result.skipped > 0 || (result.added > 0 && result.detailsPending === 0)) && (
                <div className={styles.details}>
                  {result.skipped > 0 && (
                    <p>{result.skipped} skipped; they won't be suggested again.</p>
                  )}
                  {result.added > 0 && result.detailsPending === 0 && (
                    <p className={styles.ready}>
                      <SparkleIcon size={16} />
                      Example sentences and forms are ready.
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className={styles.headline}>Import saved</p>
          )}
        </div>
      </div>
      {result && result.detailsPending > 0 && <PendingDetails count={result.detailsPending} />}
    </Page>
  );
}
