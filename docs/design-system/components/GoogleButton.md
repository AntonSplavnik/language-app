# GoogleButton

Signing in with Google (`GoogleButton` in `web/src/components/GoogleButton.tsx`): **Continue with Google** on Sign in and Create account, **Sign in with Google** in Account's delete confirmation for an account whose sign-in is a day old. Shown only where Google can work (the server has the Google pair, and the page is on https or `localhost`), never on the iPhone over the LAN.

- **Google's button, not ours:** Google's branding rules allow its standard-colour "G" only on Google's light, dark or neutral button, so this is the one control in Google's own colours: `google-fill`, a 1 px `google-stroke` outline and `google-text` (light: white, `#747775`, `#1F1F1F`; dark: `#131314`, `#8E918F`, `#E3E3E3`), following the system's light or dark setting. The tokens are for this button only.
- **Shape:** `ui.button` + `ui.block`: full width, 48 px, radius 12 (Google's 40 px web button scaled by 1.2); padding 0 14 px, 12 px between the G and the label, centred.
- **The mark:** Google's "G" as Google publishes it for sign-in buttons, inline SVG (`viewBox="0 0 48 48"`, four paths in `#EA4335`, `#4285F4`, `#FBBC05`, `#34A853`), 24 px (20 px on Google's 40 px), `aria-hidden`. Never recoloured, resized against the button, used alone, or put in `icons.tsx` (it is a logo, not a stroke icon).
- **Label:** one of Google's own, "Continue with Google" or "Sign in with Google", 17 px / 600 in DM Sans (Google's buttons use Google Sans; the app fetches no font from another site). Sentence case as Google writes it.
- **States:** pressed darkens the fill toward `google-text` (88%); focus is the 2 px `accent-ink` ring, 2 px out; disabled and busy (asking the server for Google's address) fade to 0.45 like every non-primary button. A busy button keeps its G and label, as Google's rules want them, so there is no spinner or "-ing" label.
- **Placement:** under the form card and its error, above Sign in's quiet **Create an account ›**; inside ConfirmDelete under its message. It never takes the footer, which keeps the screen's own lime action.
- Consumer provides: `label`, `onClick` (ask for Google's address, then open it), `busy`, `disabled` (the screen is busy otherwise).
