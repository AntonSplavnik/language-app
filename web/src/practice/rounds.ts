import {
  type CardResult,
  type PracticeCard,
  type SessionResponse,
  shuffle,
} from "@language-app/core";

// The rounds of a practice session (§8.4): after the last card, the words answered Didn't know can
// come back as a new round, and those still missed after it, until none are left. It all happens
// on the phone: the server only stores each answer with its round.

export type Rounds = {
  /** 1 for the session's cards, 2 for the first repeat, and so on. */
  round: number;
  /** This round's cards, in the order they are shown. */
  cards: PracticeCard[];
  /** The card shown, from 0; the last one while between rounds. */
  index: number;
  /** This round's cards answered Didn't know so far. */
  missed: PracticeCard[];
  /** The round is over, and the learner chooses Next round or End practice. */
  between: boolean;
};

/** What the tab keeps, so a reload continues in the same place. */
export type Saved = { session: SessionResponse } & Rounds;

/** A tab saved before rounds has only `session` and `index`. */
export type StoredTab = { session: SessionResponse } & Partial<Rounds>;

export const firstRound = (cards: PracticeCard[]): Rounds => ({
  round: 1,
  cards,
  index: 0,
  missed: [],
  between: false,
});

/** Where the shown card's answer leads; `null` when the session is to finish. */
export function afterAnswer(state: Rounds, result: CardResult): Rounds | null {
  const card = state.cards[state.index];
  const missed = result === "didnt_know" && card ? [...state.missed, card] : state.missed;
  if (state.index + 1 < state.cards.length) return { ...state, index: state.index + 1, missed };
  return missed.length > 0 ? { ...state, missed, between: true } : null;
}

/** The round after this one: its misses, shuffled so their order isn't remembered. */
export const nextRound = (state: Rounds, random?: () => number): Rounds => ({
  ...firstRound(shuffle(state.missed, random)),
  round: state.round + 1,
});

/**
 * Where the screen starts. What the tab stored comes first: the browser keeps the state the session
 * was started with across a reload, and that would go back to the first card of round 1.
 */
export function restoreRounds(
  stored: StoredTab | undefined,
  started: SessionResponse | null,
  sessionId: number,
): Saved | null {
  if (stored) return { ...firstRound(stored.session.cards), ...stored };
  return started?.id === sessionId ? { session: started, ...firstRound(started.cards) } : null;
}

/** The header's label. */
export const roundLabel = (round: number) => (round === 1 ? "Practice" : `Round ${round}`);

export const roundDoneTitle = (round: number) => `Round ${round} done`;

export const missedLine = (count: number) =>
  `${count} ${count === 1 ? "word" : "words"} you missed`;

/**
 * What the header's close button does: in round 1 back to Home, the session unfinished; from round
 * 2 on what End practice does, since the first round is complete and has a score.
 */
export const closeAction = (round: number): "home" | "finish" => (round === 1 ? "home" : "finish");
