# Wikigai — release v20261111b

| | |
|---|---|
| Version | v20261111b |
| Builds on | v20261111 (live on preprod + prod) — everything in it is included; its notes are in `RELEASE_v20261111.md` |
| Status | **LIVE on production wikigai.com** (2026-11-12 01:08 CET) and preprod — deployed & verified (local ✅ → preprod ✅ → prod ✅) |
| Why | Phase 7 of the CMO Social Engine: TikTok and Meta developer apps require live **Privacy Policy**, **Terms** and **user data deletion** URLs on the brand domain |
| Production site | **https://wikigai.com** |

## Changes

### 1. New public pages (EN / FR / ES, indexable, in the sitemap)
| URL | What |
|---|---|
| `/privacy` (`/fr/privacy`, `/es/privacy`) | Full GDPR privacy policy written from what the code actually does: data table (what · why · legal basis · retention), cookies (one strictly-necessary cookie), AI (only profession/skills/age band/country/language are sent — never name, email, birthday), WikiVids/YouTube, providers, transfers, **social media + Postiz section for Meta/TikTok reviewers**, rights, deletion, minors, security |
| `/terms` (+ fr, es) | Terms of use: guidance not advice, AI content, fair use, IP, donations, beta features, liability (consumer-safe), Spanish law |
| `/delete-my-data` (+ fr, es) | **Public data deletion** — works signed out and without a password: email → 6-digit code → tick "I understand" → everything deleted → receipt email. This is the "User data deletion" URL for Meta and TikTok |

Aliases (301, same language): `/privacy-policy`, `/terms-of-service`, `/terms-of-use`, `/tos`, `/data-deletion`, `/delete-data`,
`/delete-account`, `/user-data-deletion`, `/privacidad`, `/condiciones`, `/borrar-mis-datos`, `/confidentialite`, `/cgu`,
`/supprimer-mes-donnees`… (`/fr/data-deletion` → `/fr/delete-my-data`).

Legal texts live in `backend/src/seo/legal/<lang>/{privacy,terms}.html` (server-rendered into the page in the visitor's language).
Page chrome, form texts and footer are in the `legal` block of `locales/<lang>/ui.js` (added by `tools/i18n/add-legal-texts.py`).

### 2. Every user can delete — and download — their data
- **New API** `POST /api/privacy/delete/start {email}` → always `{ok:true}` (no account enumeration), max one code per address per minute;
  `POST /api/privacy/delete/confirm {email, pin}` → deletes the account and everything linked, emails a receipt, clears the session cookie.
  Rate-limited like sign-in. Migration `014_privacy_delete.sql` adds the `delete` PIN purpose.
- **One deletion routine** `backend/src/lib/accountData.js › deleteAccount()` used by both the Account page (password) and the public page
  (email code). It now explicitly deletes `user_results` (by id **and** legacy email hash), `learning_plans`, `learning_research`,
  `favorite_videos`, `plan_ai_log`, `video_search_log`, `auth_pins`, `users` in one transaction and logs row counts only (no id, no email).
- **Download my data** (GDPR access/portability): Account › "Download my data" → `GET /api/user/export` → `wikigai-my-data-YYYY-MM-DD.json`
  (profile with decrypted email/phone, survey results, plans, research, saved videos; never the password hash).
- Account page: "Forgot your password? Delete with an email code instead" link + Privacy/Terms links.
- Emails (EN/FR/ES): "Your Wikigai data deletion code" and "Your Wikigai account and data were deleted".

### 3. Site-wide legal footer + consent line
- Footer on **every** page (Privacy · Terms · Delete my data · Support · © Wikigai by Digitradin), language-aware links,
  injected by `assets/app.js` (self-contained CSS; opt out with `<body data-no-footer>`).
- Sign-up: "By creating an account you accept the Terms of Use and the Privacy Policy" (linked) under the button.

### 4. Phone layout fixes found during review (matter for social traffic, which is ~all mobile)
- **Home page** was 541 px wide on a 390 px phone (inline style kept the 4 pillars in 4 columns) → now 1 column on phones,
  2 on tablets; nav buttons no longer overflow by 2 px in French.
- **Account page** was 489 px wide on phones (long country names in the selects) → fits 390 px.

### 5. Estonian company + leaner privacy policy (added 2026-11-12, on Tomas's request)
- **Controller and service provider = Digitradin OÜ (Estonia)**, shown as "being registered in Estonia" until the registry code and
  address exist. Set on the server (no code change; pages update on restart), see `deploy/.env.production.example`:
  `LEGAL_ENTITY_NAME` (default `Digitradin OÜ`), `LEGAL_REG_CODE`, `LEGAL_ADDRESS`, `LEGAL_EMAIL` (default `admin@digitradin.cloud`).
  When code + address are set, the wording switches automatically to "registered in the Estonian Business Register under registry code …".
- Estonian best practice applied (EN/FR/ES): GDPR + Estonian Personal Data Protection Act; lead authority **Andmekaitse Inspektsioon**
  (Tatari 39, 10134 Tallinn, aki.ee) plus the user's local authority; breach notice to AKI within 72 h; Estonian digital-consent age
  **13** added to the age list; Terms under **Estonian law**, **Harju County Court**, consumers keep their home-country rights,
  **Consumer Disputes Committee (TTJA)** for consumers in Estonia, ECC-Net for other EU consumers; liability wording per Law of
  Obligations Act § 106; **service-provider block** (name, registry code, address, email) required by the Information Society Services Act.
- **Leaner privacy policy (harder to copy):** chapter 2 now lists data *categories*, purposes, legal bases and retention only (what
  GDPR Art. 13 requires) — no analytics method, no exact AI inputs, no model/provider names, no internal tool names (Postiz),
  no security stack. Providers are listed by category ("current list on request"). Chapter 2 went from ~400 to ~200 words.
- Scripts kept for traceability: `tools/i18n/legal-estonia.py`, `tools/i18n/legal-privacy-lean.py` (both idempotent).
- Re-tested: i18n check 0 errors, smoke 23/23, all 9 legal URLs 200, no `{{placeholder}}` left in any language, both identity modes
  (being registered / registered) render correctly, phone width 390 px.

## Files
New: `backend/src/lib/accountData.js`, `backend/src/routes/privacy.js`, `backend/src/seo/legal/{en,fr,es}/{privacy,terms}.html`,
`deploy/migrations/014_privacy_delete.sql`, `frontend/public/{privacy,terms,delete-my-data}.html`, `frontend/public/assets/legal.css`,
`tools/i18n/add-legal-texts.py`.
Changed: `backend/src/index.js` (route + rate limit), `backend/src/seo/index.js` (3 pages, aliases, legal fragments, dictionary merge),
`backend/src/routes/user.js` (shared deletion + export), `backend/src/routes/auth.js` (exports PIN helpers, `delete` email kind),
`backend/src/i18n/locales/{en,fr,es}.json` (4 email texts), `frontend/public/assets/i18n/locales/{en,fr,es}/ui.js` (`legal` block, 61 keys),
`frontend/public/assets/app.js` (footer), `frontend/public/account.html`, `frontend/public/signup.html`, `frontend/public/index.html`,
`frontend/public/assets/learning.css`.

## Tests run (local, real Postgres + Chromium)
- `node tools/i18n/check.js` → 0 errors, 0 warnings (61 new keys × 3 languages, 4 new email keys).
- `backend/scripts/smoke.mjs` → **23/23 pass** (sign-up, verify, login, results, forgot/reset unchanged).
- Routes: `/privacy`, `/terms`, `/delete-my-data` × EN/FR/ES = 200; aliases 301 to the right language; `/privacy.html` → `/privacy`;
  sitemap 21 URLs (9 new) with hreflang; `<html lang>`, title, canonical and hreflang per language.
- Public deletion API: bad email → 400; unknown email → ok (no enumeration); real email → code (in the requested language);
  second request within 60 s → no new code; wrong code → `PIN_MISMATCH`; right code → 200, session cookie cleared, **all rows gone**
  (users, results incl. a legacy email-hash row, plans, saved videos, pins), receipt email in the account language; reused code → `PIN_NO_PIN`.
- Account page: wrong password → `DELETE_BAD_PASSWORD`; correct → all rows gone. Export: JSON with account + 1 result + 1 plan + 1 video,
  `Content-Disposition: attachment`, `Cache-Control: private, no-store`; without a session → 401.
- Browser (Chromium): privacy desktop EN, privacy phone FR (data table turns into cards), terms phone ES, delete page full flow in FR
  (button stays disabled until 6 digits + checkbox), Account page download (file `wikigai-my-data-….json` received), sign-up consent line,
  footer on home/login/sign-up/survey/account. No page errors, no horizontal scroll on 390 px phones.
- SEO audit: new pages pass; 3 new meta descriptions shortened to ≤ 160 chars. (Pre-existing: FR home, FR sign-up, FR/ES support
  descriptions are 164–184 chars — harmless, can be trimmed later.)

## Deploy (CTO)
1. Preprod: deploy this folder (`Deploy Wikigai.command`) → check https://wikigai.digitradin.cloud/privacy, `/terms`, `/delete-my-data`,
   and a real deletion with a throw-away account (the code email must arrive — SMTP must be set on preprod, else codes go to the outbox).
2. Prod: same, then confirm `https://wikigai.com/privacy`, `/terms`, `/delete-my-data` return 200 **without redirects** (Meta and TikTok
   reviewers fetch them) and `https://wikigai.com/sitemap.xml` lists them.
3. Migration `014` runs automatically at start-up (idempotent).
   Optional now, required once the OÜ is registered: add `LEGAL_REG_CODE` and `LEGAL_ADDRESS` (and `LEGAL_ENTITY_NAME` if the final
   company name differs) to the server `.env.production` and restart.
4. Tell the CMO: "legal URLs live" → Phase 7 can start.

Rollback: deploy `v20261111` (no data change needed; the extra PIN purpose is harmless).

## Legal note
Texts are written from the actual code and data flows, but they are not legal advice. Before scaling paid campaigns, have them reviewed
once by an Estonian lawyer — especially: the company name once registered (and whether "being registered" wording is acceptable until then),
the minimum-age rule for minors, the data processing agreements with each provider, and — if management stays in Spain — where the
company's "main establishment" for GDPR purposes really is (it decides which authority leads).
