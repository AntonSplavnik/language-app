import type { ReactNode } from "react";
import { Link } from "react-router";
import styles from "./Page.module.css";

type PageProps = {
  title: string;
  /** Where the back link goes; no back link when omitted. */
  back?: string;
  children: ReactNode;
  /** The screen's main action, pinned to the bottom where the thumb reaches it. */
  footer?: ReactNode;
};

/** Mobile-first screen layout: header, scrolling content, optional sticky action bar. */
export function Page({ title, back, children, footer }: PageProps) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        {back && (
          <Link to={back} className={styles.back} aria-label="Back">
            ‹
          </Link>
        )}
        <h1 className={styles.title}>{title}</h1>
      </header>
      <main className={styles.main}>{children}</main>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </div>
  );
}
