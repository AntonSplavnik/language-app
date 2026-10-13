import type { ReactNode } from "react";
import { Link } from "react-router";
import styles from "./Page.module.css";

type PageProps = {
  /** The header's heading; left out when the screen shows its own `<h1>`, like Word detail. */
  title?: ReactNode;
  /** Where the back link goes; no back link when omitted. */
  back?: string;
  /**
   * A control at the left end instead of the back link, e.g. Edit word's Cancel. The title is then
   * centred between it and the action, as on an iOS sheet.
   */
  leading?: ReactNode;
  /** A control at the right end of the header, e.g. Word detail's Edit button. */
  action?: ReactNode;
  children: ReactNode;
  /** The screen's main action, pinned to the bottom where the thumb reaches it. */
  footer?: ReactNode;
};

/** Mobile-first screen layout: header, scrolling content, optional sticky action bar. */
export function Page({ title, back, leading, action, children, footer }: PageProps) {
  return (
    <div className={styles.page}>
      <header className={`${styles.header} ${leading ? styles.sheet : ""}`}>
        {leading ? (
          <div className={styles.leading}>{leading}</div>
        ) : (
          back && (
            <Link to={back} className={styles.back} aria-label="Back">
              ‹
            </Link>
          )
        )}
        {title && <h1 className={styles.title}>{title}</h1>}
        {action && <div className={styles.action}>{action}</div>}
      </header>
      <main className={styles.main}>{children}</main>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </div>
  );
}
