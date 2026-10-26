import { describe, expect, it } from "vitest";
import {
  AI_NOT_INCLUDED,
  addWordsBack,
  aiFeaturesText,
  newImportHint,
  newImportPath,
  showsAddDetails,
  withoutAiRedirect,
} from "../src/auth/aiFeatures";
import { detailsReady, moreWords } from "../src/imports/done";
import { isRetryable } from "../src/imports/photoErrors";
import { saveLabel, savingLabel } from "../src/state/reviewDecisions";

// The screens for an account without AI (docs/design.md §10): no photo or PDF import, no Ask AI,
// no Add details. The web app knows `aiEnabled` from GET /api/auth/get-session.

describe("New import without AI", () => {
  it("goes straight to Add words", () => {
    expect(newImportPath(true)).toBe("/imports/new");
    expect(newImportPath(false)).toBe("/words/new");
  });

  it("the photo and PDF screens send an account without AI to Add words", () => {
    expect(withoutAiRedirect(false, "/imports/new")).toBe("/words/new");
    expect(withoutAiRedirect(false, "/imports/new/pdf")).toBe("/words/new");
    // An import that exists stays reachable: it may be one to finish reviewing.
    expect(withoutAiRedirect(false, "/imports/12")).toBeNull();
    expect(withoutAiRedirect(false, "/words/new")).toBeNull();
    expect(withoutAiRedirect(true, "/imports/new")).toBeNull();
    expect(withoutAiRedirect(true, "/imports/new/pdf")).toBeNull();
  });

  it("Add words says why, and goes back Home rather than to New import", () => {
    expect(AI_NOT_INCLUDED).toBe(
      "Importing photos and PDF pages uses AI, which isn't included in your account.",
    );
    expect(addWordsBack(true)).toBe("/imports/new");
    expect(addWordsBack(false)).toBe("/");
  });

  it("Home's hint for an empty list speaks of typing, not photographing", () => {
    expect(newImportHint(true)).toBe(
      "Photograph the pages you studied to collect their new words.",
    );
    expect(newImportHint(false)).toBe("Type the words you studied to start your list.");
  });
});

describe("saving without AI", () => {
  it("says Saving…, not Adding details…: no details are added", () => {
    expect(savingLabel(true)).toBe("Adding details…");
    expect(savingLabel(false)).toBe("Saving…");
    expect(saveLabel({ adds: 8, fresh: 9, saving: true, aiEnabled: false })).toBe("Saving…");
    expect(saveLabel({ adds: 8, fresh: 9, saving: true })).toBe("Adding details…");
  });
});

describe("Add details without AI", () => {
  it("Home and Done show it only with AI and words waiting", () => {
    expect(showsAddDetails(true, 3)).toBe(true);
    expect(showsAddDetails(true, 0)).toBe(false);
    expect(showsAddDetails(false, 3)).toBe(false);
  });
});

describe("Done without AI", () => {
  const saved = { added: 4, skipped: 0, detailsPending: 0 };

  it("doesn't claim example sentences it never asked for", () => {
    expect(detailsReady(saved, true)).toBe(true);
    expect(detailsReady(saved, false)).toBe(false);
    expect(detailsReady({ ...saved, detailsPending: 2 }, true)).toBe(false);
    expect(detailsReady({ ...saved, added: 0 }, true)).toBe(false);
    expect(detailsReady(null, true)).toBe(false);
  });

  it("offers to type more words whatever the import was", () => {
    for (const source of ["photos", "pdf", "typed"] as const) {
      expect(moreWords(source, false)).toEqual({
        to: "/words/new?mode=list",
        label: "Type more words",
      });
    }
    expect(moreWords("photos", true)).toEqual({ to: "/imports/new", label: "Import more pages" });
  });
});

describe("Account's AI features card (§10 screen 19)", () => {
  it("has two states", () => {
    expect(aiFeaturesText(true)).toBe("Included: photo and PDF import, Ask AI, example sentences");
    expect(aiFeaturesText(false)).toBe("Not included in your account");
  });
});

describe("a photo that failed (§12 Import)", () => {
  it("offers Retry when AI is unavailable, busy, or the answer was unusable", () => {
    for (const code of ["ai_unavailable", "ai_busy", "ai_invalid_output", "network", "internal"]) {
      expect(isRetryable(code), code).toBe(true);
    }
  });

  it("not when another photo is needed, or retrying can't help", () => {
    for (const code of [
      "page_too_long",
      "ai_refused",
      "invalid_image",
      "file_too_large",
      "daily_limit",
      "ai_not_enabled",
      "import_closed",
    ]) {
      expect(isRetryable(code), code).toBe(false);
    }
  });
});
