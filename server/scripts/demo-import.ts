// Runs the import flow end to end against a running `pnpm dev`, through the same API client and
// /api proxy the web app uses. Makes one real AI call.
//
//   pnpm --filter server demo:import <photo> --user <email|username> [--save] [--base http://localhost:5173]
//
// Signs in as --user first (the password is asked for, or piped in). Without --save the import is
// left open (Home shows a banner for it). With --save, content words are added (dictionary article
// applied to mismatches) and small words are skipped.
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Candidate, createApiClient, type SaveDecision } from "@language-app/core";
import { askPassword } from "./prompt";
import { shrinkLikeTheBrowser } from "./shrink-photo";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { save: { type: "boolean" }, base: { type: "string" }, user: { type: "string" } },
});
const [photo] = positionals;
const login = values.user;
if (!photo || !login) {
  console.error(
    "Usage: demo:import <photo> --user <email|username> [--save] [--base http://localhost:5173]",
  );
  process.exit(1);
}

const baseUrl = values.base ?? `http://localhost:${process.env.WEB_PORT || 5173}`;
// Node's fetch keeps no cookies: this one sends back the session cookie the sign-in set.
let cookie = "";
const api = createApiClient({
  baseUrl,
  fetch: async (input, init) => {
    const headers = new Headers(init?.headers);
    if (cookie) headers.set("cookie", cookie);
    const res = await fetch(input, { ...init, headers });
    const set = res.headers.getSetCookie().map((c) => c.split(";")[0]);
    if (set.length > 0) cookie = set.join("; ");
    return res;
  },
});
const CONTENT_WORDS = new Set(["noun", "verb", "adjective", "adverb"]);

const password = await askPassword();
const { user } = login.includes("@")
  ? await api.signInEmail({ email: login, password })
  : await api.signInUsername({ username: login, password });
console.log(`Signed in as ${user.displayUsername ?? user.email}`);

const created = await api.createImport({ name: `Demo: ${basename(photo)}` });
console.log(`Import #${created.id} created`);

const jpeg = shrinkLikeTheBrowser(resolve(process.env.INIT_CWD ?? process.cwd(), photo));
const started = performance.now();
const upload = await api.uploadPhoto(
  created.id,
  new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }),
);
console.log(
  `Photo read in ${((performance.now() - started) / 1000).toFixed(1)} s: page ${upload.pageQuality}, ` +
    `${upload.wordsFound} words, ${upload.import.candidates.length} candidates`,
);

const candidates = upload.import.candidates;
const show = (label: string, list: Candidate[], format = (c: Candidate) => c.lemma) =>
  console.log(`\n${label} (${list.length}): ${list.map(format).join(", ") || "-"}`);
const fresh = candidates.filter((c) => c.existing === "none");
show(
  "Already in your words",
  candidates.filter((c) => c.existing === "in_my_words"),
);
show(
  "Dictionary match",
  fresh.filter((c) => c.dictionary.status === "match"),
  (c) => (c.article ? `${c.article} ${c.lemma}` : c.lemma),
);
show(
  "Dictionary mismatch",
  fresh.filter((c) => c.dictionary.status === "mismatch"),
  (c) => `AI: ${c.article ?? "-"} ${c.lemma} · Dictionary: ${c.dictionary.genders?.join("/")}`,
);
show(
  "Not in dictionary",
  fresh.filter((c) => c.dictionary.status === "not_found"),
);

if (values.save) {
  await api.startReview(created.id);
  const decisions: SaveDecision[] = fresh.map((c) => ({
    key: c.key,
    action: CONTENT_WORDS.has(c.pos) ? "add" : "skip",
    ...(c.dictionary.status === "mismatch" && c.dictionary.genders?.[0]
      ? { article: c.dictionary.genders[0] }
      : {}),
  }));
  const saved = await api.saveImport(created.id, decisions);
  console.log(
    `\nSaved: ${saved.added} added, ${saved.skipped} skipped, ${saved.detailsPending} without details yet`,
  );
}

const stats = await api.stats();
console.log(
  `\nHome: learning ${stats.learning} · learned ${stats.learned} · ` +
    `${stats.unfinishedImports.length} unfinished import(s)`,
);
