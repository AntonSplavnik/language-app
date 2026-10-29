import { useState } from "react";
import { useLocation, useParams } from "react-router";
import { api } from "../api";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { LoadState } from "../components/LoadState";
import { MenuCard, MenuRow } from "../components/MenuCard";
import { Page } from "../components/Page";
import { findGroup, groupFacts } from "../groups/labels";
import {
  GROUP_MISSING,
  GROUPS_URL,
  type GroupPageState,
  leaveDeletedGroup,
  type RenameGroupState,
  renameGroupUrl,
} from "../groups/settingsRoutes";
import { useGroups } from "../groups/useGroups";
import { useHistoryStep } from "../lib/sheetHistory";
import { errorMessage, useToast } from "../lib/toast";
import styles from "./PastImportScreen.module.css";

/** What deleting a group leaves: its words stay in the list. */
const staying = (words: number) =>
  words === 0
    ? "It has no words."
    : words === 1
      ? "Its 1 word stays in your list."
      : `Its ${words} words stay in your list.`;

/**
 * One group (§10), as an import's page: its name as the title, its words and the day it was made,
 * a card of actions (Rename), and Delete group at the bottom.
 */
export function GroupScreen() {
  const id = Number(useParams().id);
  const state = useLocation().state as GroupPageState | null;
  const go = useHistoryStep();
  const toast = useToast();
  const { state: groups, reload } = useGroups();
  const found = findGroup(groups, id);
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (found.kind !== "ready") {
    return (
      <Page back={GROUPS_URL}>
        <LoadState loading={found} missing={GROUP_MISSING} onRetry={reload} />
      </Page>
    );
  }

  const { group } = found;
  // Rename group returns here by going back, without adding a history entry.
  const renameState: RenameGroupState = { fromGroup: true };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.deleteGroup(group.id);
      toast.show("Group deleted");
      go(leaveDeletedGroup(state));
    } catch (error) {
      toast.show(errorMessage(error));
      setDeleting(false);
    }
  };

  return (
    <Page back={GROUPS_URL} largeTitle={<span className={styles.title}>{group.name}</span>}>
      <p className={styles.facts}>{groupFacts(group)}</p>
      <MenuCard>
        <MenuRow to={renameGroupUrl(group.id)} state={renameState} name="Rename" />
      </MenuCard>
      <ConfirmDelete
        label="Delete group"
        question={`Delete the group “${group.name}”?`}
        asking={asking}
        onAsk={() => setAsking(true)}
        onKeep={() => setAsking(false)}
        onDelete={remove}
        deleting={deleting}
      >
        {staying(group.words)}
      </ConfirmDelete>
    </Page>
  );
}
