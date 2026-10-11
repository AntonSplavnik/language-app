import type { StatsResponse } from "@language-app/core";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
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

            {state.stats.unfinishedImports.map((item) => (
              <div key={item.id} className={styles.banner}>
                {item.status === "reviewing" ? "Finish reviewing" : "Continue importing"}{" "}
                <strong>{item.name ?? `the import from ${formatDate(item.createdAt)}`}</strong>
              </div>
            ))}
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
