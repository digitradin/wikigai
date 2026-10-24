/* Wikigai SEO audit — checks every public page in every language plus the
   sitemap, robots.txt and the noindex on private pages.
   Used by: tools/seo/audit.js (command line, against any URL) and
            GET /api/admin/seo (admin dashboard, against the running server).
   audit(fetchPage) where fetchPage(path) → { status, headers: {name: value}, body } */
'use strict';
const seo = require('./index');

const between = (s, a, b) => s.length >= a && s.length <= b;
const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const attr = (html, re) => { const m = html.match(re); return m ? decode(m[1]) : null; };

async function audit(fetchPage, opts = {}) {
  const base = (opts.publicUrl || seo.PUBLIC_URL).replace(/\/+$/, '');
  const langs = opts.locales || seo.locales();
  const checks = [];
  const add = (page, check, ok, detail, level = 'error') => checks.push({ page, check, ok: !!ok, level: ok ? 'ok' : level, detail: detail || '' });

  for (const route of Object.keys(seo.PAGES)) {
    for (const lang of langs) {
      const p = seo.localPath(route, lang);
      let r;
      try { r = await fetchPage(p); } catch (e) { add(p, 'reachable', false, e.message); continue; }
      add(p, 'status 200', r.status === 200, String(r.status));
      if (r.status !== 200) continue;
      const h = r.body;
      const title = attr(h, /<title[^>]*>([\s\S]*?)<\/title>/i) || '';
      add(p, 'title length 15–65', between(title.trim(), 15, 65), `${title.trim().length} chars — “${title.trim()}”`, 'warn');
      const desc = attr(h, /<meta name="description"[^>]*content="([^"]*)"/i) || '';
      add(p, 'meta description 50–160', between(desc, 50, 160), `${desc.length} chars`, desc ? 'warn' : 'error');
      add(p, `html lang="${lang}"`, new RegExp(`<html[^>]*lang="${lang}"`, 'i').test(h), attr(h, /<html[^>]*lang="([^"]*)"/i));
      const canon = attr(h, /<link rel="canonical" href="([^"]+)"/i);
      add(p, 'canonical = this page', canon === base + p, canon || 'missing');
      const alts = [...h.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/gi)].map((m) => m[1]);
      const missing = [...langs, 'x-default'].filter((l) => !alts.includes(l));
      add(p, 'hreflang for every language + x-default', !missing.length, missing.length ? 'missing ' + missing.join(', ') : alts.join(', '));
      ['og:title', 'og:description', 'og:image', 'og:url'].forEach((k) => {
        const v = attr(h, new RegExp(`<meta property="${k}" content="([^"]*)"`, 'i'));
        add(p, k, !!v && (k !== 'og:image' && k !== 'og:url' ? true : /^https:\/\//.test(v)), v || 'missing', 'warn');
      });
      add(p, 'twitter:card', /<meta name="twitter:card" content="summary_large_image"/i.test(h), '', 'warn');
      const h1 = (h.match(/<h1\b/gi) || []).length;
      add(p, 'exactly one <h1>', h1 === 1, `${h1} found`, 'warn');
      const imgs = [...h.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
      const noAlt = imgs.filter((i) => !/\balt="[^"]+"/i.test(i)).length;
      add(p, 'images have alt text', !noAlt, noAlt ? `${noAlt} without alt` : `${imgs.length} ok`, 'warn');
      const robotsMeta = attr(h, /<meta name="robots" content="([^"]*)"/i) || '';
      const xr = (r.headers['x-robots-tag'] || '');
      add(p, 'indexable (no noindex)', !/noindex/i.test(robotsMeta + xr), robotsMeta + (xr ? ' / header: ' + xr : ''));
      if (route === '/') {
        const ld = attr(h, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
        let okLd = false; try { okLd = Array.isArray(JSON.parse(ld)); } catch { okLd = false; }
        add(p, 'structured data (JSON-LD) valid', okLd, okLd ? 'WebSite, Organization, WebApplication' : 'missing or invalid');
      }
      add(p, 'page weight < 150 KB', h.length < 150000, `${Math.round(h.length / 1024)} KB`, 'warn');
    }
  }

  // sitemap
  try {
    const s = await fetchPage('/sitemap.xml');
    const locs = [...s.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const expected = Object.keys(seo.PAGES).length * langs.length;
    add('/sitemap.xml', 'sitemap lists every public page × language', s.status === 200 && locs.length === expected, `${locs.length}/${expected} URLs`);
    add('/sitemap.xml', 'sitemap URLs on canonical domain', locs.every((l) => l.startsWith(base + '/')), base);
  } catch (e) { add('/sitemap.xml', 'sitemap reachable', false, e.message); }

  // robots
  try {
    const rb = await fetchPage('/robots.txt');
    add('/robots.txt', 'robots.txt points to sitemap', /Sitemap:\s*https?:\/\/\S+\/sitemap\.xml/i.test(rb.body), '');
    const blocked = seo.PRIVATE_PREFIXES.filter((p) => !new RegExp(`Disallow: ${p.replace('/', '\\/')}\\b`).test(rb.body));
    add('/robots.txt', 'private areas disallowed', !blocked.length, blocked.length ? 'not blocked: ' + blocked.join(', ') : 'ok');
  } catch (e) { add('/robots.txt', 'robots reachable', false, e.message); }

  // private pages must be noindex
  for (const p of ['/survey', '/dashboard', '/ikigai', '/verify', '/reset', '/admin']) {
    try {
      const r = await fetchPage(p);
      const no = /noindex/i.test((r.headers['x-robots-tag'] || '') + (attr(r.body || '', /<meta name="robots" content="([^"]*)"/i) || ''));
      add(p, 'private page is noindex', no, r.headers['x-robots-tag'] || '');
    } catch (e) { add(p, 'reachable', false, e.message, 'warn'); }
  }

  const errors = checks.filter((c) => c.level === 'error').length;
  const warns = checks.filter((c) => c.level === 'warn').length;
  const passed = checks.filter((c) => c.ok).length;
  return { generatedAt: new Date().toISOString(), base, score: Math.round((passed / Math.max(1, checks.length)) * 100), passed, errors, warnings: warns, total: checks.length, checks };
}

module.exports = { audit };
