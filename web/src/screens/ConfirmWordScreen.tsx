import {
  type Article,
  CUSTOM_TRANSLATION_MAX,
  type EntryView,
  formsText,
  type LookupResponse,
  Pos,
  TYPED_LEMMA_MAX,
  TYPED_TEXT_MAX,
} from "@language-app/core";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { api } from "../api";
import { Headword } from "../components/Headword";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SparkleIcon,
} from "../components/icons";
import { Page } from "../components/Page";
import { StepProgress } from "../components/StepProgress";
import type { DoneState } from "../imports/done";
import { errorMessage, useToast } from "../lib/toast";
import {
  type AddWordsState,
  addLabel,
  back,
  beginStep,
  canAdd,
  changeStep,
  type Decision,
  decide,
  type Flow,
  fillHand,
  type HandForm,
  isLast,
  listWords,
  type Section,
  type Step,
  sections,
  setAi,
  setTranslation,
  toggleCard,
  toggleHand,
  updateHand,
  viewKey,
  viewsOf,
  wordsOf,
} from "../state/addWords";
import { useAddWords } from "../state/useAddWords";
import ui from "../styles/ui.module.css";
import { shortGlosses } from "../words/glosses";
import styles from "./ConfirmWordScreen.module.css";

type Lookup =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; found: LookupResponse };

/** The dictionary's answer for one typed text; `retry` asks again. */
function useLookup(text: string) {
  const [lookup, setLookup] = useState<{ text: string; state: Lookup }>({
    text,
    state: { kind: "loading" },
  });
  // Only the latest request may show its answer: Back and Add can overtake a slow one.
  const latest = useRef(0);

  const load = useCallback(() => {
    const request = ++latest.current;
    setLookup({ text, state: { kind: "loading" } });
    api.lookup(text).then(
      (found) => request === latest.current && setLookup({ text, state: { kind: "ready", found } }),
      (error) =>
        request === latest.current &&
        setLookup({ text, state: { kind: "failed", message: errorMessage(error) } }),
    );
  }, [text]);

  useEffect(load, [load]);

  // Until the new text's answer is in, the previous one doesn't count.
  const state: Lookup = lookup.text === text ? lookup.state : { kind: "loading" };
  return { lookup: state, retry: load };
}

/** Confirm one typed text at a time (§6.7, §10 screen 15). */
export function ConfirmWordScreen() {
  const [state, update] = useAddWords();
  // Saving clears the flow while the next screen is still on its way (React Router navigates in
  // a transition): the last flow stays on screen until then, and only arriving without one sends
  // the learner to Add words.
  const last = useRef(state.flow);
  if (state.flow) last.current = state.flow;
  if (!last.current) return <Navigate to="/words/new" replace />;
  return <Confirm flow={last.current} update={update} />;
}

function Confirm({
  flow,
  update,
}: {
  flow: Flow;
  update: (change: (current: AddWordsState) => AddWordsState) => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const fromAddWords = Boolean(
    (useLocation().state as { fromAddWords?: boolean } | null)?.fromAddWords,
  );
  const text = flow.texts[flow.index] ?? "";
  const step = flow.steps[flow.index] as Step;
  const { lookup, retry } = useLookup(text);
  const [asking, setAsking] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const changeFlow = useCallback(
    (change: (flow: Flow) => Flow) =>
      update((current) => (current.flow ? { ...current, flow: change(current.flow) } : current)),
    [update],
  );
  /** Changes this text's step, even when its answer arrives after the learner moved on. */
  const index = flow.index;
  const change = useCallback(
    (edit: (step: Step) => Step) => changeFlow((f) => changeStep(f, edit, index)),
    [changeFlow, index],
  );

  // Set the step up once its lookup is in: the one exact or form card chosen, or the hand form.
  const found = lookup.kind === "ready" ? lookup.found : null;
  useEffect(() => {
    if (found && !step.begun) change((s) => beginStep(s, found));
  }, [found, step.begun, change]);

  /** Back to Add words, the way the learner came, with the state as it is after `done`. */
  const leave = (done: (current: AddWordsState) => AddWordsState) => {
    update(done);
    if (fromAddWords) navigate(-1);
    else navigate(flow.mode === "list" ? "/words/new?mode=list" : "/words/new", { replace: true });
  };

  const goBack = () => {
    if (flow.index === 0) return leave((current) => current);
    changeFlow(back);
    window.scrollTo(0, 0);
  };

  const shown = found ? sections(step, text, found) : [];
  const views = viewsOf(shown);
  const nothingFound =
    found !== null &&
    found.entries.length === 0 &&
    found.forms.length === 0 &&
    found.similar.length === 0 &&
    !step.ai;

  const saveOne = async () => {
    setSaving(true);
    try {
      const result = await api.addWords(wordsOf(step, views));
      leave((current) => ({
        draft: { ...current.draft, one: "" },
        flow: null,
        notice:
          result.added.length > 0 ? { kind: "added", words: result.added } : { kind: "already" },
      }));
    } catch (error) {
      // The choices stay, so Add can be tried again.
      toast.show(errorMessage(error));
      setSaving(false);
    }
  };

  const saveList = async (decided: Flow) => {
    const words = listWords(decided);
    const nothing = (current: AddWordsState): AddWordsState => ({
      draft: { ...current.draft, list: "" },
      flow: null,
      notice: { kind: "none" },
    });
    if (words.length === 0) return leave(nothing);
    setSaving(true);
    try {
      const result = await api.saveTypedImport(words);
      if (result.importId === null) return leave(nothing);
      update((current) => ({ draft: { ...current.draft, list: "" }, flow: null, notice: null }));
      const done: DoneState = {
        added: result.added.length,
        skipped: 0,
        detailsPending: result.detailsPending,
        source: "typed",
      };
      navigate(`/imports/${result.importId}/done`, { replace: true, state: done });
    } catch (error) {
      toast.show(errorMessage(error));
      setSaving(false);
    }
  };

  const next = (decision: Decision) => {
    if (flow.mode === "one") return saveOne();
    const decided = decide(flow, decision);
    changeFlow(() => decided);
    if (isLast(flow)) return saveList(decided);
    window.scrollTo(0, 0);
  };

  const askForCard = async (view: EntryView) => {
    setAsking(viewKey(view));
    try {
      const word = await api.describeWord({ text: view.lemma, entryId: view.entryId });
      change((s) => setTranslation(s, view, word.translation));
    } catch (error) {
      // The field keeps its text.
      toast.show(errorMessage(error));
    } finally {
      setAsking(null);
    }
  };

  const askForHand = async () => {
    setAsking("hand");
    try {
      const word = await api.describeWord({
        text: (step.hand.lemma.trim() || text).slice(0, TYPED_TEXT_MAX),
      });
      // When the AI's word is in the dictionary, its entries are offered instead.
      const entries = (await api.lookup(word.lemma).catch(() => null))?.entries ?? [];
      change((s) => (entries.length > 0 ? setAi(s, word, entries) : fillHand(s, word)));
    } catch (error) {
      toast.show(errorMessage(error));
    } finally {
      setAsking(null);
    }
  };

  const list = flow.mode === "list";
  const ready = found !== null && canAdd(step) && !saving;

  return (
    <Page
      bar={
        <>
          <button type="button" className={ui.round} aria-label="Back" onClick={goBack}>
            <ChevronLeftIcon />
          </button>
          {list ? (
            <StepProgress
              label="Confirm words"
              position={flow.index + 1}
              done={flow.index}
              total={flow.texts.length}
            />
          ) : (
            <h1 className={styles.title}>Confirm word</h1>
          )}
        </>
      }
      footer={
        <div className={list ? styles.actions : undefined}>
          {list && (
            <button
              type="button"
              className={`${ui.button} ${ui.secondary} ${ui.large} ${styles.remove}`}
              disabled={saving || found === null}
              onClick={() => next({ kind: "remove" })}
            >
              Remove
            </button>
          )}
          <button
            type="button"
            className={`${ui.button} ${ui.primary} ${ui.cta}`}
            disabled={!ready}
            onClick={() => next({ kind: "add", words: wordsOf(step, views) })}
          >
            {saving && <span className={ui.spinner} />}
            {saving ? "Adding details…" : addLabel(step)}
          </button>
        </div>
      }
    >
      <p className={styles.typed}>
        You typed{" "}
        <span lang="de" className={styles.typedText}>
          {text}
        </span>
      </p>

      {lookup.kind === "loading" && <p className={styles.muted}>Looking it up…</p>}
      {lookup.kind === "failed" && (
        <div className={`${ui.card} ${styles.error}`} role="alert">
          <span>{lookup.message}</span>
          <button
            type="button"
            className={`${ui.button} ${ui.secondary} ${ui.small}`}
            onClick={retry}
          >
            Try again
          </button>
        </div>
      )}

      {found && (
        <>
          {shown.map((section) => (
            <section key={sectionKey(section)} className={styles.section}>
              <SectionHeading section={section} />
              <ul className={styles.cards}>
                {section.views.map((view) => (
                  <EntryCard
                    key={viewKey(view)}
                    view={view}
                    translation={step.chosen[viewKey(view)]}
                    asking={asking === viewKey(view)}
                    onToggle={() => change((s) => toggleCard(s, view))}
                    onTranslation={(value) => change((s) => setTranslation(s, view, value))}
                    onAsk={() => askForCard(view)}
                  />
                ))}
              </ul>
            </section>
          ))}

          <HandCard
            hand={step.hand}
            nothingFound={nothingFound}
            asking={asking === "hand"}
            onToggle={() => change(toggleHand)}
            onChange={(edit) => change((s) => updateHand(s, edit))}
            onAsk={askForHand}
          />
        </>
      )}
    </Page>
  );
}

const sectionKey = (section: Section) =>
  section.kind === "form" ? `form-${section.lemma}` : section.kind;

/** What heads a group of cards; the exact entries need none. */
function SectionHeading({ section }: { section: Section }) {
  switch (section.kind) {
    case "entries":
      return null;
    case "ai":
      return (
        <h2 className={styles.heading}>
          <SparkleIcon size={16} />
          <span>
            The AI suggests{" "}
            <strong>
              <Headword word={section.word} />
            </strong>
          </span>
        </h2>
      );
    case "form":
      return (
        <h2 className={styles.heading}>
          <span>
            <em lang="de">{section.form}</em> is a form of{" "}
            <strong lang="de">{section.lemma}</strong>
          </span>
        </h2>
      );
    case "similar":
      return <h2 className={styles.heading}>Did you mean…?</h2>;
  }
}

/**
 * A dictionary entry as a card, the whole card a toggle like a Review card. Chosen, it opens its
 * translation field; a word already in the list is dimmed and links to it instead.
 */
function EntryCard({
  view,
  translation,
  asking,
  onToggle,
  onTranslation,
  onAsk,
}: {
  view: EntryView;
  /** Its translation as typed so far; undefined while the card isn't chosen. */
  translation: string | undefined;
  asking: boolean;
  onToggle: () => void;
  onTranslation: (value: string) => void;
  onAsk: () => void;
}) {
  const fieldId = useId();
  const chosen = translation !== undefined;
  const details = (
    <span className={styles.word}>
      <Headword word={view} className={styles.headword} />
      <span className={styles.meta}>{[view.pos, formsText(view)].filter(Boolean).join(" · ")}</span>
      {view.glosses.length > 0 && (
        <span className={styles.glosses}>
          {view.glosses.map((gloss) => (
            <span key={gloss}>{gloss}</span>
          ))}
        </span>
      )}
    </span>
  );

  if (view.inMyWords !== null) {
    return (
      <li className={`${styles.card} ${styles.inList}`}>
        <div className={styles.cardMain}>
          {details}
          <Link
            to={`/words/${view.inMyWords}`}
            state={{ from: "/words/new" }}
            className={styles.inListLink}
          >
            In your words
            <ChevronRightIcon size={16} />
          </Link>
        </div>
      </li>
    );
  }

  const chips = shortGlosses(view.glosses);
  return (
    <li className={`${styles.card} ${chosen ? styles.chosen : ""}`}>
      <button type="button" className={styles.cardMain} aria-pressed={chosen} onClick={onToggle}>
        {details}
        <span className={styles.tick} aria-hidden>
          {chosen && <CheckIcon size={16} weight={2.8} />}
        </span>
      </button>
      {chosen && (
        <div className={styles.translation}>
          <label htmlFor={fieldId} className={ui.label}>
            Translation
          </label>
          <input
            id={fieldId}
            className={`${ui.input} ${ui.sunk}`}
            value={translation}
            maxLength={CUSTOM_TRANSLATION_MAX}
            placeholder={chips[0] ?? "Translation"}
            enterKeyHint="done"
            onChange={(event) => onTranslation(event.target.value)}
          />
          <div className={styles.chips}>
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                className={styles.chip}
                aria-pressed={chip === translation.trim()}
                onClick={() => onTranslation(chip)}
              >
                {chip}
              </button>
            ))}
            <AskAi asking={asking} onAsk={onAsk} />
          </div>
        </div>
      )}
    </li>
  );
}

function AskAi({ asking, onAsk }: { asking: boolean; onAsk: () => void }) {
  return (
    <button
      type="button"
      className={`${ui.pill} ${ui.pillSecondary} ${styles.askAi}`}
      disabled={asking}
      onClick={onAsk}
    >
      {asking ? <span className={ui.spinner} /> : <SparkleIcon size={16} />}
      Ask AI
    </button>
  );
}

const ARTICLES: Article[] = ["der", "die", "das"];

/**
 * The word entered by hand (§6.7 step 4): a quieter card that opens the form, open from the start
 * when the dictionary found nothing at all.
 */
function HandCard({
  hand,
  nothingFound,
  asking,
  onToggle,
  onChange,
  onAsk,
}: {
  hand: HandForm;
  nothingFound: boolean;
  asking: boolean;
  onToggle: () => void;
  onChange: (edit: Partial<HandForm>) => void;
  onAsk: () => void;
}) {
  const ids = { word: useId(), pos: useId(), translation: useId() };
  const open = hand.open || nothingFound;

  return (
    <section className={styles.hand}>
      {nothingFound ? (
        <h2 className={styles.handTitle}>Not in the dictionary</h2>
      ) : (
        <button type="button" className={styles.handToggle} aria-expanded={open} onClick={onToggle}>
          <span>Not in the dictionary?</span>
          <ChevronDownIcon size={16} className={styles.chevron} />
        </button>
      )}
      {open && (
        <div className={styles.handFields}>
          <div className={styles.handField}>
            <label htmlFor={ids.word} className={ui.label}>
              German word
            </label>
            <input
              id={ids.word}
              className={`${ui.input} ${ui.sunk}`}
              lang="de"
              value={hand.lemma}
              maxLength={TYPED_LEMMA_MAX}
              autoCapitalize="none"
              onChange={(event) => onChange({ lemma: event.target.value })}
            />
          </div>
          <div className={styles.handField}>
            <label htmlFor={ids.pos} className={ui.label}>
              Part of speech
            </label>
            <span className={styles.selectWrap}>
              <select
                id={ids.pos}
                className={`${ui.input} ${ui.sunk} ${styles.select}`}
                value={hand.pos}
                onChange={(event) => {
                  const pos = Pos.safeParse(event.target.value);
                  onChange({ pos: pos.success ? pos.data : "" });
                }}
              >
                <option value="">Choose…</option>
                {Pos.options.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
              <ChevronDownIcon size={18} className={styles.selectChevron} />
            </span>
          </div>
          {hand.pos === "noun" && (
            <fieldset className={styles.handField}>
              <legend className={ui.label}>Article</legend>
              <div className={styles.articles}>
                {ARTICLES.map((article) => (
                  <button
                    key={article}
                    type="button"
                    lang="de"
                    className={`${styles.article} ${styles[article]}`}
                    aria-pressed={hand.article === article}
                    onClick={() => onChange({ article: hand.article === article ? null : article })}
                  >
                    {article}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <div className={styles.handField}>
            <label htmlFor={ids.translation} className={ui.label}>
              Translation
            </label>
            <input
              id={ids.translation}
              className={`${ui.input} ${ui.sunk}`}
              value={hand.translation}
              maxLength={CUSTOM_TRANSLATION_MAX}
              placeholder="e.g. umbrella"
              enterKeyHint="done"
              onChange={(event) => onChange({ translation: event.target.value })}
            />
          </div>
          <div className={styles.handAsk}>
            <AskAi asking={asking} onAsk={onAsk} />
            <span className={styles.askHint}>Fills in all four</span>
          </div>
        </div>
      )}
    </section>
  );
}
