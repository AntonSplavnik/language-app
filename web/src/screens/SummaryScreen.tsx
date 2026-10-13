import { displayTranslation, type SessionSummary } from "@language-app/core";
import { Link, useLocation } from "react-router";
import { Headword } from "../components/Headword";
import { Page } from "../components/Page";
import { knewOf, resultShares } from "../practice/summary";
import ui from "../styles/ui.module.css";
import styles from "./SummaryScreen.module.css";

/** After the last card (§8.6). The counts come from finishing the session; a reload just says so. */
export function SummaryScreen() {
  const summary = useLocation().state as SessionSummary | null;

  return (
    <Page
      largeTitle="Session done"
      footer={
        <div className={styles.actions}>
          <Link to="/" className={`${ui.button} ${ui.secondary} ${ui.large} ${styles.home}`}>
            Home
          </Link>
          <Link to="/practice" className={`${ui.button} ${ui.primary} ${ui.cta}`}>
            New session
          </Link>
        </div>
      }
    >
      {summary ? (
        <>
          <Results summary={summary} />

          {summary.missed.length > 0 && (
            <section>
              <h2 className={styles.heading}>
                Words you missed{" "}
                <span className={styles.headingCount}>{summary.missed.length}</span>
              </h2>
              <ul className={styles.missed}>
                {summary.missed.map((word) => (
                  <li key={word.userWordId}>
                    <Headword word={word} className={styles.word} />
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

const COUNTS = [
  { result: "knew", label: "Knew", key: "knew" },
  { result: "didnt_know", label: "Didn't know", key: "didntKnow" },
  { result: "skipped", label: "Skipped", key: "skipped" },
] as const;

/** "14 of 20 knew", the answers as a bar, and the three counts. */
function Results({ summary }: { summary: SessionSummary }) {
  const headline = knewOf(summary);
  return (
    <section className={`${ui.card} ${styles.results}`} aria-label="Results">
      {headline && (
        <>
          <p className={styles.headline}>
            <span className={styles.knewCount}>{headline.knew}</span>
            <span className={styles.of}>of {headline.of} knew</span>
          </p>
          {/* The counts below say it; the bar is only for the eye. */}
          <div className={styles.bar} aria-hidden="true">
            {resultShares(summary).map(({ result, count }) => (
              <span key={result} className={styles[result]} style={{ flex: count }} />
            ))}
          </div>
        </>
      )}
      <dl className={styles.counts}>
        {COUNTS.map(({ result, label, key }) => (
          <div key={result}>
            <dt>
              <span className={`${styles.dot} ${styles[result]}`} />
              {label}
            </dt>
            <dd>{summary[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
