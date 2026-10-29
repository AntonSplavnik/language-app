# Card

The container for anything read or tapped as a unit (`ui.card`): `surface`, 1 px `border`, `radius-card` (24), no shadow.

- **Hero card** (`radius-hero`, 28, padding 22–24): exactly one per screen: Home's deck, Word detail's word, Summary's results.
- **Content card** (padding 20 px 22 px, gap 10): Example, Note, Progress; fields on Edit word (padding 18).
- **Tile** (min 140 px, padding 18, a 44 px `surface-muted` icon well on top, title + caption at the bottom): Home's My words; New import is the same shape as a 1.5 px dashed `track-strong` outline with no fill.
- **Menu card**: rows that open screens, hairlines between them, no padding of its own (MenuCard).
- **Check list**: the same with rows that toggle a check, under a label (CheckList: Edit word's Themes).
- Labels inside a card are the uppercase `label` style in `muted`.
- Never add a coloured left border, a gradient or a shadow to a card.
