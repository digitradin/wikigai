# Wikigai — release v20261112c

| | |
|---|---|
| Version | v20261112c |
| Builds on | v20261112b (TikTok login + share, not deployed) → v20261112 → v20261111b (live) — all included; notes in `RELEASE_v20261112b.md`, `RELEASE_v20261112.md`, `RELEASE_v20261111b.md` |
| Status | **LIVE on preprod wikigai.digitradin.cloud** since 2026-11-12 22:09 CET (TikTok sandbox on, Google/Facebook/Instagram off). Not yet promoted to production. |
| Ship instead of | v20261112b (same deploy plan; v20261112b no longer needs to ship on its own) |
| Safe to deploy dark | Every sign-in app is **hidden** (buttons, Account rows, privacy-policy paragraphs) unless its keys **and** `<APP>_LOGIN=true` are set on that stack |

## 1. Share to TikTok — new artwork + emojis
- Slides use the new **four-circles image** (`frontend/public/assets/brand/ikigai-circles.jpg`, 1024×1024) blended into each slide's colour
  (canvas "screen" blend, so its black background disappears). Old drawn circles stay only as a fallback if the image fails to load.
- **Fun emojis tied to the user's results**, and **never on top of the circles (the logo)**:
  - a row of 4 emojis sits in the empty band **under** the circles: the **top profession's emoji** first (e.g. 📱 UX Designer, 🤖 ML Engineer,
    🧠 Clinical Psychologist, 🚑 Paramedic, 🐠 Marine Biologist — a keyword map covers all 160 careers; anything new falls back to its
    domain icon), then the **top domains' icons** (🔬 🎨 💼 🩺 🤝 ⚖️ 🏗️ 🌿);
  - enforced in code, not just by layout: the circles' painted area (glow included) is read from the image as a mask, and an emoji is only
    drawn where its whole box plus a margin is clear of it — if there is no clear spot, no emoji is drawn. Applies to the fallback circles too;
  - each passion and each career in the lists has its own emoji (in the text area); titles get 💖 / 🎯; the last slide's row is 👀 🤔 💭 👇.
- **Caption and title are written from the results** (still editable before posting), EN/FR/ES, e.g.
  `📱 My top career match: UX Designer! · 💖 What I love: 🎨 Creative Arts & Design · 🔬 Science & Technology … · Which careers would fit YOU? 👇 #ikigai #careertest #wikigai #creative #tech`
  (2 domain hashtags added from the results). Title: `📱 My ikigai: UX Designer`.
- Still **no logo, no "Wikigai" wordmark, no URL** on the images (TikTok rule).
  ⚠️ If TikTok's reviewers read the four circles as the Wikigai logo, they may flag it as branding — answer: it is the generic ikigai diagram
  (four overlapping circles), with no name or link. If they insist, swap the image file; nothing else changes.

## 2. Sign-in apps: ready for Google, Facebook and Instagram (hidden)
One account, many ways in. TikTok works exactly as in v20261112b; Google, Facebook and Instagram are built in but **hidden** until switched on.
- **Backend, one generic flow** (`backend/src/routes/oauth.js` + one small file per app in `backend/src/lib/oauth/`):
  `GET /api/oauth/:app/start?intent=login|link|delete|share` → app consent → `GET /auth/:app/callback`, `POST /api/oauth/:app/disconnect`.
  The v20261112b URLs keep working (`/api/tiktok/start`, `/auth/tiktok/callback`). Results come back as `?auth=<code>&via=<app>`;
  sign-in ends at `/auth/done` (session in the #fragment, as before).
- **Where the buttons show** (only the apps switched on): `/login` and `/signup` (onboarding) — "Continue with TikTok / Google /
  Facebook / Instagram" in each app's official colours; **Account › Sign-in methods** — Email + one row per app (Connect / Disconnect),
  also for an app that was switched off later so people can still disconnect it.
- **Rules (all apps)**: an app account belongs to one Wikigai account. An app that gives a **verified email** (Google; Facebook) fills the
  account's email at sign-up, so no "add your email" card. If that email **already has an account**, nothing is merged silently: the person is
  told to sign in with the email and connect the app from Account (`?auth=email_exists`). Instagram (business/creator accounts only) gives
  no email, like TikTok. Disconnecting is allowed while another way in remains (email or another app). App-only accounts delete with
  "Confirm with <app>". Merge of an app-only account into the signed-in one now moves its other app links too.
- **Schema** (`016_oauth_providers.sql`, idempotent): `user_identities.provider` allows `tiktok, google, facebook, instagram`;
  `tiktok_oauth_states` → generic **`oauth_states`** (+ `provider` column). `015_tiktok.sql` no longer creates the old table.
- **Add another app later**: one file in `lib/oauth/`, its id in the 016 CHECK, its icon in `assets/oauth.js`. Nothing else.

## 3. Privacy policy follows the switches (EN/FR/ES)
`backend/src/seo/legal/<lang>/privacy.html` now has conditional blocks, resolved from the server settings:
- apps that are off are **never named**; "We do not offer sign-in with Facebook or Instagram" stays while both are off;
- when Google/Facebook/Instagram is on: a data-table row, a "Signing in with Google and Facebook" paragraph (identifier, name, picture,
  verified email only; no silent merge; token used once then revoked), a Facebook/Instagram line in "our social media", and the
  deletion step "Signed up with … → Confirm with …". Delete-my-data page text is now app-neutral.
- Scripts: `tools/i18n/legal-signin-apps.py`, `tools/i18n/add-oauth-texts.py` (new `oauth.*` texts, 39 keys × 3; TikTok-only sign-in texts
  removed from `tiktok.*`; 3 caption keys added).

## Files
New: `backend/src/lib/oauth/{index,common,tiktok,google,facebook,instagram}.js`, `backend/src/routes/oauth.js`,
`deploy/migrations/016_oauth_providers.sql`, `frontend/public/assets/oauth.js` (replaces `assets/tiktok.js`),
`frontend/public/auth-done.html` (replaces `auth-tiktok.html`), `frontend/public/assets/brand/ikigai-circles.jpg`,
`backend/scripts/oauth_standin.mjs` + `oauth_smoke.mjs` (replace the `tiktok_*` ones).
Changed: `index.js`, `routes/tiktok.js` (sharing only), `routes/user.js` (profile `methods.providers`), `lib/accountData.js`,
`lib/retention.js`, `seo/index.js`, privacy ×3, `015_tiktok.sql`, `tiktok-share.js/.css`, `support.js`, login/signup/account/share pages, ui.js ×3.

## Settings (server `.env.production`, per stack — see `deploy/.env.production.example`)
TikTok: unchanged (see `RELEASE_v20261112b.md`). New, all optional and **off by default**:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (default `PUBLIC_URL/auth/google/callback`), `GOOGLE_LOGIN`
- `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI` (default `PUBLIC_URL/auth/facebook/callback`), `FACEBOOK_GRAPH_VERSION` (v21.0), `FACEBOOK_LOGIN`
- `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI` (default `PUBLIC_URL/auth/instagram/callback`), `INSTAGRAM_LOGIN`
Use a **separate Meta app** for user sign-in (not the Postiz publishing app). Not added to `deploy.sh` SYNC_KEYS (prod stays off).

## Tests run (local, real Postgres 16 + Chromium)
- `backend/scripts/oauth_smoke.mjs` with TikTok + Google + Facebook on → **70/70 pass**: all 48 TikTok cases of v20261112b on the new
  routes (+ old `/api/tiktok/start` still works); config lists only the apps on (Instagram hidden); Google: new user gets the verified email
  and no card, same account on 2nd login, existing email → `email_exists` and no account created, unverified email not used, email user
  connects Google → Google opens it, cancel; TikTok-only account adds Facebook → both sign in to it, TikTok disconnect allowed, last
  app without email refused, second Facebook refused, Facebook user with email, delete by "Confirm with Facebook"; Instagram off →
  refused; unknown app → `BAD_PROVIDER`; share intent TikTok-only; privacy page names "Google and Facebook" only.
- Same script with **no app switched on** (`HIDDEN=1`, = production today) → **8/8**: config empty, every app's start refused, privacy
  EN/FR/ES mention no Google/Facebook sign-in and keep "we do not offer sign-in with Facebook or Instagram", no template tags left.
- Browser: no buttons / no Sign-in methods card when everything is off; with apps on, login + signup show the 3 buttons, Spanish
  `email_exists` message, Account rows Email / TikTok / Google / Facebook (app icon when the avatar can't load), no horizontal scroll on
  iPhone 13; share screen EN + FR: 4 slides with the new art, emojis and generated caption; no page errors.
- `node tools/i18n/check.js` → 0 errors.

How to run: `node backend/scripts/oauth_standin.mjs 9911`, backend with the env at the top of that file (+ `EXPOSE_PINS=true
AUTH_RATE_MAX=1000 API_RATE_MAX=2000`), then `BASE_URL=http://localhost:8080 TT=http://localhost:9911 node backend/scripts/oauth_smoke.mjs`.

## Local test (double-click "Test Wikigai Locally.command")
TikTok buttons now show locally too: the script starts a **pretend TikTok** (`backend/scripts/oauth_standin.mjs`, port 9911) and switches
`TIKTOK_LOGIN` / `TIKTOK_SHARE` on for the local run only, so "Continue with TikTok" (sign-up / sign-in) and "Share to TikTok" can be clicked
without TikTok keys (it signs you in as a test TikTok user). Hide them with `WK_LOCAL_TIKTOK=false` in `tools/local/local.env`.
Server stacks are unaffected: preprod / wikigai.com show the button only after the TikTok keys + `TIKTOK_LOGIN=true` are set there.

## Deploy (CTO) — same plan as v20261112b
1. **Preprod** with the TikTok **sandbox** keys + `TIKTOK_LOGIN=true`, `TIKTOK_SHARE=true` (redirect `https://wikigai.digitradin.cloud/auth/tiktok/callback`).
   Leave Google/Facebook/Instagram unset. Check `[migrate] applied 016_oauth_providers.sql` in the logs (and no `[migrate] FAILED`).
2. **Production** with every app off — safe; brings the migration fixes and legal texts.
3. Later, per app: create the app (Google Cloud OAuth client / Meta app for login), redirect `https://wikigai.com/auth/<app>/callback`,
   set keys + `<APP>_LOGIN=true` on preprod first, then prod. The button, Account row and privacy text appear on their own.

Rollback: `v20261112b` (or `v20261112`). `oauth_states` and the widened CHECK are harmless to older versions except v20261112b's
TikTok sign-in, which expects `tiktok_oauth_states` — if rolling back to v20261112b with TikTok on, run
`ALTER TABLE oauth_states RENAME TO tiktok_oauth_states;` first.
