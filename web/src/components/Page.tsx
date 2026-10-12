import type { ReactNode } from "react";
import { Link } from "react-router";
import styles from "./Page.module.css";

type PageProps = {
  title: string;
  /** Where the back link goes; no back link when omitted. */
  back?: string;
  /** A control at the right end of the header, e.g. Word detail's speaker button. */
  action?: ReactNode;
  /** A bigger title that wraps instead of being cut off, for a screen about one German word. */
  wordTitle?: boolean;
  children: ReactNode;
  /** The screen's main action, pinned to the bottom where the thumb reaches it. */
  footer?: ReactNode;
};

/** Mobile-first screen layout: header, scrolling content, optional sticky action bar. */
export function Page({ title, back, action, wordTitle = false, children, footer }: PageProps) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        {back && (
          <Link to={back} className={styles.back} aria-label="Back">
            ‹
          </Link>
        )}
        {/* lang="de" lets the browser hyphenate a long compound where it wraps. */}
        <h1
          className={`${styles.title} ${wordTitle ? styles.wordTitle : ""}`}
          lang={wordTitle ? "de" : undefined}
        >
          {title}
        </h1>
        {action && <div className={styles.action}>{action}</div>}
      </header>
      <main className={styles.main}>{children}</main>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </div>
  );
}
