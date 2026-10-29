import {
  type Article,
  cardBack,
  displayTranslation,
  LEARNED_STREAK,
  type WordStatus,
} from "@language-app/core";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { api } from "../api";
import { useSignedInUser } from "../auth/session";
import { ExampleSentence } from "../components/ExampleSentence";
import { Headword } from "../components/Headword";
import { ChevronDownIcon, PencilIcon } from "../components/icons";
import { Page } from "../components/Page";
import { SpeakerButton } from "../components/SpeakerButton";
import { ThemeChips } from "../components/ThemeChips";
import { WordLoadState } from "../components/WordLoadState";
import { errorMessage, useToast } from "../lib/toast";
import ui from "../styles/ui.module.css";
import type { EditState } from "../words/editHistory";
import { historyLine, sourceNote, streakLabel } from "../words/labels";
import { TABS, wordsUrl } from "../words/listQuery";
import { themeChips } from "../words/themes";
import { useWord } from "../words/useWord";
import styles from "./WordDetailScreen.module.css";

/** One segment per right answer in a row that it takes to learn a word: 1, 2, 3. */
const STREAK_SEGMENTS = Array.from({ length: LEARNED_STREAK }, (_, index) => index + 1);

/** The gender chip over a noun: "der · masculine". */
const GENDER: Record<Article, string> = { der: "masculine", die: "feminine", das: "neuter" };

/** One word, to read; its status changes here, the learner's texts in Edit word (§10). */
export function WordDetailScreen() {
  const id = Number(useParams().id);
  // The list the learner came from, with its tab and search; the word's own tab otherwise.
  const from = (useLocation().state as { from?: string } | null)?.from;
  const toast = useToast();
  const { word, setWord, loading, load } = useWord(id);
  const [savingStatus, setSavingStatus] = useState<WordStatus | null>(null);
  // Without AI no details are pending, so there is no "Use Add details on Home".
  const { aiEnabled } = useSignedInUser();

  const listUrl = from ?? wordsUrl({ status: word?.status ?? "learning", q: "" });

  if (!word) {
    return (
      <Page back={listUrl}>
        <WordLoadState loading={loading} listUrl={listUrl} onRetry={load} />
      </Page>
    );
  }

  const back = cardBack(word, { aiEnabled });
  // A noun's gender colours its chip.
  const article = word.pos === "noun" ? word.article : null;
  const note = sourceNote(word);
  const themes = themeChips(word);
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
          className={ui.round}
          aria-label="Edit word"
        >
          <PencilIcon size={18} />
        </Link>
      }
    >
      {/* Cards without content are left out. */}
      <div className={styles.detail}>
        <section className={`${ui.card} ${styles.top}`}>
          {article && (
            <span className={`${styles.chip} ${styles[article]}`}>
              {article} · {GENDER[article]}
            </span>
          )}
          <div className={styles.wordRow}>
            {/* Headword is lang="de", so the browser hyphenates a long compound where it wraps. */}
            <h1 className={styles.word}>
              <Headword word={word} />
            </h1>
            {/* Pronunciation from Wiktionary; recordings are credited in Home's footer. */}
            {back.audioUrl && (
              <SpeakerButton url={back.audioUrl} word={back.headword} className={styles.speaker} />
            )}
          </div>
          {/* Forms join the line when they fit, else wrap onto their own line (no leading dot). */}
          <div className={styles.metaClip}>
            <p className={styles.meta}>
              <span>{word.ipa ? `${word.ipa} · ${word.pos}` : word.pos}</span>
              {back.forms && <span lang="de">{back.forms}</span>}
            </p>
          </div>
          {/* Nothing when the word has no themes (§10). */}
          {themes && <ThemeChips labels={themes.labels} own={themes.own} />}

          <div className={styles.meaning}>
            <h2 className={styles.label}>Meaning</h2>
            <p className={styles.translation}>{displayTranslation(word)}</p>
            {hasOwnTranslation && <p className={styles.small}>originally “{word.translation}”</p>}
            {note && <p className={note.warning ? styles.warning : styles.small}>{note.text}</p>}
          </div>
        </section>

        {(back.detailsPending || back.example) && (
          <section className={`${ui.card} ${styles.card}`}>
            <h2 className={styles.label}>Example</h2>
            {back.detailsPending ? (
              <p className={styles.pending}>
                Example and forms not added yet. Use Add details on Home.
              </p>
            ) : (
              back.example && (
                <>
                  <ExampleSentence sentence={back.example.de} word={word} />
                  {back.example.translation && (
                    <p className={styles.exampleTranslation}>{back.example.translation}</p>
                  )}
                </>
              )
            )}
          </section>
        )}

        {back.note && (
          <section className={`${ui.card} ${styles.card}`}>
            <h2 className={styles.label}>Note</h2>
            <p className={styles.note}>{back.note}</p>
          </section>
        )}

        <section className={`${ui.card} ${styles.progress}`}>
          {streak && (
            <div className={styles.streak}>
              <div className={styles.streakHead} aria-hidden>
                <span className={styles.streakTitle}>Streak</span>
                <span className={styles.streakText}>{streak.text}</span>
              </div>
              <div className={styles.segments} aria-hidden>
                {STREAK_SEGMENTS.map((segment) => (
                  <span
                    key={segment}
                    className={`${styles.segment} ${segment <= streak.filled ? styles.filled : ""}`}
                  />
                ))}
              </div>
              <span className={ui.srOnly}>{streak.spoken}</span>
            </div>
          )}
          <div className={styles.statusRow}>
            <p className={styles.history}>{historyLine(word)}</p>
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
                <ChevronDownIcon size={16} className={styles.pillIcon} />
              )}
            </div>
          </div>
        </section>
      </div>
    </Page>
  );
}
