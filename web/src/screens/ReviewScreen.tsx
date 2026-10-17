import type { Article, Candidate, ImportView } from "@language-app/core";
import { Fragment, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { api } from "../api";
import { Headword } from "../components/Headword";
import { CheckIcon, ChevronDownIcon, WarningIcon } from "../components/icons";
import { Page } from "../components/Page";
import { readJson, removeItem, writeJson } from "../lib/storage";
import { errorMessage, useToast } from "../lib/toast";
import {
  BULK_LABELS,
  choiceLabel,
  countAdds,
  type Decision,
  type Decisions,
  initialDecisions,
  type ReviewAction,
  reviewable,
  reviewReducer,
  reviewSummary,
  saveLabel,
  toSaveDecisions,
} from "../state/reviewDecisions";
import ui from "../styles/ui.module.css";
import styles from "./ReviewScreen.module.css";

const storageKey = (importId: number) => `review:${importId}`;

const withArticle = (article: Article | null, lemma: string) =>
  article ? `${article} ${lemma}` : lemma;

/** "9 new words" with the number in bold. */
function Counted({ text }: { text: string }) {
  const [count, ...rest] = text.split(" ");
  return (
    <>
      <strong>{count}</strong> {rest.join(" ")}
    </>
  );
}

/**
 * Review the new words: Practice or Ignore each, fix articles the dictionary disagrees with
 * (§6.4).
 */
export function ReviewScreen() {
  const importId = Number(useParams().id);
  const navigate = useNavigate();
  const toast = useToast();

  const [view, setView] = useState<ImportView | null>(null);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [showKnown, setShowKnown] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let loaded = await api.getImport(importId);
      if (loaded.status === "done") return navigate("/", { replace: true });
      // Opened directly while still collecting: reviewing closes the import to photos.
      if (loaded.status === "collecting") loaded = await api.startReview(importId);
      if (cancelled) return;
      setView(loaded);
      setDecisions(initialDecisions(loaded.candidates, readJson<Decisions>(storageKey(importId))));
    })().catch((error) => toast.show(errorMessage(error)));
    return () => {
      cancelled = true;
    };
  }, [importId, navigate, toast]);

  // Decisions survive a reload on this device (§12: leaving during review).
  useEffect(() => {
    if (view) writeJson(storageKey(importId), decisions);
  }, [view, importId, decisions]);

  const update = (action: ReviewAction) =>
    setDecisions((current) => reviewReducer(current, action));

  if (!view) {
    return (
      <Page largeTitle="Review" back="/">
        <p className={styles.muted}>Loading…</p>
      </Page>
    );
  }

  const fresh = reviewable(view.candidates);
  const known = view.candidates.filter((c) => c.existing === "in_my_words");
  const adds = countAdds(decisions);
  const summary = reviewSummary(fresh.length, adds);

  const save = async () => {
    setSaving(true);
    try {
      const result = await api.saveImport(importId, toSaveDecisions(view.candidates, decisions));
      removeItem(storageKey(importId));
      navigate(`/imports/${importId}/done`, { replace: true, state: result });
    } catch (error) {
      // Saving can take a while because of enrichment; if the answer got lost on the way, the
      // import may well be saved. Check before offering to save again.
      const saved = await api.getImport(importId).then(
        (current) => current.status === "done",
        () => false,
      );
      if (saved) {
        removeItem(storageKey(importId));
        navigate(`/imports/${importId}/done`, { replace: true });
        return;
      }
      toast.show(errorMessage(error));
      setSaving(false);
    }
  };

  return (
    <Page
      largeTitle={view.name ?? "Review words"}
      back="/"
      footer={
        <button
          type="button"
          className={`${ui.button} ${ui.primary} ${ui.cta}`}
          disabled={saving}
          onClick={save}
        >
          {saving && <span className={ui.spinner} />}
          {saveLabel({ adds, fresh: fresh.length, saving })}
        </button>
      }
    >
      <div className={styles.summary}>
        <p>
          <Counted text={summary.fresh} /> · <Counted text={summary.adds} />
        </p>
        {fresh.length > 0 && (
          <div className={styles.bulk}>
            <button
              type="button"
              className={styles.pill}
              onClick={() => update({ type: "setAll", action: "add" })}
            >
              {BULK_LABELS.add}
            </button>
            <button
              type="button"
              className={styles.pill}
              onClick={() => update({ type: "setAll", action: "skip" })}
            >
              {BULK_LABELS.skip}
            </button>
          </div>
        )}
      </div>

      {known.length > 0 && (
        <section className={styles.known}>
          <button
            type="button"
            className={styles.knownToggle}
            aria-expanded={showKnown}
            onClick={() => setShowKnown((open) => !open)}
          >
            <CheckIcon size={16} />
            <span className={styles.knownText}>{known.length} already in your words</span>
            <ChevronDownIcon size={16} className={styles.chevron} />
          </button>
          {showKnown && (
            <p className={styles.knownList}>
              {known.map((c, i) => (
                <Fragment key={c.key}>
                  {i > 0 && ", "}
                  <Headword word={c} />
                </Fragment>
              ))}
            </p>
          )}
        </section>
      )}

      {fresh.length === 0 && (
        <p className={styles.empty}>Every word on these pages is already in your list.</p>
      )}

      <ul className={styles.list}>
        {fresh.map((candidate) => {
          const decision = decisions[candidate.key];
          return decision ? (
            <WordRow
              key={candidate.key}
              candidate={candidate}
              decision={decision}
              onToggle={() => update({ type: "toggle", key: candidate.key })}
              onApply={(article) => update({ type: "applyArticle", key: candidate.key, article })}
              onUndo={() => update({ type: "clearArticle", key: candidate.key })}
            />
          ) : null;
        })}
      </ul>
    </Page>
  );
}

function WordRow({
  candidate,
  decision,
  onToggle,
  onApply,
  onUndo,
}: {
  candidate: Candidate;
  decision: Decision;
  onToggle: () => void;
  onApply: (article: Article) => void;
  onUndo: () => void;
}) {
  const adding = decision.action === "add";
  const article = decision.article ?? candidate.article;
  const mismatch = candidate.dictionary.status === "mismatch";
  const fixed = decision.article !== undefined && decision.article !== candidate.article;

  return (
    <li className={`${styles.row} ${adding ? styles.adding : styles.skipping}`}>
      <button type="button" className={styles.rowMain} aria-pressed={adding} onClick={onToggle}>
        <span className={styles.word}>
          <Headword word={{ ...candidate, article }} className={styles.lemma} />
          <span className={styles.meta}>
            {candidate.translation} · {candidate.pos}
          </span>
          {candidate.dictionary.status === "not_found" && (
            <span className={styles.notFound}>not in dictionary</span>
          )}
        </span>
        <span className={styles.choice}>
          {adding && <CheckIcon size={16} weight={2.8} />}
          {choiceLabel(decision.action)}
        </span>
      </button>

      {mismatch && (
        <div className={`${styles.fix} ${fixed ? styles.fixed : ""}`}>
          {fixed ? (
            <>
              <span className={styles.fixText}>Dictionary article applied</span>
              <button type="button" className={styles.undo} onClick={onUndo}>
                Undo
              </button>
            </>
          ) : (
            <>
              <WarningIcon size={18} className={styles.fixIcon} />
              <span className={styles.fixText}>
                AI: <strong>{withArticle(candidate.article, candidate.lemma)}</strong> · Dictionary:{" "}
                <strong>
                  {(candidate.dictionary.genders ?? [])
                    .map((g) => withArticle(g, candidate.lemma))
                    .join(" / ")}
                </strong>
              </span>
              <span className={styles.fixButtons}>
                {(candidate.dictionary.genders ?? []).map((gender) => (
                  <button
                    key={gender}
                    type="button"
                    className={styles.use}
                    onClick={() => onApply(gender)}
                  >
                    Use {gender}
                  </button>
                ))}
              </span>
            </>
          )}
        </div>
      )}
    </li>
  );
}
