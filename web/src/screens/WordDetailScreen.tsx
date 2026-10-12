import {
  ApiClientError,
  CUSTOM_TRANSLATION_MAX,
  cardBack,
  displayTranslation,
  NOTE_MAX,
  type WordDetail,
  type WordStatus,
} from "@language-app/core";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { api } from "../api";
import { Page } from "../components/Page";
import { errorMessage, useToast } from "../lib/toast";
import ui from "../styles/ui.module.css";
import { checkLabel, dayText, FORMS_SOURCE_LABEL } from "../words/labels";
import { TABS, wordsUrl } from "../words/listQuery";
import { changesOf, draftOf, type WordDraft } from "../words/wordForm";
import styles from "./WordDetailScreen.module.css";

const STATUS_HELP: Record<WordStatus, string> = {
  learning: "Practised until you know it 3 times in a row.",
  learned: "Still comes up in Last import and Last 7 days, not in Not learned yet.",
  ignored: "Never practised, and never offered again by an import.",
};

type Load = { kind: "loading" } | { kind: "missing" } | { kind: "failed"; message: string };

/** Everything about one word; edit the learner's own texts, change status, delete (§10). */
export function WordDetailScreen() {
  const id = Number(useParams().id);
  // The list the learner came from, with its tab and search; the word's own tab otherwise.
  const from = (useLocation().state as { from?: string } | null)?.from;
  const navigate = useNavigate();
  const toast = useToast();

  const [word, setWord] = useState<WordDetail | null>(null);
  const [loading, setLoading] = useState<Load>({ kind: "loading" });
  const latestRequest = useRef(0);
  const [draft, setDraft] = useState<WordDraft>({ customTranslation: "", note: "" });
  const [busy, setBusy] = useState<null | "status" | "save" | "delete">(null);
  const [savingStatus, setSavingStatus] = useState<WordStatus | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(() => {
    const request = ++latestRequest.current;
    setLoading({ kind: "loading" });
    api.getWord(id).then(
      (loaded) => {
        if (request !== latestRequest.current) return;
        setWord(loaded);
        setDraft(draftOf(loaded));
      },
      (error) => {
        if (request !== latestRequest.current) return;
        // Deleted meanwhile, or a mistyped URL.
        const gone =
          error instanceof ApiClientError && (error.status === 404 || error.status === 400);
        setLoading(gone ? { kind: "missing" } : { kind: "failed", message: errorMessage(error) });
      },
    );
  }, [id]);

  useEffect(load, [load]);

  const listUrl = from ?? wordsUrl({ status: word?.status ?? "learning", q: "" });

  if (!word) {
    return (
      <Page title="Word" back={listUrl}>
        {loading.kind === "loading" && <p className={styles.muted}>Loading…</p>}
        {loading.kind === "missing" && (
          <div className={styles.gone}>
            <p>This word is not in your list any more.</p>
            <Link to={listUrl} className={`${ui.button} ${ui.secondary}`}>
              My words
            </Link>
          </div>
        )}
        {loading.kind === "failed" && (
          <div className={styles.failed} role="alert">
            <span>{loading.message}</span>
            <button
              type="button"
              className={`${ui.button} ${ui.secondary} ${ui.small}`}
              onClick={load}
            >
              Try again
            </button>
          </div>
        )}
      </Page>
    );
  }

  const back = cardBack(word);
  const check = checkLabel(word.checkStatus);
  const changes = changesOf(word, draft);
  const shownStatus = savingStatus ?? word.status;
  const hasOwnTranslation = Boolean(word.customTranslation?.trim());

  const changeStatus = async (status: WordStatus) => {
    if (status === word.status || busy) return;
    setBusy("status");
    setSavingStatus(status);
    try {
      setWord(await api.updateWord(word.userWordId, { status }));
      toast.show(`Moved to ${TABS.find((tab) => tab.status === status)?.label}`);
    } catch (error) {
      toast.show(errorMessage(error));
    } finally {
      setSavingStatus(null);
      setBusy(null);
    }
  };

  const save = async () => {
    if (!changes || busy) return;
    const sent = draft;
    setBusy("save");
    try {
      const updated = await api.updateWord(word.userWordId, changes);
      setWord(updated);
      // Show the texts as stored (trimmed), unless the learner kept typing meanwhile.
      setDraft((current) => (current === sent ? draftOf(updated) : current));
      toast.show("Saved");
    } catch (error) {
      toast.show(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await api.deleteWord(word.userWordId);
      toast.show(`“${back.headword}” deleted`);
      navigate(listUrl, { replace: true });
    } catch (error) {
      toast.show(errorMessage(error));
      setBusy(null);
    }
  };

  return (
    <Page title={back.headword} back={listUrl}>
      <section className={styles.summary}>
        <p className={styles.pos}>{word.pos}</p>
        <p className={styles.translation}>{displayTranslation(word)}</p>
      </section>

      {/* Native radios for keyboard and screen readers; a tap saves at once. */}
      <fieldset className={styles.status}>
        <legend className={styles.legend}>Status</legend>
        <div className={styles.segmented}>
          {TABS.map((tab) => (
            <label
              key={tab.status}
              className={`${styles.segment} ${shownStatus === tab.status ? styles.selected : ""}`}
            >
              <input
                type="radio"
                name="status"
                value={tab.status}
                className={styles.radio}
                checked={shownStatus === tab.status}
                disabled={busy !== null}
                onChange={() => changeStatus(tab.status)}
              />
              {savingStatus === tab.status && <span className={ui.spinner} />}
              {tab.label}
            </label>
          ))}
        </div>
        <p className={styles.help}>{STATUS_HELP[shownStatus]}</p>
      </fieldset>

      <section className={styles.box}>
        <dl className={styles.facts}>
          {/* Next to the learner's own translation, the stored one must not pass for it. */}
          <Fact label={hasOwnTranslation ? "Original translation" : "Translation"}>
            {word.translation || "—"}
          </Fact>
          {back.forms && (
            <Fact label="Forms">
              <span lang="de">{back.forms}</span>
              {word.formsSource && (
                <span className={styles.source}>{FORMS_SOURCE_LABEL[word.formsSource]}</span>
              )}
            </Fact>
          )}
          {back.example && (
            <Fact label="Example">
              <span className={styles.example} lang="de">
                {back.example.de}
              </span>
              {back.example.translation && (
                <span className={styles.muted}>{back.example.translation}</span>
              )}
            </Fact>
          )}
          <Fact label="Dictionary">
            <span className={check.warning ? styles.warning : undefined}>{check.text}</span>
          </Fact>
        </dl>
        {back.detailsPending && (
          <p className={styles.pending}>
            No example sentence or forms yet. Use Add details on the Home screen.
          </p>
        )}
      </section>

      <section className={styles.box} aria-label="Progress">
        <div className={styles.stats}>
          <Stat label="Seen" value={word.timesSeen} />
          <Stat label="Correct" value={word.timesCorrect} />
          <Stat label="In a row" value={word.correctStreak} />
        </div>
        <p className={styles.history}>
          {word.lastPracticedAt
            ? `Last practised ${dayText(word.lastPracticedAt)}: ${
                word.lastResult === "knew" ? "knew it" : "didn't know"
              }`
            : "Not practised yet"}
          {" · "}Added {dayText(word.addedAt)}
        </p>
      </section>

      <form
        className={`${styles.box} ${styles.form}`}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label className={styles.field}>
          <span className={styles.label}>Your translation</span>
          <input
            className={styles.input}
            value={draft.customTranslation}
            placeholder={word.translation}
            maxLength={CUSTOM_TRANSLATION_MAX}
            autoCapitalize="none"
            enterKeyHint="done"
            onChange={(event) => {
              const customTranslation = event.target.value;
              setDraft((current) => ({ ...current, customTranslation }));
            }}
          />
          <span className={styles.help}>
            Shown on cards instead of “{word.translation}”. Leave empty to use it.
          </span>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Note</span>
          <textarea
            className={styles.input}
            rows={3}
            value={draft.note}
            placeholder="Shown on the back of the card"
            maxLength={NOTE_MAX}
            onChange={(event) => {
              const note = event.target.value;
              setDraft((current) => ({ ...current, note }));
            }}
          />
        </label>
        {changes && (
          <div className={styles.buttons}>
            <button
              type="button"
              className={`${ui.button} ${ui.secondary}`}
              disabled={busy === "save"}
              onClick={() => setDraft(draftOf(word))}
            >
              Discard
            </button>
            <button type="submit" className={`${ui.button} ${ui.primary}`} disabled={busy !== null}>
              {busy === "save" && <span className={ui.spinner} />}
              Save
            </button>
          </div>
        )}
      </form>

      {confirmingDelete ? (
        <section className={styles.confirm} aria-label="Delete word">
          <p>
            <strong>Delete “{back.headword}” from your words?</strong> Its progress and note are
            lost, and a later import may offer it again as a new word. To stop practising it for
            good, choose Ignored instead.
          </p>
          <div className={styles.buttons}>
            <button
              type="button"
              className={`${ui.button} ${ui.secondary}`}
              disabled={busy === "delete"}
              onClick={() => setConfirmingDelete(false)}
            >
              Keep
            </button>
            <button
              type="button"
              className={`${ui.button} ${ui.danger}`}
              disabled={busy !== null}
              onClick={remove}
            >
              {busy === "delete" && <span className={ui.spinner} />}
              Delete
            </button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          className={`${ui.button} ${styles.deleteButton}`}
          onClick={() => setConfirmingDelete(true)}
        >
          Delete word
        </button>
      )}
    </Page>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
