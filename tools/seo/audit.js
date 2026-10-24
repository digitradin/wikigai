#!/usr/bin/env node
/* Wikigai SEO audit from the command line.
     BASE_URL=https://wikigai.digitradin.cloud node tools/seo/audit.js
     BASE_URL=http://localhost:3000 node tools/seo/audit.js --json
   Checks every public page in every language (title, description, canonical,
   hreflang, Open Graph, JSON-LD, h1, image alt…), the sitemap, robots.txt and
   the noindex on private pages. Exit code 1 if any error is found. */
'use strict';
const path = require('path');
const seo = require(path.join(__dirname, '..', '..', 'backend', 'src', 'seo'));
const { audit } = require(path.join(__dirname, '..', '..', 'backend', 'src', 'seo', 'audit'));
seo.init(path.join(__dirname, '..', '..', 'frontend', 'public')); // loads the languages (en, fr, es…)

const BASE = (process.env.BASE_URL || 'https://wikigai.digitradin.cloud').replace(/\/+$/, '');
const asJson = process.argv.includes('--json');

async function fetchPage(p) {
  const r = await fetch(BASE + p, { redirect: 'manual', headers: { 'User-Agent': 'WikigaiSEOAudit/1.0 (bot)' } });
  const headers = {}; r.headers.forEach((v, k) => { headers[k] = v; });
  return { status: r.status, headers, body: await r.text() };
}

audit(fetchPage, { publicUrl: process.env.PUBLIC_URL || BASE }).then((res) => {
  if (asJson) { console.log(JSON.stringify(res, null, 2)); process.exit(res.errors ? 1 : 0); }
  const icon = { ok: '✓', warn: '!', error: '✗' };
  console.log(`\nWikigai SEO audit — ${BASE}\n`);
  const byPage = {};
  res.checks.forEach((c) => { (byPage[c.page] = byPage[c.page] || []).push(c); });
  for (const [page, list] of Object.entries(byPage)) {
    const bad = list.filter((c) => !c.ok);
    console.log(`${bad.some((c) => c.level === 'error') ? '✗' : bad.length ? '!' : '✓'} ${page}  (${list.length - bad.length}/${list.length})`);
    bad.forEach((c) => console.log(`    ${icon[c.level]} ${c.check}${c.detail ? ' — ' + c.detail : ''}`));
  }
  console.log(`\nScore ${res.score}/100 · ${res.passed} passed · ${res.warnings} warnings · ${res.errors} errors\n`);
  process.exit(res.errors ? 1 : 0);
}).catch((e) => { console.error('audit failed:', e.message); process.exit(2); });
