import { useEffect } from "react";
import { ACCOUNT_URL } from "../auth/rules";
import { useSignedInUser } from "../auth/session";
import { MenuCard, MenuRow } from "../components/MenuCard";
import { Page } from "../components/Page";
import { importsStatus } from "../imports/labels";
import { IMPORTS_URL } from "../imports/settingsRoutes";
import { usePastImports } from "../imports/usePastImports";
import { useToast } from "../lib/toast";

/**
 * Settings (§10 screen 10): a menu, one row per section. Account first, with the username, then
 * Imports; later sections (such as the daily goal) join the card.
 */
export function SettingsScreen() {
  const toast = useToast();
  const user = useSignedInUser();
  const { state } = usePastImports();

  // Without the past imports the row just has no count; Imports itself offers Try again.
  const importsError = state.kind === "error" ? state.message : null;
  useEffect(() => {
    if (importsError) toast.show(importsError);
  }, [importsError, toast]);

  return (
    <Page largeTitle="Settings" back="/">
      <MenuCard>
        <MenuRow to={ACCOUNT_URL} name="Account" status={user.displayUsername ?? user.username} />
        <MenuRow to={IMPORTS_URL} name="Imports" status={importsStatus(state)} />
      </MenuCard>
    </Page>
  );
}
