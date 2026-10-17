import { Link } from "react-router";
import ui from "../styles/ui.module.css";
import styles from "./LoadState.module.css";

/** Why a screen's one thing (a word, an import) isn't on screen yet. */
export type Load = { kind: "loading" } | { kind: "missing" } | { kind: "failed"; message: string };

type LoadStateProps = {
  loading: Load;
  /** What a gone thing says, and the link to its list: "This word is not in your list any more." */
  missing: { text: string; to: string; label: string };
  onRetry: () => void;
};

/**
 * A screen about one thing until it is there: loading, gone, or failed with Try again (§12). Word
 * detail and Edit word (through WordLoadState), an import's page and Rename import.
 */
export function LoadState({ loading, missing, onRetry }: LoadStateProps) {
  switch (loading.kind) {
    case "loading":
      return <p className={styles.muted}>Loading…</p>;
    case "missing":
      return (
        <div className={styles.gone}>
          <p>{missing.text}</p>
          <Link to={missing.to} className={`${ui.button} ${ui.secondary}`}>
            {missing.label}
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
