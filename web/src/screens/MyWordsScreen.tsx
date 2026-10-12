import {
  cardBack,
  displayTranslation,
  type WordListItem,
  type WordListResponse,
} from "@language-app/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api } from "../api";
import { Page } from "../components/Page";
import { errorMessage } from "../lib/toast";
import ui from "../styles/ui.module.css";
import { progressLabel } from "../words/labels";
import { type ListQuery, listParams, parseListQuery, TABS, wordsUrl } from "../words/listQuery";
import styles from "./MyWordsScreen.module.css";

/** Typing waits this long before searching. */
const SEARCH_DELAY_MS = 250;

type Loaded = { query: ListQuery; data: WordListResponse };

/** The learner's words by status, with search (§10 My words). */
export function MyWordsScreen() {
  const [params, setParams] = useSearchParams();
  const query = parseListQuery(params);
  const { status, q } = query;

  const [text, setText] = useState(q);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);

  // The search goes into the URL, so Back from a word returns to the same results. `replace`:
  // tabs and searches are not steps the Back button should walk through.
  const search = useCallback(
    (value: string) => setParams(listParams({ status, q: value }), { replace: true }),
    [status, setParams],
  );

  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => search(text), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, q, search]);

  // Only the latest request may show its answer: typing can overtake a slow one.
  const load = useCallback(() => {
    const request = ++latestRequest.current;
    setError(null);
    api.listWords({ status, q }).then(
      (data) => request === latestRequest.current && setLoaded({ query: { status, q }, data }),
      (failure) => request === latestRequest.current && setError(errorMessage(failure)),
    );
  }, [status, q]);

  useEffect(load, [load]);

  // While another search loads, the previous results of the same tab stay on screen.
  const shown = loaded?.query.status === status ? loaded : null;
  const here = wordsUrl(query);

  return (
    <Page title="My words" back="/">
      <form
        className={styles.search}
        onSubmit={(event) => {
          event.preventDefault();
          // Enter searches at once and closes the keyboard.
          search(text);
          (document.activeElement as HTMLElement | null)?.blur();
        }}
      >
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

      <nav className={styles.tabs} aria-label="Word status">
        {TABS.map((tab) => (
          <Link
            key={tab.status}
            to={wordsUrl({ status: tab.status, q })}
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
        <div className={styles.error} role="alert">
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
          <ul className={styles.list} aria-busy={shown.query.q !== q}>
            {shown.data.words.map((word) => (
              <WordRow key={word.userWordId} word={word} from={here} />
            ))}
          </ul>
        ))}
    </Page>
  );
}

function WordRow({ word, from }: { word: WordListItem; from: string }) {
  const progress = progressLabel(word);
  return (
    <li>
      <Link to={`/words/${word.userWordId}`} state={{ from }} className={styles.row}>
        <span className={styles.text}>
          <span className={styles.headword} lang="de">
            {cardBack(word).headword}
          </span>
          <span className={styles.translation}>{displayTranslation(word)}</span>
        </span>
        {progress && (
          <span className={progress.kind === "new" ? styles.new : styles.streak}>
            <span aria-hidden>{progress.text}</span>
            <span className={ui.srOnly}>{progress.spoken}</span>
          </span>
        )}
        <span className={styles.chevron} aria-hidden>
          ›
        </span>
      </Link>
    </li>
  );
}

const EMPTY: Record<ListQuery["status"], string> = {
  learning: "No words to learn. Import the pages you studied to collect their new words.",
  learned: "No learned words yet. A word counts as learned after 3 right answers in a row.",
  ignored: "No ignored words. Words you skip in a review land here and are never offered again.",
};

function EmptyList({ query, counts }: { query: ListQuery; counts: WordListResponse["counts"] }) {
  if (!query.q) {
    return (
      <div className={styles.empty}>
        <p>{EMPTY[query.status]}</p>
        {query.status === "learning" && (
          <Link to="/imports/new" className={`${ui.button} ${ui.secondary}`}>
            New import
          </Link>
        )}
      </div>
    );
  }
  // The search may have found words in the other tabs.
  const elsewhere = TABS.filter((tab) => tab.status !== query.status && counts[tab.status] > 0);
  return (
    <div className={styles.empty}>
      <p>
        No {TABS.find((tab) => tab.status === query.status)?.label.toLowerCase()} words match “
        {query.q}”.
      </p>
      {elsewhere.map((tab) => (
        <Link
          key={tab.status}
          to={wordsUrl({ status: tab.status, q: query.q })}
          replace
          className={`${ui.button} ${ui.quiet}`}
        >
          {counts[tab.status]} in {tab.label} ›
        </Link>
      ))}
    </div>
  );
}
