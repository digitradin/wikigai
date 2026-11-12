# Wikigai — release v20261112d

| | |
|---|---|
| Version | v20261112d |
| Builds on | v20261112c (LIVE on preprod) — everything in it is unchanged; its notes are in `RELEASE_v20261112c.md` |
| Status | Built and tested locally (Postgres 16 + Chromium). **Not deployed.** Visual proposal for review: `docs/schools-preview/index.html` |
| Theme | **Schools directory: two versions.** Public `/schools` (traffic) with blurred insights + full **My learning › Schools** (members) |
| Data | **DEMO dataset**: 192 programmes, 24 *fictional* "Demo" institutions, 6 markets (ES, FR, UK, IE, US, MX), illustrative figures. Labelled "DEMO" everywhere; public page is **noindex** and out of the sitemap until real data is in (`SCHOOLS_INDEX=true`) |
| Strategy | `Business_Model/Schools_Listings/` (strategy, markets, schema, scoring). Next steps: `NEXT_STEPS_SCHOOLS.md` |

## 1. Public directory: `/schools`, `/fr/schools`, `/es/schools`
- Server-rendered like the other public pages (title, description, canonical, hreflang, Open Graph per language; `/schools.html` → 301).
- **Empty search field** (no preselected area or profession). It searches careers, fields, schools and cities in the visitor's language
  (e.g. "diseñador" finds UX/product design: local career names are matched to Wikigai careers).
- Interactive filters: **country** (6, with counts) and **level**; **More filters** is folded: public/private, teaching language, study mode, tuition band.
  Members-only filters (max cost, min ROI, min employment, admission chance, scholarships) and sorts (best ROI, salary, match) show a **🔒**.
- **Every insight is blurred** (match, ROI score, salary, employment, admission chance, cost/year, fees, scholarships, payback) with a
  "Sign up free / Sign in" lock. **Gating is server-side**: `/api/schools` never sends those numbers without a session. The blurred values are
  placeholders, so nothing can be "un-blurred" in the browser.
- Any 🔒, locked sort or ☆ Save opens a short **sign-up prompt** (sign-up, or sign-in with `?next=/learning/schools`).
- Signed-in visitors are sent to the full version (`/learning/schools`).
- Shareable links keep the search (`/schools?q=nursing&country=IE,UK`).

## 2. My learning › Schools: `/learning/schools` (members, full version)
- **Defaults from My path:** the **1st area** and the **1st profession** are selected; the other areas and professions are shown **unselected**;
  extra ones are **folded** under "+ N more" (desktop: 3 areas / 6 professions visible; phone: 2 / 3). "More filters" is folded too.
- Filter logic: chosen professions → programmes leading to them; a chosen area *without* a chosen profession adds all its programmes.
- Full cards: **Match %** (+ "Leads to your ✓ UX Designer"), ROI score, salary yr 1, employment, admission chance (Likely / Possible / Ambitious),
  cost per year; **Details**: home and international fees, living costs, salary after 5 years, payback, acceptance rate, scholarships,
  international students, data-confidence grade (A–D).
- Insights bar for the current results (median cost, median salary, employment, best ROI, with scholarships).
- **★ My shortlist**, saved to the account (`favorite_schools`), included in *Download my data*, deleted with the account, merged with TikTok accounts.
- Left menu: Schools badge **"New"** (was "Soon"); My learning overview card; Favourites › More links to the shortlist.

## 3. Under the hood
| Area | Change |
|---|---|
| API | `backend/src/routes/schools.js`: `GET /api/schools` (search, filters, facets, sort, paging; visitors get a reduced record, members the full one + match), `GET/POST /api/schools/saved`, `POST /api/schools/saved/remove` |
| Data | `backend/src/data/schools-demo.json`, built by `tools/schools/build-demo.js` (deterministic). `SCHOOLS_DATA=/path.json` swaps in another file with the same shape |
| DB | `deploy/migrations/017_schools.sql`: `favorite_schools` (user_id, program_id) — idempotent, runs at start |
| SEO | `seo/index.js`: `/schools` page (EN/FR/ES); `indexable()` switch → noindex + no sitemap entry until `SCHOOLS_INDEX=true` |
| Privacy | `lib/accountData.js`: shortlist in export, delete and account merge |
| Analytics | events `schools_search`, `schools_unlock_click`, `schools_save`, `schools_details` (cookieless, as before) |
| Front end | `schools.html`, `assets/schools.js` (one module, `public` / `member` modes), `assets/schools.css`; `learning.js/html/css`, `site.js`, `wk.css` |
| Text | 151 `sch.*` keys + `side.new` + `learn.schoolsCardLead` in EN/FR/ES (`tools/i18n/add-schools-texts.py`); `tools/i18n/check.js`: 0 errors |

## Settings (server `.env.production`, optional)
| Variable | Default | Meaning |
|---|---|---|
| `SCHOOLS_INDEX` | *(off)* | `true` = `/schools` becomes indexable and enters the sitemap. **Keep off while on demo data.** |
| `SCHOOLS_DATA` | demo file | Path to another dataset JSON (same shape) |

## Tests run (local, real Postgres 16 + Chromium)
- `backend/scripts/schools_smoke.mjs`: **44/44**. Covers: no insight field reaches visitors; locked filters and sorts are ignored for visitors;
  text, localized-career, country, level, control and band filters; pages in 3 languages; noindex; sitemap exclusion; `/learning/schools` needs a session;
  member defaults → 6 UX programmes; match and why; widening by area; minRoi; admission filter; save, double save, bad id, list, export, remove.
- `backend/scripts/smoke.mjs` (existing regression): **23/23**.
- `tools/i18n/check.js`: 0 errors, 0 warnings.
- `tools/seo/audit.js`: no new issues except the intended demo noindex/sitemap exclusion. With `SCHOOLS_INDEX=true` the 3 pages pass every check
  except "canonical = this page", which fails for every page when tested on localhost.
- Browser (Playwright, desktop 1280/1440 + iPhone 13, EN/FR/ES): no page errors, no horizontal scroll; screenshots in `docs/schools-preview/`.

## Local test
Double-click **Test Wikigai Locally.command** → http://localhost:8080/schools (public) · sign up → finish the test → **My learning › Schools**.

## Deploy (CTO), when approved
1. Local → preprod → prod (as always). Migration 017 runs automatically. Leave `SCHOOLS_INDEX` unset.
2. Smoke on preprod: `BASE_URL=https://wikigai.digitradin.cloud node backend/scripts/schools_smoke.mjs` (needs `EXPOSE_PINS=true` for the member half; otherwise run the public half only).
3. `/schools` isn't linked from the landing page yet (deliberate: review first). Link it when approved (see NEXT_STEPS_SCHOOLS.md §2).

Rollback: `v20261112c`. The `favorite_schools` table is harmless to older versions.
