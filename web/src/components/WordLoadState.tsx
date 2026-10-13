import { Link } from "react-router";
import ui from "../styles/ui.module.css";
import type { WordLoad } from "../words/useWord";
import styles from "./WordLoadState.module.css";

type WordLoadStateProps = {
  loading: WordLoad;
  /** Where "My words" goes when the word is gone. */
  listUrl: string;
  onRetry: () => void;
};

/** Word detail and Edit word until the word is there: loading, gone, or failed (§12 My words). */
export function WordLoadState({ loading, listUrl, onRetry }: WordLoadStateProps) {
  switch (loading.kind) {
    case "loading":
      return <p className={styles.muted}>Loading…</p>;
    case "missing":
      return (
        <div className={styles.gone}>
          <p>This word is not in your list any more.</p>
          <Link to={listUrl} className={`${ui.button} ${ui.secondary}`}>
            My words
          </Link>
        </div>
      );
    case "failed":
      return (
        <div className={styles.failed} role="alert">
          <span>{loading.message}</span>
          <button
            type="button"
            className={`${ui.button} ${ui.secondary} ${ui.small}`}
            onClick={onRetry}
          >
            Try again
          </button>
        </div>
      );
  }
}
