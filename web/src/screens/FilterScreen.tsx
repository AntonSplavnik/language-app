import { themeLabel } from "@language-app/core";
import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { CheckList, CheckRow, checkListAction, MoreRow } from "../components/CheckList";
import { Page } from "../components/Page";
import { GROUPS_URL, type GroupsState } from "../groups/settingsRoutes";
import { useGroups } from "../groups/useGroups";
import { labelImports } from "../imports/labels";
import { usePastImports } from "../imports/usePastImports";
import { useHistoryStep } from "../lib/sheetHistory";
import { useToast } from "../lib/toast";
import { importRows } from "../words/filterScreen";
import { filterKey, type ListFilter, parseListQuery, wordsUrl } from "../words/listQuery";
import { backToList, returnToList } from "../words/listReturn";
import { useThemes } from "../words/useThemes";
import type { FromList } from "./MyWordsScreen";

/** Groups' Edit link opens Settings → Groups, whose Back returns here. */
const FROM_FILTER: GroupsState = { fromFilter: true };

/**
 * Filter (§10): one filter for My words at a time, chosen from the imports, the themes and the
 * groups, each with its words. A tap chooses it and returns to My words at once, without adding a
 * history entry; the screen only chooses (groups are edited in Settings → Groups).
 */
export function FilterScreen() {
  const toast = useToast();
  const go = useHistoryStep();
  const [params] = useSearchParams();
  const fromList = Boolean((useLocation().state as FromList | null)?.fromList);
  const query = parseListQuery(params);
  const current = filterKey(query.filter);
  const [allImports, setAllImports] = useState(false);
  const { state: past } = usePastImports();
  const themes = useThemes();
  const { state: groups } = useGroups();

  // A section that can't load is a toast and is left out (§12).
  const failure = [past, themes, groups].find((list) => list.kind === "error");
  const failed = failure?.kind === "error" ? failure.message : null;
  useEffect(() => {
    if (failed) toast.show(failed);
  }, [failed, toast]);

  const choose = (filter: ListFilter | null) =>
    go(returnToList(wordsUrl({ ...query, filter }), fromList));
  const row = (filter: ListFilter, label: string, count: number) => (
    <CheckRow
      key={filterKey(filter)}
      label={label}
      count={count}
      checked={filterKey(filter) === current}
      onToggle={() => choose(filter)}
    />
  );

  const imports =
    past.kind === "ready"
      ? importRows(
          labelImports(past.imports),
          query.filter?.kind === "import" ? query.filter.importId : null,
          allImports,
        )
      : null;

  return (
    <Page largeTitle="Filter" onBack={() => go(backToList(wordsUrl(query), fromList))}>
      <CheckList>
        <CheckRow label="All words" checked={current === ""} onToggle={() => choose(null)} />
      </CheckList>

      {past.kind === "loading" && <CheckList label="Imports" help="Loading…" />}
      {imports && imports.rows.length > 0 && (
        <CheckList label="Imports">
          {imports.rows.map((item) =>
            row({ kind: "import", importId: item.id }, item.label, item.words),
          )}
          {imports.more !== null && (
            <MoreRow label={`All ${imports.more} imports`} onShow={() => setAllImports(true)} />
          )}
        </CheckList>
      )}

      {themes.kind === "loading" && <CheckList label="Themes" help="Loading…" />}
      {themes.kind === "ready" && themes.themes.length > 0 && (
        <CheckList label="Themes">
          {themes.themes.map((theme) =>
            row({ kind: "theme", theme: theme.key }, themeLabel(theme.key), theme.words),
          )}
        </CheckList>
      )}

      {groups.kind === "loading" && <CheckList label="Groups" help="Loading…" />}
      {groups.kind === "ready" &&
        (groups.groups.length > 0 ? (
          <CheckList
            label="Groups"
            action={
              <Link to={GROUPS_URL} state={FROM_FILTER} className={checkListAction}>
                Edit
              </Link>
            }
          >
            {groups.groups.map((group) =>
              row({ kind: "group", groupId: group.id }, group.name, group.words),
            )}
          </CheckList>
        ) : (
          <CheckList label="Groups" help="No groups yet. Use Select in My words to make one." />
        ))}
    </Page>
  );
}
