import type { EntryView, LookupResponse } from "@language-app/core";
import { describe, expect, it } from "vitest";
import {
  addLabel,
  back,
  beginStep,
  canAdd,
  decide,
  fillHand,
  listWords,
  type Step,
  sections,
  setAi,
  setTranslation,
  startFlow,
  toggleCard,
  toggleHand,
  updateHand,
  viewKey,
  wordsOf,
} from "../src/state/addWords";
import { shortGloss, shortGlosses } from "../src/words/glosses";
import { countText, typedLines } from "../src/words/typedList";

const view = (lemma: string, overrides: Partial<EntryView> = {}): EntryView => ({
  entryId: lemma.length * 100 + lemma.charCodeAt(0),
  lemma,
  pos: "noun",
  article: "der",
  plural: null,
  forms: null,
  glosses: [lemma.toLowerCase()],
  ipa: null,
  audioUrl: null,
  inMyWords: null,
  ...overrides,
});

const lookup = (parts: Partial<LookupResponse>): LookupResponse => ({
  entries: [],
  forms: [],
  similar: [],
  ...parts,
});

const lake = view("See", { entryId: 1, glosses: ["lake"] });
const sea = view("See", { entryId: 2, article: "die", glosses: ["sea, ocean", "swell"] });
const umbrella = view("Regenschirm", {
  entryId: 3,
  glosses: ["umbrella (used for protection against rain)"],
});
const gehen = view("gehen", { entryId: 4, pos: "verb", article: null, glosses: ["to go"] });

/** The step of the flow's current text. */
const stepOf = (flow: { steps: Step[]; index: number }) => flow.steps[flow.index] as Step;

describe("a typed list's lines (§10 Add words)", () => {
  it("one word per line, trimmed; blank lines and repeats (ignoring case) don't count", () => {
    expect(typedLines(" Tisch \n\nstuhl\r\n  \nTISCH\nLampe")).toEqual({
      words: ["Tisch", "stuhl", "Lampe"],
      tooMany: false,
    });
    expect(typedLines("")).toEqual({ words: [], tooMany: false });
  });

  it("keeps a phrase together, with single spaces", () => {
    expect(typedLines("zum   Beispiel\nsich  freuen").words).toEqual([
      "zum Beispiel",
      "sich freuen",
    ]);
  });

  it("drops list bullets and numbers from pasted lists", () => {
    expect(typedLines("- Tisch\n• Stuhl\n* Lampe\n1. Bett\n2) Sofa").words).toEqual([
      "Tisch",
      "Stuhl",
      "Lampe",
      "Bett",
      "Sofa",
    ]);
  });

  it("at most 30 words at a time", () => {
    const thirty = Array.from({ length: 30 }, (_, i) => `Wort${i}`).join("\n");
    expect(typedLines(thirty).tooMany).toBe(false);
    expect(typedLines(`${thirty}\nnoch eins`)).toMatchObject({ tooMany: true });
    expect(typedLines(`${thirty}\nWORT0`).tooMany).toBe(false);
  });

  it("a line is cut at 50 characters, the most the dictionary looks up", () => {
    expect(typedLines("x".repeat(60)).words).toEqual(["x".repeat(50)]);
  });

  it("says how many words", () => {
    expect(countText(0)).toBe("No words yet");
    expect(countText(1)).toBe("1 word");
    expect(countText(5)).toBe("5 words");
  });
});

describe("shortened glosses (§6.7 step 3)", () => {
  it("drops the parts in parentheses", () => {
    expect(shortGloss("umbrella (used for protection against rain)")).toBe("umbrella");
    expect(shortGloss("bench (which people sit on); pew")).toBe("bench; pew");
    expect(shortGloss("(intransitive) to go")).toBe("to go");
    expect(shortGloss("bank (financial institution)")).toBe("bank");
    expect(shortGloss("dining table, dinner table")).toBe("dining table, dinner table");
  });

  it("copes with nested parentheses and keeps a gloss that is all parentheses", () => {
    expect(shortGloss("acre (when speaking (vaguely)) of land")).toBe("acre of land");
    expect(shortGloss("(informal)")).toBe("(informal)");
  });

  it("at most 200 characters, the longest translation", () => {
    expect(shortGloss("a".repeat(250))).toHaveLength(200);
  });

  it("the chips: each gloss shortened once, empty ones left out", () => {
    expect(shortGlosses(["sea, ocean", "sea (body of water)", "  ", "swell"])).toEqual([
      "sea, ocean",
      "sea",
      "swell",
    ]);
  });
});

describe("Confirm word's steps (§6.7, §10 screen 15)", () => {
  it("one card from an exact match starts chosen, with its first gloss shortened", () => {
    const flow = startFlow("one", ["Regenschirm"]);
    const step = beginStep(stepOf(flow), lookup({ entries: [umbrella] }));
    expect(step.chosen).toEqual({ [viewKey(umbrella)]: "umbrella" });
    expect(canAdd(step)).toBe(true);
  });

  it("several cards, a similar word, or a word in the list start unchosen", () => {
    const flow = startFlow("one", ["See"]);
    expect(beginStep(stepOf(flow), lookup({ entries: [lake, sea] })).chosen).toEqual({});
    expect(beginStep(stepOf(flow), lookup({ similar: [umbrella] })).chosen).toEqual({});
    const mine = { ...umbrella, inMyWords: 7 };
    expect(beginStep(stepOf(flow), lookup({ entries: [mine] })).chosen).toEqual({});
  });

  it("one card from a form starts chosen", () => {
    const flow = startFlow("one", ["ging"]);
    const step = beginStep(
      stepOf(flow),
      lookup({ forms: [{ lemma: "gehen", pos: "verb", entries: [gehen] }] }),
    );
    expect(Object.keys(step.chosen)).toEqual([viewKey(gehen)]);
  });

  it("nothing found: the hand form is open from the start, with the typed text", () => {
    const flow = startFlow("one", ["Kinderbibliothek"]);
    const step = beginStep(stepOf(flow), lookup({}));
    expect(step.hand).toMatchObject({ open: true, lemma: "Kinderbibliothek" });
    expect(canAdd(step)).toBe(false);
  });

  it("begins a step once: going back to a word keeps what was chosen", () => {
    const flow = startFlow("one", ["Regenschirm"]);
    const begun = beginStep(stepOf(flow), lookup({ entries: [umbrella] }));
    const unchosen = toggleCard(begun, umbrella);
    expect(beginStep(unchosen, lookup({ entries: [umbrella] })).chosen).toEqual({});
  });

  it("a suggestion opens Confirm word with that entry chosen", () => {
    const flow = startFlow("one", ["See"], sea);
    const step = beginStep(stepOf(flow), lookup({ entries: [lake, sea] }));
    expect(step.chosen).toEqual({ [viewKey(sea)]: "sea, ocean" });
  });

  it("choose: tapping a card toggles it; a word in the list can't be chosen", () => {
    let step = stepOf(startFlow("one", ["See"]));
    step = toggleCard(step, lake);
    step = toggleCard(step, sea);
    expect(Object.keys(step.chosen)).toEqual([viewKey(lake), viewKey(sea)]);
    expect(addLabel(step)).toBe("Add 2 words");
    step = toggleCard(step, lake);
    expect(addLabel(step)).toBe("Add");
    expect(toggleCard(step, { ...umbrella, inMyWords: 7 })).toBe(step);
  });

  it("one view per gender is its own card", () => {
    const der = view("Liter", { entryId: 9, article: "der" });
    const das = view("Liter", { entryId: 9, article: "das" });
    expect(viewKey(der)).not.toBe(viewKey(das));
  });

  it("at most 5 words for one typed text", () => {
    let step = stepOf(startFlow("one", ["der"]));
    const many = Array.from({ length: 6 }, (_, i) => view(`Wort${i}`, { entryId: 50 + i }));
    for (const each of many) step = toggleCard(step, each);
    expect(Object.keys(step.chosen)).toHaveLength(5);
  });

  it("translation: editable, needed for every chosen card", () => {
    let step = toggleCard(stepOf(startFlow("one", ["See"])), sea);
    step = setTranslation(step, sea, "  ");
    expect(canAdd(step)).toBe(false);
    step = setTranslation(step, sea, "the sea");
    expect(canAdd(step)).toBe(true);
    expect(wordsOf(step, [lake, sea])).toEqual([
      { lemma: "See", pos: "noun", article: "die", translation: "the sea", entryId: 2 },
    ]);
  });

  it("the hand form: word, part of speech, article for a noun, translation", () => {
    let step = toggleHand(stepOf(startFlow("one", ["kinderbibliothek"])));
    expect(step.hand).toMatchObject({ open: true, lemma: "kinderbibliothek", pos: "" });
    expect(canAdd(step)).toBe(false);
    step = updateHand(step, { lemma: "Kinderbibliothek", pos: "noun", article: "die" });
    expect(canAdd(step)).toBe(false);
    step = updateHand(step, { translation: "children's library" });
    expect(canAdd(step)).toBe(true);
    expect(wordsOf(step, [])).toEqual([
      { lemma: "Kinderbibliothek", pos: "noun", article: "die", translation: "children's library" },
    ]);
    // An article belongs to a noun only.
    step = updateHand(step, { pos: "adjective" });
    expect(wordsOf(step, [])[0]?.article).toBeNull();
    // Closed, it adds nothing.
    expect(wordsOf(toggleHand(step), [])).toEqual([]);
  });

  it("an open hand form must be complete before Add, also next to chosen cards", () => {
    let step = toggleCard(stepOf(startFlow("one", ["See"])), lake);
    step = toggleHand(step);
    expect(canAdd(step)).toBe(false);
    step = toggleHand(step);
    expect(canAdd(step)).toBe(true);
  });

  it("Ask AI on the hand form fills all four fields", () => {
    const step = fillHand(stepOf(startFlow("one", ["Kinderbiblothek"])), {
      lemma: "Kinderbibliothek",
      pos: "noun",
      article: "die",
      translation: "children's library",
    });
    expect(step.hand).toEqual({
      open: true,
      lemma: "Kinderbibliothek",
      pos: "noun",
      article: "die",
      translation: "children's library",
    });
    expect(canAdd(step)).toBe(true);
  });

  it("Ask AI's word in the dictionary: its entries instead, the matching one chosen with the AI's translation", () => {
    let step = toggleHand(stepOf(startFlow("one", ["Regenschrim"])));
    step = setAi(
      step,
      { lemma: "Regenschirm", pos: "noun", article: "der", translation: "umbrella" },
      [umbrella],
    );
    expect(step.hand.open).toBe(false);
    expect(step.chosen).toEqual({ [viewKey(umbrella)]: "umbrella" });
    // The AI's cards come first, and aren't repeated under "Did you mean…?".
    const shown = sections(step, "Regenschrim", lookup({ similar: [umbrella, lake] }));
    expect(shown.map((s) => [s.kind, s.views.map((v) => v.entryId)])).toEqual([
      ["ai", [3]],
      ["similar", [1]],
    ]);
  });

  it("the sections: exact entries, then each base word, then similar words", () => {
    const step = stepOf(startFlow("one", ["ging"]));
    expect(
      sections(
        step,
        "ging",
        lookup({ forms: [{ lemma: "gehen", pos: "verb", entries: [gehen] }] }),
      ),
    ).toEqual([{ kind: "form", form: "ging", lemma: "gehen", views: [gehen] }]);
    expect(sections(step, "See", lookup({ entries: [lake, sea] }))).toEqual([
      { kind: "entries", views: [lake, sea] },
    ]);
  });

  it("add and remove go on to the next word; back returns to the previous one", () => {
    let flow = startFlow("list", ["See", "Bnak", "gehen"]);
    expect(flow.index).toBe(0);
    flow = decide(flow, { kind: "add", words: wordsOf(toggleCard(stepOf(flow), lake), [lake]) });
    expect(flow.index).toBe(1);
    flow = decide(flow, { kind: "remove" });
    expect(flow.index).toBe(2);
    flow = back(flow);
    expect(flow.index).toBe(1);
    // Deciding the last word stays on it: the list is saved next.
    flow = decide(flow, { kind: "remove" });
    flow = decide(flow, {
      kind: "add",
      words: [{ lemma: "gehen", pos: "verb", article: null, translation: "to go" }],
    });
    expect(flow.index).toBe(2);
    expect(listWords(flow).map((w) => w.lemma)).toEqual(["See", "gehen"]);
  });

  it("back from the first word stays on it (the screen then opens Add words)", () => {
    const flow = startFlow("list", ["See", "gehen"]);
    expect(back(flow)).toBe(flow);
  });

  it("a removed word saves nothing", () => {
    let flow = startFlow("list", ["See", "gehen"]);
    flow = decide(flow, { kind: "remove" });
    flow = decide(flow, { kind: "remove" });
    expect(listWords(flow)).toEqual([]);
  });
});
