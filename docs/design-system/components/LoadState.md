# LoadState

A screen about one thing (a word, an import) until that thing is there: loading, gone, or failed (`LoadState` in `web/src/components/LoadState.tsx`; `WordLoadState` beside it for a word). Word detail and Edit word (through `WordLoadState`), an import's page and Rename import, and the app's start when it can't ask who is signed in.

- **Loading:** "Loading…" in `muted`, no spinner.
- **Gone** (only where the thing can be gone): centred in `muted`, padding 32 8, the reason over a secondary button to its list, 12 apart: "This word is not in your list any more." over **My words**.
- **Failed:** the error box (as on Home's Banner): a row on `danger-soft` in `danger`, `radius` (14), padding 12 14, the message at the left and a small secondary **Try again** at the right, 12 apart; `role="alert"`.
- Consumer provides: `loading` (`loading`, `missing` or `failed` with its message), `missing` (the text, the list's address and the button's label; left out where nothing can be gone) and `onRetry`.
