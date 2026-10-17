import { useParams } from "react-router";
import { LoadState } from "../components/LoadState";
import { MenuCard, MenuRow } from "../components/MenuCard";
import { Page } from "../components/Page";
import { findImport, importFacts } from "../imports/labels";
import {
  IMPORT_MISSING,
  IMPORTS_URL,
  type RenameState,
  renameImportUrl,
} from "../imports/settingsRoutes";
import { usePastImports } from "../imports/usePastImports";
import styles from "./PastImportScreen.module.css";

/**
 * One past import (§10 screen 12): its label as the title, its words and day, and a card of
 * actions. For now Rename; later actions (deleting it, for example) join the card.
 */
export function PastImportScreen() {
  const id = Number(useParams().id);
  const { state, reload } = usePastImports();
  const found = findImport(state, id);

  if (found.kind !== "ready") {
    return (
      <Page back={IMPORTS_URL}>
        <LoadState loading={found} missing={IMPORT_MISSING} onRetry={reload} />
      </Page>
    );
  }

  const { item } = found;
  // Rename import returns here by going back, without adding a history entry.
  const renameState: RenameState = { fromImport: true };

  return (
    <Page back={IMPORTS_URL} largeTitle={<span className={styles.title}>{item.label}</span>}>
      <p className={styles.facts}>{importFacts(item)}</p>
      <MenuCard>
        <MenuRow to={renameImportUrl(item.id)} state={renameState} name="Rename" />
      </MenuCard>
    </Page>
  );
}
