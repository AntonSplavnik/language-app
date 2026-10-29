import {
  CUSTOM_TRANSLATION_MAX,
  cardBack,
  NOTE_MAX,
  THEMES,
  type ThemeKey,
  themeLabel,
} from "@language-app/core";
import { useId, useState } from "react";
import { useLocation, useParams } from "react-router";
import { api } from "../api";
import { CheckList, CheckRow, checkListAction } from "../components/CheckList";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { Headword } from "../components/Headword";
import { Page } from "../components/Page";
import { WordLoadState } from "../components/WordLoadState";
import { useHistoryStep } from "../lib/sheetHistory";
import { errorMessage, useToast } from "../lib/toast";
import ui from "../styles/ui.module.css";
import { afterDelete, type EditState, leaveEdit } from "../words/editHistory";
import { wordsUrl } from "../words/listQuery";
import { toggleTheme, usesOwnThemes } from "../words/themes";
import { useWord } from "../words/useWord";
import { changesOf, draftOf, type WordDraft } from "../words/wordForm";
import styles from "./EditWordScreen.module.css";

/**
 * The learner's own translation, note and themes for a word, and deleting it (§10). A screen of
 * its own that looks like an iOS sheet: Cancel and Save return to Word detail without adding
 * history.
 */
export function EditWordScreen() {
  const id = Number(useParams().id);
  const state = useLocation().state as EditState | null;
  const go = useHistoryStep();
  const toast = useToast();
  const formId = useId();
  const { word, loading, load } = useWord(id);
  // What the learner typed; null until they type, which shows the saved texts.
  const [typed, setTyped] = useState<WordDraft | null>(null);
  const [busy, setBusy] = useState<null | "save" | "delete">(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Cancel, like the browser's Back, drops what was typed without asking.
  const leave = () => go(leaveEdit(id, state));
  const listUrl = state?.from ?? wordsUrl({ status: word?.status ?? "learning", q: "" });

  const cancel = (
    <button
      type="button"
      className={`${ui.pill} ${ui.pillSecondary}`}
      disabled={busy !== null}
      onClick={leave}
    >
      Cancel
    </button>
  );

  if (!word) {
    return (
      <Page
        title="Edit word"
        leading={cancel}
        action={
          <button type="button" className={`${ui.pill} ${ui.pillPrimary}`} disabled>
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
  // Use suggested shows while the checked themes aren't the word's own (§10).
  const ownThemes = usesOwnThemes(draft.themes, word.suggestedThemes);
  const toggle = (key: ThemeKey) => {
    const { themes, limited } = toggleTheme(draft.themes, key);
    if (limited) toast.show("At most 2 themes");
    else edit({ themes });
  };

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
          className={`${ui.pill} ${ui.pillPrimary}`}
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
          <span className={ui.label}>Your translation</span>
          <input
            className={`${ui.input} ${ui.sunk}`}
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
          <span className={ui.label}>Note</span>
          <textarea
            className={`${ui.input} ${ui.sunk} ${styles.textarea}`}
            rows={4}
            value={draft.note}
            placeholder="Shown on the back of the card"
            maxLength={NOTE_MAX}
            onChange={(event) => edit({ note: event.target.value })}
          />
        </label>
        <CheckList
          label="Themes"
          help={
            ownThemes
              ? `Suggested: ${word.suggestedThemes.map(themeLabel).join(", ") || "none"}`
              : "Up to 2. The first is the main one."
          }
          action={
            ownThemes && (
              <button
                type="button"
                className={checkListAction}
                onClick={() => edit({ themes: word.suggestedThemes })}
              >
                Use suggested
              </button>
            )
          }
        >
          {THEMES.map((theme) => (
            <CheckRow
              key={theme.key}
              label={theme.label}
              checked={draft.themes.includes(theme.key)}
              onToggle={() => toggle(theme.key)}
            />
          ))}
        </CheckList>
      </form>

      <ConfirmDelete
        label="Delete word"
        question={
          <>
            Delete “<span lang="de">{back.headword}</span>” from your words?
          </>
        }
        asking={confirmingDelete}
        onAsk={() => setConfirmingDelete(true)}
        onKeep={() => setConfirmingDelete(false)}
        onDelete={remove}
        deleting={busy === "delete"}
        disabled={busy !== null}
      >
        Its progress and note are lost, and a later import may offer it again as a new word. To stop
        practising it for good, set its status to Ignored instead.
      </ConfirmDelete>
    </Page>
  );
}
