# Wikigai — release v20261112b

| | |
|---|---|
| Version | v20261112b |
| Builds on | v20261112 (export fix, not deployed) → v20261111b (live) — all included; notes in `RELEASE_v20261112.md`, `RELEASE_v20261111b.md` |
| Status | Built and tested locally against a TikTok stand-in — **not deployed yet** (local ✅ → preprod with TikTok **sandbox** keys → prod) |
| Briefs | `CMO/Projects/wip/CMO_Wikigai_Campaigns/wikigai/briefs/tiktok-login-linking.md` + `tiktok-share-feature.md` |
| Safe to deploy dark | Everything TikTok is **off** unless `TIKTOK_LOGIN=true` / `TIKTOK_SHARE=true` + keys are set on that stack |

## 1. "Continue with TikTok" + one account, two ways in
- **Sign-up / sign-in** (`/login`, `/signup`, EN/FR/ES): black "Continue with TikTok" button above the email form. New TikTok users go
  straight to the survey (no email asked); returning ones to the dashboard. Only scope `user.info.basic`; the sign-in token is revoked
  right after reading the profile. Stored: TikTok open_id, display name, avatar (`user_identities`).
- **Add your email after the results**: card on the survey results / Wikigai hub / dashboard for accounts without email —
  email → 6-digit code → saved (no password needed). "Not now" twice = never again. After that, "Change password" sets a password.
- **Account › Sign-in methods**: Email ✓ / Add email · TikTok Connect / Disconnect. Disconnect needs an email (no lock-out).
- **Linking rules**: one TikTok ↔ one Wikigai account. Email user connects TikTok → either login opens the same account.
  TikTok already on another account **with** an email → refused. TikTok on a **TikTok-only** account (no email, no password) →
  that account is **merged** into the signed-in one (results stages, plans, research, saved videos; the email account wins on
  conflicts) and deleted. A TikTok user who types an email that already has an account is told to sign in there and connect TikTok.
- **Deletion**: TikTok-only accounts delete with "Confirm with TikTok" (fresh consent must return the same open_id). Deleting any
  account also revokes the TikTok posting token and deletes identities, tokens, images and OAuth states. Export lists sign-in methods.
- Schema (`015_tiktok.sql`): `users.email_hash` now nullable (+ `email_prompt_dismissals`), `user_identities`, `tiktok_tokens`
  (encrypted, ≤ 24 h, never a refresh token), `tiktok_media` (≤ 24 h), `tiktok_oauth_states` (single use, 10 min).
  Survey rows of accounts without email use `user_email = 'uid:<id>'` (column is NOT NULL); re-keyed to the email hash when one is added.

## 2. "Share to TikTok" (photo carousel → the user's own TikTok)
- **TikTok** button in the share row (signed-in users) → `/share/tiktok`.
- Not connected → "Connect TikTok" (asks `video.publish,video.upload` only here). Token stored encrypted ≤ 24 h.
- **Carousel built in the browser**: 4 slides 1080×1920 JPEG (hook · top 3 passions · top 3 careers with % · question), in the
  user's language, **no logo / no "Wikigai" / no URL** on the images (TikTok rule). Server re-checks every image (JPEG, exact size,
  ≤ 2.5 MB, max 20 shares/day) and serves them at `/tt-media/<token>/<n>.jpg` (200, image/jpeg, no redirect) for 24 h.
- **Post screen = TikTok's Content Sharing Guidelines**: creator avatar + nickname from `creator_info` (fetched every time), preview,
  editable title (≤ 90) + caption, "Who can view" from `privacy_level_options` with **no default** (Post disabled until chosen),
  comments + music **unticked**, comments greyed when the creator disabled them, commercial-content toggle with Your brand /
  Branded content + "Promotional content" / "Paid partnership" notices, Branded content blocks "Only me", Music Usage Confirmation
  (+ Branded Content Policy) line right above Post. Nothing goes to TikTok before Post. The server re-checks privacy against
  creator_info and refuses branded + private.
- **Post** (DIRECT_POST) or **Open in TikTok to add a sound** (MEDIA_UPLOAD → inbox) → status polling (5 s, 2 min) → result.
  Error codes mapped to plain messages (posting limit, too many drafts, app version, unaudited = private accounts only).

## 3. Legal texts (EN/FR/ES)
Privacy: new data-table row "TikTok sign-in and sharing"; §8 rewritten (Signing in with TikTok / Sharing to TikTok / our own accounts);
§10 adds "signed up with TikTok → Confirm with TikTok". Terms: new §7b "Posting to TikTok and other platforms".
Delete-my-data sidebar: how TikTok-only accounts delete. Scripts: `tools/i18n/legal-tiktok.py`, `tools/i18n/add-tiktok-texts.py`.

## 4. Migration safety fix (also patched into v20261112)
003 and 011 now re-create the PIN-purpose check with the full list. Before, a pending `email_change` or `delete` code made 003 fail
at start-up and **skipped every later migration**. **CTO: grep prod/preprod logs for `[migrate] FAILED`.**

## Settings (server `.env.production`, per stack — see `deploy/.env.production.example`)
`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` (Wikigai app — sandbox keys on preprod), `TIKTOK_REDIRECT_URI` (default
`PUBLIC_URL/auth/tiktok/callback` — must match the app exactly), `TIKTOK_MEDIA_BASE_URL` (default `PUBLIC_URL`, must be a
verified URL property), `TIKTOK_LOGIN`, `TIKTOK_SHARE`. Not added to `deploy.sh` SYNC_KEYS on purpose (prod must stay off).
Tests only: `AUTH_RATE_MAX`, `API_RATE_MAX` (defaults 40 / 60 unchanged).

## Tests run (local, real Postgres + Chromium + TikTok stand-in)
- `backend/scripts/tiktok_smoke.mjs` → **48/48 pass**: new TikTok user (no email, language kept, results saved, export, disconnect
  refused), add email by code (no password) → email+password login opens the same account → disconnect allowed; email user links
  TikTok → TikTok login opens it; taken / second TikTok / forged session refused; TikTok-only merged into an email account (results
  moved, old account gone); share: scopes only on share, creator info, wrong size refused, 3 slides served 200 image/jpeg, no-privacy
  and branded+private refused, Direct Post body exactly as chosen, TikTok fetched every image, PUBLISH_COMPLETE, MEDIA_UPLOAD →
  inbox without privacy fields, another user can't use the images; cancel → `?tiktok=cancel`, unknown state → expired;
  confirm-delete with a different TikTok refused, with the right one → account + identities + tokens + images + results = 0 rows,
  token revoked at TikTok. Posting token stored encrypted (no plaintext in the DB).
- `backend/scripts/smoke.mjs` → 23/23. `node tools/i18n/check.js` → 0 errors (100 new keys × 3). Flags off → no button, `/start` 404.
- Browser (iPhone 13, EN/FR/ES): TikTok sign-up → survey; UTF-8 names; email card on dashboard; Sign-in methods; Add email wording;
  "Confirm with TikTok" delete → deleted page, session cleared; share: Post disabled until privacy, no default, unticked boxes,
  commercial rules, declarations, 4 slides rendered and posted (TikTok fetched 4×200). No page errors.
- Regression: email account export + public deletion by code OK.

How to run the TikTok tests yourself: `node backend/scripts/tiktok_standin.mjs 9911`, start the backend with the env shown at the
top of that file (+ `EXPOSE_PINS=true AUTH_RATE_MAX=1000 API_RATE_MAX=2000`), then
`BASE_URL=http://localhost:8080 TT=http://localhost:9911 node backend/scripts/tiktok_smoke.mjs`.

## Deploy (CTO)
1. Deploy to **preprod** with the Wikigai app's **sandbox** keys, `TIKTOK_LOGIN=true`, `TIKTOK_SHARE=true`,
   redirect `https://wikigai.digitradin.cloud/auth/tiktok/callback`, media base `https://wikigai.digitradin.cloud` (URL prefix
   `/tt-media/` verified in the sandbox). Target users only (set to Private). Run the briefs' acceptance lists with real TikTok.
2. Production: deploy with TikTok **off** (no keys or flags) — safe; the migration fix and legal texts go live.
3. After TikTok app review: production keys + `TIKTOK_LOGIN=true`. After the Direct Post audit: `TIKTOK_SHARE=true`.
4. Record the review demo on preprod: sign-in → consent → survey → share screen → Post → result in TikTok → Confirm-with-TikTok delete.

Rollback: `v20261112` (TikTok tables stay but are unused).
