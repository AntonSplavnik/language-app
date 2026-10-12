import type { StatsResponse } from "@language-app/core";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import { PendingDetails } from "../components/PendingDetails";
import ui from "../styles/ui.module.css";
import { countsText, hasWords, practiceText } from "../words/counts";
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
      <header>
        <h1 className={styles.title}>German words</h1>
      </header>

      <main className={styles.main}>
        {state.kind === "loading" && <p className={styles.muted}>Loading…</p>}

        {state.kind === "error" && (
          <div className={styles.error} role="alert">
            <p>{state.message}</p>
            <button type="button" className={styles.retry} onClick={load}>
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
        (CC BY-SA)
      </footer>
    </div>
  );
}

/** Home once the stats are in (§10 screen 1). */
function Ready({ stats }: { stats: StatsResponse }) {
  const practice = practiceText(stats);
  return (
    <>
      {/* The only way to My words: the counts open the Learning tab, which links the others. */}
      <Link to={wordsUrl({ status: "learning", q: "" })} className={styles.wordsCard}>
        <span className={styles.wordsText}>
          <span className={styles.wordsTitle}>My words</span>
          <span className={styles.muted}>{countsText(stats)}</span>
        </span>
        <span aria-hidden className={styles.chevron}>
          ›
        </span>
      </Link>

      {stats.unfinishedImports.map((item) => (
        <Link
          key={item.id}
          to={item.status === "reviewing" ? `/imports/${item.id}/review` : `/imports/${item.id}`}
          className={styles.banner}
        >
          <span>
            {item.status === "reviewing" ? "Finish reviewing" : "Continue importing"}{" "}
            <strong>{item.name ?? `the import from ${formatDate(item.createdAt)}`}</strong>
          </span>
          <span aria-hidden>›</span>
        </Link>
      ))}

      {stats.detailsPending > 0 && (
        <PendingDetails key={stats.detailsPending} count={stats.detailsPending} />
      )}

      {practice && (
        <Link
          to="/practice"
          className={`${ui.button} ${ui.primary} ${styles.bigAction} ${styles.twoLines}`}
        >
          Practice
          <span className={styles.subline}>{practice}</span>
        </Link>
      )}
      <Link
        to="/imports/new"
        className={`${ui.button} ${hasWords(stats) ? ui.secondary : ui.primary} ${styles.bigAction}`}
      >
        <span aria-hidden className={styles.plus}>
          +
        </span>
        New import
      </Link>
      {!hasWords(stats) && (
        <p className={styles.hint}>Photograph the pages you studied to collect their new words.</p>
      )}
    </>
  );
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
