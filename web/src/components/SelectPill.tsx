import type { ReactNode } from "react";
import { ChevronDownIcon } from "./icons";
import styles from "./SelectPill.module.css";

/**
 * A native select drawn as a pill with the chosen option's text and a chevron (My words' view
 * menu, Practice setup's Import menu). The select itself is invisible over the pill, so a tap
 * opens the phone's own picker and the pill is as wide as the chosen text, not the longest option.
 */
export function SelectPill({
  text,
  label,
  value,
  onChange,
  onCard = false,
  className = "",
  children,
}: {
  /** What the pill shows: the chosen option's text. */
  text: string;
  /** The select's accessible name. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** On a card the pill is `surface-raised` without a border; on the page `surface` + `border`. */
  onCard?: boolean;
  className?: string;
  /** The `<option>`s and `<optgroup>`s. */
  children: ReactNode;
}) {
  return (
    <span className={`${styles.pill} ${onCard ? styles.onCard : ""} ${className}`}>
      <span className={styles.text} aria-hidden>
        {text}
      </span>
      <ChevronDownIcon size={16} className={styles.icon} />
      <select
        className={styles.select}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </span>
  );
}
