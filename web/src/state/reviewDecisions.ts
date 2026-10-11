import type { Article, Candidate, SaveDecision } from "@language-app/core";

// The learner's Add / Skip choices on the Review screen (§6.4), keyed by candidate key.

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
