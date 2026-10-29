import { GROUP_NAME_MAX, type GroupSummary } from "@language-app/core";
import { dateText } from "../lib/dates";
import type { Groups } from "./useGroups";

// How screens speak of groups and of the words selected for them (docs/design.md §10: My words'
// selection mode, Add to group, Settings → Groups, a group's page, Rename group).

const wordsText = (count: number) => `${count} ${count === 1 ? "word" : "words"}`;

/** Selection mode's title: "3 selected", "Select words" with none. */
export const selectionTitle = (count: number) =>
  count === 0 ? "Select words" : `${count} selected`;

/** The action bar's main button: "Add 3 words to group", "Add to group" with none. */
export const addText = (count: number) =>
  count === 0 ? "Add to group" : `Add ${wordsText(count)} to group`;

/** The action bar's second button in a group's list: "Remove 3 from group". */
export const removeText = (count: number) =>
  count === 0 ? "Remove from group" : `Remove ${count} from group`;

/** Add to group's lead line: "3 words selected". */
export const selectedLead = (count: number) => `${wordsText(count)} selected`;

/** Whether Create can make a group of the typed name: trimmed, 1–40 characters. */
export const canCreate = (typed: string) => {
  const name = typed.trim();
  return name.length > 0 && name.length <= GROUP_NAME_MAX;
};

/** The toast after adding: counts only the words that were new to the group. */
export const addedText = (added: number, name: string) =>
  added === 0 ? `They're all in ${name} already` : `Added ${wordsText(added)} to ${name}`;

/** The toast after removing: counts only the words that were in the group. */
export const removedText = (removed: number, name: string) =>
  `Removed ${wordsText(removed)} from ${name}`;

/** A name the learner already has, ignoring case (409 `group_exists`). */
export const groupExistsText = (name: string) => `You already have a group called “${name}”.`;

/** Groups' grey line under a name: "8 words · 29 Oct", the day it was made. */
export const groupSubline = (group: GroupSummary, now: Date = new Date(), locale?: string) =>
  `${wordsText(group.words)} · ${dateText(new Date(group.createdAt), now, locale)}`;

/** The muted line under a group's title on its page: "8 words · made 29 Oct". */
export const groupFacts = (group: GroupSummary, now: Date = new Date(), locale?: string) =>
  `${wordsText(group.words)} · made ${dateText(new Date(group.createdAt), now, locale)}`;

/** Settings' Groups row: the number of groups, nothing while there are none. */
export const groupsStatus = (state: Groups): string | null =>
  state.kind === "ready" && state.groups.length > 0 ? String(state.groups.length) : null;

/** One group as its page and Rename group hold it while the groups load. */
export type OneGroup =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "missing" }
  | { kind: "ready"; group: GroupSummary };

/** Finds a group among the learner's; one that isn't listed (any more, or a mistyped id) is missing. */
export function findGroup(state: Groups, id: number): OneGroup {
  if (state.kind === "loading") return { kind: "loading" };
  if (state.kind === "error") return { kind: "failed", message: state.message };
  const group = state.groups.find((each) => each.id === id);
  return group ? { kind: "ready", group } : { kind: "missing" };
}

/**
 * What saving the typed text on Rename group would store: the trimmed name, when it has 1–40
 * characters and differs from the current one (a change of case counts); otherwise undefined.
 */
export function groupNameChange(current: string, typed: string): string | undefined {
  const next = typed.trim();
  return canCreate(next) && next !== current ? next : undefined;
}
