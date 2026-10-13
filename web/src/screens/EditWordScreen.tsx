import { CUSTOM_TRANSLATION_MAX, cardBack, NOTE_MAX } from "@language-app/core";
import { useId, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { api } from "../api";
import { Headword } from "../components/Headword";
import { TrashIcon } from "../components/icons";
import { Page } from "../components/Page";
import { WordLoadState } from "../components/WordLoadState";
import { errorMessage, useToast } from "../lib/toast";
import ui from "../styles/ui.module.css";
import { afterDelete, type EditState, type HistoryStep, leaveEdit } from "../words/editHistory";
import { wordsUrl } from "../words/listQuery";
import { useWord } from "../words/useWord";
import { changesOf, draftOf, type WordDraft } from "../words/wordForm";
import styles from "./EditWordScreen.module.css";

/**
 * The learner's own translation and note for a word, and deleting it (§10). A screen of its own
 * that looks like an iOS sheet: Cancel and Save return to Word detail without adding history.
 */
export function EditWordScreen() {
  const id = Number(useParams().id);
  const state = useLocation().state as EditState | null;
  const navigate = useNavigate();
  const toast = useToast();
  const formId = useId();
  const { word, loading, load } = useWord(id);
  // What the learner typed; null until they type, which shows the saved texts.
  const [typed, setTyped] = useState<WordDraft | null>(null);
  const [busy, setBusy] = useState<null | "save" | "delete">(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const go = (step: HistoryStep) =>
    "back" in step ? navigate(-step.back) : navigate(step.to, { replace: true, state: step.state });
  // Cancel, like the browser's Back, drops what was typed without asking.
  const leave = () => go(leaveEdit(id, state));
  const listUrl = state?.from ?? wordsUrl({ status: word?.status ?? "learning", q: "" });

  const cancel = (
    <button type="button" className={styles.cancel} disabled={busy !== null} onClick={leave}>
      Cancel
    </button>
  );

  if (!word) {
    return (
      <Page
        title="Edit word"
        leading={cancel}
        action={
          <button type="button" className={styles.save} disabled>
            Save
          </button>
        }
      >
        <WordLoadState loading={loading} listUrl={listUrl} onRetry={load} />
      </Page>
    );
  }

  const back = cardBack(word);
  const draft = typed ?? draftOf(word);
  const changes = changesOf(word, draft);
  const edit = (field: Partial<WordDraft>) =>
    setTyped((current) => ({ ...(current ?? draftOf(word)), ...field }));

  const save = async () => {
    if (!changes || busy) return;
    setBusy("save");
    try {
      await api.updateWord(word.userWordId, changes);
      toast.show("Saved");
      // Word detail loads the word again, so it shows the texts as stored.
      leave();
    } catch (error) {
      toast.show(errorMessage(error));
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await api.deleteWord(word.userWordId);
      toast.show(`“${back.headword}” deleted`);
      go(afterDelete(listUrl, state));
    } catch (error) {
      toast.show(errorMessage(error));
      setBusy(null);
    }
  };

  return (
    <Page
      title={<Headword word={word} className={styles.title} />}
      leading={cancel}
      action={
        <button
          type="submit"
          form={formId}
          className={styles.save}
          disabled={!changes || busy !== null}
        >
          {busy === "save" && <span className={ui.spinner} />}
          Save
        </button>
      }
    >
      <form
        id={formId}
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          // Enter in the translation saves; with nothing changed it just closes the keyboard.
          if (changes) save();
          else (document.activeElement as HTMLElement | null)?.blur();
        }}
      >
        <label className={`${ui.card} ${styles.field}`}>
          <span className={styles.label}>Your translation</span>
          <input
            className={styles.input}
            value={draft.customTranslation}
            placeholder={word.translation}
            maxLength={CUSTOM_TRANSLATION_MAX}
            autoCapitalize="none"
            enterKeyHint="done"
            onChange={(event) => edit({ customTranslation: event.target.value })}
          />
          <span className={styles.help}>
            Shown on cards instead of “{word.translation}”. Leave empty to use it.
          </span>
        </label>
        <label className={`${ui.card} ${styles.field}`}>
          <span className={styles.label}>Note</span>
          <textarea
            className={`${styles.input} ${styles.textarea}`}
            rows={4}
            value={draft.note}
            placeholder="Shown on the back of the card"
            maxLength={NOTE_MAX}
            onChange={(event) => edit({ note: event.target.value })}
          />
        </label>
      </form>

      <section className={styles.delete} aria-label="Delete word">
        {confirmingDelete ? (
          <div className={styles.confirm}>
            <div className={styles.question}>
              <span className={styles.trash}>
                <TrashIcon size={20} />
              </span>
              <p>
                <strong>
                  Delete “<span lang="de">{back.headword}</span>” from your words?
                </strong>{" "}
                Its progress and note are lost, and a later import may offer it again as a new word.
                To stop practising it for good, set its status to Ignored instead.
              </p>
            </div>
            <div className={styles.buttons}>
              <button
                type="button"
                className={`${ui.button} ${ui.secondary} ${styles.choice}`}
                disabled={busy === "delete"}
                onClick={() => setConfirmingDelete(false)}
              >
                Keep
              </button>
              <button
                type="button"
                className={`${ui.button} ${ui.danger} ${styles.choice}`}
                disabled={busy !== null}
                onClick={remove}
              >
                {busy === "delete" && <span className={ui.spinner} />}
                Delete
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={`${ui.button} ${styles.deleteButton}`}
            disabled={busy !== null}
            onClick={() => setConfirmingDelete(true)}
          >
            <TrashIcon size={20} />
            Delete word
          </button>
        )}
      </section>
    </Page>
  );
}
