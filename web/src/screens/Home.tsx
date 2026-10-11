import type { StatsResponse } from "@language-app/core";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import { PendingDetails } from "../components/PendingDetails";
import ui from "../styles/ui.module.css";
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

        {state.kind === "ready" && (
          <>
            <section className={styles.counters} aria-label="Your words">
              <Counter label="Learning" value={state.stats.learning} />
              <Counter label="Learned" value={state.stats.learned} />
            </section>

            {state.stats.detailsPending > 0 && (
              <PendingDetails key={state.stats.detailsPending} count={state.stats.detailsPending} />
            )}

            {state.stats.unfinishedImports.map((item) => (
              <Link
                key={item.id}
                to={
                  item.status === "reviewing" ? `/imports/${item.id}/review` : `/imports/${item.id}`
                }
                className={styles.banner}
              >
                <span>
                  {item.status === "reviewing" ? "Finish reviewing" : "Continue importing"}{" "}
                  <strong>{item.name ?? `the import from ${formatDate(item.createdAt)}`}</strong>
                </span>
                <span aria-hidden>›</span>
              </Link>
            ))}

            <Link to="/imports/new" className={`${ui.button} ${ui.primary} ${styles.newImport}`}>
              <span aria-hidden className={styles.camera}>
                +
              </span>
              New import
            </Link>
            <p className={styles.muted}>
              Photograph the pages you studied to collect their new words.
            </p>
          </>
        )}
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

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.counter}>
      <span className={styles.counterValue}>{value}</span>
      <span className={styles.counterLabel}>{label}</span>
    </div>
  );
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
