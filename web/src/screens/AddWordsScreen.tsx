import { type AddedWord, type EntryView, SUGGEST_MIN, TYPED_TEXT_MAX } from "@language-app/core";
import { Fragment, useEffect, useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api } from "../api";
import { Headword } from "../components/Headword";
import { CheckIcon } from "../components/icons";
import { Page } from "../components/Page";
import { SegmentedTabs } from "../components/SegmentedTabs";
import { type Flow, type Mode, type Notice, startFlow, withoutNotice } from "../state/addWords";
import { useAddWords } from "../state/useAddWords";
import ui from "../styles/ui.module.css";
import { shortGlosses } from "../words/glosses";
import { countText, typedLines } from "../words/typedList";
import styles from "./AddWordsScreen.module.css";

/** Suggestions wait this long after typing stops. */
const SUGGEST_DELAY_MS = 200;

const MODES: Array<{ mode: Mode; label: string; to: string }> = [
  { mode: "one", label: "One word", to: "/words/new" },
  { mode: "list", label: "A list", to: "/words/new?mode=list" },
];

/** Type one German word, with suggestions, or a list of them (§10 screen 14). */
export function AddWordsScreen() {
  const [params] = useSearchParams();
  const mode: Mode = params.get("mode") === "list" ? "list" : "one";
  const navigate = useNavigate();
  const [state, update] = useAddWords();
  const { draft } = state;

  // The line after a save is shown only right after it: taken out of the tab as the screen opens
  // (so leaving and coming back, or a reload, shows none), and hidden on typing or switching tabs.
  const [shown, setShown] = useState(() => state.notice && { notice: state.notice, mode });
  useEffect(() => update(withoutNotice), [update]);
  if (shown && shown.mode !== mode) setShown(null);
  const notice = shown?.notice;

  const confirm = (flow: Flow) => {
    update((current) => ({ ...current, flow }));
    // Confirm word goes back here when it's done, so the history keeps one Add words.
    navigate("/words/new/confirm", { state: { fromAddWords: true } });
  };

  const oneText = draft.one.trim();
  const list = typedLines(draft.list);
  const ready = mode === "one" ? oneText.length > 0 : list.words.length > 0 && !list.tooMany;
  const next = () => {
    if (!ready) return;
    confirm(mode === "one" ? startFlow("one", [oneText]) : startFlow("list", list.words));
  };

  return (
    <Page
      largeTitle="Add words"
      back="/imports/new"
      footer={
        <button
          type="button"
          className={`${ui.button} ${ui.primary} ${ui.cta}`}
          disabled={!ready}
          onClick={next}
        >
          Continue
        </button>
      }
    >
      <SegmentedTabs
        label="How many words"
        current={mode}
        tabs={MODES.map((m) => ({ key: m.mode, label: m.label, to: m.to }))}
      />

      {notice && <NoticeLine notice={notice} />}

      {mode === "one" ? (
        <OneWord
          text={draft.one}
          onText={(one) => {
            setShown(null);
            update((current) => ({ ...current, draft: { ...current.draft, one } }));
          }}
          onSubmit={next}
          onPick={(view) => confirm(startFlow("one", [view.lemma], view))}
        />
      ) : (
        <ListOfWords
          text={draft.list}
          count={list.words.length}
          tooMany={list.tooMany}
          onText={(text) => {
            setShown(null);
            update((current) => ({ ...current, draft: { ...current.draft, list: text } }));
          }}
        />
      )}
    </Page>
  );
}

/** The single-word field, with the dictionary's suggestions under it. */
function OneWord({
  text,
  onText,
  onSubmit,
  onPick,
}: {
  text: string;
  onText: (text: string) => void;
  onSubmit: () => void;
  onPick: (view: EntryView) => void;
}) {
  const fieldId = useId();
  const [suggestions, setSuggestions] = useState<EntryView[]>([]);
  const q = text.trim();

  // From 2 letters, shortly after typing stops. A failed request shows none: Continue still works.
  useEffect(() => {
    if (q.length < SUGGEST_MIN) {
      setSuggestions([]);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      api.suggest(q).then(
        (found) => current && setSuggestions(found.suggestions),
        () => current && setSuggestions([]),
      );
    }, SUGGEST_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [q]);

  return (
    <>
      <form
        className={styles.field}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor={fieldId} className={styles.fieldLabel}>
          German word
        </label>
        {/* The phone's autocorrect stays on; no automatic capital, since the lookup ignores case. */}
        <input
          id={fieldId}
          className={`${ui.input} ${styles.word}`}
          lang="de"
          value={text}
          placeholder="e.g. Regenschirm"
          maxLength={TYPED_TEXT_MAX}
          autoCapitalize="none"
          autoComplete="off"
          enterKeyHint="go"
          onChange={(event) => onText(event.target.value)}
        />
      </form>

      {q.length >= SUGGEST_MIN && suggestions.length > 0 && (
        <ul className={styles.suggestions} aria-label="Suggestions">
          {suggestions.map((view) => (
            <li key={`${view.entryId}|${view.article ?? ""}`}>
              <button type="button" className={styles.row} onClick={() => onPick(view)}>
                <span className={styles.rowText}>
                  <Headword word={view} className={styles.headword} />
                  <span className={styles.meta}>
                    {[shortGlosses(view.glosses).slice(0, 2).join("; "), view.pos]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {view.inMyWords !== null && <span className={styles.inList}>In your words</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** A list, one word per line, with how many words it holds. */
function ListOfWords({
  text,
  count,
  tooMany,
  onText,
}: {
  text: string;
  count: number;
  tooMany: boolean;
  onText: (text: string) => void;
}) {
  const fieldId = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={fieldId} className={styles.fieldLabel}>
        One word per line
      </label>
      <textarea
        id={fieldId}
        className={`${ui.input} ${styles.list}`}
        lang="de"
        value={text}
        placeholder={"Regenschirm\ngehen\nschnell"}
        autoCapitalize="none"
        rows={8}
        onChange={(event) => onText(event.target.value)}
      />
      <p className={`${styles.count} ${tooMany ? styles.tooMany : ""}`} aria-live="polite">
        {tooMany ? "At most 30 words at a time" : countText(count)}
      </p>
    </div>
  );
}

/** What the last save did: "✓ der Regenschirm added" (opens it), or that nothing was added. */
function NoticeLine({ notice }: { notice: Notice }) {
  if (notice.kind !== "added") {
    return (
      <p className={`${ui.card} ${styles.notice}`} role="status">
        {notice.kind === "already" ? "Already in your list." : "No words added."}
      </p>
    );
  }
  return (
    <p className={`${ui.card} ${styles.notice}`} role="status">
      <CheckIcon size={18} className={styles.noticeIcon} />
      <span>
        {notice.words.map((word, i) => (
          <Fragment key={word.userWordId}>
            {i > 0 && (i === notice.words.length - 1 ? " and " : ", ")}
            <AddedLink word={word} />
          </Fragment>
        ))}{" "}
        added
      </span>
    </p>
  );
}

function AddedLink({ word }: { word: AddedWord }) {
  return (
    <Link
      to={`/words/${word.userWordId}`}
      state={{ from: "/words/new" }}
      className={styles.noticeLink}
    >
      <Headword word={{ ...word, pos: word.article ? "noun" : "other" }} />
    </Link>
  );
}
