import { ApiClientError, GROUP_NAME_MAX } from "@language-app/core";
import { useEffect, useId, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { api } from "../api";
import { AddRow, CheckList } from "../components/CheckList";
import { Page } from "../components/Page";
import { addedText, canCreate, groupExistsText, selectedLead } from "../groups/labels";
import { useGroups } from "../groups/useGroups";
import { useHistoryStep } from "../lib/sheetHistory";
import { errorMessage, useToast } from "../lib/toast";
import ui from "../styles/ui.module.css";
import { parseListQuery, wordsUrl } from "../words/listQuery";
import { backToList, returnToList } from "../words/listReturn";
import { clearSelection, getSelection } from "../words/selection";
import styles from "./AddToGroupScreen.module.css";
import type { FromList } from "./MyWordsScreen";

/** What is being saved: a new group, or the selection into one of the groups. */
type Saving = { kind: "new" } | { kind: "group"; id: number } | null;

/**
 * Add to group (§10): the words selected in My words go into a new group or one of the learner's.
 * A screen of its own like Edit word; it returns to My words without adding a history entry, out
 * of selection mode. Cancel returns still selecting.
 */
export function AddToGroupScreen() {
  const toast = useToast();
  const go = useHistoryStep();
  const navigate = useNavigate();
  const formId = useId();
  const [params] = useSearchParams();
  const fromList = Boolean((useLocation().state as FromList | null)?.fromList);
  const listUrl = wordsUrl(parseListQuery(params));
  // The selection as it was when the screen opened; it lives in memory only.
  const [ids] = useState(() => [...getSelection().ids]);
  const { state: groups } = useGroups();
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState<Saving>(null);

  // Without the groups, a new group can still be made.
  const failed = groups.kind === "error" ? groups.message : null;
  useEffect(() => {
    if (failed) toast.show(failed);
  }, [failed, toast]);

  // Opened without a selection (a reload, a typed URL): My words takes its place.
  const empty = ids.length === 0;
  useEffect(() => {
    if (empty) navigate(listUrl, { replace: true });
  }, [empty, listUrl, navigate]);

  const done = (added: number, name: string) => {
    toast.show(addedText(added, name));
    clearSelection();
    go(returnToList(listUrl, fromList));
  };

  const create = async () => {
    const name = typed.trim();
    if (!canCreate(name) || saving) return;
    setSaving({ kind: "new" });
    try {
      const created = await api.createGroup({ name, userWordIds: ids });
      done(created.added, created.group.name);
    } catch (error) {
      // The typed name and the selection stay, so trying again is one tap.
      const taken = error instanceof ApiClientError && error.code === "group_exists";
      toast.show(taken ? groupExistsText(name) : errorMessage(error));
      setSaving(null);
    }
  };

  const addTo = async (id: number, name: string) => {
    if (saving) return;
    setSaving({ kind: "group", id });
    try {
      const { added } = await api.addToGroup(id, ids);
      done(added, name);
    } catch (error) {
      toast.show(errorMessage(error));
      setSaving(null);
    }
  };

  if (empty) return null;

  return (
    <Page
      title="Add to group"
      leading={
        <button
          type="button"
          className={`${ui.pill} ${ui.pillSecondary}`}
          disabled={saving !== null}
          onClick={() => go(backToList(listUrl, fromList))}
        >
          Cancel
        </button>
      }
    >
      <p className={styles.lead}>{selectedLead(ids.length)}</p>

      <form
        id={formId}
        className={`${ui.card} ${styles.naming}`}
        onSubmit={(event) => {
          event.preventDefault();
          create();
        }}
      >
        <label className={ui.label} htmlFor={`${formId}-name`}>
          New group
        </label>
        <div className={styles.nameRow}>
          <input
            id={`${formId}-name`}
            className={`${ui.input} ${ui.sunk}`}
            value={typed}
            placeholder="e.g. Hard ones"
            maxLength={GROUP_NAME_MAX}
            enterKeyHint="done"
            onChange={(event) => setTyped(event.target.value)}
          />
          <button
            type="submit"
            className={`${ui.pill} ${ui.pillPrimary}`}
            disabled={!canCreate(typed) || saving !== null}
          >
            {saving?.kind === "new" && <span className={ui.spinner} />}
            Create
          </button>
        </div>
      </form>

      {groups.kind === "loading" && <p className={styles.muted}>Loading…</p>}
      {groups.kind === "ready" && groups.groups.length > 0 && (
        <CheckList label="Your groups">
          {groups.groups.map((group) => (
            <AddRow
              key={group.id}
              label={group.name}
              count={group.words}
              busy={saving?.kind === "group" && saving.id === group.id}
              disabled={saving !== null}
              onAdd={() => addTo(group.id, group.name)}
            />
          ))}
        </CheckList>
      )}
    </Page>
  );
}
