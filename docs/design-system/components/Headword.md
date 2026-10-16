# Headword

A German word as the card back shows it, with a noun's article in its gender colour (`web/src/components/Headword.tsx`).

- `der` → `der`, `die` → `die`, `das` → `das` as **text colour only**; non-nouns and nouns without an article show the lemma alone.
- Always `lang="de"`, so long compounds hyphenate where they wrap.
- In rows (`headword` style, 18/700) the article is 600 (`--article-weight: 600`); on Word detail it is as heavy as the word.
- Use it everywhere a German headword appears: My words, Review (and its known list), Summary, Edit word's title, the card back, Word detail.
- Consumer provides: the word's `lemma`, `pos` and `article`.
