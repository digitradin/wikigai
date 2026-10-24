# Wikigai — tracking, owner stats & SEO (release 2026-10-24)

## What's new
- **Cookieless first-party analytics** (`/api/t`, `assets/track.js`): page views + funnel events
  (signup, verify, login, stage 1/2/3, shares per channel, donate, language change, retake).
  No cookies, no IP stored, daily-rotating anonymous id, bots filtered, honours DNT/GPC.
  Rows are deleted after `ANALYTICS_RETENTION_DAYS` (default 395).
- **Owner dashboard** at `/admin` (EN/FR/ES): KPIs vs previous period, daily chart, funnel,
  referrers, pages, UTM campaigns, languages, countries, devices, engagement, accounts,
  progress, CSV export, UTM link builder, SEO health check. A "Stats" link appears in the
  navbar for admins.
- **SEO**: server-rendered public pages per language (`/`, `/fr/`, `/es/`, `/signup`, `/fr/signup`…),
  canonical + hreflang, Open Graph/Twitter cards with per-language share images, JSON-LD,
  `sitemap.xml` with language alternates, `robots.txt`, noindex on private pages.
- Share links now carry `utm_source=<channel>&utm_medium=share`.
- Fix: `trust proxy` behind Traefik (rate limits and visitor counting were seeing one IP).

## Add to /opt/cps/.env.production on the server (before deploying)
```
ADMIN_EMAILS=your-login-email@example.com
PUBLIC_URL=https://wikigai.digitradin.cloud
GOOGLE_SITE_VERIFICATION=
BING_SITE_VERIFICATION=
ANALYTICS_ENABLED=true
ANALYTICS_RESPECT_DNT=true
ANALYTICS_RETENTION_DAYS=395
ANALYTICS_SELF_HOSTS=
TRUST_PROXY_HOPS=1
```
Only `ADMIN_EMAILS` is required; the rest have these defaults.

## After deploy
1. Sign out/in once, open `/admin` → "Run SEO check" (expect ~100).
2. Google Search Console: add the property, paste the code into `GOOGLE_SITE_VERIFICATION`,
   redeploy, then submit `https://wikigai.digitradin.cloud/sitemap.xml`. Same for Bing.
3. From the Mac: `BASE_URL=https://wikigai.digitradin.cloud node tools/seo/audit.js`

Visit numbers start from the deploy day — earlier visits were never recorded and can't be recovered.
Rollback copies of the replaced files: `_backup_20261024_tracking_seo/`.
