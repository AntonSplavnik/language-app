import { Link } from "react-router";
import { ChevronRightIcon } from "../components/icons";
import { Page } from "../components/Page";
import { importSubline, labelImports } from "../imports/labels";
import { importPageUrl, SETTINGS_URL } from "../imports/settingsRoutes";
import { usePastImports } from "../imports/usePastImports";
import ui from "../styles/ui.module.css";
import styles from "./PastImportsScreen.module.css";

/** Imports (§10 screen 11): the past imports, newest first; a row opens the import's page. */
export function PastImportsScreen() {
  const { state, reload } = usePastImports();

  return (
    <Page largeTitle="Imports" back={SETTINGS_URL}>
      {state.kind === "loading" && <p className={styles.muted}>Loading…</p>}

      {state.kind === "error" && (
        <div className={`${ui.card} ${styles.error}`} role="alert">
          <span>{state.message}</span>
          <button
            type="button"
            className={`${ui.button} ${ui.secondary} ${ui.small}`}
            onClick={reload}
          >
            Try again
          </button>
        </div>
      )}

      {state.kind === "ready" &&
        (state.imports.length === 0 ? (
          <p className={styles.muted}>Your imports will appear here.</p>
        ) : (
          <ul className={styles.list}>
            {labelImports(state.imports).map((item) => (
              <li key={item.id}>
                <Link to={importPageUrl(item.id)} className={styles.row}>
                  <span className={styles.text}>
                    <span className={styles.name}>{item.label}</span>
                    <span className={styles.sub}>{importSubline(item)}</span>
                  </span>
                  <ChevronRightIcon className={styles.chevron} />
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </Page>
  );
}
