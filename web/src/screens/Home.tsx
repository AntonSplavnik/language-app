import type { StatsResponse } from "@language-app/core";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import {
  ArrowUpRightIcon,
  BookIcon,
  ChevronRightIcon,
  GearIcon,
  PlayIcon,
  PlusIcon,
} from "../components/icons";
import { PendingDetails } from "../components/PendingDetails";
import ui from "../styles/ui.module.css";
import { countsText, deckSummary, hasWords, practiceText } from "../words/counts";
import { wordsUrl } from "../words/listQuery";
import styles from "./Home.module.css";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; stats: StatsResponse };

export function Home() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(() => {
    setState({ kind: "loading" });
    api.stats().then(
      (stats) => setState({ kind: "ready", stats }),
      (error: Error) => setState({ kind: "error", message: error.message }),
    );
  }, []);

  useEffect(load, [load]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>German words</h1>
        <Link to="/settings" className={ui.round} aria-label="Settings">
          <GearIcon />
        </Link>
      </header>

      <main className={styles.main}>
        {state.kind === "loading" && <p className={styles.muted}>Loading…</p>}

        {state.kind === "error" && (
          <div className={`${ui.card} ${styles.error}`} role="alert">
            <p>{state.message}</p>
            <button
              type="button"
              className={`${ui.button} ${ui.secondary} ${ui.small}`}
              onClick={load}
            >
              Try again
            </button>
          </div>
        )}

        {state.kind === "ready" && <Ready stats={state.stats} />}
      </main>

      <footer className={styles.footer}>
        Grammar data from{" "}
        <a href="https://en.wiktionary.org/" target="_blank" rel="noreferrer">
          Wiktionary
        </a>{" "}
        (CC BY-SA), recordings from{" "}
        <a href="https://commons.wikimedia.org/" target="_blank" rel="noreferrer">
          Wikimedia Commons
        </a>
      </footer>
    </div>
  );
}

/** Home once the stats are in (§10 screen 1). */
function Ready({ stats }: { stats: StatsResponse }) {
  const practice = practiceText(stats);
  const started = hasWords(stats);

  // The only way to My words: the counts open the Learning tab, which links the others.
  const myWords = (
    <Link to={wordsUrl({ status: "learning", q: "" })} className={`${ui.card} ${styles.tile}`}>
      <span className={styles.tileTop}>
        <span className={styles.well}>
          <BookIcon lines size={22} />
        </span>
        <ArrowUpRightIcon size={18} className={styles.arrow} />
      </span>
      <span className={styles.tileText}>
        <span className={styles.tileTitle}>My words</span>
        <span className={styles.tileSub}>{countsText(stats)}</span>
      </span>
    </Link>
  );

  return (
    <>
      {started && <Deck stats={stats} />}

      {stats.unfinishedImports.map((item) => (
        <Link
          key={item.id}
          to={item.status === "reviewing" ? `/imports/${item.id}/review` : `/imports/${item.id}`}
          className={`${ui.card} ${styles.banner}`}
        >
          <span>
            {item.status === "reviewing" ? "Finish reviewing" : "Continue importing"}{" "}
            <strong>{item.name ?? `the import from ${formatDate(item.createdAt)}`}</strong>
          </span>
          <ChevronRightIcon className={styles.chevron} />
        </Link>
      ))}

      {stats.detailsPending > 0 && (
        <PendingDetails key={stats.detailsPending} count={stats.detailsPending} />
      )}

      {practice && (
        <Link to="/practice" className={styles.bigAction}>
          <span className={styles.bigText}>
            <span className={styles.bigLabel}>Practice</span>
            <span className={styles.subline}>{practice}</span>
          </span>
          <span className={styles.bigCircle}>
            <PlayIcon />
          </span>
        </Link>
      )}

      {started ? (
        <div className={styles.tiles}>
          {myWords}
          <Link to="/imports/new" className={`${styles.tile} ${styles.newImport}`}>
            <span className={styles.well}>
              <PlusIcon size={22} />
            </span>
            <span className={styles.tileText}>
              <span className={styles.tileTitle}>New import</span>
              <span className={styles.tileSub}>Add more words</span>
            </span>
          </Link>
        </div>
      ) : (
        // No words yet: New import is the main action, and the hint says what it is for.
        <>
          <Link to="/imports/new" className={styles.bigAction}>
            <span className={styles.bigLabel}>New import</span>
            <span className={styles.bigCircle}>
              <PlusIcon size={26} />
            </span>
          </Link>
          <p className={styles.hint}>
            Photograph the pages you studied to collect their new words.
          </p>
          {myWords}
        </>
      )}
    </>
  );
}

/** The deck card: every word not ignored, the share learned, and the two counts (§10). */
function Deck({ stats }: { stats: StatsResponse }) {
  const { total, learnedPercent } = deckSummary(stats);
  return (
    <section className={`${ui.card} ${styles.deck}`}>
      <div className={styles.deckHead}>
        <span>Your deck</span>
        <span className={styles.percent}>{learnedPercent}% learned</span>
      </div>
      <p className={styles.total}>
        <span className={styles.totalNumber}>{total}</span>
        <span className={styles.totalUnit}>{total === 1 ? "word" : "words"}</span>
      </p>
      {/* "N% learned" already says it, so the bar is only for the eye. */}
      <div className={styles.bar} aria-hidden="true">
        <div className={styles.barFill} style={{ width: `${learnedPercent}%` }} />
      </div>
      <dl className={styles.stats}>
        <div>
          <dt>
            <span className={`${styles.dot} ${styles.learningDot}`} />
            Learning
          </dt>
          <dd>{stats.learning}</dd>
        </div>
        <div>
          <dt>
            <span className={`${styles.dot} ${styles.learnedDot}`} />
            Learned
          </dt>
          <dd>{stats.learned}</dd>
        </div>
      </dl>
    </section>
  );
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
