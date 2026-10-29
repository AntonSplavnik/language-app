# Test fixtures

- `ai/*.json`: raw Claude responses recorded with `pnpm --filter server ai:try … --save <name>` (see `docs/design.md` §13).
- `dictionary-themes-sample.tsv`: a themes file in the format of `server/data/dictionary-themes.tsv` (`docs/design.md` §7, Themes) for 13 words of the kaikki sample, written by hand, with an unknown key and a third theme to be dropped as it loads.
- `kaikki-sample.jsonl`: a few dozen entries from the kaikki.org German dictionary, reduced to the fields the mapper reads (`server/scripts/make-kaikki-sample.ts`). Data from [Wiktionary](https://en.wiktionary.org/) via [kaikki.org](https://kaikki.org/), licensed [CC BY-SA](https://creativecommons.org/licenses/by-sa/4.0/).
