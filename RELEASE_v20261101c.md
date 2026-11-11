# Wikigai — release v20261101c

| | |
|---|---|
| Version | v20261101c |
| Builds on | v20261101b (Plans beta, frozen paid exports) — everything in it is included; earlier notes: `RELEASE_v20261101b.md`, `RELEASE_v20261101.md`, `RELEASE_v20261031_base.md` |
| Status | Built and tested locally — **not deployed yet** |

## Changes
### Step 4 — save the plan
- New bar under the plan: "Like this plan? Save it…" **⭐ Save to My favourites**. Once saved: "★ Saved in My favourites ·
  Open My favourites → · Remove from favourites".
- A new plan is **not** in the saved list until the user taps Save (before, every plan was listed automatically).
  Plans created before this version stay saved (migration `012_plan_favorites.sql`, column `saved`, default TRUE for old rows).
- API: `POST /api/plans/:id/save { saved: true|false }`; `GET /api/plans` lists saved plans only. Stat event `plan_save`.

### New menu section "My favourites" (`/favorites`)
Sidebar group ⭐ **My favourites** (between My learning and My profile) with:
- **My plans** — badge **Premium** · saved plans (profession, length, skills, date); click opens the plan at step 4
  (`/learning/plans?open=<id>`); ☆ removes it from favourites.
- **My WikiVids** — saved videos with thumbnails; play inside Wikigai, unsave, YouTube link.
- **My courses** — "coming soon".
- On the overview page also **More coming**: schools, tools, jobs & internships ("coming soon").
- Tabs All / My plans / My WikiVids / My courses; members-only like the other pages (visitors → sign-in).
- "Premium" is a label only for now — saving plans stays free; HTML / print stay frozen (🔒 1 €) as in v20261101b.
- EN / FR / ES texts (`side.favorites…`, `fav.*`, `plan.saveFav…`).

## Files
`frontend/public/assets/learning.js`, `learning.css`, `site.js`, `wk.css`, `i18n/locales/{en,fr,es}/ui.js`,
`backend/src/routes/plans.js`, `backend/src/index.js` (`/favorites` routes), `backend/src/lib/pageGuard.js`,
`backend/src/analytics/collect.js`, `stats.js`, `tools/dashboard/stats-i18n.json` (+ rebuilt stats page),
`deploy/migrations/012_plan_favorites.sql`, `backend/scripts/plans_smoke.mjs`.

## Tests run
- Plans API (`plans_smoke.mjs`, real backend + PGlite + AI stand-in): **39/39** — new plan not saved until Save, save/unsave,
  list = saved only, ownership. Backend smoke OK. `/favorites/plans` without session → sign-in.
- Browser (Chromium): sidebar shows My favourites (My plans · Premium, My WikiVids, My courses · Soon); step 4 Save → saved bar;
  favourites page lists the plan + the saved video thumbnail; plan opens at stage 4 from favourites; unsave empties My plans;
  video plays in the modal; ES phone 375 px "Mis favoritos", no horizontal scroll. `tools/i18n/check.js`: 0 errors.

## Rollback
Deploy `v20261101b`. The new `saved` column is ignored by older versions (they list every plan again).
