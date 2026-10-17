import {
  type AddedWord,
  type Article,
  type DescribeResponse,
  type EntryView,
  type LookupResponse,
  type Pos,
  TYPED_WORDS_MAX,
  type TypedWord,
} from "@language-app/core";
import { readJson, writeJson } from "../lib/storage";
import { shortGloss } from "../words/glosses";

// Adding words by hand (§6.7, §10 screens 14–15): the typed texts, each confirmed on its own.
// Everything lives in the tab (sessionStorage), so a reload continues at the same word; nothing
// reaches the server before the last word of a list is decided.

export type Mode = "one" | "list";

/** The word entered by hand, or by Ask AI, when the dictionary doesn't have it. */
export type HandForm = {
  open: boolean;
  lemma: string;
  /** Empty until chosen. */
  pos: Pos | "";
  article: Article | null;
  translation: string;
};

/** What was decided for a typed text: the words to add, or nothing (Remove). */
export type Decision = { kind: "add"; words: TypedWord[] } | { kind: "remove" };

/** One typed text on Confirm word. */
export type Step = {
  /** The chosen cards by `viewKey`, each with its translation as typed so far, in choosing order. */
  chosen: Record<string, string>;
  hand: HandForm;
  /** Ask AI on the hand form found its word in the dictionary: that word and its entries. */
  ai: { word: DescribeResponse; entries: EntryView[] } | null;
  /** Set up from its lookup already (the one exact or form card chosen), so Back keeps choices. */
  begun: boolean;
  decision: Decision | null;
};

export type Flow = { mode: Mode; texts: string[]; index: number; steps: Step[] };

/** The line Add words shows after a save. */
export type Notice = { kind: "added"; words: AddedWord[] } | { kind: "already" } | { kind: "none" };

/** Everything Add words and Confirm word keep in the tab. */
export type AddWordsState = {
  draft: { one: string; list: string };
  flow: Flow | null;
  notice: Notice | null;
};

const STORAGE_KEY = "add-words";
export const emptyState: AddWordsState = { draft: { one: "", list: "" }, flow: null, notice: null };

export const loadState = (): AddWordsState => ({
  ...emptyState,
  ...readJson<AddWordsState>(STORAGE_KEY, "session"),
});
export const saveState = (state: AddWordsState) => writeJson(STORAGE_KEY, state, "session");

/** A card: an entry in one of its genders (der/das Liter are two cards). */
export const viewKey = (view: Pick<EntryView, "entryId" | "article">) =>
  `${view.entryId}|${view.article ?? ""}`;

/** The translation a chosen card starts with: its first gloss, shortened. */
const firstGloss = (view: EntryView) => shortGloss(view.glosses[0] ?? "");

function newStep(text: string): Step {
  return {
    chosen: {},
    // A capitalised text is most likely a noun; anything else is for the learner to choose.
    hand: {
      open: false,
      lemma: text,
      pos: /^\p{Lu}/u.test(text) ? "noun" : "",
      article: null,
      translation: "",
    },
    ai: null,
    begun: false,
    decision: null,
  };
}

/**
 * The texts to confirm, from the first. `preselect` is a suggestion tapped on Add words: it
 * starts chosen.
 */
export function startFlow(mode: Mode, texts: string[], preselect?: EntryView): Flow {
  const steps = texts.map(newStep);
  const [first] = steps;
  if (preselect && first) {
    steps[0] = { ...first, chosen: { [viewKey(preselect)]: firstGloss(preselect) }, begun: true };
  }
  return { mode, texts, index: 0, steps };
}

/**
 * Sets a step up from its lookup, once: when exactly one card comes from an exact match or a form
 * (and isn't in the list already), it starts chosen; when nothing at all was found, the hand form
 * is open.
 */
export function beginStep(step: Step, found: LookupResponse): Step {
  if (step.begun) return { ...step };
  const direct = [...found.entries, ...found.forms.flatMap((f) => f.entries)];
  const nothing = direct.length === 0 && found.similar.length === 0;
  const [only] = direct;
  return {
    ...step,
    begun: true,
    chosen:
      direct.length === 1 && only && !only.inMyWords
        ? { [viewKey(only)]: firstGloss(only) }
        : step.chosen,
    hand: nothing ? { ...step.hand, open: true } : step.hand,
  };
}

/** How many words Add would save: the chosen cards, and the hand form when open. */
const wordCount = (step: Step) => Object.keys(step.chosen).length + (step.hand.open ? 1 : 0);

/** Chooses a card or unchooses it. A word in the list can't be chosen; at most 5 words. */
export function toggleCard(step: Step, view: EntryView): Step {
  const key = viewKey(view);
  if (key in step.chosen) {
    const { [key]: _, ...rest } = step.chosen;
    return { ...step, chosen: rest };
  }
  if (view.inMyWords || wordCount(step) >= TYPED_WORDS_MAX) return step;
  return { ...step, chosen: { ...step.chosen, [key]: firstGloss(view) } };
}

export function setTranslation(step: Step, view: EntryView, translation: string): Step {
  const key = viewKey(view);
  if (!(key in step.chosen)) return step;
  return { ...step, chosen: { ...step.chosen, [key]: translation } };
}

export const toggleHand = (step: Step): Step => ({
  ...step,
  hand: { ...step.hand, open: !step.hand.open },
});

export const updateHand = (step: Step, change: Partial<HandForm>): Step => ({
  ...step,
  hand: { ...step.hand, ...change },
});

/** Ask AI on the hand form, for a word the dictionary doesn't have: all four fields. */
export const fillHand = (step: Step, word: DescribeResponse): Step => ({
  ...step,
  hand: { open: true, ...word },
});

/**
 * Ask AI on the hand form, for a word the dictionary has: its entries are offered instead, the
 * one matching the AI's word chosen with the AI's translation, and the hand form closes.
 */
export function setAi(step: Step, word: DescribeResponse, entries: EntryView[]): Step {
  const match = entries.find(
    (e) => e.pos === word.pos && e.article === word.article && !e.inMyWords,
  );
  return {
    ...step,
    ai: { word, entries },
    hand: { ...step.hand, open: false },
    chosen: match ? { ...step.chosen, [viewKey(match)]: word.translation } : step.chosen,
  };
}

const handComplete = ({ lemma, pos, translation }: HandForm) =>
  Boolean(lemma.trim() && pos && translation.trim());

/** Add is possible when something is chosen and every chosen card, and an open hand form, is filled. */
export function canAdd(step: Step): boolean {
  if (wordCount(step) === 0) return false;
  if (Object.values(step.chosen).some((translation) => !translation.trim())) return false;
  return !step.hand.open || handComplete(step.hand);
}

/** "Add", or "Add 2 words" when two are chosen. */
export function addLabel(step: Step): string {
  const count = wordCount(step);
  return count > 1 ? `Add ${count} words` : "Add";
}

/** The words Add saves: the chosen cards (from `views`, the cards on screen), then the hand form. */
export function wordsOf(step: Step, views: EntryView[]): TypedWord[] {
  const byKey = new Map(views.map((v) => [viewKey(v), v]));
  const chosen = Object.entries(step.chosen).flatMap(([key, translation]) => {
    const view = byKey.get(key);
    return view
      ? [
          {
            lemma: view.lemma,
            pos: view.pos,
            article: view.article,
            translation: translation.trim(),
            entryId: view.entryId,
          },
        ]
      : [];
  });
  const { hand } = step;
  const typed =
    hand.open && hand.pos && handComplete(hand)
      ? [
          {
            lemma: hand.lemma.trim(),
            pos: hand.pos,
            article: hand.pos === "noun" ? hand.article : null,
            translation: hand.translation.trim(),
          },
        ]
      : [];
  return [...chosen, ...typed];
}

/** A group of cards on Confirm word, with what heads it. */
export type Section =
  | { kind: "ai"; word: DescribeResponse; views: EntryView[] }
  | { kind: "entries"; views: EntryView[] }
  /** "*ging* is a form of **gehen**". */
  | { kind: "form"; form: string; lemma: string; views: EntryView[] }
  /** "Did you mean…?" */
  | { kind: "similar"; views: EntryView[] };

/**
 * The cards in order: the AI's word (after Ask AI), the exact entries, each base word, the similar
 * words. A card the AI's section shows isn't repeated below it; empty sections are left out.
 */
export function sections(step: Step, text: string, found: LookupResponse): Section[] {
  const shown = new Set(step.ai?.entries.map(viewKey) ?? []);
  const rest = (views: EntryView[]) => views.filter((v) => !shown.has(viewKey(v)));
  const all: Section[] = [
    ...(step.ai ? [{ kind: "ai" as const, word: step.ai.word, views: step.ai.entries }] : []),
    { kind: "entries", views: rest(found.entries) },
    ...found.forms.map((form) => ({
      kind: "form" as const,
      form: text,
      lemma: form.lemma,
      views: rest(form.entries),
    })),
    { kind: "similar", views: rest(found.similar) },
  ];
  return all.filter((section) => section.views.length > 0);
}

/** Every card on screen, to turn the chosen keys back into words. */
export const viewsOf = (all: Section[]) => all.flatMap((section) => section.views);

/** Records the current text's decision and goes on to the next; the last one stays current. */
export function decide(flow: Flow, decision: Decision): Flow {
  const steps = flow.steps.map((step, i) => (i === flow.index ? { ...step, decision } : step));
  const index = Math.min(flow.index + 1, flow.texts.length - 1);
  return { ...flow, steps, index };
}

/** The previous text; the first stays (Back then leaves for Add words). */
export const back = (flow: Flow): Flow =>
  flow.index > 0 ? { ...flow, index: flow.index - 1 } : flow;

/** Changes one text's step: the current one, or (for an answer that arrives later) the one asked for. */
export const changeStep = (flow: Flow, change: (step: Step) => Step, index = flow.index): Flow => ({
  ...flow,
  steps: flow.steps.map((step, i) => (i === index ? change(step) : step)),
});

/** Whether the current text is the list's last (or the only one). */
export const isLast = (flow: Flow) => flow.index === flow.texts.length - 1;

/** The words a typed list saves: those of every text decided as Add. */
export const listWords = (flow: Flow): TypedWord[] =>
  flow.steps.flatMap((step) => (step.decision?.kind === "add" ? step.decision.words : []));
