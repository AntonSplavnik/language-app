import {
  displayTranslation,
  LEARNED_STREAK,
  type WordListItem,
  type WordListResponse,
  type WordSort,
} from "@language-app/core";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api } from "../api";
import { FilterPill } from "../components/FilterPill";
import { Headword } from "../components/Headword";
import { BookIcon, CheckIcon, SearchIcon } from "../components/icons";
import { Page } from "../components/Page";
import { SegmentedTabs } from "../components/SegmentedTabs";
import { SelectPill } from "../components/SelectPill";
import { addText, removedText, removeText, selectionTitle } from "../groups/labels";
import { useGroups } from "../groups/useGroups";
import { labelImports } from "../imports/labels";
import { usePastImports } from "../imports/usePastImports";
import { errorMessage, useToast } from "../lib/toast";
import ui from "../styles/ui.module.css";
import { wordCount } from "../words/counts";
import { groupByDay } from "../words/groupByDay";
import { groupByLetter } from "../words/groupByLetter";
import { progressLabel } from "../words/labels";
import {
  addToGroupUrl,
  emptyFilterText,
  filterGone,
  filterKey,
  filterText,
  filterUrl,
  type ListQuery,
  listParams,
  listRequest,
  parseListQuery,
  sectionsBy,
  TABS,
  wordsUrl,
} from "../words/listQuery";
import { takeListReturn } from "../words/listReturn";
import {
  allSelected,
  clearSelection,
  selectAll,
  startSelecting,
  toggle,
  updateSelected,
  useSelection,
} from "../words/selection";
import { useThemes } from "../words/useThemes";
import styles from "./MyWordsScreen.module.css";

/** Typing waits this long before searching. */
const SEARCH_DELAY_MS = 250;

/** One dot per right answer in a row that it takes to learn a word: 1, 2, 3. */
const STREAK_DOTS = Array.from({ length: LEARNED_STREAK }, (_, index) => index + 1);

const SORT_TEXT: Record<WordSort, string> = { az: "A–Z", newest: "Newest first" };

/** What Filter and Add to group store in their history entry: opened from My words. */
export type FromList = { fromList?: boolean };
const FROM_LIST: FromList = { fromList: true };

type Loaded = { query: ListQuery; data: WordListResponse };

/**
 * The learner's words by status, with search, the sort, the filter and selection mode (§10 My
 * words).
 */
export function MyWordsScreen() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const query = parseListQuery(params);
  const { status, q, sort, filter } = query;
  // Strings, so effects and callbacks don't run again for an equal query.
  const key = filterKey(filter);
  const search = params.toString();
  const here = wordsUrl(query);

  const [text, setText] = useState(q);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const latestRequest = useRef(0);
  const selection = useSelection();
  const { state: past } = usePastImports();
  const imports = past.kind === "ready" ? labelImports(past.imports) : null;
  const themeList = useThemes();
  const themes = themeList.kind === "ready" ? themeList.themes : null;
  const { state: groupList } = useGroups();
  const groups = groupList.kind === "ready" ? groupList.groups : null;

  // Back from Filter or Add to group with a list chosen: it replaces this entry's list, so Back
  // from here goes where it went before (§10 Filter).
  useLayoutEffect(() => {
    const chosen = takeListReturn(here);
    if (chosen) navigate(chosen, { replace: true });
  }, [here, navigate]);

  // The search, sort and filter go into the URL, so Back from a word returns to the same list.
  // `replace`: tabs, searches, sorts and filters are not steps the Back button should walk through.
  const show = useCallback(
    (change: Partial<ListQuery>) =>
      setParams((current) => listParams({ ...parseListQuery(current), ...change }), {
        replace: true,
      }),
    [setParams],
  );

  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => show({ q: text }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, q, show]);

  // Only the latest request may show its answer: typing can overtake a slow one.
  const load = useCallback(() => {
    const request = ++latestRequest.current;
    const asked = parseListQuery(new URLSearchParams(search));
    setError(null);
    api.listWords(listRequest(asked)).then(
      (data) => request === latestRequest.current && setLoaded({ query: asked, data }),
      (failure) => request === latestRequest.current && setError(errorMessage(failure)),
    );
  }, [search]);

  useEffect(load, [load]);

  // Without the imports, themes or groups the list still loads as asked; the Filter pill then
  // says "One import" or "One group".
  useFailureToast(past.kind === "error" ? past.message : null);
  useFailureToast(themeList.kind === "error" ? themeList.message : null);
  useFailureToast(groupList.kind === "error" ? groupList.message : null);

  // A filter no longer offered (an import whose words were all deleted, a theme without words, a
  // deleted group) falls back to all words, keeping the tab, search and sort.
  const gone = filterGone(filter, { imports, themes, groups });
  useEffect(() => {
    if (gone) show({ filter: null });
  }, [gone, show]);

  // While another search loads, the previous results of the same tab, sort and filter stay.
  const shown =
    loaded?.query.status === status &&
    loaded.query.sort === sort &&
    filterKey(loaded.query.filter) === key
      ? loaded
      : null;
  const shownIds = shown?.data.words.map((word) => word.userWordId) ?? [];
  // How many words there are in all (in the filter); a search's counts are only its matches.
  const total = loaded && !loaded.query.q ? wordCount(loaded.data.counts) : null;

  const selecting = selection.active;
  const selected = selection.ids.size;
  const groupId = filter?.kind === "group" ? filter.groupId : null;

  const remove = async () => {
    if (groupId === null || selected === 0 || removing) return;
    setRemoving(true);
    try {
      const { removed } = await api.removeFromGroup(groupId, [...selection.ids]);
      toast.show(removedText(removed, filterText(filter, { imports, groups })));
      clearSelection();
      load();
    } catch (failure) {
      // The selection stays, so trying again is one tap.
      toast.show(errorMessage(failure));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Page
      largeTitle="My words"
      back={selecting ? undefined : "/"}
      title={selecting ? selectionTitle(selected) : undefined}
      leading={
        selecting && (
          <button
            type="button"
            className={`${ui.pill} ${ui.pillSecondary}`}
            disabled={removing}
            onClick={clearSelection}
          >
            Cancel
          </button>
        )
      }
      action={
        selecting ? (
          <button
            type="button"
            className={`${ui.pill} ${ui.pillSecondary}`}
            disabled={shownIds.length === 0 || removing}
            onClick={() => updateSelected((ids) => selectAll(ids, shownIds))}
          >
            {allSelected(selection.ids, shownIds) ? "Deselect all" : "Select all"}
          </button>
        ) : (
          total && <span className={styles.total}>{total}</span>
        )
      }
      footer={
        selecting && (
          <div className={styles.actions}>
            <button
              type="button"
              className={`${ui.button} ${ui.primary} ${ui.cta}`}
              disabled={selected === 0 || removing}
              onClick={() => navigate(addToGroupUrl(query), { state: FROM_LIST })}
            >
              {addText(selected)}
            </button>
            {groupId !== null && (
              <button
                type="button"
                className={`${ui.button} ${ui.secondary} ${ui.large}`}
                disabled={selected === 0 || removing}
                onClick={remove}
              >
                {removing && <span className={ui.spinner} />}
                {removeText(selected)}
              </button>
            )}
          </div>
        )
      }
    >
      <form
        className={styles.search}
        onSubmit={(event) => {
          event.preventDefault();
          // Enter searches at once and closes the keyboard.
          show({ q: text });
          (document.activeElement as HTMLElement | null)?.blur();
        }}
      >
        <SearchIcon size={18} className={styles.searchIcon} />
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search German or English"
          aria-label="Search your words"
          value={text}
          onChange={(event) => setText(event.target.value)}
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </form>

      <div className={styles.pills}>
        <SelectPill
          className={styles.sort}
          label="Sort words"
          text={SORT_TEXT[sort]}
          value={sort}
          onChange={(value) => show({ sort: value === "newest" ? "newest" : "az" })}
        >
          <option value="az">{SORT_TEXT.az}</option>
          <option value="newest">{SORT_TEXT.newest}</option>
        </SelectPill>
        <FilterPill
          to={filterUrl(query)}
          state={FROM_LIST}
          chosen={filter ? filterText(filter, { imports, groups }) : null}
          onClear={() => show({ filter: null })}
        />
        {!selecting && (
          <button
            type="button"
            className={`${ui.pill} ${ui.pillSecondary} ${styles.select}`}
            onClick={startSelecting}
          >
            Select
          </button>
        )}
      </div>

      <SegmentedTabs
        label="Word status"
        current={status}
        tabs={TABS.map((tab) => ({
          key: tab.status,
          label: tab.label,
          to: wordsUrl({ ...query, status: tab.status }),
          count: loaded?.data.counts[tab.status],
        }))}
      />

      {error && (
        <div className={`${ui.card} ${styles.error}`} role="alert">
          <span>{error}</span>
          <button
            type="button"
            className={`${ui.button} ${ui.secondary} ${ui.small}`}
            onClick={load}
          >
            Try again
          </button>
        </div>
      )}

      {!shown && !error && <p className={styles.muted}>Loading…</p>}

      {shown &&
        (shown.data.words.length === 0 ? (
          <EmptyList query={shown.query} counts={shown.data.counts} />
        ) : (
          <div className={styles.results} aria-busy={shown.query.q !== q}>
            <Sections
              words={shown.data.words}
              query={shown.query}
              row={(word) =>
                selecting ? (
                  <SelectRow
                    key={word.userWordId}
                    word={word}
                    selected={selection.ids.has(word.userWordId)}
                    onToggle={() => updateSelected((ids) => toggle(ids, word.userWordId))}
                  />
                ) : (
                  <WordRow key={word.userWordId} word={word} from={here} />
                )
              }
            />
          </div>
        ))}
    </Page>
  );
}

/** A failed load of what the Filter pill names, said once in a toast. */
function useFailureToast(message: string | null) {
  const toast = useToast();
  useEffect(() => {
    if (message) toast.show(message);
  }, [message, toast]);
}

/**
 * Without a search, newest first under day headings and A–Z under letter headings, for every list,
 * filtered or not; while searching, one flat list.
 */
function Sections({
  words,
  query,
  row,
}: {
  words: WordListItem[];
  query: ListQuery;
  row: (word: WordListItem) => ReactNode;
}) {
  const by = sectionsBy(query);
  if (by === "none") return <ul className={styles.list}>{words.map(row)}</ul>;
  const sections =
    by === "day"
      ? groupByDay(words)
      : groupByLetter(words).map((group) => ({ heading: group.letter, words: group.words }));
  return sections.map((section) => (
    // Keyed by its first word: a heading can come back later in the server's order.
    <section key={section.words[0]?.userWordId}>
      <h2 className={styles.letter}>{section.heading}</h2>
      <ul className={styles.list}>{section.words.map(row)}</ul>
    </section>
  ));
}

/** Headword over translation, the progress mark at the right; the whole row opens the word. */
function WordRow({ word, from }: { word: WordListItem; from: string }) {
  return (
    <li>
      <Link to={`/words/${word.userWordId}`} state={{ from }} className={styles.row}>
        <RowContent word={word} />
      </Link>
    </li>
  );
}

/** In selection mode: a circle at the left; the whole row selects or unselects the word. */
function SelectRow({
  word,
  selected,
  onToggle,
}: {
  word: WordListItem;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`${styles.row} ${styles.selectRow}`}
        aria-pressed={selected}
        onClick={onToggle}
      >
        <span className={`${styles.check} ${selected ? styles.checked : ""}`} aria-hidden>
          {selected && <CheckIcon size={14} weight={3} />}
        </span>
        <RowContent word={word} />
      </button>
    </li>
  );
}

function RowContent({ word }: { word: WordListItem }) {
  const progress = progressLabel(word);
  return (
    <>
      <span className={styles.text}>
        <Headword word={word} className={styles.headword} />
        <span className={styles.translation}>{displayTranslation(word)}</span>
      </span>
      {progress &&
        (progress.kind === "new" ? (
          <span className={styles.new}>
            <span aria-hidden>{progress.text}</span>
            <span className={ui.srOnly}>{progress.spoken}</span>
          </span>
        ) : (
          <span className={styles.dots}>
            {STREAK_DOTS.map((dot) => (
              <span
                key={dot}
                aria-hidden
                className={`${styles.dot} ${dot <= progress.filled ? styles.filled : ""}`}
              />
            ))}
            <span className={ui.srOnly}>{progress.spoken}</span>
          </span>
        ))}
    </>
  );
}

/** What an empty tab says: a headline, then what belongs there. */
const EMPTY: Record<ListQuery["status"], { title: string; text: string }> = {
  learning: {
    title: "No words to learn.",
    text: "Import the pages you studied to collect their new words.",
  },
  learned: {
    title: "No learned words yet.",
    text: "A word counts as learned after 3 right answers in a row.",
  },
  ignored: {
    title: "No ignored words.",
    text: "Words you ignore in a review land here and are never offered again.",
  },
};

function EmptyList({ query, counts }: { query: ListQuery; counts: WordListResponse["counts"] }) {
  const tab = TABS.find((t) => t.status === query.status)?.label.toLowerCase();
  // A search or a filter may have words in the other tabs.
  const elsewhere = TABS.filter((t) => t.status !== query.status && counts[t.status] > 0).map(
    (t) => (
      <Link
        key={t.status}
        to={wordsUrl({ ...query, status: t.status })}
        replace
        className={`${ui.button} ${ui.quiet}`}
      >
        {counts[t.status]} in {t.label} ›
      </Link>
    ),
  );

  if (query.q) {
    return (
      <div className={styles.empty}>
        <EmptyIcon />
        <p className={styles.emptyTitle}>
          No {tab} words match “{query.q}”.
        </p>
        {elsewhere}
      </div>
    );
  }
  if (query.filter?.kind === "group" && counts.learning + counts.learned + counts.ignored === 0) {
    return (
      <div className={styles.empty}>
        <EmptyIcon />
        <p className={styles.emptyTitle}>No words in this group yet.</p>
        <p>Use Select to add some.</p>
      </div>
    );
  }
  if (query.filter) {
    return (
      <div className={styles.empty}>
        <EmptyIcon />
        <p className={styles.emptyTitle}>{emptyFilterText(query.status, query.filter)}</p>
        {elsewhere}
      </div>
    );
  }
  return (
    <div className={styles.empty}>
      <EmptyIcon />
      <p className={styles.emptyTitle}>{EMPTY[query.status].title}</p>
      <p>{EMPTY[query.status].text}</p>
      {query.status === "learning" && (
        <Link to="/imports/new" className={`${ui.button} ${ui.secondary}`}>
          New import
        </Link>
      )}
    </div>
  );
}

const EmptyIcon = () => (
  <span className={styles.emptyIcon}>
    <BookIcon size={28} />
  </span>
);
