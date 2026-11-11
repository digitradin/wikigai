# v20261031 — preprod lock-down + server hygiene (builds on v20261029)

Date: 2026-11-01 · Base: `v20261029` (identical app code, no backend/frontend change)
Scope: deployment, secrets handling and server configuration — **plus one app change added 2026-11-01 (smooth onboarding, see below; not yet on preprod).**

## What changed

### Preprod (wikigai.digitradin.cloud, survey.digitradin.cloud)
- **Preprod is public, exactly like production** — no extra password prompt. A basic-auth gate was
  added during the night and **removed again on Tomas's instruction** (11:25): preprod should behave
  like prod, not sit behind a second door.
- **What actually closes the old exposure is the flag, not a gate:** `EXPOSE_PINS=false` on preprod
  (was `true`). That is what made `/api/captcha/_debug/solve` a public answer key and put PINs in API
  responses — both are now gone, identical to prod: debug endpoints **404**, responses carry no
  `dev_pin`. `PUBLIC_URL=https://wikigai.digitradin.cloud` is now set like prod has it (canonical /
  share URLs no longer point at wikigai.com from preprod).
- **Database off the public `traefik` network**: `cps-db` sits on `wikigai-preprod-db-net`
  (`internal: true`); only `cps-backend` is on both.
- **`traefik.docker.network=traefik` label on the backend** — without it Traefik load-balances to
  the private-network IP and every authenticated request hangs (12–25 s) before timing out.
- **`/opt/cps/outbox` is mounted at `/data/outbox`.** Preprod has no SMTP provider, so the mailer
  writes `.eml` files instead of sending; the mount keeps sign-up PINs readable on the host and
  alive across redeploys (`cat /opt/cps/outbox/*.eml`). Real email on preprod needs an SMTP
  credential — prod uses Resend, preprod has none.

### Prod (wikigai.com)
- Same DB isolation (`wikigai-prod-db-net`, `internal: true`, backend on both networks, network label).
- **`deploy/prod/docker-compose.prod.yml` is versioned here for the first time** — until now it
  existed only on the server. `deploy/prod/pg-backup-prod.sh` likewise.

### Deploy path
- `deploy.sh` deploys as **`deploy@76.13.248.104`** (non-root, docker group, NOPASSWD sudo);
  root SSH and password login are closed on the box.
- `deploy/backup/` holds the four backup tools that were previously unversioned:
  `pg-backup.sh` (server, age-encrypted, N/N-1 rotation, `.FAILED` marker),
  `backup-pull.sh` (Mac, verify-and-copy only, no decrypt), `backup-check.sh`, `backup-daily.sh`.

### VPS edge (server-side only, documented here)
- Key-only SSH for `deploy`, `PermitRootLogin no`, `PasswordAuthentication no`, `MaxAuthTries 3`,
  `LoginGraceTime 20`; fail2ban `sshd` jail (bantime 30m); ufw 22/80/443.
- `docker-port-guard.service` drops internet traffic to docker-published ports 8081, 8090, 49366,
  47668 (ufw cannot filter those); Traefik→container bridge traffic is untouched.

## Deploy
```bash
cd website/v20261031 && ./deploy.sh          # preprod, as deploy@
```
No secret to create: preprod needs no gate. (If a gate is ever wanted again, generate an htpasswd
line with cost 12, put it in a server-only `.env.preprod`, excluded from `rsync`, and fail closed
with `${VAR:?}` in the label — that is how it was built and removed on 1 Nov.)

## Rollback
`v20261029` is frozen history: same app code, but no DB isolation and a `deploy.sh` that targets
`root@`, which no longer accepts logins. To roll back the app, deploy
`v20261029`'s `backend/` and `frontend/` with `v20261031`'s `deploy/`.

## Tests run (2026-11-01, final state)
- preprod is public: `wikigai.digitradin.cloud` **200**, `survey.digitradin.cloud` **200** (0.22–0.26 s),
  no auth prompt; `/health` → `database: connected`.
- PIN exposure closed on both environments: `/api/captcha/_debug/solve` **404** and
  `/api/captcha/_debug/challenge` **404** on preprod, same as prod; sign-up response has no `dev_pin`.
- Mailer dry path proven: a send writes `/data/outbox/<ts>-<to>.eml`, visible on the host at
  `/opt/cps/outbox`. Sign-up itself needs the visual captcha, so a scripted end-to-end sign-up stops
  at `CAPTCHA_FAIL` by design.
- `wikigai.com` health/landing **200**; `wikigai.com/api/captcha/_debug/solve` **404**.
- `cps-db` unreachable from `wikigai-prod-*` containers; prod health `database: connected`.
- Dashboard `/wikigai` → **200**, live prod KPIs, no preprod data.
- External port scan: only 22/80/443 open; 8081/8090/49366/47668 closed.

## Addendum 2026-11-01 — smooth onboarding (app change, NOT yet deployed)
Added to this folder on request, after the preprod deploy above. Preprod/prod still run the old sign-up form until `./deploy.sh` is run again.

- **Sign-up asks for the email once and the password once.** Removed "Confirm email address" and
  "Confirm password" from `frontend/public/signup.html` (2 fewer fields, ~25% less typing on step 1).
  - A mistyped email is caught by the 6-digit code step (`/verify` already has "← Use a different email").
  - A mistyped password is fixed with "Forgot password" (email code → reset). The **Show** toggle
    stays on the password field so people can check what they typed.
- `backend/src/routes/auth.js` `/api/auth/signup`: `email2` / `password2` are now optional. If an old
  cached page still sends them, they are still checked (backward compatible).
- Password reset (`reset.html`) keeps its confirm field — unchanged.
- Unused i18n keys (`auth.email2*`, `auth.password2*`, `auth.errEmailMatch`) left in place, harmless.
- Tests: `smoke.mjs` signup now sends one email + one password; `browser_e2e.mjs` asserts the confirm
  fields are gone. Local run (PGlite): **23/23 smoke pass**; signup without confirm fields → 201;
  legacy body with mismatched `email2` → 400 `EMAIL_MISMATCH`; `/signup` HTML has no `email2`/`password2`;
  `tools/i18n/check.js` 0 errors.
- Sync these 4 files to the git repo (`EDU_20260927_CPS-Login`) before the next tag:
  `frontend/public/signup.html`, `backend/src/routes/auth.js`, `backend/scripts/smoke.mjs`, `backend/scripts/browser_e2e.mjs`.
