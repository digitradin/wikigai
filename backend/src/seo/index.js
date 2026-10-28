/* Wikigai SEO — server-side rendering of public pages per language + head tags.
   Public (indexable) pages are served at /, /fr/, /es/ (and /support, /signup,
   /login with the same prefixes). The server writes the translated text, <html lang>,
   title, description, canonical, hreflang alternates, Open Graph / Twitter cards
   and JSON-LD into the HTML, so search engines index every language.
   Private pages (survey, dashboard, hub, account flows, admin) get noindex.
   Configuration (env):
     PUBLIC_URL                  canonical origin, default https://wikigai.com (production)
     GOOGLE_SITE_VERIFICATION    Search Console token (optional)
     BING_SITE_VERIFICATION      Bing Webmaster token (optional)                    */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://wikigai.com').replace(/\/+$/, '');
const CANONICAL_HOST = new URL(PUBLIC_URL).hostname;
const BUILD_DATE = new Date().toISOString().slice(0, 10);

/* indexable pages: route → source file + dictionary keys */
const PAGES = {
  '/': { file: 'index.html', title: 'meta.landing', desc: 'meta.landingDesc', priority: '1.0', changefreq: 'weekly', jsonld: true },
  '/signup': { file: 'signup.html', title: 'meta.signup', desc: 'meta.signupDesc', priority: '0.8', changefreq: 'monthly' },
  '/support': { file: 'support.html', title: 'meta.support', desc: 'meta.supportDesc', priority: '0.6', changefreq: 'monthly' },
  '/login': { file: 'login.html', title: 'meta.login', desc: 'meta.loginDesc', priority: '0.3', changefreq: 'yearly' },
};
/* never indexed */
const PRIVATE_PREFIXES = ['/survey', '/dashboard', '/ikigai', '/learning', '/account', '/verify', '/forgot', '/reset', '/widget'];

let PUBLIC_DIR = null;
let LOCALES = ['en'];
const DICTS = {};
const fileCache = {};

function init(publicDir) {
  PUBLIC_DIR = publicDir;
  const runtime = fs.readFileSync(path.join(publicDir, 'assets/i18n/i18n.js'), 'utf8');
  LOCALES = [...runtime.matchAll(/\{\s*code:\s*'([a-z]{2})'/g)].map((m) => m[1]);
  LOCALES.forEach((code) => {
    const file = path.join(publicDir, `assets/i18n/locales/${code}/ui.js`);
    const ctx = { WK: { i18n: { register: (c, ns, data) => { if (ns === 'ui') DICTS[c] = data; } } } };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  });
}
const locales = () => LOCALES.slice();

function t(lang, key, vars) {
  const get = (d) => key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), d);
  let v = get(DICTS[lang]);
  if (v == null) v = get(DICTS.en);
  if (v == null || typeof v === 'object') return null;
  return String(v).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stripTags = (s) => String(s ?? '').replace(/<[^>]+>/g, '');

/* URL of a public page in a language: en → /signup, fr → /fr/signup, root → /fr/ */
function localPath(route, lang) {
  if (lang === 'en') return route;
  return route === '/' ? `/${lang}/` : `/${lang}${route}`;
}
/* parse /fr/support → { lang:'fr', route:'/support' } */
function matchPublic(p) {
  const m = p.match(/^\/([a-z]{2})(\/.*)?$/);
  if (m && LOCALES.includes(m[1]) && m[1] !== 'en') {
    const route = (m[2] || '/').replace(/\/+$/, '') || '/';
    return PAGES[route] ? { lang: m[1], route } : null;
  }
  const route = p.replace(/\/+$/, '') || '/';
  return PAGES[route] ? { lang: 'en', route } : null;
}
const isPrivate = (p) => PRIVATE_PREFIXES.some((x) => p === x || p.startsWith(x + '/') || p.startsWith(x + '?') || p.startsWith(x + '.'));

function readFile(file) {
  if (!fileCache[file] || process.env.NODE_ENV !== 'production') fileCache[file] = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
  return fileCache[file];
}

/* write dictionary text into data-i18n / data-i18n-html / data-i18n-attr elements */
function translateHtml(html, lang) {
  html = html.replace(/(<([a-z0-9]+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/gi, (all, open, tag, key, inner, close) => {
    const v = t(lang, key);
    return v == null ? all : open + esc(v) + close;
  });
  html = html.replace(/(<([a-z0-9]+)\b[^>]*\bdata-i18n-html="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/gi, (all, open, tag, key, inner, close) => {
    const v = t(lang, key);
    return v == null ? all : open + v + close;
  });
  html = html.replace(/<[a-z0-9]+\b[^>]*\bdata-i18n-attr="([^"]+)"[^>]*>/gi, (el, spec) => {
    let out = el;
    spec.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':').map((s) => s && s.trim());
      const v = attr && key ? t(lang, key) : null;
      if (v == null) return;
      const re = new RegExp(`(\\s${attr}=")[^"]*(")`);
      out = re.test(out) ? out.replace(re, `$1${esc(v)}$2`) : out.replace(/^<([a-z0-9]+)/i, `<$1 ${attr}="${esc(v)}"`);
    });
    return out;
  });
  return html;
}

/* point internal links of public pages at the same-language version */
function localizeLinks(html, lang) {
  if (lang === 'en') return html;
  return html.replace(/href="(\/(?:signup|support|login)?)"/g, (m, href) => `href="${localPath(href === '' ? '/' : href, lang)}"`);
}

function jsonLd(lang) {
  const data = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Wikigai', url: PUBLIC_URL + '/', inLanguage: LOCALES, description: stripTags(t(lang, 'meta.landingDesc')) },
    { '@context': 'https://schema.org', '@type': 'Organization', name: 'Wikigai', url: PUBLIC_URL + '/', logo: PUBLIC_URL + '/assets/brand/wikigai-mark.png' },
    {
      '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Wikigai', url: PUBLIC_URL + localPath('/', lang),
      applicationCategory: 'EducationalApplication', operatingSystem: 'Any', inLanguage: lang,
      description: stripTags(t(lang, 'meta.landingDesc')),
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    },
  ];
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function headTags(route, lang, page) {
  const self = PUBLIC_URL + localPath(route, lang);
  const title = t(lang, page.title) || 'Wikigai';
  const desc = stripTags(t(lang, page.desc) || t(lang, 'meta.landingDesc') || '');
  const ogLocale = { en: 'en_GB', fr: 'fr_FR', es: 'es_ES' };
  const alts = LOCALES.map((l) => `<link rel="alternate" hreflang="${l}" href="${PUBLIC_URL + localPath(route, l)}">`).join('\n')
    + `\n<link rel="alternate" hreflang="x-default" href="${PUBLIC_URL + localPath(route, 'en')}">`;
  const img = `${PUBLIC_URL}/assets/brand/og-${LOCALES.includes(lang) ? lang : 'en'}.png`;
  const tags = [
    `<meta name="robots" content="index, follow, max-image-preview:large">`,
    `<link rel="canonical" href="${self}">`,
    alts,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Wikigai">`,
    `<meta property="og:url" content="${self}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:image" content="${img}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:locale" content="${ogLocale[lang] || 'en_GB'}">`,
    ...LOCALES.filter((l) => l !== lang).map((l) => `<meta property="og:locale:alternate" content="${ogLocale[l] || l}">`),
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${img}">`,
    `<meta name="theme-color" content="#0a0a1a">`,
  ];
  if (process.env.GOOGLE_SITE_VERIFICATION) tags.push(`<meta name="google-site-verification" content="${esc(process.env.GOOGLE_SITE_VERIFICATION)}">`);
  if (process.env.BING_SITE_VERIFICATION) tags.push(`<meta name="msvalidate.01" content="${esc(process.env.BING_SITE_VERIFICATION)}">`);
  if (page.jsonld) tags.push(jsonLd(lang));
  return { tags: tags.join('\n'), title, desc };
}

/* full HTML of a public page in a language */
function renderPublic(route, lang) {
  const page = PAGES[route];
  let html = readFile(page.file);
  html = translateHtml(html, lang);
  html = localizeLinks(html, lang);
  const { tags, title, desc } = headTags(route, lang, page);
  html = html.replace(/<html lang="[^"]*"/i, `<html lang="${lang}"`);
  html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, (m) => m.replace(/>[\s\S]*?</, `>${esc(title)}<`));
  if (/<meta name="description"[^>]*>/i.test(html)) {
    html = html.replace(/(<meta name="description"[^>]*content=")[^"]*(")/i, `$1${esc(desc)}$2`);
  } else {
    html = html.replace(/<\/title>/i, `</title>\n<meta name="description" content="${esc(desc)}">`);
  }
  // right after <title>, so the tags exist before i18n.js runs (it reads hreflang links)
  html = html.replace(/<\/title>/i, `</title>\n${tags}`);
  return html;
}

/* private pages: add noindex to the HTML too (header is set by middleware) */
function renderPrivate(file) {
  return readFile(file).replace(/<head>/i, '<head>\n<meta name="robots" content="noindex, nofollow">');
}

function sitemap() {
  const urls = [];
  Object.entries(PAGES).forEach(([route, page]) => {
    LOCALES.forEach((lang) => {
      const alts = LOCALES.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${PUBLIC_URL + localPath(route, l)}"/>`).join('\n');
      urls.push(`  <url>\n    <loc>${PUBLIC_URL + localPath(route, lang)}</loc>\n    <lastmod>${BUILD_DATE}</lastmod>\n    <changefreq>${page.changefreq}</changefreq>\n    <priority>${page.priority}</priority>\n${alts}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${PUBLIC_URL + localPath(route, 'en')}"/>\n  </url>`);
    });
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
}

function robots() {
  return ['User-agent: *', 'Allow: /', ...PRIVATE_PREFIXES.map((p) => `Disallow: ${p}`), 'Disallow: /api/', '', `Sitemap: ${PUBLIC_URL}/sitemap.xml`, ''].join('\n');
}

/* Express wiring */
function mount(app, publicDir) {
  init(publicDir);
  // other hosts (survey.digitradin.cloud, raw IP…) must not compete with the canonical site
  app.use((req, res, next) => {
    if (req.hostname && req.hostname !== CANONICAL_HOST && !/^(localhost|127\.0\.0\.1)$/.test(req.hostname)) res.setHeader('X-Robots-Tag', 'noindex');
    if (isPrivate(req.path)) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  // one URL per page: send old .html addresses to the clean ones
  ['index', 'signup', 'support', 'login'].forEach((f) => app.get(`/${f}.html`, (req, res) => res.redirect(301, f === 'index' ? '/' : `/${f}`)));
  app.get('/sitemap.xml', (req, res) => res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(sitemap()));
  app.get('/robots.txt', (req, res) => res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(robots()));
  // public pages in every language — before static so "/" is rendered too
  app.get(/^\/(?:[a-z]{2}(?:\/.*)?|signup|support|login)?\/?$/, (req, res, next) => {
    const m = matchPublic(req.path);
    if (!m) return next();
    if (m.lang !== 'en' && req.path === `/${m.lang}`) return res.redirect(301, `/${m.lang}/` + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''));
    res.set('Content-Language', m.lang).set('Cache-Control', 'public, max-age=300').type('html').send(renderPublic(m.route, m.lang));
  });
}

module.exports = { mount, init, renderPublic, renderPrivate, sitemap, robots, matchPublic, isPrivate, localPath, PAGES, PRIVATE_PREFIXES, PUBLIC_URL, CANONICAL_HOST, locales };
