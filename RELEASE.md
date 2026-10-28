# Wikigai — release v20261028b

| | |
|---|---|
| Version | v20261028b |
| Builds on | v20261028 (free-only AI provider list) — everything in it is included |
| Status | Built and tested locally — **not deployed yet** |
| Production site | **https://wikigai.com** |

## Changes
1. **WikiVids — options fold after a search.** Once a search runs (or My WikiVids is open), all option rows
   (Area, Subfields, Professions) fold to **max 2 rows of chips** with a **"+ More options" / "− Fewer options"**
   button, so the videos are visible straight away. After a search the user starts, the page scrolls to the videos
   if they are below the screen (phones). Folding back scrolls the search box into view.
   Files: `frontend/public/assets/learning.js` (wvFitOpts, wvShowResults), `learning.css`.
2. **AI learning plans = "coming soon".** `AI_SOON = true` in `learning.js`: Plans shows a coming-soon page
   ("✨ AI · Coming soon", what's coming, CTA → WikiVids); sidebar badge "Soon"; overview card badge "AI · Coming soon".
   The Plans code and `/api/plans` stay in place — set `AI_SOON = false` (and the badge in `site.js`) to switch back.
3. **"Free" messaging → "free on basic searches, fair to grow"** (EN/ES/FR): landing hint + meta, sign-up meta,
   /support page (title "Free to start. Fair to grow.", new lead on why advanced personalised services and guidance
   will need a small investment), support box, share text + email, dashboard footer, tools lead, plan loading text.
   Static fallbacks in `index.html` / `support.html` updated.
4. **Production domain = wikigai.com** as default for share links (`support.js` always shares wikigai.com),
   SEO canonical/sitemap default (`backend/src/seo`), share URL in `/api/config`, OpenRouter referer, SEO audit and
   stats dashboard defaults, share images. Server routing (docker-compose/Traefik), JWT issuer and CORS unchanged.
   ⚠ If the server `.env` has `PUBLIC_URL=https://wikigai.digitradin.cloud`, change it to `https://wikigai.com`.

5. **Brand fixes.** Share images `og-en/es/fr.png` rebuilt from the official logo files (`wikigai-logo.png` top-left,
   the favicon mark on the right — the old images used a hand-drawn copy of the circles). Subtitle is neutral, without
   "free" wording ("Career guidance for students and career changers"), and the domain is wikigai.com. Template to
   re-make them: `tools/brand/og.html` (open with `?en`, `?es` or `?fr` at 1200×630 and take a screenshot).
   My Wikigai circles (`ikigai.css` `.ik-venn`) now use the logo colours (pink, purple, blue, light blue + white dot)
   instead of pink / purple / green / orange.

6. **Round 2 (same version):**
   - **Logo everywhere = official mark.** New `assets/brand/wikigai-mark-icon.png` (transparent, cut from the favicon).
     My Wikigai circles show it with no text on it; every small CSS-drawn logo (`.ikigai-logo` in survey, `.ikigai-mark`
     in brand.css) now shows the same image — 4 circles meeting in the middle with the white dot.
   - **WikiVids: two search buttons** on the right of the field — "🔎 EN" and "🔎 ES/FR" (page language; one button when
     the page is in English). The clicked one is highlighted; Enter repeats the last language. Uses `lang=` of `/api/videos/search`.
   - **Stage 1 / 2 intro:** Start (+ Dashboard) on the left, keyboard tip on the right — keys 1 2 3 4 5 "Easier using your
     keyboard" (keys already answer the questions; tip hidden on phones and in Stage 3).
   - **Account: country of residence + up to 10 countries to study / work in** (flags, names in the page language, saved on
     change). Backend: migration `009_countries.sql` (users.residence_country, users.target_countries), `lib/countries.js`
     (250 ISO codes + Kosovo), `PUT /api/user/profile` accepts `residenceCountry` / `targetCountries`, profile returns them.
     Front: `account.html`, `assets/countries.js`. Not yet used by the matching/pay pages (next step if wanted).

7. **Round 3 (same version):**
   - **Sign-up: country of residence pre-filled from the visitor's connection** (flag + name in the page language), user
     keeps or changes it; saved on the account. `GET /api/geo` → proxy country header (e.g. Cloudflare) → offline IP lookup
     (`geoip-country` 5.0.202610140208, GeoLite2 data inside node_modules: the IP never leaves the server and is not stored)
     → browser language region. New backend dependency (Docker installs it on deploy; the local launcher installs it if
     missing). MaxMind attribution line added on /support (required by the GeoLite2 licence).
   - **WikiVids language switch:** page in ES/FR + click "EN" → the words become the English name when they are one of the
     page's topics (areas, subfields, professions), e.g. "Ingeniero de software" → "Software Engineer" (and back with "ES").
     Otherwise the field is emptied with a tip to pick a topic (filled in English) or type in English — no search runs.

8. **Round 4 (same version):**
   - **Permanent account id for everything.** Every account has a UUID (`users.id`); sessions, plans, saved videos and
     AI research already used it. Survey results were still looked up by email hash — now they belong to `users.id` too
     (migration `010` backfills existing rows; `lib/results.js` links any older row on first read; new rows get the id).
     So changing an email later only needs the `users` row updated — no results lost. (Email-change screen not built yet.)
   - **Phone on the Account page** (optional): international format (+ or 00, 7-15 digits), normalised to +34600112233,
     stored encrypted (`users.phone_enc`, pgcrypto like the email), Save / Clear.

9. **Round 5 (same version):**
   - **Change email** (Account › Password & sign-in): new email + current password → 6-digit code to the NEW address →
     confirm. Same account id, so results, plans and saved videos stay; the session stays signed in; a security notice is
     emailed to the OLD address. Blocks an email used by another verified account; removes an unfinished sign-up with that
     address. API: `POST /api/auth/email-change/start|confirm`; migration `011` adds the 'email_change' code purpose;
     email texts EN/ES/FR in `backend/src/i18n/locales`.
   - **WikiVids:** the EN button shows "🔎 EN 🔥" with an orange outline, so it stands out even when ES/FR is selected.

10. **Round 6 (same version):**
   - **Passions: select / deselect** areas (Stage 1, max 4 like the survey), subfields and professions (Stage 2), with
     "✓ Selected / + Select" buttons. Deselected items stay listed (dimmed) and drop out of every match (My Wikigai cards,
     matches list, My learning path, the saved top 20); nothing is deleted. Saved as `stage_1.domainPrefs`,
     `stage_2.subPrefs`, `stage_2.excluded` (no backend change). "Show all" for the full profession list.
   - **My path:** the 4 cards next to the logo never underline on hover / tap (purple border instead).

## Tests run
- Round 6: browser — no underline on hover; 39 toggles shown; 5th area refused (max 4); deselecting a profession and a
  subfield updates the count (35 of 40) and dims the rows; layout checked desktop.
- Round 5: email change — same email / wrong password / email taken / wrong code rejected; confirm keeps id, session and
  results, old email removed; code mail to new address + notice to old address in the outbox. Account form and EN 🔥 button
  checked in the browser.
- Round 4: legacy results row (email only) found via the account id and linked; results kept after a simulated email
  change; phone saved normalised + encrypted, invalid phone rejected, cleared; 0 results rows without an id.
- Round 3: /api/geo (IP ES/US, Cloudflare header, language fallback); sign-up stores the chosen country / IP guess / none.
  Browser: sign-up pre-selects 🇪🇸 España; EN/ES switch swaps chip words, clears free text with the tip, chips fill in English.
- Round 2: real backend + PGlite — migrations 001-009 applied; profile save / clear / bad country / >10 countries OK.
  Browser (ES): intro layout, EN/ES buttons send lang=en / lang=es, Enter keeps the language, My Wikigai mark, Account
  countries add / remove / residence saved.
- `node tools/i18n/check.js`: 0 errors, 0 warnings (new keys in all 3 locales).
- Syntax check of every changed JS file.
- Browser test (Chromium, mocked API) at 1280px and 390px: options fold to 2 rows after search, More/Fewer toggle,
  new search re-folds, scroll to results on phone, Plans coming-soon page, /support page.
- Not run here: backend smoke / Plans API suites (no backend changes beyond default URLs).

## Deploy / rollback
Deploy with `Deploy Wikigai.command` in this folder. Rollback: deploy `v20261028` or the live `v20261024d`.
