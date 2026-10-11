# Test fixtures

- `ai/*.json`: raw Claude responses recorded with `pnpm --filter server ai:try … --save <name>` (see `docs/design.md` §13).
- `kaikki-sample.jsonl`: a few dozen entries from the kaikki.org German dictionary, reduced to the fields the mapper reads (`server/scripts/make-kaikki-sample.ts`). Data from [Wiktionary](https://en.wiktionary.org/) via [kaikki.org](https://kaikki.org/), licensed [CC BY-SA](https://creativecommons.org/licenses/by-sa/4.0/).
