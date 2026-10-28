# Wikigai statistics — stand-alone page for dashboard.digitradin.cloud

The owner statistics are **not part of the Wikigai site** any more (no Stats menu, no /admin page).
They live in one self-contained file you host on the Digitradin dashboard:

    deploy/dashboard/wikigai-stats.html   (built by: node tools/dashboard/build.js)

## Install on dashboard.digitradin.cloud
1. Copy `wikigai-stats.html` into the dashboard website (e.g. `/wikigai-stats.html` or a "Wikigai" tab/iframe).
   Keep it behind the dashboard's own login.
2. On the Wikigai server, add to `/opt/cps/.env.production` and redeploy:
   ```
   STATS_API_TOKEN=<long random value, e.g. openssl rand -hex 24>
   STATS_ALLOWED_ORIGINS=https://dashboard.digitradin.cloud
   ```
3. Open the page, paste the same token in **Connection** → Connect. The token stays only in that browser
   ("Forget token" removes it). The site defaults to https://wikigai.com.

## What it shows
KPIs vs previous period (7/21/30/90 days), daily chart, conversion funnel, sources, pages, UTM campaigns,
languages, countries, devices, engagement (shares, AI research, video searches, account deletions…),
accounts and progress, CSV export, campaign link builder, SEO health check. EN / FR / ES.

## Security
- API: `GET /api/admin/stats`, `GET /api/admin/seo` — require `Authorization: Bearer <STATS_API_TOKEN>`;
  without the variable the API is off (503); wrong token → 401; brute-force limited like sign-in.
- Browsers may call it only from the origins in `STATS_ALLOWED_ORIGINS` (CORS).
- Aggregates only — no names, emails or IPs.

## Local test
`Test Wikigai Locally.command` serves this page at http://localhost:8080/__stats (development only)
and puts a local `STATS_API_TOKEN` in `tools/local/local.env`.
