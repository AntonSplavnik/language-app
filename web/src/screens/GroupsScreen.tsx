import { Link, useLocation } from "react-router";
import { ChevronRightIcon } from "../components/icons";
import { Page } from "../components/Page";
import { groupSubline } from "../groups/labels";
import {
  type GroupPageState,
  type GroupsState,
  groupPageUrl,
  groupsBack,
} from "../groups/settingsRoutes";
import { useGroups } from "../groups/useGroups";
import { useHistoryStep } from "../lib/sheetHistory";
import ui from "../styles/ui.module.css";
import styles from "./PastImportsScreen.module.css";

/** A group's page goes back here after Delete group, without adding a history entry. */
const FROM_GROUPS: GroupPageState = { fromGroups: true };

/**
 * Groups (§10): the learner's groups, newest first, as Imports lists the past imports; a row opens
 * the group's page. Opened from the Filter screen's Edit, Back returns there.
 */
export function GroupsScreen() {
  const go = useHistoryStep();
  const state = useLocation().state as GroupsState | null;
  const { state: groups, reload } = useGroups();
  const back = groupsBack(state);

  return (
    <Page
      largeTitle="Groups"
      back={"to" in back ? back.to : undefined}
      onBack={"back" in back ? () => go(back) : undefined}
    >
      {groups.kind === "loading" && <p className={styles.muted}>Loading…</p>}

      {groups.kind === "error" && (
        <div className={`${ui.card} ${styles.error}`} role="alert">
          <span>{groups.message}</span>
          <button
            type="button"
            className={`${ui.button} ${ui.secondary} ${ui.small}`}
            onClick={reload}
          >
            Try again
          </button>
        </div>
      )}

      {groups.kind === "ready" &&
        (groups.groups.length === 0 ? (
          <p className={styles.muted}>No groups yet. Use Select in My words to make one.</p>
        ) : (
          <ul className={styles.list}>
            {groups.groups.map((group) => (
              <li key={group.id}>
                <Link to={groupPageUrl(group.id)} state={FROM_GROUPS} className={styles.row}>
                  <span className={styles.text}>
                    <span className={styles.name}>{group.name}</span>
                    <span className={styles.sub}>{groupSubline(group)}</span>
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
