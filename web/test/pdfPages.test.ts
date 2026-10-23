import { describe, expect, it } from "vitest";
import {
  autoName,
  type BookPages,
  checkRange,
  pageLabel,
  pageLabels,
  rangeFields,
  suggestRange,
} from "../src/imports/pdfPages";

/** A 180-page book without page labels. */
const plain: BookPages = { pageCount: 180, labels: null };

/** i, ii, then 40, 41, … like a textbook whose PDF starts with two front pages. */
const labelled: BookPages = {
  pageCount: 14,
  labels: ["i", "ii", ...Array.from({ length: 12 }, (_, i) => String(40 + i))],
};

const pages = (check: ReturnType<typeof checkRange>) =>
  check.ok ? check.pages.map((p) => `${p.number}:${p.label}`) : check.reason;

describe("page labels (§6.8)", () => {
  it("are the PDF's own numbers when it has no labels", () => {
    expect(pageLabel(plain, 42)).toBe("42");
  });

  it("are the printed numbers when the PDF has labels", () => {
    expect(pageLabel(labelled, 1)).toBe("i");
    expect(pageLabel(labelled, 5)).toBe("42");
  });

  it("fall back to the number for a page whose label is empty", () => {
    expect(pageLabel({ pageCount: 2, labels: ["A", ""] }, 2)).toBe("2");
  });

  it("are left out when they only repeat the PDF's numbers, or don't fit the book", () => {
    expect(pageLabels(["1", "2", "3"], 3)).toBeNull();
    expect(pageLabels(["1", "2"], 3)).toBeNull();
    expect(pageLabels(null, 3)).toBeNull();
    expect(pageLabels([" i ", "1", "2"], 3)).toEqual(["i", "1", "2"]);
  });
});

describe("a page range (§10 screen 16)", () => {
  it("is From–To inside the book, at most 10 pages", () => {
    expect(pages(checkRange(plain, "42", "45"))).toEqual(["42:42", "43:43", "44:44", "45:45"]);
    expect(pages(checkRange(plain, " 7 ", "7"))).toEqual(["7:7"]);
    expect(pages(checkRange(plain, "171", "180"))).toHaveLength(10);
  });

  it("says why it can't be imported", () => {
    expect(pages(checkRange(plain, "42", "52"))).toBe("At most 10 pages at a time");
    expect(pages(checkRange(plain, "45", "42"))).toBe("From must not be after To");
    expect(pages(checkRange(plain, "179", "181"))).toBe("The book has 180 pages");
    expect(pages(checkRange(plain, "0", "3"))).toBe("The book has 180 pages");
    expect(pages(checkRange(plain, "4.5", "6"))).toBe("The book has 180 pages");
    expect(pages(checkRange(plain, "", "6"))).toBe("Enter the first and the last page");
    expect(pages(checkRange(plain, "6", " "))).toBe("Enter the first and the last page");
    expect(pages(checkRange({ pageCount: 1, labels: null }, "1", "2"))).toBe("The book has 1 page");
  });

  it("uses the printed numbers when the PDF has labels", () => {
    expect(pages(checkRange(labelled, "42", "45"))).toEqual(["5:42", "6:43", "7:44", "8:45"]);
    expect(pages(checkRange(labelled, "ii", "40"))).toEqual(["2:ii", "3:40"]);
    expect(pages(checkRange(labelled, "I", "ii"))).toEqual(["1:i", "2:ii"]);
    expect(pages(checkRange(labelled, "3", "5"))).toBe("The book has no page 3");
    expect(pages(checkRange(labelled, "45", "42"))).toBe("From must not be after To");
  });

  it("finds a printed number that occurs twice near the pages suggested", () => {
    // A course book and its workbook in one PDF: pages 1–3 and 4–6 are both printed 1–3.
    const twice: BookPages = { pageCount: 6, labels: ["1", "2", "3", "1", "2", "3"] };
    expect(pages(checkRange(twice, "1", "2"))).toEqual(["1:1", "2:2"]);
    expect(pages(checkRange(twice, "1", "2", 4))).toEqual(["4:1", "5:2"]);
    // To is looked for from From onwards.
    expect(pages(checkRange(twice, "3", "1"))).toEqual(["3:3", "4:1"]);
  });
});

describe("the automatic name (§6.8)", () => {
  it("is the pages, or the one page", () => {
    expect(
      autoName([
        { number: 42, label: "42" },
        { number: 45, label: "45" },
      ]),
    ).toBe("Pages 42–45");
    expect(autoName([{ number: 42, label: "42" }])).toBe("Page 42");
    expect(autoName([])).toBe("");
  });
});

describe("the pages suggested (§6.8)", () => {
  it("start at 1–1 for a new book", () => {
    expect(suggestRange(plain, null)).toEqual({ from: 1, to: 1 });
  });

  it("follow the last import, as many pages again", () => {
    expect(suggestRange(plain, { from: 42, to: 45 })).toEqual({ from: 46, to: 49 });
    expect(suggestRange(plain, { from: 10, to: 10 })).toEqual({ from: 11, to: 11 });
  });

  it("are clamped to the book's end", () => {
    expect(suggestRange(plain, { from: 174, to: 177 })).toEqual({ from: 178, to: 180 });
    expect(suggestRange(plain, { from: 177, to: 180 })).toEqual({ from: 180, to: 180 });
    // A remembered range from a longer book of the same name.
    expect(suggestRange({ pageCount: 5, labels: null }, { from: 42, to: 45 })).toEqual({
      from: 5,
      to: 5,
    });
  });

  it("fill the fields with the printed numbers", () => {
    expect(rangeFields(labelled, suggestRange(labelled, { from: 3, to: 4 }))).toEqual({
      from: "42",
      to: "43",
    });
    expect(rangeFields(plain, { from: 46, to: 49 })).toEqual({ from: "46", to: "49" });
  });
});
