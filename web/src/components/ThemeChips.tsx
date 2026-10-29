import styles from "./ThemeChips.module.css";

type ThemeChipsProps = {
  /** The themes' labels, the main one first ("Body & health", "Work"). */
  labels: string[];
  /** The learner chose them: a muted "Your choice" follows. */
  own: boolean;
  className?: string;
};

/**
 * A word's themes as small neutral chips (§10 Word detail). See
 * docs/design-system/components/ThemeChips.md.
 */
export function ThemeChips({ labels, own, className }: ThemeChipsProps) {
  return (
    <ul className={`${styles.chips} ${className ?? ""}`} aria-label="Themes">
      {labels.map((label) => (
        <li key={label} className={styles.chip}>
          {label}
        </li>
      ))}
      {own && <li className={styles.own}>Your choice</li>}
    </ul>
  );
}
