import type { PracticeCard, SessionResponse } from "@language-app/core";
import { describe, expect, it } from "vitest";
import {
  afterAnswer,
  closeAction,
  firstRound,
  missedLine,
  nextRound,
  type Rounds,
  restoreRounds,
  roundDoneTitle,
  roundLabel,
} from "../src/practice/rounds";

const card = (userWordId: number, lemma: string) =>
  ({ userWordId, lemma, pos: "noun", translation: lemma }) as PracticeCard;

const [tisch, stuhl, bett] = [card(1, "Tisch"), card(2, "Stuhl"), card(3, "Bett")] as [
  PracticeCard,
  PracticeCard,
  PracticeCard,
];
const session: SessionResponse = { id: 9, source: "not_learned", cards: [tisch, stuhl, bett] };

/** The rounds after answering each card of the round in turn; `null` once the session finishes. */
const play = (start: Rounds, answers: Parameters<typeof afterAnswer>[1][]) =>
  answers.reduce<Rounds | null>((state, result) => state && afterAnswer(state, result), start);

describe("a round's answers (§8.4)", () => {
  it("starts on the session's cards, in their order, as round 1", () => {
    expect(firstRound(session.cards)).toEqual({
      round: 1,
      cards: [tisch, stuhl, bett],
      index: 0,
      missed: [],
      between: false,
    });
  });

  it("moves to the next card, remembering a miss", () => {
    const next = afterAnswer(firstRound(session.cards), "didnt_know");
    expect(next).toMatchObject({ index: 1, missed: [tisch], between: false });
  });

  it("only Didn't know is a miss", () => {
    expect(play(firstRound(session.cards), ["knew", "skipped"])).toMatchObject({
      index: 2,
      missed: [],
    });
  });

  it("the last card with a miss goes between rounds, staying on the last position", () => {
    const state = play(firstRound(session.cards), ["didnt_know", "knew", "didnt_know"]);
    expect(state).toEqual({
      round: 1,
      cards: [tisch, stuhl, bett],
      index: 2,
      missed: [tisch, bett],
      between: true,
    });
  });

  it("the last card without a miss finishes the session", () => {
    expect(play(firstRound(session.cards), ["knew", "skipped", "knew"])).toBeNull();
  });

  it("a miss on the only card goes between rounds", () => {
    expect(afterAnswer(firstRound([tisch]), "didnt_know")).toMatchObject({
      missed: [tisch],
      between: true,
    });
  });
});

describe("the next round (§8.4)", () => {
  const between = play(firstRound(session.cards), ["didnt_know", "knew", "didnt_know"]) as Rounds;

  it("takes the round's misses, from the first card, with none missed yet", () => {
    const next = nextRound(between);
    expect(next).toMatchObject({ round: 2, index: 0, missed: [], between: false });
    expect(next.cards).toHaveLength(2);
    expect(next.cards).toEqual(expect.arrayContaining([tisch, bett]));
  });

  it("shuffles them", () => {
    // Math.floor(0 * 2) swaps the two cards.
    expect(nextRound(between, () => 0).cards).toEqual([bett, tisch]);
    expect(nextRound(between, () => 0.99).cards).toEqual([tisch, bett]);
  });

  it("a word answered right or skipped in a repeat isn't in the one after", () => {
    const three = play(firstRound(session.cards), ["didnt_know", "didnt_know", "didnt_know"]);
    const second = { ...nextRound(three as Rounds), cards: [tisch, stuhl, bett] };

    const after = play(second, ["knew", "skipped", "didnt_know"]) as Rounds;

    expect(after).toMatchObject({ round: 2, missed: [bett], between: true });
    expect(nextRound(after)).toMatchObject({ round: 3, cards: [bett] });
  });

  it("a repeat with nothing missed finishes the session", () => {
    expect(play(nextRound(between), ["knew", "skipped"])).toBeNull();
  });

  it("has no limit on rounds", () => {
    let state = afterAnswer(firstRound([tisch]), "didnt_know") as Rounds;
    for (let i = 0; i < 25; i++) {
      state = afterAnswer(nextRound(state), "didnt_know") as Rounds;
    }
    expect(state).toMatchObject({ round: 26, cards: [tisch], between: true });
  });
});

describe("the words on screen (§10 screen 5)", () => {
  it("the header says Practice in round 1 and the round after it", () => {
    expect(roundLabel(1)).toBe("Practice");
    expect(roundLabel(2)).toBe("Round 2");
    expect(roundLabel(12)).toBe("Round 12");
  });

  it("the between-rounds title names the round just done", () => {
    expect(roundDoneTitle(1)).toBe("Round 1 done");
    expect(roundDoneTitle(3)).toBe("Round 3 done");
  });

  it("counts the words missed", () => {
    expect(missedLine(6)).toBe("6 words you missed");
    expect(missedLine(1)).toBe("1 word you missed");
  });
});

describe("the close button (§12)", () => {
  it("leaves for Home in round 1, the session unfinished", () => {
    expect(closeAction(1)).toBe("home");
  });

  it("finishes the session from round 2 on, as End practice does", () => {
    expect(closeAction(2)).toBe("finish");
    expect(closeAction(7)).toBe("finish");
  });
});

describe("the tab's stored state (§8.4)", () => {
  const midRound: Rounds = {
    round: 2,
    cards: [bett, tisch],
    index: 1,
    missed: [bett],
    between: false,
  };

  it("starts the session the first time", () => {
    expect(restoreRounds(undefined, session, 9)).toEqual({
      session,
      ...firstRound(session.cards),
    });
  });

  it("wins over the started session, which the browser keeps across a reload", () => {
    const stored = { session, ...firstRound(session.cards), index: 2 };
    expect(restoreRounds(stored, session, 9)).toEqual(stored);
  });

  it("restores the middle of a round", () => {
    const stored = { session, ...midRound };
    expect(restoreRounds(stored, session, 9)).toEqual(stored);
  });

  it("restores between rounds", () => {
    const stored = { session, ...midRound, between: true };
    expect(restoreRounds(stored, null, 9)).toEqual(stored);
  });

  it("reads a tab saved before rounds as round 1", () => {
    expect(restoreRounds({ session, index: 2 }, session, 9)).toEqual({
      session,
      round: 1,
      cards: session.cards,
      index: 2,
      missed: [],
      between: false,
    });
  });

  it("ignores a started session that isn't this one", () => {
    expect(restoreRounds(undefined, session, 10)).toBeNull();
  });

  it("has nothing without either", () => {
    expect(restoreRounds(undefined, null, 9)).toBeNull();
  });
});
