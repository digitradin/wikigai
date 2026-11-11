# Wikigai — release v20261101b

| | |
|---|---|
| Version | v20261101b |
| Builds on | v20261101 (Plans in 4 stages) — everything in it is included; its notes: `RELEASE_v20261101.md` (and `RELEASE_v20261031_base.md`) |
| Status | Built and tested locally — **not deployed yet** |

## Changes
- **Plans is tagged BETA:** "Beta" badge next to the page title, sidebar badge "AI · Beta" (EN / FR / ES: Beta / Bêta / Beta).
  The Plans flow itself is unchanged (4 stages from v20261101).
- **Save as HTML and Print / save as PDF are frozen** as upcoming paid extras: both buttons show 🔒 + price "1 €",
  greyed and dashed; clicking shows "Saving as HTML and printing / PDF will be paid extras (1 €) — coming soon.
  Your plan stays saved in your account." No file is downloaded and nothing is printed.
- New stats event `plan_export_locked` (clicks on the frozen buttons = demand signal for the paid extra), on the owner stats page.
- Switch back / change price: `frontend/public/assets/learning.js` → `EXPORT_LOCKED = false` / `EXPORT_PRICE = '1 €'`.

## Files
`frontend/public/assets/learning.js`, `learning.css`, `site.js`, `i18n/locales/{en,fr,es}/ui.js` (plan.beta, plan.paidSoon),
`backend/src/analytics/collect.js`, `stats.js`, `tools/dashboard/stats-i18n.json` (+ rebuilt `deploy/dashboard/wikigai-stats.html`).

## Tests run
Browser (real backend + PGlite + AI stand-in): EN desktop and FR phone 375 px — Beta tag on title and sidebar, plan created,
both buttons locked with price, click shows the message, 0 downloads, no print, no horizontal scroll, no JS errors.
`tools/i18n/check.js`: 0 errors. Local launcher folder checked complete (database engine files present).

## Rollback
Deploy `v20261101` (exports on) or `v20261031`.
