# Toast

A short confirmation near the bottom edge (`web/src/lib/toast.tsx`): "Moved to Learned", "Saved", "“der Tisch” deleted", or an error message.

- Inverted colours (`text` ground, `bg` text), 15 px, `radius-sm`, padding 12 16, `shadow`; rises in over 160 ms.
- Above the sticky footer on screens that have one (`--toast-bottom`), otherwise 24 px over the safe area.
- One sentence, past tense for what happened; no actions inside it.
