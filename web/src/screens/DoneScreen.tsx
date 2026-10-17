import { IMPORT_NAME_MAX } from "@language-app/core";
import { useId, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { api } from "../api";
import { CheckIcon, PlayIcon, SparkleIcon } from "../components/icons";
import { Page } from "../components/Page";
import { PendingDetails } from "../components/PendingDetails";
import { type DoneState, doneLines, doneSource, moreWords, needsName } from "../imports/done";
import { usePastImports } from "../imports/usePastImports";
import { errorMessage, useToast } from "../lib/toast";
import { useStartSession } from "../practice/useStartSession";
import ui from "../styles/ui.module.css";
import styles from "./DoneScreen.module.css";

/** After saving (§10 Done). The counts come from the save response; a reload just says "saved". */
export function DoneScreen() {
  const importId = Number(useParams().id);
  const result = useLocation().state as DoneState | null;
  const { start, starting } = useStartSession();
  const { headline, note } = doneLines(result);
  // Done reads the past imports to find this one, so a reloaded Done screen offers naming too.
  const { state: past } = usePastImports();
  const offerName = past.kind === "ready" && needsName(past.imports, importId);
  const more = moreWords(doneSource(result, past, importId));

  return (
    <Page
      // Small: the result below is the big text.
      title={<span className={styles.eyebrow}>Done</span>}
      footer={
        <div className={styles.actions}>
          {result && result.added > 0 && (
            <button
              type="button"
              className={`${ui.button} ${ui.primary} ${ui.cta}`}
              disabled={starting}
              onClick={() => start({ source: "import", importId })}
            >
              {starting && <span className={ui.spinner} />}
              Practice these now
              <PlayIcon size={18} />
            </button>
          )}
          <Link to={more.to} className={`${ui.button} ${ui.secondary} ${ui.large} ${ui.block}`}>
            {more.label}
          </Link>
          <Link to="/" className={`${ui.button} ${ui.block} ${styles.home}`}>
            Home
          </Link>
        </div>
      }
    >
      <div className={styles.result}>
        <span className={styles.badge} aria-hidden>
          <span className={styles.check}>
            <CheckIcon size={44} weight={2.6} />
          </span>
        </span>
        <div className={styles.text}>
          <p className={styles.headline}>{headline}</p>
          {(note || (result && result.added > 0 && result.detailsPending === 0)) && (
            <div className={styles.details}>
              {note && <p>{note}</p>}
              {result && result.added > 0 && result.detailsPending === 0 && (
                <p className={styles.ready}>
                  <SparkleIcon size={16} />
                  Example sentences and forms are ready.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      {result && result.detailsPending > 0 && <PendingDetails count={result.detailsPending} />}
      {offerName && <NameImport importId={importId} />}
    </Page>
  );
}

/**
 * "Name this import" for a past import without a name (§10 Done): a field and a Save pill; once
 * saved, one line with the name.
 */
function NameImport({ importId }: { importId: number }) {
  const toast = useToast();
  const fieldId = useId();
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  if (saved) {
    return (
      <p className={`${ui.card} ${styles.named}`} role="status">
        <CheckIcon size={18} className={styles.namedIcon} />
        <span>
          Saved as “<strong>{saved}</strong>”
        </span>
      </p>
    );
  }

  const name = typed.trim();
  const save = async () => {
    if (!name || saving) return;
    setSaving(true);
    try {
      const renamed = await api.renameImport(importId, name);
      setSaved(renamed.name ?? name);
    } catch (error) {
      // The typed name stays, so trying again is one tap.
      toast.show(errorMessage(error));
      setSaving(false);
    }
  };

  return (
    <form
      className={`${ui.card} ${styles.naming}`}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <label htmlFor={fieldId} className={ui.label}>
        Name this import
      </label>
      <div className={styles.nameRow}>
        <input
          id={fieldId}
          className={`${ui.input} ${ui.sunk}`}
          value={typed}
          placeholder="e.g. Lesson 4"
          maxLength={IMPORT_NAME_MAX}
          enterKeyHint="done"
          onChange={(event) => setTyped(event.target.value)}
        />
        <button type="submit" className={`${ui.pill} ${ui.pillPrimary}`} disabled={!name || saving}>
          {saving && <span className={ui.spinner} />}
          Save
        </button>
      </div>
    </form>
  );
}
