// Cuts the test sample out of the full kaikki.org download: every entry for a chosen list of
// words, reduced to the fields the mapper reads. Re-run after changing the word list:
//
//   pnpm --filter server exec tsx scripts/make-kaikki-sample.ts ../data/kaikki/kaikki.org-dictionary-German.jsonl
//
// Data: Wiktionary via kaikki.org, CC BY-SA (docs/design.md §7).
import { createReadStream, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const WORDS = new Set([
  // nouns: one gender, two genders, three genders, no plural, plural only, nonstandard plural
  "Tisch",
  "See",
  "Band",
  "Obst",
  "Eltern",
  "Handy",
  "Stock",
  "Kinderärztin",
  "Zeitung",
  // derived words that Wiktionary files under form-of but are words in their own right
  "Partnerin",
  "Lehrer",
  "Freundin",
  "Blümchen",
  // a real form-of entry (plural of Tisch) and a proper name
  "Tische",
  "Berlin",
  // verbs: sein-perfect, haben-perfect, both auxiliaries, irregular, separable
  "gehen",
  "verkaufen",
  "fahren",
  "sein",
  "aufstehen",
  // other parts of speech
  "schnell",
  "ungefähr",
  "möbliert",
  "der",
  "ich",
  "mit",
  "nicht",
  "und",
  "acht",
  "hallo",
  "im",
  // pronunciation: a recording tagged Austria before the untagged one; an IPA tagged Austria
  // before the one tagged Germany
  "Zimmer",
  "November",
]);
const KEEP = ["word", "pos", "lang_code", "forms", "senses", "sounds"] as const;

const source = process.argv[2];
if (!source) {
  console.error("Usage: make-kaikki-sample.ts <kaikki German .jsonl>");
  process.exit(1);
}

const out = fileURLToPath(new URL("../test/fixtures/kaikki-sample.jsonl", import.meta.url));
const lines: string[] = [];
const rl = createInterface({
  input: createReadStream(resolve(process.env.INIT_CWD ?? process.cwd(), source)),
});
for await (const line of rl) {
  const entry = JSON.parse(line);
  if (!WORDS.has(entry.word)) continue;
  const reduced = Object.fromEntries(KEEP.filter((k) => k in entry).map((k) => [k, entry[k]]));
  // Senses: only what the mapper reads.
  reduced.senses = (entry.senses ?? []).map((s: Record<string, unknown>) => ({
    ...(s.tags ? { tags: s.tags } : {}),
    ...(s.glosses ? { glosses: s.glosses } : {}),
    ...(s.form_of ? { form_of: s.form_of } : {}),
  }));
  // Sounds: the IPA transcriptions and the recordings (not rhymes, homophones…), with the fields
  // the mapper reads.
  if (entry.sounds) {
    reduced.sounds = entry.sounds
      .filter((s: Record<string, unknown>) => s.ipa || s.audio)
      .map((s: Record<string, unknown>) =>
        Object.fromEntries(
          ["ipa", "audio", "mp3_url", "tags"].filter((k) => k in s).map((k) => [k, s[k]]),
        ),
      );
  }
  lines.push(JSON.stringify(reduced));
}
writeFileSync(out, `${lines.join("\n")}\n`);
console.log(`Wrote ${lines.length} entries to ${out}`);
