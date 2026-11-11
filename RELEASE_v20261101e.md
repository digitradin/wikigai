# Wikigai — release v20261101e

| | |
|---|---|
| Version | v20261101e |
| Builds on | v20261101d — everything in it is included; earlier notes: `RELEASE_v20261101d.md` … `RELEASE_v20261031_base.md` |
| Status | **Deployed to production 2026-11-02** (preprod 12:04 CET, prod 12:41 CET) |

## Database structure for Plans, My favourites and WikiVids
Full description: `deploy/DATA_MODEL_LEARNING.md`.
- **Migration `013_favorites_structure.sql`** (idempotent, safe on existing data):
  - `learning_plans.saved_at` (when a plan was added to My favourites; old saved plans get their creation date) — My plans now sorted by it.
  - Integrity rules: language en/fr/es, 1–10 skills as a JSON array, overview/plan are JSON objects, saved ⇔ saved_at,
    profession length, valid YouTube video ids, non-negative numbers, AI log kinds. Added `NOT VALID` → new/changed rows are
    checked, old rows never block start-up.
  - Indexes matched to the real queries (partial index for saved plans; created_at indexes for clean-up); the old
    `idx_learning_plans_saved` is replaced.
  - View **`user_favorites`**: every favourite (plans + WikiVids) in one list (kind, ref, title, saved_at) — ready for courses,
    schools, tools, jobs as their own tables.
  - Table comments describing purpose and retention.
- **Daily clean-up** (`backend/src/lib/retention.js`): unsaved plans after 30 days, shared overview cache after 30 days,
  video search cache after 24 h, daily-limit logs after 7 days. Saved plans and saved WikiVids are never touched.
- **Cap:** max 100 saved plans per user (`PLAN_SAVED_MAX`, error `PLANS_FULL`, EN/FR/ES), like the 200 WikiVids cap.
- Settings (optional): `PLAN_UNSAVED_DAYS=30`, `PLAN_SAVED_MAX=100`, `PLAN_OUTLOOK_CACHE_DAYS=30`, `VIDEO_CACHE_HOURS=24`.

## Tests run (real backend + PGlite)
- **Upgrade:** database created and filled by v20261101d, then started with v20261101e → 013 applied, no errors;
  restarted again → idempotent. Every saved plan got `saved_at`, 0 inconsistent rows.
- **Rules:** inserts with language "de", 11 skills, saved without saved_at, and a bad video id were all refused by the database.
- **Clean-up:** back-dated unsaved plans / caches / logs were purged; all saved plans kept.
- `plans_smoke.mjs` 39/39 on a fresh database · `smoke.mjs` 23/23 · `tools/i18n/check.js` 0 errors.

## Rollback
Deploy `v20261101d`. The added column, rules, indexes and view are harmless to older versions.

## Deployment — preprod, 2026-11-02 12:04 CET
- Deployed this folder with `bash deploy/deploy.sh` as `deploy@76.13.248.104`; server settings left untouched (no local secrets file sync).
- One-off encrypted DB snapshots (no cron, no off-site push): **N-1 = pre-deploy** (`/var/backups/wikigai-preprod/wikigai-preprod_N-1.dump.age`, 73,244 B, sha256 `0887eeb1…`) and **N = post-deploy** (`…_N.dump.age`, 81,890 B, sha256 `9565eafc…`). Both pulled to `SupportFunctions/CTO/backups/wikigai-preprod/` and decrypt to a valid `PGDMP`.
- Migrations `012_plan_favorites.sql` and `013_favorites_structure.sql` applied on start-up; `saved`, `saved_at`, the rules and `user_favorites` verified live. A saved plan appears once in the view; invalid `lang='de'` and `saved=true` without `saved_at` are refused; all test rows rolled back.
- Users unchanged **36**; `/health` → `database: connected`; `wikigai.digitradin.cloud` and `survey.digitradin.cloud` **200**; debug captcha **404**; served `app.js` / `learning.js` / `learning.css` / `site.js` match this folder byte-for-byte. Prod untouched (`wikigai.com` 200, 7 users).
- Preprod DB stays on `wikigai-preprod-db-net`; prod/preprod DB hostnames remain unresolvable from the other environment.

## Deployment — production, 2026-11-02 12:41 CET
- **Pre-deploy prod backup first:** ran `/opt/startups/wikigai/prod/backup/pg-backup.sh` (prod cron script, unchanged). New **N = pre-deploy state** (`wikigai-prod_N.dump.age`, 46,983 B, 7 users, 12 tables, sha256 `5a2edb63…`); **N-1** is the 03:17 run (46,540 B). Both pulled to `SupportFunctions/CTO/backups/wikigai-prod/` with `tools/wikigai/backup-pull.sh`, sha-verified against the server MANIFEST.
- **Prod was on v20261031** before this deploy (`backend/src/index.js` = `b4cc0431…`, migrations up to `011`), i.e. the version that had already passed on preprod.
- Synced `backend/`, `frontend/`, `deploy/migrations/`, `deploy/dashboard/`, `deploy/preview/` (rsync `--delete`, no local secrets file) from this folder to `/opt/startups/wikigai/prod` as root over the `deploy` user. `deploy/Dockerfile.backend`, `init-db.sql`, `smoke.sh`, docs and `.env.production.example` also match this folder now; `deploy/prod/` got the versioned compose + backup-script copies.
- **`.env.production` not touched** (sha256 `a62b7d64…`, 961 B, `root:root 600`); the live `backup/pg-backup.sh` not touched; `deploy/docker-compose.prod.yml` already byte-identical to `deploy/prod/docker-compose.prod.yml` (`4d91650c…`).
- Rebuilt with `docker compose -f docker-compose.prod.yml up -d --build`; image `sha256:954e52b7…`. Compose recreated both services; data volume `deploy_wikigai-prod-db-data` reused.
- Migrations `012_plan_favorites.sql` and `013_favorites_structure.sql` applied (log shows all 13). `saved`/`saved_at`, `learning_plans_saved_at_chk`, `idx_learning_plans_unsaved` and the `user_favorites` view live; a saved plan appears once in the view and `saved=true` without `saved_at` is refused — all test rows rolled back.
- **Data unchanged: 7 users, 0 plans** (as before the deploy). `/health` → `database: connected`; `wikigai.com` and `www.wikigai.com` **200**; `/learning` and `/favorites` **302** to login; debug captcha **404**; served `app.js` / `learning.js` / `learning.css` match this folder byte-for-byte.
- **Stats API:** with the real `STATS_API_TOKEN` → **200** (`ok`, kpis/accounts payload); without/with a wrong token → **401**; `digitradin-dashboard` read the endpoint from inside the network → **200**, `accounts.total=7`.
- **Isolation intact:** `cps-db` unresolved from prod backend, `wikigai-prod-db` unresolved from preprod backend. Preprod stayed on this version (36 users, `/health` ok).
- **App rollback:** sync `v20261031` `backend/` + `frontend/` back and rebuild, or restore `wikigai-prod_N.dump.age`. The DB additions are backward-compatible, so no DB restore is needed for an app rollback.

