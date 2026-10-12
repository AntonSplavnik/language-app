import { cardBack, displayTranslation, type SessionSummary } from "@language-app/core";
import { Link, useLocation } from "react-router";
import { Page } from "../components/Page";
import ui from "../styles/ui.module.css";
import styles from "./SummaryScreen.module.css";

/** After the last card (§8.6). The counts come from finishing the session; a reload just says so. */
export function SummaryScreen() {
  const summary = useLocation().state as SessionSummary | null;

  return (
    <Page
      title="Session done"
      footer={
        <div className={styles.actions}>
          <Link to="/" className={`${ui.button} ${ui.secondary}`}>
            Home
          </Link>
          <Link to="/practice" className={`${ui.button} ${ui.primary}`}>
            New session
          </Link>
        </div>
      }
    >
      {summary ? (
        <>
          <section className={styles.tiles} aria-label="Results">
            <Tile label="Knew" value={summary.knew} tone="good" />
            <Tile label="Didn't know" value={summary.didntKnow} tone="bad" />
            <Tile label="Skipped" value={summary.skipped} tone="muted" />
          </section>

          {summary.missed.length > 0 && (
            <section>
              <h2 className={styles.heading}>Words you missed</h2>
              <ul className={styles.missed}>
                {summary.missed.map((word) => (
                  <li key={word.userWordId}>
                    <span className={styles.word}>{cardBack(word).headword}</span>
                    <span className={styles.translation}>{displayTranslation(word)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <p className={styles.muted}>Session finished. Your answers are saved.</p>
      )}
    </Page>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "bad" | "muted";
}) {
  return (
    <div className={`${styles.tile} ${styles[tone]}`}>
      <span className={styles.value}>{value}</span>
      <span>{label}</span>
    </div>
  );
}
