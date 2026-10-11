// Shows what the dictionary check sees for a word.
//
//   pnpm --filter server dict:lookup <lemma> <pos> [article]
//   pnpm --filter server dict:lookup See noun die
import { Article, Pos } from "@language-app/core";
import { loadEnvFile, parseConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { checkWord } from "../src/dictionary/check";
import { lookupWord } from "../src/dictionary/lookup";

const [lemma, posArg, articleArg] = process.argv.slice(2);
const pos = Pos.safeParse(posArg);
const article = articleArg === undefined ? null : Article.safeParse(articleArg);
if (!lemma || !pos.success || (article && !article.success)) {
  console.error(`Usage: dict:lookup <lemma> <${Pos.options.join("|")}> [der|die|das]`);
  process.exit(1);
}

loadEnvFile();
const db = createDb(parseConfig(process.env).DATABASE_URL);
try {
  const entries = await lookupWord(db, { lemma, pos: pos.data });
  for (const e of entries) {
    console.log(`${e.lemma} (${e.pos})`, {
      genders: e.genders,
      plurals: e.plurals,
      forms: e.forms,
      glosses: e.glossesEn,
    });
  }
  if (entries.length === 0) console.log("Not in the dictionary.");
  console.log(
    "Check:",
    checkWord({ pos: pos.data, article: article?.success ? article.data : null }, entries),
  );
} finally {
  await db.$client.end();
}
