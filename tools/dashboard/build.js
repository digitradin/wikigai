#!/usr/bin/env node
/* Builds the stand-alone Wikigai statistics page (one self-contained HTML file) for the
   Digitradin dashboard:  node tools/dashboard/build.js  →  deploy/dashboard/wikigai-stats.html
   Sources (this folder): template.html, stats-main.html, stats-page.js, stats-page.css, stats-i18n.json.
   The page talks to the Wikigai stats API with a token (see backend/src/routes/admin.js). */
'use strict';
const fs = require('fs');
const path = require('path');
const here = __dirname;
const read = (f) => fs.readFileSync(path.join(here, f), 'utf8');

let js = read('stats-page.js');
const patch = (from, to) => { if (!js.includes(from)) throw new Error('stats-page.js patch not found: ' + from.slice(0, 60)); js = js.replace(from, to); };
patch("  if (!Store.token) { location.href = '/login'; return; }\n", '');
patch("      if (err.status === 401) { Store.clear(); location.href = '/login'; return; }\n", "      if (err.status === 401 || err.status === 503 || err.status === 0) { if (window.__statsOpenConn) window.__statsOpenConn(); }\n");
patch("      data = await api('/api/admin/stats?days=' + days);\n", "      data = await api('/api/admin/stats?days=' + days);\n      if (window.__statsConnected) window.__statsConnected();\n");
patch("history.replaceState(null, '', '/admin?days=' + days)", "history.replaceState(null, '', location.pathname + '?days=' + days)");
patch("const base = location.origin.replace(", "const base = window.__statsBase().replace(");
patch("  I.ready.then(load);", "  window.__statsReload = load;\n  I.ready.then(() => { if (Store.token) load(); else { $('adMsg').className = 'ad-msg info'; $('adMsg').textContent = T('page.needToken'); } });");

const out = read('template.html')
  .replace('__STATS_CSS__', () => read('stats-page.css'))
  .replace('__MAIN__', () => read('stats-main.html'))
  .replace('__DICT__', () => JSON.stringify(JSON.parse(read('stats-i18n.json'))))
  .replace('__STATS_JS__', () => js);
const dest = path.join(here, '..', '..', 'deploy', 'dashboard', 'wikigai-stats.html');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log('built', path.relative(process.cwd(), dest), Math.round(out.length / 1024) + ' KB');
