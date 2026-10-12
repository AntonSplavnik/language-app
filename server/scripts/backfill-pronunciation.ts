// Fills the pronunciation (IPA and Wikimedia Commons recording, docs/design.md §6.6) of words saved
// before it existed. Re-import the dictionary first, so its entries have pronunciations. Safe to run
// again: words that already have one are left alone.
//
//   pnpm --filter server backfill:pronunciation
import { count, isNotNull } from "drizzle-orm";
import { loadEnvFile, parseConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { dictionaryEntries } from "../src/db/schema";
import { backfillPronunciation } from "../src/words/pronunciation";

loadEnvFile();
const db = createDb(parseConfig(process.env).DATABASE_URL);
try {
  const [withAudio] = await db
    .select({ n: count() })
    .from(dictionaryEntries)
    .where(isNotNull(dictionaryEntries.audioUrl));
  if (!withAudio?.n) {
    console.error(
      "The dictionary has no recordings: re-import it first (pnpm --filter server import:wiktionary <file>).",
    );
    process.exitCode = 1;
  } else {
    const { checked, updated } = await backfillPronunciation(db);
    console.log(`Updated ${updated} of ${checked} words without a pronunciation.`);
    const none = checked - updated;
    if (none > 0)
      console.log(`${none} ${none === 1 ? "word has" : "words have"} none in the dictionary.`);
  }
} finally {
  await db.$client.end();
}
