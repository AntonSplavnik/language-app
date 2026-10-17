import { IMPORT_NAME_MAX } from "@language-app/core";
import { useId, useState } from "react";
import { useLocation, useParams } from "react-router";
import { api } from "../api";
import { LoadState } from "../components/LoadState";
import { Page } from "../components/Page";
import { findImport, nameChange } from "../imports/labels";
import { IMPORT_MISSING, leaveRename, type RenameState } from "../imports/settingsRoutes";
import { usePastImports } from "../imports/usePastImports";
import { useHistoryStep } from "../lib/sheetHistory";
import { errorMessage, useToast } from "../lib/toast";
import ui from "../styles/ui.module.css";
import styles from "./RenameImportScreen.module.css";

/**
 * Renaming a past import (§10 screen 13). Looks like Edit word's sheet: Cancel and Save return to
 * the import's page without adding history.
 */
export function RenameImportScreen() {
  const id = Number(useParams().id);
  const state = useLocation().state as RenameState | null;
  const go = useHistoryStep();
  const toast = useToast();
  const formId = useId();
  const { state: past, reload } = usePastImports();
  const found = findImport(past, id);
  // What the learner typed; null until they type, which shows the current name.
  const [typed, setTyped] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const item = found.kind === "ready" ? found.item : null;
  const text = typed ?? item?.name ?? "";
  // undefined while the trimmed text is the name already: nothing to save.
  const change = item ? nameChange(item.name, text) : undefined;

  // Cancel, like the browser's Back, drops what was typed without asking.
  const leave = () => go(leaveRename(id, state));

  const save = async () => {
    if (!item || change === undefined || saving) return;
    setSaving(true);
    try {
      await api.renameImport(item.id, change);
      toast.show("Renamed");
      // The import's page loads the imports again, so it shows the new title.
      leave();
    } catch (error) {
      // The typed name stays, so trying again is one tap.
      toast.show(errorMessage(error));
      setSaving(false);
    }
  };

  return (
    <Page
      title="Rename"
      leading={
        <button
          type="button"
          className={`${ui.pill} ${ui.pillSecondary}`}
          disabled={saving}
          onClick={leave}
        >
          Cancel
        </button>
      }
      action={
        <button
          type="submit"
          form={formId}
          className={`${ui.pill} ${ui.pillPrimary}`}
          disabled={change === undefined || saving}
        >
          {saving && <span className={ui.spinner} />}
          Save
        </button>
      }
    >
      {found.kind === "ready" ? (
        <form
          id={formId}
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            // Enter saves; with nothing changed it just closes the keyboard.
            if (change !== undefined) save();
            else (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          <label className={`${ui.card} ${styles.field}`}>
            <span className={ui.label}>Name</span>
            <input
              className={`${ui.input} ${ui.sunk}`}
              value={text}
              placeholder={found.item.day}
              maxLength={IMPORT_NAME_MAX}
              enterKeyHint="done"
              onChange={(event) => setTyped(event.target.value)}
            />
            <span className={styles.help}>Leave empty to show the date instead.</span>
          </label>
        </form>
      ) : (
        <LoadState loading={found} missing={IMPORT_MISSING} onRetry={reload} />
      )}
    </Page>
  );
}
