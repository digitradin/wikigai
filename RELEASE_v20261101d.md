# Wikigai — release v20261101d

| | |
|---|---|
| Version | v20261101d |
| Builds on | v20261101c (My favourites) — everything in it is included; earlier notes: `RELEASE_v20261101c.md`, `RELEASE_v20261101b.md`, `RELEASE_v20261101.md`, `RELEASE_v20261031_base.md` |
| Status | Built and tested locally — **not deployed yet** |

## Quick fixes
- **My favourites › My plans:** the button on the right of a saved plan now reads **★ Saved** in yellow (same style as
  saved WikiVids) instead of an empty grey ☆.
- **Confirm pop-up before losing favourites:** removing a plan (My favourites list or step 4 "Remove from favourites"),
  removing a WikiVid (★ Saved on the Videos page or in My favourites) and deleting a saved plan now open a pop-up:
  "Remove from your favourites? … You will lose …" — **Keep it** (default focus) / **Yes, remove**. Esc or a click
  outside = keep.
- **Confirm pop-up before retaking survey stage 1 or 2:** "Retake stage N? Retaking stage N replaces your current answers
  and results for this stage once you finish it. Your matches and plans may change." — **Keep it** / **Yes, retake**.
  Applies to the Retake buttons on the Dashboard, on My path › Passions (step cards) and inside the survey (review screen).
  Stage 3 is unchanged.
- One shared, accessible pop-up (`CPS.confirm` in `app.js`), EN / FR / ES (`confirm.*`).

## Files
`frontend/public/assets/app.js`, `learning.js`, `learning.css`, `survey.js`, `ikigai.js`, `dashboard/index.html`,
`i18n/locales/{en,fr,es}/ui.js`. No backend or database change.

## Tests run
Browser (Chromium, real backend + PGlite): yellow "★ Saved" on a favourite plan; plan unsave → pop-up, Keep / Esc keep it,
Yes removes it; WikiVid unsave → pop-up with the video title, Keep / Yes; Dashboard Retake stage 1 → pop-up, Keep stays,
Yes opens the survey; survey review "Retake" → pop-up, Keep stays; no JS errors. `tools/i18n/check.js`: 0 errors.

## Rollback
Deploy `v20261101c`.
