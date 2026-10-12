import { describe, expect, it } from "vitest";
import { commonsFileUrl } from "../src";

describe("commonsFileUrl (§10 Word detail)", () => {
  it("links the recording's file page on Wikimedia Commons", () => {
    expect(commonsFileUrl("De-Tisch2.ogg")).toBe(
      "https://commons.wikimedia.org/wiki/File:De-Tisch2.ogg",
    );
  });

  it("writes spaces as underscores, like Commons does", () => {
    expect(commonsFileUrl("CPIDL German - Hallo.ogg")).toBe(
      "https://commons.wikimedia.org/wiki/File:CPIDL_German_-_Hallo.ogg",
    );
  });

  it("percent-encodes umlauts and other special characters", () => {
    expect(commonsFileUrl("De-Kühlschrank.ogg")).toBe(
      "https://commons.wikimedia.org/wiki/File:De-K%C3%BChlschrank.ogg",
    );
    expect(commonsFileUrl("LL-Q188 (deu)-Frank C. Müller-AM.wav")).toBe(
      "https://commons.wikimedia.org/wiki/File:LL-Q188_(deu)-Frank_C._M%C3%BCller-AM.wav",
    );
    expect(commonsFileUrl("De-a?b&c.ogg")).toBe(
      "https://commons.wikimedia.org/wiki/File:De-a%3Fb%26c.ogg",
    );
  });
});
