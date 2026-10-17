import styles from "./StepProgress.module.css";

/**
 * Where a run of steps is, for a header (§10): the label, "**5** / 20" at its right, and a thin bar
 * filled by the steps done so far. Flashcards' cards, Confirm word's typed words. Fills the rest
 * of the header row after its round button.
 */
export function StepProgress({
  label,
  position,
  done,
  total,
}: {
  label: string;
  /** The current step, from 1. */
  position: number;
  /** Steps finished, for the bar. */
  done: number;
  total: number;
}) {
  return (
    <div className={styles.progress}>
      <div className={styles.line}>
        <h1 className={styles.heading}>{label}</h1>
        <span className={styles.position}>
          <span className={styles.current}>{position}</span> / {total}
        </span>
      </div>
      {/* The numbers say it; the bar is only for the eye. */}
      <div className={styles.track} aria-hidden="true">
        <div
          className={styles.fill}
          style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}
