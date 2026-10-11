import { useState } from "react";
import { api } from "../api";
import { errorMessage, useToast } from "../lib/toast";
import ui from "../styles/ui.module.css";
import styles from "./PendingDetails.module.css";

/**
 * "N words without details" with a button that retries enrichment (§6.6, §12: enrichment fails).
 * Calls `onChange` with the number still pending afterwards.
 */
export function PendingDetails({
  count,
  onChange,
}: {
  count: number;
  onChange?: (pending: number) => void;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(count);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<{ enriched: number } | null>(null);

  if (pending === 0) {
    return lastRun ? (
      <p className={`${styles.box} ${styles.done}`}>✓ Details added for {lastRun.enriched} words</p>
    ) : null;
  }

  const run = async () => {
    setRunning(true);
    try {
      const result = await api.enrichPending();
      setPending(result.pending);
      setLastRun(result);
      onChange?.(result.pending);
      if (result.pending > 0) toast.show("Some words still have no details. Try again later.");
    } catch (error) {
      toast.show(errorMessage(error));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={styles.box}>
      <span>
        {pending} {pending === 1 ? "word" : "words"} without details yet
        <span className={styles.sub}>example sentence, plural or verb forms</span>
      </span>
      <button
        type="button"
        className={`${ui.button} ${ui.secondary} ${ui.small}`}
        disabled={running}
        onClick={run}
      >
        {running && <span className={ui.spinner} />}
        {running ? "Adding…" : "Add details"}
      </button>
    </div>
  );
}
