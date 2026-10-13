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
import { errorMessage } from "../lib/toast";
import ui from "../styles/ui.module.css";
import { wordCount } from "../words/counts";
import { groupByLetter } from "../words/groupByLetter";
import { progressLabel } from "../words/labels";
import { type ListQuery, listParams, parseListQuery, TABS, wordsUrl } from "../words/listQuery";
import styles from "./MyWordsScreen.module.css";

/** Typing waits this long before searching. */
const SEARCH_DELAY_MS = 250;

/** One dot per right answer in a row that it takes to learn a word: 1, 2, 3. */
const STREAK_DOTS = Array.from({ length: LEARNED_STREAK }, (_, index) => index + 1);

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
  // How many words there are in all; a search's counts are only its matches.
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
          search(text);
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
              // While searching: one flat list, without letter headings.
              <WordList words={shown.data.words} from={here} />
            ) : (
              groupByLetter(shown.data.words).map((group) => (
                // Keyed by its first word: a letter can come back later in the server's order.
                <section key={group.words[0]?.userWordId}>
                  <h2 className={styles.letter}>{group.letter}</h2>
                  <WordList words={group.words} from={here} />
                </section>
              ))
            )}
          </div>
        ))}
    </Page>
  );
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
  if (!query.q) {
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
  // The search may have found words in the other tabs.
  const elsewhere = TABS.filter((tab) => tab.status !== query.status && counts[tab.status] > 0);
  return (
    <div className={styles.empty}>
      <EmptyIcon />
      <p className={styles.emptyTitle}>
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

const EmptyIcon = () => (
  <span className={styles.emptyIcon}>
    <BookIcon size={28} />
  </span>
);
