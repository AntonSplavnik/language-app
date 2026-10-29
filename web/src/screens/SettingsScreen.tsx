import { useEffect } from "react";
import { ACCOUNT_URL } from "../auth/rules";
import { useSignedInUser } from "../auth/session";
import { MenuCard, MenuRow } from "../components/MenuCard";
import { Page } from "../components/Page";
import { groupsStatus } from "../groups/labels";
import { GROUPS_URL } from "../groups/settingsRoutes";
import { useGroups } from "../groups/useGroups";
import { importsStatus } from "../imports/labels";
import { IMPORTS_URL } from "../imports/settingsRoutes";
import { usePastImports } from "../imports/usePastImports";
import { useToast } from "../lib/toast";

/**
 * Settings (§10 screen 10): a menu, one row per section. Account first, with the username, then
 * Imports and Groups; later sections (such as the daily goal) join the card.
 */
export function SettingsScreen() {
  const toast = useToast();
  const user = useSignedInUser();
  const { state } = usePastImports();
  const { state: groups } = useGroups();

  // Without the past imports or the groups the row just has no count; Imports and Groups
  // themselves offer Try again.
  const importsError = state.kind === "error" ? state.message : null;
  useEffect(() => {
    if (importsError) toast.show(importsError);
  }, [importsError, toast]);
  const groupsError = groups.kind === "error" ? groups.message : null;
  useEffect(() => {
    if (groupsError) toast.show(groupsError);
  }, [groupsError, toast]);

  return (
    <Page largeTitle="Settings" back="/">
      <MenuCard>
        <MenuRow to={ACCOUNT_URL} name="Account" status={user.displayUsername ?? user.username} />
        <MenuRow to={IMPORTS_URL} name="Imports" status={importsStatus(state)} />
        <MenuRow to={GROUPS_URL} name="Groups" status={groupsStatus(groups)} />
      </MenuCard>
    </Page>
  );
}
