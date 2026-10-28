# Wikigai — tracking, owner stats & SEO (release 2026-10-24)

## What's new
- **Cookieless first-party analytics** (`/api/t`, `assets/track.js`): page views + funnel events
  (signup, verify, login, stage 1/2/3, shares per channel, donate, language change, retake).
  No cookies, no IP stored, daily-rotating anonymous id, bots filtered, honours DNT/GPC.
  Rows are deleted after `ANALYTICS_RETENTION_DAYS` (default 395).
- **Owner statistics** (EN/FR/ES): KPIs vs previous period, daily chart, funnel, referrers, pages,
  UTM campaigns, languages, countries, devices, engagement, accounts, progress, CSV export, UTM link
  builder, SEO health check. Since v20261024d this is a stand-alone page for dashboard.digitradin.cloud
  (`deploy/dashboard/wikigai-stats.html`, see `deploy/dashboard/README.md`) — not part of the site.
- **SEO**: server-rendered public pages per language (`/`, `/fr/`, `/es/`, `/signup`, `/fr/signup`…),
  canonical + hreflang, Open Graph/Twitter cards with per-language share images, JSON-LD,
  `sitemap.xml` with language alternates, `robots.txt`, noindex on private pages.
- Share links now carry `utm_source=<channel>&utm_medium=share`.
- Fix: `trust proxy` behind Traefik (rate limits and visitor counting were seeing one IP).

## Add to /opt/cps/.env.production on the server (before deploying)
```
STATS_API_TOKEN=<openssl rand -hex 24>
STATS_ALLOWED_ORIGINS=https://dashboard.digitradin.cloud
PUBLIC_URL=https://wikigai.com
GOOGLE_SITE_VERIFICATION=
BING_SITE_VERIFICATION=
ANALYTICS_ENABLED=true
ANALYTICS_RESPECT_DNT=true
ANALYTICS_RETENTION_DAYS=395
ANALYTICS_SELF_HOSTS=
TRUST_PROXY_HOPS=1
```
`STATS_API_TOKEN` switches the statistics API on; the rest have these defaults.

## After deploy
1. Open the stats page on the dashboard, paste the token → "Run SEO check" (expect ~100).
2. Google Search Console: add the property, paste the code into `GOOGLE_SITE_VERIFICATION`,
   redeploy, then submit `https://wikigai.com/sitemap.xml`. Same for Bing.
3. From the Mac: `BASE_URL=https://wikigai.com node tools/seo/audit.js`

Visit numbers start from the deploy day — earlier visits were never recorded and can't be recovered.
Rollback copies of the replaced files: `_backup_20261024_tracking_seo/`.
