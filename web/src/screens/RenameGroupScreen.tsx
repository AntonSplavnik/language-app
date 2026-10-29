import { ApiClientError, GROUP_NAME_MAX } from "@language-app/core";
import { useId, useState } from "react";
import { useLocation, useParams } from "react-router";
import { api } from "../api";
import { LoadState } from "../components/LoadState";
import { Page } from "../components/Page";
import { findGroup, groupExistsText, groupNameChange } from "../groups/labels";
import { GROUP_MISSING, leaveRenameGroup, type RenameGroupState } from "../groups/settingsRoutes";
import { useGroups } from "../groups/useGroups";
import { useHistoryStep } from "../lib/sheetHistory";
import { errorMessage, useToast } from "../lib/toast";
import ui from "../styles/ui.module.css";
import styles from "./RenameImportScreen.module.css";

/**
 * Renaming a group (§10), as Rename import: Cancel and Save return to the group's page without
 * adding history.
 */
export function RenameGroupScreen() {
  const id = Number(useParams().id);
  const state = useLocation().state as RenameGroupState | null;
  const go = useHistoryStep();
  const toast = useToast();
  const formId = useId();
  const { state: groups, reload } = useGroups();
  const found = findGroup(groups, id);
  // What the learner typed; null until they type, which shows the current name.
  const [typed, setTyped] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const group = found.kind === "ready" ? found.group : null;
  const text = typed ?? group?.name ?? "";
  // undefined unless the trimmed text is a name of 1–40 other than the current one.
  const change = group ? groupNameChange(group.name, text) : undefined;

  // Cancel, like the browser's Back, drops what was typed without asking.
  const leave = () => go(leaveRenameGroup(id, state));

  const save = async () => {
    if (!group || change === undefined || saving) return;
    setSaving(true);
    try {
      await api.renameGroup(group.id, change);
      toast.show("Renamed");
      // The group's page loads the groups again, so it shows the new title.
      leave();
    } catch (error) {
      // The typed name stays, so trying again is one tap.
      const taken = error instanceof ApiClientError && error.code === "group_exists";
      toast.show(taken ? groupExistsText(change) : errorMessage(error));
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
            // Enter saves; with nothing to save it just closes the keyboard.
            if (change !== undefined) save();
            else (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          <label className={`${ui.card} ${styles.field}`}>
            <span className={ui.label}>Name</span>
            <input
              className={`${ui.input} ${ui.sunk}`}
              value={text}
              maxLength={GROUP_NAME_MAX}
              enterKeyHint="done"
              onChange={(event) => setTyped(event.target.value)}
            />
            <span className={styles.help}>Up to {GROUP_NAME_MAX} characters.</span>
          </label>
        </form>
      ) : (
        <LoadState loading={found} missing={GROUP_MISSING} onRetry={reload} />
      )}
    </Page>
  );
}
