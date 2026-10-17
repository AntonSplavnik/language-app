import {
  displayTranslation,
  LEARNED_STREAK,
  type WordListItem,
  type WordListResponse,
} from "@language-app/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api } from "../api";
import { Headword } from "../components/Headword";
import { BookIcon, SearchIcon } from "../components/icons";
import { Page } from "../components/Page";
import { SelectPill } from "../components/SelectPill";
import { type LabelledImport, labelImports } from "../imports/labels";
import { usePastImports } from "../imports/usePastImports";
import { errorMessage, useToast } from "../lib/toast";
import ui from "../styles/ui.module.css";
import { wordCount } from "../words/counts";
import { groupByDay } from "../words/groupByDay";
import { groupByLetter } from "../words/groupByLetter";
import { progressLabel } from "../words/labels";
import {
  type ListQuery,
  type ListView,
  listParams,
  listRequest,
  parseListQuery,
  TABS,
  viewFromValue,
  viewValue,
  wordsUrl,
} from "../words/listQuery";
import styles from "./MyWordsScreen.module.css";

/** Typing waits this long before searching. */
const SEARCH_DELAY_MS = 250;

/** One dot per right answer in a row that it takes to learn a word: 1, 2, 3. */
const STREAK_DOTS = Array.from({ length: LEARNED_STREAK }, (_, index) => index + 1);

type Loaded = { query: ListQuery; data: WordListResponse };

/** The learner's words by status, with search and the view menu (§10 My words). */
export function MyWordsScreen() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const query = parseListQuery(params);
  const { status, q, view } = query;
  // A string, so effects and callbacks don't run again for an equal view.
  const viewKey = viewValue(view);

  const [text, setText] = useState(q);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);
  const { state: past } = usePastImports();
  const imports = past.kind === "ready" ? labelImports(past.imports) : null;

  // The search and the view go into the URL, so Back from a word returns to the same list.
  // `replace`: tabs, searches and views are not steps the Back button should walk through.
  const show = useCallback(
    (change: Partial<ListQuery>) =>
      setParams(listParams({ status, q, view: viewFromValue(viewKey), ...change }), {
        replace: true,
      }),
    [status, q, viewKey, setParams],
  );

  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => show({ q: text }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, q, show]);

  // Only the latest request may show its answer: typing can overtake a slow one.
  const load = useCallback(() => {
    const request = ++latestRequest.current;
    const asked: ListQuery = { status, q, view: viewFromValue(viewKey) };
    setError(null);
    api.listWords(listRequest(asked)).then(
      (data) => request === latestRequest.current && setLoaded({ query: asked, data }),
      (failure) => request === latestRequest.current && setError(errorMessage(failure)),
    );
  }, [status, q, viewKey]);

  useEffect(load, [load]);

  // Without the imports the list still loads as asked; the menu offers only the All words views.
  const importsError = past.kind === "error" ? past.message : null;
  useEffect(() => {
    if (importsError) toast.show(importsError);
  }, [importsError, toast]);

  // An import that is no longer in the menu (its words were all deleted) falls back to A–Z.
  const importGone =
    view.kind === "import" && imports !== null && !imports.some((i) => i.id === view.importId);
  useEffect(() => {
    if (importGone) show({ view: { kind: "az" } });
  }, [importGone, show]);

  // While another search loads, the previous results of the same tab and view stay on screen.
  const shown =
    loaded?.query.status === status && viewValue(loaded.query.view) === viewKey ? loaded : null;
  const here = wordsUrl(query);
  // How many words there are in all (in the chosen import); a search's counts are only its matches.
  const total = loaded && !loaded.query.q ? wordCount(loaded.data.counts) : null;

  return (
    <Page
      largeTitle="My words"
      back="/"
      action={total && <span className={styles.total}>{total}</span>}
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

      <ViewMenu view={view} imports={imports} onChange={(next) => show({ view: next })} />

      <nav className={styles.tabs} aria-label="Word status">
        {TABS.map((tab) => (
          <Link
            key={tab.status}
            to={wordsUrl({ status: tab.status, q, view })}
            replace
            className={`${styles.tab} ${tab.status === status ? styles.activeTab : ""}`}
            aria-current={tab.status === status ? "page" : undefined}
          >
            {tab.label}
            {loaded && <span className={styles.tabCount}>{loaded.data.counts[tab.status]}</span>}
          </Link>
        ))}
      </nav>

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
            {shown.query.q ? (
              // While searching: one flat list, without headings, in either order.
              <WordList words={shown.data.words} from={here} />
            ) : (
              <Sections words={shown.data.words} view={shown.query.view} from={here} />
            )}
          </div>
        ))}
    </Page>
  );
}

const VIEW_TEXT = { az: "All words · A–Z", newest: "All words · Newest first" };

/**
 * All words · A–Z, All words · Newest first, then the past imports under "Imports" (§10). Until the
 * imports are in (or when they fail to load), an import in the URL shows as "One import".
 */
function ViewMenu({
  view,
  imports,
  onChange,
}: {
  view: ListView;
  imports: LabelledImport[] | null;
  onChange: (view: ListView) => void;
}) {
  const chosen =
    view.kind === "import" ? imports?.find((item) => item.id === view.importId) : undefined;
  const text = view.kind === "import" ? (chosen?.label ?? "One import") : VIEW_TEXT[view.kind];
  return (
    <SelectPill
      className={styles.view}
      label="Words to show"
      text={text}
      value={viewValue(view)}
      onChange={(value) => onChange(viewFromValue(value))}
    >
      <option value="az">{VIEW_TEXT.az}</option>
      <option value="newest">{VIEW_TEXT.newest}</option>
      {imports && imports.length > 0 && (
        <optgroup label="Imports">
          {imports.map((item) => (
            <option key={item.id} value={viewValue({ kind: "import", importId: item.id })}>
              {item.label}
            </option>
          ))}
        </optgroup>
      )}
      {view.kind === "import" && !chosen && <option value={viewValue(view)}>{text}</option>}
    </SelectPill>
  );
}

/** Newest first under day headings; A–Z (all words or one import's) under letter headings. */
function Sections({ words, view, from }: { words: WordListItem[]; view: ListView; from: string }) {
  const groups =
    view.kind === "newest"
      ? groupByDay(words)
      : groupByLetter(words).map((group) => ({ heading: group.letter, words: group.words }));
  return groups.map((group) => (
    // Keyed by its first word: a heading can come back later in the server's order.
    <section key={group.words[0]?.userWordId}>
      <h2 className={styles.letter}>{group.heading}</h2>
      <WordList words={group.words} from={from} />
    </section>
  ));
}

function WordList({ words, from }: { words: WordListItem[]; from: string }) {
  return (
    <ul className={styles.list}>
      {words.map((word) => (
        <WordRow key={word.userWordId} word={word} from={from} />
      ))}
    </ul>
  );
}

/** Headword over translation, the progress mark at the right; the whole row opens the word. */
function WordRow({ word, from }: { word: WordListItem; from: string }) {
  const progress = progressLabel(word);
  return (
    <li>
      <Link to={`/words/${word.userWordId}`} state={{ from }} className={styles.row}>
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
      </Link>
    </li>
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
    text: "Words you skip in a review land here and are never offered again.",
  },
};

function EmptyList({ query, counts }: { query: ListQuery; counts: WordListResponse["counts"] }) {
  const tab = TABS.find((t) => t.status === query.status)?.label.toLowerCase();
  // A search, or one import, may have words in the other tabs.
  const elsewhere = TABS.filter((t) => t.status !== query.status && counts[t.status] > 0).map(
    (t) => (
      <Link
        key={t.status}
        to={wordsUrl({ status: t.status, q: query.q, view: query.view })}
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
  if (query.view.kind === "import") {
    return (
      <div className={styles.empty}>
        <EmptyIcon />
        <p className={styles.emptyTitle}>No {tab} words from this import.</p>
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
