import type { Article, Candidate, SaveDecision } from "@language-app/core";

// The learner's Practice / Ignore choices on the Review screen (§6.4), keyed by candidate key. The
// API keeps the actions `add` / `skip`: Practice saves the word as learning, Ignore as ignored.

export type Decision = { action: "add" | "skip"; article?: Article };
export type Decisions = Record<string, Decision>;

export type ReviewAction =
  | { type: "toggle"; key: string }
  | { type: "setAll"; action: "add" | "skip" }
  | { type: "applyArticle"; key: string; article: Article }
  | { type: "clearArticle"; key: string };

/** New candidates are the ones under review; words already in my list are only shown. */
export const reviewable = (candidates: Candidate[]) =>
  candidates.filter((c) => c.existing === "none");

/**
 * Every new candidate starts as Add. Decisions saved earlier on this device are restored for
 * words still under review; an article the dictionary doesn't offer is dropped.
 */
export function initialDecisions(candidates: Candidate[], saved: Decisions = {}): Decisions {
  const decisions: Decisions = {};
  for (const candidate of reviewable(candidates)) {
    const previous = saved[candidate.key];
    const articleOk =
      previous?.article !== undefined &&
      (candidate.dictionary.genders ?? []).includes(previous.article);
    decisions[candidate.key] = {
      action: previous?.action ?? "add",
      ...(articleOk ? { article: previous.article } : {}),
    };
  }
  return decisions;
}

export function reviewReducer(state: Decisions, action: ReviewAction): Decisions {
  switch (action.type) {
    case "toggle": {
      const current = state[action.key];
      if (!current) return state;
      return {
        ...state,
        [action.key]: { ...current, action: current.action === "add" ? "skip" : "add" },
      };
    }
    case "setAll":
      return Object.fromEntries(
        Object.entries(state).map(([key, d]) => [key, { ...d, action: action.action }]),
      );
    case "applyArticle": {
      const current = state[action.key];
      if (!current) return state;
      return { ...state, [action.key]: { ...current, article: action.article } };
    }
    case "clearArticle": {
      const current = state[action.key];
      if (!current) return state;
      const { article: _, ...rest } = current;
      return { ...state, [action.key]: rest };
    }
  }
}

export const countAdds = (decisions: Decisions) =>
  Object.values(decisions).filter((d) => d.action === "add").length;

/** The state on a word's card: Practice (saved as learning) or Ignore (kept, never practised). */
export const choiceLabel = (action: Decision["action"]) =>
  action === "add" ? "Practice" : "Ignore";

/** The pills that set every word at once. */
export const BULK_LABELS = { add: "Practice all", skip: "Ignore all" } as const;

const words = (count: number) => `${count} ${count === 1 ? "word" : "words"}`;

/** "9 new words · 8 to practise", under the title. */
export const reviewSummary = (fresh: number, adds: number) => ({
  fresh: `${fresh} new ${fresh === 1 ? "word" : "words"}`,
  adds: `${adds} to practise`,
});

/** What a button says while new words are saved (and get their details, with AI). */
export const savingLabel = (aiEnabled: boolean) => (aiEnabled ? "Adding details…" : "Saving…");

/**
 * The save button: what saving does, or what it is doing. Without AI saving adds no details, so it
 * just says "Saving…".
 */
export function saveLabel({
  adds,
  fresh,
  saving,
  aiEnabled = true,
}: {
  adds: number;
  fresh: number;
  saving: boolean;
  aiEnabled?: boolean;
}): string {
  if (saving) return adds > 0 ? savingLabel(aiEnabled) : "Saving…";
  if (adds > 0) return `Save ${words(adds)}`;
  if (fresh === 0) return "Finish";
  return fresh === 1 ? "Ignore 1 word" : `Ignore all ${fresh} words`;
}

/** The body of POST /imports/:id/save: the original key, plus the applied article if any. */
export function toSaveDecisions(candidates: Candidate[], decisions: Decisions): SaveDecision[] {
  return reviewable(candidates).flatMap((candidate) => {
    const decision = decisions[candidate.key];
    if (!decision) return [];
    return [
      {
        key: candidate.key,
        action: decision.action,
        ...(decision.article && decision.article !== candidate.article
          ? { article: decision.article }
          : {}),
      },
    ];
  });
}
