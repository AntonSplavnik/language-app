import { SESSION_SIZE, type SessionOptionsResponse, type SessionSource } from "@language-app/core";
import { useEffect, useState } from "react";
import { api } from "../api";
import { Page } from "../components/Page";
import { errorMessage, useToast } from "../lib/toast";
import { useStartSession } from "../practice/useStartSession";
import ui from "../styles/ui.module.css";
import styles from "./PracticeSetupScreen.module.css";

const LABELS: Record<SessionSource, { title: string; description: string }> = {
  last_import: { title: "Last import", description: "The words you added most recently" },
  last_7_days: { title: "Last 7 days", description: "Everything added this week" },
  not_learned: { title: "Not learned yet", description: "Words you missed come first" },
};

const countText = (count: number) =>
  count === 0
    ? "No words"
    : count <= SESSION_SIZE
      ? `${count} ${count === 1 ? "word" : "words"}`
      : `${SESSION_SIZE} of ${count} words`;

/** Choose what to practise (§8.1). The first source with words is preselected: two taps to start. */
export function PracticeSetupScreen() {
  const toast = useToast();
  const { start, starting } = useStartSession();
  const [options, setOptions] = useState<SessionOptionsResponse["options"] | null>(null);
  const [selected, setSelected] = useState<SessionSource | null>(null);

  useEffect(() => {
    api.sessionOptions().then(
      ({ options }) => {
        setOptions(options);
        setSelected(options.find((o) => o.count > 0)?.source ?? null);
      },
      (error) => toast.show(errorMessage(error)),
    );
  }, [toast]);

  return (
    <Page
      title="Practice"
      back="/"
      footer={
        <button
          type="button"
          className={`${ui.button} ${ui.primary} ${ui.block}`}
          disabled={!selected || starting}
          onClick={() => selected && start(selected)}
        >
          {starting && <span className={ui.spinner} />}
          Start
        </button>
      }
    >
      {!options && <p className={styles.muted}>Loading…</p>}
      {options && (
        <fieldset className={styles.options}>
          <legend className={styles.legend}>What to practise</legend>
          {options.map(({ source, count }) => (
            <label
              key={source}
              className={`${styles.option} ${selected === source ? styles.selected : ""} ${
                count === 0 ? styles.disabled : ""
              }`}
            >
              <input
                type="radio"
                name="source"
                value={source}
                className={styles.radio}
                checked={selected === source}
                disabled={count === 0}
                onChange={() => setSelected(source)}
              />
              <span className={styles.text}>
                <span className={styles.title}>{LABELS[source].title}</span>
                <span className={styles.description}>{LABELS[source].description}</span>
              </span>
              <span className={styles.count}>{countText(count)}</span>
            </label>
          ))}
        </fieldset>
      )}
      {options?.every((o) => o.count === 0) && (
        <p className={styles.muted}>Import some pages first; their words will show up here.</p>
      )}
    </Page>
  );
}
