import { LEARNED_STREAK } from "@language-app/core";
import { describe, expect, it } from "vitest";
import { wordCount } from "../src/words/counts";
import { groupByLetter } from "../src/words/groupByLetter";
import { checkLabel, dayText, progressLabel } from "../src/words/labels";
import {
  listRequest,
  parseListQuery,
  viewFromValue,
  viewGone,
  viewValue,
  wordsUrl,
} from "../src/words/listQuery";
import { themeMenuText } from "../src/words/themes";

describe("letter sections of the list (§10)", () => {
  const words = (...lemmas: string[]) => lemmas.map((lemma, id) => ({ id, lemma }));
  const shape = (groups: ReturnType<typeof groupByLetter<{ lemma: string }>>) =>
    groups.map((group) => [group.letter, group.words.map((word) => word.lemma)]);

  it("groups the words under their first letter, keeping their order", () => {
    const list = words("ab", "Anruf", "Balkon", "bei", "Cent");
    const groups = groupByLetter(list);
    expect(shape(groups)).toEqual([
      ["A", ["ab", "Anruf"]],
      ["B", ["Balkon", "bei"]],
      ["C", ["Cent"]],
    ]);
    // The same objects, so a row still gets the whole word.
    expect(groups[0]?.words[1]).toBe(list[1]);
  });

  it("puts umlauts and other accented letters under their base letter", () => {
    expect(shape(groupByLetter(words("alt", "Ärger", "Öl", "oben", "über", "Übung")))).toEqual([
      ["A", ["alt", "Ärger"]],
      ["O", ["Öl", "oben"]],
      ["U", ["über", "Übung"]],
    ]);
  });

  it("gathers words that don't start with a letter under #", () => {
    expect(shape(groupByLetter(words("3D-Drucker", "(sich) freuen", "Abend")))).toEqual([
      ["#", ["3D-Drucker", "(sich) freuen"]],
      ["A", ["Abend"]],
    ]);
  });

  it("starts a new group only where the letter changes, never reordering", () => {
    expect(shape(groupByLetter(words("Zug", "Ärger", "Apfel")))).toEqual([
      ["Z", ["Zug"]],
      ["A", ["Ärger", "Apfel"]],
    ]);
    expect(shape(groupByLetter(words("Apfel", "Zug", "Ärger")))).toEqual([
      ["A", ["Apfel"]],
      ["Z", ["Zug"]],
      ["A", ["Ärger"]],
    ]);
  });

  it("makes one group when every word starts alike, and none for no words", () => {
    expect(shape(groupByLetter(words("Tisch", "tun", "Tür")))).toEqual([
      ["T", ["Tisch", "tun", "Tür"]],
    ]);
    expect(groupByLetter([])).toEqual([]);
  });
});

describe("word count in the header (§10)", () => {
  it("adds up every tab", () => {
    expect(wordCount({ learning: 149, learned: 3, ignored: 12 })).toBe("164 words");
  });

  it("says word for one", () => {
    expect(wordCount({ learning: 0, learned: 1, ignored: 0 })).toBe("1 word");
    expect(wordCount({ learning: 0, learned: 0, ignored: 0 })).toBe("0 words");
  });
});

describe("My words URL (§10)", () => {
  const AZ = { kind: "az" } as const;

  it("reads the tab and the search, Learning by default", () => {
    expect(parseListQuery(new URLSearchParams(""))).toEqual({
      status: "learning",
      q: "",
      view: AZ,
    });
    expect(parseListQuery(new URLSearchParams("status=ignored&q=+tisch+"))).toEqual({
      status: "ignored",
      q: "tisch",
      view: AZ,
    });
    expect(parseListQuery(new URLSearchParams("status=nonsense")).status).toBe("learning");
  });

  it("builds the URL of a tab, with the search only when there is one", () => {
    expect(wordsUrl({ status: "learned", q: "" })).toBe("/words?status=learned");
    expect(wordsUrl({ status: "learning", q: " der Tisch " })).toBe(
      "/words?status=learning&q=der+Tisch",
    );
    const url = wordsUrl({ status: "ignored", q: "über & co" });
    expect(parseListQuery(new URL(url, "http://x").searchParams)).toEqual({
      status: "ignored",
      q: "über & co",
      view: AZ,
    });
  });

  it("reads the view: newest first, or one import", () => {
    const view = (query: string) => parseListQuery(new URLSearchParams(query)).view;
    expect(view("sort=newest")).toEqual({ kind: "newest" });
    expect(view("import=5")).toEqual({ kind: "import", importId: 5 });
    // An import shows its words A–Z; a sort next to it is ignored.
    expect(view("import=5&sort=newest")).toEqual({ kind: "import", importId: 5 });
    for (const odd of ["sort=oldest", "import=abc", "import=0", "import=-2", "import=1.5"]) {
      expect(view(odd)).toEqual(AZ);
    }
  });

  it("puts the view in the URL only when it isn't A–Z", () => {
    expect(wordsUrl({ status: "learning", q: "", view: AZ })).toBe("/words?status=learning");
    expect(wordsUrl({ status: "learning", q: "", view: { kind: "newest" } })).toBe(
      "/words?status=learning&sort=newest",
    );
    const url = wordsUrl({ status: "ignored", q: "tisch", view: { kind: "import", importId: 5 } });
    expect(url).toBe("/words?status=ignored&q=tisch&import=5");
    expect(parseListQuery(new URL(url, "http://x").searchParams)).toEqual({
      status: "ignored",
      q: "tisch",
      view: { kind: "import", importId: 5 },
    });
  });

  it("asks the server for the view's words and order", () => {
    expect(listRequest({ status: "learning", q: "", view: AZ })).toEqual({
      status: "learning",
      q: "",
    });
    expect(listRequest({ status: "learned", q: "tisch", view: { kind: "newest" } })).toEqual({
      status: "learned",
      q: "tisch",
      sort: "newest",
    });
    expect(
      listRequest({ status: "ignored", q: "", view: { kind: "import", importId: 5 } }),
    ).toEqual({ status: "ignored", q: "", importId: 5 });
  });

  it("the view menu's values stand for the views", () => {
    const views = [AZ, { kind: "newest" }, { kind: "import", importId: 5 }] as const;
    expect(views.map(viewValue)).toEqual(["az", "newest", "import-5"]);
    for (const view of views) expect(viewFromValue(viewValue(view))).toEqual(view);
    expect(viewFromValue("import-x")).toEqual(AZ);
  });
});

describe("My words by theme (§10 screen 7)", () => {
  const AZ = { kind: "az" } as const;
  const home = { kind: "theme", theme: "home" } as const;

  it("reads a theme from the URL; a key that isn't in THEMES is All words · A–Z", () => {
    const view = (query: string) => parseListQuery(new URLSearchParams(query)).view;
    expect(view("theme=home")).toEqual(home);
    expect(view("theme=free-time")).toEqual({ kind: "theme", theme: "free-time" });
    // A theme shows its words A–Z; a sort next to it is ignored.
    expect(view("theme=home&sort=newest")).toEqual(home);
    for (const odd of ["theme=health", "theme=Home", "theme=", "theme=home-2"]) {
      expect(view(odd), odd).toEqual(AZ);
    }
  });

  it("keeps the theme in the URL and asks the server for its words", () => {
    const url = wordsUrl({ status: "learned", q: "tisch", view: home });
    expect(url).toBe("/words?status=learned&q=tisch&theme=home");
    expect(parseListQuery(new URL(url, "http://x").searchParams)).toEqual({
      status: "learned",
      q: "tisch",
      view: home,
    });
    expect(listRequest({ status: "learning", q: "", view: home })).toEqual({
      status: "learning",
      q: "",
      theme: "home",
    });
  });

  it("the view menu's values stand for the themes", () => {
    expect(viewValue(home)).toBe("theme-home");
    expect(viewFromValue("theme-free-time")).toEqual({ kind: "theme", theme: "free-time" });
    expect(viewFromValue("theme-health")).toEqual(AZ);
  });

  it("lists each theme under Themes by its label and its words", () => {
    expect(themeMenuText({ key: "home", words: 34 })).toBe("Home (34)");
    expect(themeMenuText({ key: "body", words: 1 })).toBe("Body & health (1)");
  });

  it("falls back to All words · A–Z once the menu is in and no longer has the view", () => {
    const menu = {
      imports: [{ id: 5 }],
      themes: [{ key: "home" as const }, { key: "work" as const }],
    };
    expect(viewGone(home, menu)).toBe(false);
    expect(viewGone({ kind: "theme", theme: "food" }, menu)).toBe(true);
    expect(viewGone({ kind: "import", importId: 5 }, menu)).toBe(false);
    expect(viewGone({ kind: "import", importId: 6 }, menu)).toBe(true);
    // While the menu loads, or when it couldn't be loaded, the view stays.
    expect(viewGone({ kind: "theme", theme: "food" }, { ...menu, themes: null })).toBe(false);
    expect(viewGone({ kind: "import", importId: 6 }, { ...menu, imports: null })).toBe(false);
    expect(viewGone(AZ, { imports: [], themes: [] })).toBe(false);
    expect(viewGone({ kind: "newest" }, { imports: [], themes: [] })).toBe(false);
  });
});

describe("progress label on a list row", () => {
  it("marks learning words that were never practised as new", () => {
    expect(progressLabel({ status: "learning", timesSeen: 0, correctStreak: 0 })).toEqual({
      kind: "new",
      text: "new",
      spoken: "Not practised yet",
      filled: 0,
    });
  });

  it("counts right answers in a row towards learned, one filled dot each", () => {
    expect(progressLabel({ status: "learning", timesSeen: 4, correctStreak: 2 })).toEqual({
      kind: "streak",
      text: `2/${LEARNED_STREAK}`,
      spoken: `2 of ${LEARNED_STREAK} right in a row`,
      filled: 2,
    });
    expect(progressLabel({ status: "learning", timesSeen: 1, correctStreak: 0 })).toMatchObject({
      text: `0/${LEARNED_STREAK}`,
      filled: 0,
    });
  });

  it("never counts past the streak that makes a word learned", () => {
    expect(progressLabel({ status: "learning", timesSeen: 9, correctStreak: 7 })).toMatchObject({
      text: `${LEARNED_STREAK}/${LEARNED_STREAK}`,
      filled: LEARNED_STREAK,
    });
  });

  it("shows nothing for learned or ignored words", () => {
    expect(progressLabel({ status: "learned", timesSeen: 9, correctStreak: 7 })).toBeNull();
    expect(progressLabel({ status: "learned", timesSeen: 0, correctStreak: 0 })).toBeNull();
    expect(progressLabel({ status: "ignored", timesSeen: 3, correctStreak: 1 })).toBeNull();
    expect(progressLabel({ status: "ignored", timesSeen: 0, correctStreak: 0 })).toBeNull();
  });
});

describe("dictionary check in plain words", () => {
  it("flags only an article the dictionary disagrees with", () => {
    expect(checkLabel("match")).toEqual({ text: "Found in Wiktionary", warning: false });
    expect(checkLabel("mismatch_fixed").warning).toBe(false);
    expect(checkLabel("mismatch_kept")).toMatchObject({ warning: true });
    expect(checkLabel("not_in_dictionary").text).toMatch(/not in Wiktionary/i);
  });
});

describe("dayText", () => {
  const now = new Date(2026, 9, 12, 9, 0);

  it("says today, yesterday or how many days ago for the last week", () => {
    expect(dayText(new Date(2026, 9, 12, 0, 5).toISOString(), now)).toBe("today");
    expect(dayText(new Date(2026, 9, 11, 23, 50).toISOString(), now)).toBe("yesterday");
    expect(dayText(new Date(2026, 9, 9, 12, 0).toISOString(), now)).toBe("3 days ago");
  });

  it("gives the date for anything older, with the year only when it differs", () => {
    expect(dayText(new Date(2026, 8, 1).toISOString(), now)).not.toMatch(/ago|2026/);
    expect(dayText(new Date(2025, 8, 1).toISOString(), now)).toMatch(/2025/);
  });
});
