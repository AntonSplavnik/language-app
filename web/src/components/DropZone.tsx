import type { ReactNode } from "react";
import styles from "./DropZone.module.css";

/**
 * The first step of an import (§10 screens 2 and 16): one big dashed target with a lime icon
 * square, a title and a hint, e.g. "Take or choose photos" or "Choose a PDF".
 */
export function DropZone({
  icon,
  title,
  hint,
  onClick,
}: {
  /** A 32 px stroke icon: the camera, the document. */
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.drop} onClick={onClick}>
      <span className={styles.icon}>{icon}</span>
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        <span className={styles.hint}>{hint}</span>
      </span>
    </button>
  );
}
