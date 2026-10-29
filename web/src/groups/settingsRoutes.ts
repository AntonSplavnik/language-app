import { SETTINGS_URL } from "../imports/settingsRoutes";
import { type HistoryStep, leaveSheet } from "../lib/sheetHistory";

// Settings → Groups → Group → Rename group (§10), built as the imports' screens are.

export const GROUPS_URL = "/settings/groups";
export const groupPageUrl = (id: number) => `${GROUPS_URL}/${id}`;
export const renameGroupUrl = (id: number) => `${groupPageUrl(id)}/rename`;

/** What the Filter screen's Edit stores in the history entry of Groups. */
export type GroupsState = {
  /** Opened from Filter, so Filter is the history entry right before it. */
  fromFilter?: boolean;
};

/**
 * Groups' round back button: back one entry, to Filter, when opened from it (Edit); otherwise a
 * link to Settings, as Imports' is.
 */
export const groupsBack = (state: GroupsState | null): HistoryStep =>
  state?.fromFilter ? { back: 1 } : { to: SETTINGS_URL };

/** What Groups' rows store in the history entry of a group's page. */
export type GroupPageState = {
  /** Opened from Groups, so Groups is the history entry right before it. */
  fromGroups?: boolean;
};

/**
 * After Delete group, Groups takes the page's place without adding a history entry: back to it
 * when the page was opened from it, otherwise replacing the page.
 */
export const leaveDeletedGroup = (state: GroupPageState | null): HistoryStep =>
  leaveSheet(GROUPS_URL, Boolean(state?.fromGroups));

/** What a group's Rename row stores in the history entry of Rename group. */
export type RenameGroupState = {
  /** Opened from the group's page, so that page is the history entry right before it. */
  fromGroup?: boolean;
};

/**
 * Save and Cancel on Rename group return to the group's page without adding a history entry, as
 * on Rename import.
 */
export const leaveRenameGroup = (id: number, state: RenameGroupState | null): HistoryStep =>
  leaveSheet(groupPageUrl(id), Boolean(state?.fromGroup));

/** What a group's page and Rename group say when the group isn't listed (any more). */
export const GROUP_MISSING = {
  text: "This group is not in your list any more.",
  to: GROUPS_URL,
  label: "Groups",
};
