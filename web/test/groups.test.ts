import type { GroupSummary } from "@language-app/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  addedText,
  addText,
  canCreate,
  findGroup,
  groupExistsText,
  groupFacts,
  groupNameChange,
  groupSubline,
  groupsStatus,
  removedText,
  removeText,
  selectedLead,
  selectionTitle,
} from "../src/groups/labels";
import { groupsBack, leaveDeletedGroup, leaveRenameGroup } from "../src/groups/settingsRoutes";
import type { Groups } from "../src/groups/useGroups";
import { countParts, groupMenu } from "../src/practice/sources";
import { importRows } from "../src/words/filterScreen";
import { backToList, returnToList, takeListReturn } from "../src/words/listReturn";
import {
  allSelected,
  clearSelection,
  getSelection,
  keepsSelection,
  selectAll,
  setSelected,
  startSelecting,
  toggle,
} from "../src/words/selection";

// Groups and the Filter screen (docs/design.md §10 screens 4, 7, 10 and the M13.2 screens).

const NOW = new Date(2026, 9, 29, 12, 0);
const group = (id: number, name: string, words: number, practisable = words): GroupSummary => ({
  id,
  name,
  words,
  practisable,
  createdAt: new Date(2026, 9, 29 - id, 9, 0).toISOString(),
});

describe("the Filter screen's imports (§10 Filter)", () => {
  const imports = (n: number) => Array.from({ length: n }, (_, i) => ({ id: n - i }));
  const ids = (rows: Array<{ id: number }>) => rows.map((row) => row.id);

  it("shows up to 6 imports in full", () => {
    for (const n of [0, 1, 6]) {
      expect(importRows(imports(n), null, false)).toEqual({ rows: imports(n), more: null });
    }
  });

  it("with more than 6, the 5 newest and a row for all of them", () => {
    const { rows, more } = importRows(imports(23), null, false);
    expect(ids(rows)).toEqual([23, 22, 21, 20, 19]);
    expect(more).toBe(23);
    // The chosen import among the 5 keeps it closed.
    expect(importRows(imports(23), 20, false).more).toBe(23);
  });

  it("open once asked, or when the chosen import is not among the 5", () => {
    expect(importRows(imports(23), null, true)).toEqual({ rows: imports(23), more: null });
    expect(importRows(imports(7), 2, false)).toEqual({ rows: imports(7), more: null });
  });
});

describe("returning to My words without a history entry (§10 Filter, Add to group)", () => {
  afterEach(() => {
    takeListReturn("");
  });

  it("opened from My words: goes back one entry, and My words then shows the list chosen", () => {
    expect(returnToList("/words?status=learning&theme=home", true)).toEqual({ back: 1 });
    // My words, back on its old URL, replaces it with the chosen one, once.
    expect(takeListReturn("/words?status=learning")).toBe("/words?status=learning&theme=home");
    expect(takeListReturn("/words?status=learning")).toBeNull();
  });

  it("the same list as before needs no replacing", () => {
    returnToList("/words?status=learning", true);
    expect(takeListReturn("/words?status=learning")).toBeNull();
  });

  it("opened directly (a typed URL, a reload): replaced by My words", () => {
    expect(returnToList("/words?status=learned&group=7", false)).toEqual({
      to: "/words?status=learned&group=7",
    });
    expect(takeListReturn("/words?status=learning")).toBeNull();
  });

  it("going back unchanged (Back, Cancel) forgets an earlier choice", () => {
    returnToList("/words?status=learning&theme=home", true);
    expect(backToList("/words?status=learning", true)).toEqual({ back: 1 });
    expect(takeListReturn("/words?status=learning")).toBeNull();
    expect(backToList("/words?status=learning", false)).toEqual({ to: "/words?status=learning" });
  });
});

describe("selection mode (§10 My words)", () => {
  afterEach(clearSelection);

  it("a tap selects a word, a second unselects it", () => {
    const once = toggle(new Set(), 4);
    expect([...once]).toEqual([4]);
    expect([...toggle(once, 4)]).toEqual([]);
    expect([...toggle(once, 5)].sort()).toEqual([4, 5]);
  });

  it("Select all adds the list shown; once all are selected it takes them out again, only those", () => {
    const shown = [1, 2, 3];
    const elsewhere = new Set([9]);
    expect(allSelected(elsewhere, shown)).toBe(false);
    const all = selectAll(elsewhere, shown);
    expect([...all].sort()).toEqual([1, 2, 3, 9]);
    expect(allSelected(all, shown)).toBe(true);
    // Deselect all: the words selected in another tab, filter or search stay.
    expect([...selectAll(all, shown)]).toEqual([9]);
    // Some of them selected: Select all adds the rest.
    expect([...selectAll(new Set([2]), shown)].sort()).toEqual([1, 2, 3]);
    // An empty list has nothing to select.
    expect(allSelected(new Set([1]), [])).toBe(false);
  });

  it("the header's title counts the selection", () => {
    expect(selectionTitle(0)).toBe("Select words");
    expect(selectionTitle(1)).toBe("1 selected");
    expect(selectionTitle(3)).toBe("3 selected");
  });

  it("the action bar's buttons", () => {
    expect(addText(0)).toBe("Add to group");
    expect(addText(1)).toBe("Add 1 word to group");
    expect(addText(3)).toBe("Add 3 words to group");
    expect(removeText(0)).toBe("Remove from group");
    expect(removeText(3)).toBe("Remove 3 from group");
  });

  it("lives in memory across My words, Filter and Add to group, and ends anywhere else", () => {
    for (const path of ["/words", "/words/filter", "/words/add-to-group"]) {
      expect(keepsSelection(path), path).toBe(true);
    }
    for (const path of ["/", "/words/4", "/words/new", "/settings/groups", "/practice"]) {
      expect(keepsSelection(path), path).toBe(false);
    }
  });

  it("is kept while selecting, and gone once ended", () => {
    expect(getSelection()).toEqual({ active: false, ids: new Set() });
    startSelecting();
    setSelected(new Set([4, 5]));
    expect(getSelection()).toEqual({ active: true, ids: new Set([4, 5]) });
    clearSelection();
    expect(getSelection()).toEqual({ active: false, ids: new Set() });
  });
});

describe("Add to group and Remove from group (§10)", () => {
  it("says how many are selected", () => {
    expect(selectedLead(1)).toBe("1 word selected");
    expect(selectedLead(3)).toBe("3 words selected");
  });

  it("Create takes a trimmed name of 1–40 characters", () => {
    expect(canCreate("Hard ones")).toBe(true);
    expect(canCreate("  x ")).toBe(true);
    expect(canCreate("   ")).toBe(false);
    expect(canCreate("")).toBe(false);
    expect(canCreate("x".repeat(40))).toBe(true);
    expect(canCreate("x".repeat(41))).toBe(false);
  });

  it("toasts what happened, counting only the words added or removed", () => {
    expect(addedText(3, "Hard ones")).toBe("Added 3 words to Hard ones");
    expect(addedText(1, "Hard ones")).toBe("Added 1 word to Hard ones");
    expect(addedText(0, "Hard ones")).toBe("They're all in Hard ones already");
    expect(removedText(3, "Hard ones")).toBe("Removed 3 words from Hard ones");
    expect(removedText(1, "Hard ones")).toBe("Removed 1 word from Hard ones");
    expect(groupExistsText("hard ones")).toBe("You already have a group called “hard ones”.");
  });
});

describe("Settings → Groups (§10)", () => {
  const ready = (groups: GroupSummary[]): Groups => ({ kind: "ready", groups });

  it("the Groups row counts the groups, and shows nothing while there are none", () => {
    expect(groupsStatus(ready([group(1, "A", 2), group(2, "B", 0)]))).toBe("2");
    expect(groupsStatus(ready([]))).toBeNull();
    expect(groupsStatus({ kind: "loading" })).toBeNull();
    expect(groupsStatus({ kind: "error", message: "No connection" })).toBeNull();
  });

  it("a group's row and page say its words and the day it was made", () => {
    const hard = group(0, "Hard ones", 8);
    expect(groupSubline(hard, NOW, "en-GB")).toBe("8 words · 29 Oct");
    expect(groupFacts(group(0, "One", 1), NOW, "en-GB")).toBe("1 word · made 29 Oct");
    expect(
      groupFacts({ ...hard, createdAt: new Date(2025, 0, 3).toISOString() }, NOW, "en-GB"),
    ).toBe("8 words · made 3 Jan 2025");
  });

  it("finds a group among the groups; one not listed (any more) is missing", () => {
    const list = ready([group(1, "A", 2), group(2, "B", 0)]);
    expect(findGroup(list, 2)).toEqual({ kind: "ready", group: group(2, "B", 0) });
    expect(findGroup(list, 3)).toEqual({ kind: "missing" });
    expect(findGroup({ kind: "loading" }, 2)).toEqual({ kind: "loading" });
    expect(findGroup({ kind: "error", message: "No connection" }, 2)).toEqual({
      kind: "failed",
      message: "No connection",
    });
  });

  it("Rename group saves a trimmed name of 1–40 that differs, a change of case included", () => {
    expect(groupNameChange("Hard ones", "Harder ones ")).toBe("Harder ones");
    expect(groupNameChange("Hard ones", "hard ones")).toBe("hard ones");
    expect(groupNameChange("Hard ones", " Hard ones ")).toBeUndefined();
    expect(groupNameChange("Hard ones", "   ")).toBeUndefined();
    expect(groupNameChange("Hard ones", "x".repeat(41))).toBeUndefined();
  });

  it("Save and Cancel on Rename group return to the group's page without a history entry", () => {
    expect(leaveRenameGroup(7, { fromGroup: true })).toEqual({ back: 1 });
    expect(leaveRenameGroup(7, null)).toEqual({ to: "/settings/groups/7" });
  });

  it("after Delete group, Groups takes the page's place without a history entry", () => {
    expect(leaveDeletedGroup({ fromGroups: true })).toEqual({ back: 1 });
    expect(leaveDeletedGroup(null)).toEqual({ to: "/settings/groups" });
  });

  it("Groups' back button returns to Filter when opened from it (Edit), else to Settings", () => {
    expect(groupsBack({ fromFilter: true })).toEqual({ back: 1 });
    expect(groupsBack(null)).toEqual({ to: "/settings" });
  });
});

describe("Practice setup's Group card (§10 screen 4)", () => {
  it("offers the groups with words to practise, newest first, and starts on the newest", () => {
    const menu = groupMenu([group(1, "Empty", 0), group(2, "Hard ones", 8), group(3, "Old", 4, 2)]);
    expect(menu.groups.map((item) => item.name)).toEqual(["Hard ones", "Old"]);
    expect(menu.start).toBe(2);
  });

  it("counts the chosen group's words to practise", () => {
    const { groups } = groupMenu([group(1, "Big", 40, 34)]);
    expect(countParts(groups[0]?.practisable ?? 0)).toEqual({ number: 20, rest: "of 34 words" });
  });

  it("without a group to practise, the card has no menu and no words", () => {
    for (const list of [[], [group(1, "Ignored", 3, 0)]]) {
      expect(groupMenu(list)).toEqual({ groups: [], start: null });
    }
  });
});
