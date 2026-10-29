import { LEARNED_STREAK } from "@language-app/core";
import { describe, expect, it } from "vitest";
import { wordCount } from "../src/words/counts";
import { groupByLetter } from "../src/words/groupByLetter";
import { checkLabel, dayText, progressLabel } from "../src/words/labels";
import {
  addToGroupUrl,
  emptyFilterText,
  filterGone,
  filterKey,
  filterText,
  filterUrl,
  listRequest,
  parseListQuery,
  sectionsBy,
  wordsUrl,
} from "../src/words/listQuery";

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
  const ALL = { sort: "az", filter: null } as const;

  it("reads the tab and the search, Learning by default", () => {
    expect(parseListQuery(new URLSearchParams(""))).toEqual({ status: "learning", q: "", ...ALL });
    expect(parseListQuery(new URLSearchParams("status=ignored&q=+tisch+"))).toEqual({
      status: "ignored",
      q: "tisch",
      ...ALL,
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
      ...ALL,
    });
  });

  it("reads the sort and at most one filter: an import, a theme or a group", () => {
    const read = (query: string) => {
      const { sort, filter } = parseListQuery(new URLSearchParams(query));
      return { sort, filter };
    };
    expect(read("sort=newest")).toEqual({ sort: "newest", filter: null });
    expect(read("import=5")).toEqual({ sort: "az", filter: { kind: "import", importId: 5 } });
    expect(read("theme=home")).toEqual({ sort: "az", filter: { kind: "theme", theme: "home" } });
    expect(read("group=7")).toEqual({ sort: "az", filter: { kind: "group", groupId: 7 } });
    // The sort stays beside a filter (M13.2): every list can be newest first.
    expect(read("import=5&sort=newest")).toEqual({
      sort: "newest",
      filter: { kind: "import", importId: 5 },
    });
    expect(read("group=7&sort=newest").sort).toBe("newest");
    // Only one filter at a time; the first of import, theme and group wins.
    expect(read("theme=home&group=7").filter).toEqual({ kind: "theme", theme: "home" });
  });

  it("reads a filter it doesn't know as none (and a sort it doesn't know as A–Z)", () => {
    const filter = (query: string) => parseListQuery(new URLSearchParams(query)).filter;
    for (const odd of [
      "import=abc",
      "import=0",
      "import=-2",
      "import=1.5",
      "theme=health",
      "theme=Home",
      "theme=",
      "group=abc",
      "group=0",
      "group=2x",
    ]) {
      expect(filter(odd), odd).toBeNull();
    }
    expect(parseListQuery(new URLSearchParams("sort=oldest")).sort).toBe("az");
  });

  it("puts the sort in the URL only when it is newest first, then the filter", () => {
    expect(wordsUrl({ status: "learning", q: "", ...ALL })).toBe("/words?status=learning");
    expect(wordsUrl({ status: "learning", q: "", sort: "newest" })).toBe(
      "/words?status=learning&sort=newest",
    );
    const cases = [
      [{ kind: "import", importId: 5 }, "import=5"],
      [{ kind: "theme", theme: "home" }, "theme=home"],
      [{ kind: "group", groupId: 7 }, "group=7"],
    ] as const;
    for (const [filter, param] of cases) {
      const url = wordsUrl({ status: "ignored", q: "tisch", sort: "newest", filter });
      expect(url).toBe(`/words?status=ignored&q=tisch&sort=newest&${param}`);
      expect(parseListQuery(new URL(url, "http://x").searchParams)).toEqual({
        status: "ignored",
        q: "tisch",
        sort: "newest",
        filter,
      });
    }
  });

  it("asks the server for the filter's words in the sort's order", () => {
    expect(listRequest({ status: "learning", q: "", ...ALL })).toEqual({
      status: "learning",
      q: "",
    });
    expect(listRequest({ status: "learned", q: "tisch", sort: "newest", filter: null })).toEqual({
      status: "learned",
      q: "tisch",
      sort: "newest",
    });
    expect(
      listRequest({
        status: "ignored",
        q: "",
        sort: "az",
        filter: { kind: "import", importId: 5 },
      }),
    ).toEqual({ status: "ignored", q: "", importId: 5 });
    expect(
      listRequest({
        status: "learning",
        q: "",
        sort: "newest",
        filter: { kind: "theme", theme: "home" },
      }),
    ).toEqual({ status: "learning", q: "", theme: "home", sort: "newest" });
    expect(
      listRequest({ status: "learning", q: "", sort: "az", filter: { kind: "group", groupId: 7 } }),
    ).toEqual({ status: "learning", q: "", groupId: 7 });
  });

  it("the Filter screen and Add to group carry My words' query", () => {
    const query = {
      status: "learned",
      q: "tisch",
      sort: "newest",
      filter: { kind: "theme", theme: "home" },
    } as const;
    expect(filterUrl(query)).toBe("/words/filter?status=learned&q=tisch&sort=newest&theme=home");
    expect(addToGroupUrl(query)).toBe(
      "/words/add-to-group?status=learned&q=tisch&sort=newest&theme=home",
    );
  });

  it("a filter's key stands for it: equal filters, equal keys", () => {
    expect(filterKey(null)).toBe("");
    expect(filterKey({ kind: "import", importId: 5 })).toBe("import-5");
    expect(filterKey({ kind: "theme", theme: "home" })).toBe("theme-home");
    expect(filterKey({ kind: "group", groupId: 7 })).toBe("group-7");
  });
});

describe("the Filter pill (§10 screen 7)", () => {
  const imports = [{ id: 5, label: "Lesson 4" }];
  const groups = [{ id: 7, name: "Hard ones" }];

  it("says Filter without a filter, else the filter's name", () => {
    expect(filterText(null, { imports, groups })).toBe("Filter");
    expect(filterText({ kind: "import", importId: 5 }, { imports, groups })).toBe("Lesson 4");
    expect(filterText({ kind: "theme", theme: "body" }, { imports, groups })).toBe("Body & health");
    expect(filterText({ kind: "group", groupId: 7 }, { imports, groups })).toBe("Hard ones");
  });

  it("while the imports or groups load (or failed), says One import or One group; a theme at once", () => {
    const loading = { imports: null, groups: null };
    expect(filterText({ kind: "import", importId: 5 }, loading)).toBe("One import");
    expect(filterText({ kind: "group", groupId: 7 }, loading)).toBe("One group");
    expect(filterText({ kind: "theme", theme: "home" }, loading)).toBe("Home");
  });

  it("clearing it keeps the tab, search and sort", () => {
    const query = {
      status: "learned",
      q: "tisch",
      sort: "newest",
      filter: { kind: "group", groupId: 7 },
    } as const;
    expect(wordsUrl({ ...query, filter: null })).toBe("/words?status=learned&q=tisch&sort=newest");
  });

  it("falls back to all words once the lists are in and no longer offer the filter", () => {
    const lists = {
      imports: [{ id: 5 }],
      themes: [{ key: "home" as const }, { key: "work" as const }],
      groups: [{ id: 7 }],
    };
    expect(filterGone({ kind: "theme", theme: "home" }, lists)).toBe(false);
    expect(filterGone({ kind: "theme", theme: "food" }, lists)).toBe(true);
    expect(filterGone({ kind: "import", importId: 5 }, lists)).toBe(false);
    expect(filterGone({ kind: "import", importId: 6 }, lists)).toBe(true);
    expect(filterGone({ kind: "group", groupId: 7 }, lists)).toBe(false);
    // A deleted group.
    expect(filterGone({ kind: "group", groupId: 8 }, lists)).toBe(true);
    // While a list loads, or when it couldn't be loaded, the filter stays.
    expect(filterGone({ kind: "theme", theme: "food" }, { ...lists, themes: null })).toBe(false);
    expect(filterGone({ kind: "import", importId: 6 }, { ...lists, imports: null })).toBe(false);
    expect(filterGone({ kind: "group", groupId: 8 }, { ...lists, groups: null })).toBe(false);
    expect(filterGone(null, { imports: [], themes: [], groups: [] })).toBe(false);
  });
});

describe("My words' list headings (§10 screen 7)", () => {
  it("newest first splits any list by day, filtered or not; A–Z by letter", () => {
    expect(sectionsBy({ sort: "newest", q: "" })).toBe("day");
    expect(sectionsBy({ sort: "az", q: "" })).toBe("letter");
    // While searching: one flat list.
    expect(sectionsBy({ sort: "newest", q: "tisch" })).toBe("none");
  });

  it("each filter's empty tab says where it looks", () => {
    expect(emptyFilterText("learned", { kind: "import", importId: 5 })).toBe(
      "No learned words from this import.",
    );
    expect(emptyFilterText("ignored", { kind: "theme", theme: "home" })).toBe(
      "No ignored words in this theme.",
    );
    expect(emptyFilterText("learned", { kind: "group", groupId: 7 })).toBe(
      "No learned words in this group.",
    );
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
