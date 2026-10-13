import {
  cardBack,
  displayTranslation,
  type HighlightSegment,
  highlightWord,
  LEARNED_STREAK,
  type WordStatus,
} from "@language-app/core";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { api } from "../api";
import { Page } from "../components/Page";
import { SpeakerButton } from "../components/SpeakerButton";
import { WordLoadState } from "../components/WordLoadState";
import { errorMessage, useToast } from "../lib/toast";
import ui from "../styles/ui.module.css";
import type { EditState } from "../words/editHistory";
import { historyLine, sourceNote, streakLabel } from "../words/labels";
import { TABS, wordsUrl } from "../words/listQuery";
import { useWord } from "../words/useWord";
import styles from "./WordDetailScreen.module.css";

/** One bar per right answer in a row that it takes to learn a word: 1, 2, 3. */
const STREAK_BARS = Array.from({ length: LEARNED_STREAK }, (_, index) => index + 1);

/** One word, to read; its status changes here, the learner's texts in Edit word (§10). */
export function WordDetailScreen() {
  const id = Number(useParams().id);
  // The list the learner came from, with its tab and search; the word's own tab otherwise.
  const from = (useLocation().state as { from?: string } | null)?.from;
  const toast = useToast();
  const { word, setWord, loading, load } = useWord(id);
  const [savingStatus, setSavingStatus] = useState<WordStatus | null>(null);

  const listUrl = from ?? wordsUrl({ status: word?.status ?? "learning", q: "" });

  if (!word) {
    return (
      <Page back={listUrl}>
        <WordLoadState loading={loading} listUrl={listUrl} onRetry={load} />
      </Page>
    );
  }

  const back = cardBack(word);
  // The headword as on the card back, with the article on its own to colour it by gender.
  const article = word.pos === "noun" ? word.article : null;
  const note = sourceNote(word);
  const streak = streakLabel(word);
  const shownStatus = savingStatus ?? word.status;
  const hasOwnTranslation = Boolean(word.customTranslation?.trim());
  // Edit word returns here by going back, so this entry keeps its list for Back.
  const editState: EditState = { from, fromDetail: true };

  const changeStatus = async (status: WordStatus) => {
    if (status === word.status || savingStatus) return;
    setSavingStatus(status);
    try {
      setWord(await api.updateWord(word.userWordId, { status }));
      toast.show(`Moved to ${TABS.find((tab) => tab.status === status)?.label}`);
    } catch (error) {
      toast.show(errorMessage(error));
    } finally {
      setSavingStatus(null);
    }
  };

  return (
    <Page
      back={listUrl}
      action={
        <Link
          to={`/words/${word.userWordId}/edit`}
          state={editState}
          className={styles.edit}
          aria-label="Edit word"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"
              fill="currentColor"
            />
          </svg>
        </Link>
      }
    >
      {/* Sections without content are left out, so a divider only ever sits between two. */}
      <div className={styles.detail}>
        <section className={styles.top}>
          <div className={styles.wordRow}>
            {/* lang="de" lets the browser hyphenate a long compound where it wraps. */}
            <h1 className={styles.word} lang="de">
              {article && (
                <>
                  <span className={`${styles.article} ${styles[article]}`}>{article}</span>{" "}
                </>
              )}
              {word.lemma}
            </h1>
            {/* Pronunciation from Wiktionary; recordings are credited in Home's footer. */}
            {back.audioUrl && <SpeakerButton url={back.audioUrl} word={back.headword} />}
          </div>
          <p className={styles.meta}>{word.ipa ? `${word.ipa} · ${word.pos}` : word.pos}</p>

          <p className={styles.translation}>{displayTranslation(word)}</p>
          {hasOwnTranslation && <p className={styles.small}>originally “{word.translation}”</p>}
          {back.forms && (
            <p className={styles.forms} lang="de">
              {back.forms}
            </p>
          )}
          {note && <p className={note.warning ? styles.warning : styles.small}>{note.text}</p>}
        </section>

        {(back.detailsPending || back.example || back.note) && (
          <section className={styles.texts}>
            {back.detailsPending ? (
              <p className={styles.pending}>
                Example and forms not added yet. Use Add details on Home.
              </p>
            ) : (
              back.example && (
                <div className={styles.block}>
                  <h2 className={styles.label}>Example</h2>
                  <p className={styles.example} lang="de">
                    <Highlighted segments={highlightWord(back.example.de, word)} />
                  </p>
                  {back.example.translation && (
                    <p className={styles.exampleTranslation}>{back.example.translation}</p>
                  )}
                </div>
              )
            )}
            {back.note && (
              <div className={styles.block}>
                <h2 className={styles.label}>Note</h2>
                <p className={styles.note}>{back.note}</p>
              </div>
            )}
          </section>
        )}

        <section>
          <div className={styles.statusRow}>
            {/* A native select: the phone's own picker, and a change saves at once. */}
            <div className={styles.pill}>
              <select
                className={styles.select}
                aria-label="Status"
                value={shownStatus}
                disabled={savingStatus !== null}
                onChange={(event) => changeStatus(event.target.value as WordStatus)}
              >
                {TABS.map((tab) => (
                  <option key={tab.status} value={tab.status}>
                    {tab.label}
                  </option>
                ))}
              </select>
              {savingStatus ? (
                <span className={`${ui.spinner} ${styles.pillIcon}`} />
              ) : (
                <svg className={styles.pillIcon} viewBox="0 0 10 6" aria-hidden="true">
                  <path d="M0 0h10L5 6z" fill="currentColor" />
                </svg>
              )}
            </div>
            {streak && (
              <div className={styles.streak}>
                <span className={styles.streakShown} aria-hidden>
                  Streak
                  <span className={styles.bars}>
                    {STREAK_BARS.map((bar) => (
                      <span
                        key={bar}
                        className={`${styles.bar} ${bar <= streak.filled ? styles.filled : ""}`}
                      />
                    ))}
                  </span>
                  {streak.text}
                </span>
                <span className={ui.srOnly}>{streak.spoken}</span>
              </div>
            )}
          </div>
          <p className={styles.history}>{historyLine(word)}</p>
        </section>
      </div>
    </Page>
  );
}

/** The example sentence with the word it illustrates in bold. */
function Highlighted({ segments }: { segments: HighlightSegment[] }) {
  // Keyed by where each piece starts in the sentence.
  let start = 0;
  return segments.map((segment) => {
    const key = start;
    start += segment.text.length;
    return segment.bold ? (
      <strong key={key}>{segment.text}</strong>
    ) : (
      <span key={key}>{segment.text}</span>
    );
  });
}
