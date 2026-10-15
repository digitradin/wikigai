#!/usr/bin/env node
/* Wikigai i18n coverage check.        node tools/i18n/check.js [--strict]
   Fails (exit 1) when any locale is missing a UI key, a content string,
   a placeholder, or when code uses a key English does not define.
   --strict also fails on content entries left identical to English. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extract } = require('./extract-content');

const ROOT = path.join(__dirname, '../..');
const PUB = path.join(ROOT, 'frontend/public');
const I18N = path.join(PUB, 'assets/i18n');
const strict = process.argv.includes('--strict');
let errors = 0, warnings = 0;
const err = (m) => { errors++; console.log('  ✗ ' + m); };
const warn = (m) => { warnings++; console.log('  ! ' + m); };

/* registry: read the LOCALES list from i18n.js */
const runtime = fs.readFileSync(path.join(I18N, 'i18n.js'), 'utf8');
const codes = [...runtime.matchAll(/\{\s*code:\s*'([a-z]{2})'/g)].map((m) => m[1]);
const domains = JSON.parse(runtime.match(/CONTENT_DOMAINS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));

function loadLocaleFile(file) {
  const store = { ui: {}, content: {} };
  const ctx = { WK: { i18n: { register: (code, ns, data) => { if (ns === 'ui') store.ui = data; else Object.assign(store.content, data); } } } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  return store;
}
function flatten(o, pre = '', out = {}) {
  Object.keys(o).forEach((k) => {
    const v = o[k], key = pre ? pre + '.' + k : k;
    const plural = v && typeof v === 'object' && !Array.isArray(v) && 'other' in v && Object.keys(v).every((x) => ['zero', 'one', 'two', 'few', 'many', 'other'].includes(x));
    if (v && typeof v === 'object' && !Array.isArray(v) && !plural) flatten(v, key, out);
    else out[key] = v;
  });
  return out;
}
const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const tags = (s) => [...String(s).matchAll(/<\/?([a-z0-9]+)/gi)].map((m) => m[1].toLowerCase()).sort().join(',');
const strings = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [v]);

/* ── 1. UI dictionaries ── */
console.log(`Locales: ${codes.join(', ')}\n\n1. UI dictionaries`);
const en = flatten(loadLocaleFile(path.join(I18N, 'locales/en/ui.js')).ui);
console.log(`  en: ${Object.keys(en).length} keys (source)`);
codes.filter((c) => c !== 'en').forEach((code) => {
  const file = path.join(I18N, `locales/${code}/ui.js`);
  if (!fs.existsSync(file)) return err(`${code}: missing ${path.relative(ROOT, file)}`);
  const d = flatten(loadLocaleFile(file).ui);
  const miss = Object.keys(en).filter((k) => !(k in d));
  const extra = Object.keys(d).filter((k) => !(k in en));
  miss.forEach((k) => err(`${code}: missing key ${k}`));
  extra.forEach((k) => warn(`${code}: unknown key ${k} (not in en)`));
  Object.keys(en).filter((k) => k in d).forEach((k) => {
    const a = strings(en[k]), b = strings(d[k]);
    if (Array.isArray(en[k]) && a.length !== b.length) err(`${code}: ${k} has ${b.length} items, en has ${a.length}`);
    if (en[k] && typeof en[k] === 'object' && !Array.isArray(en[k]) && !(d[k] && typeof d[k] === 'object' && 'other' in d[k])) err(`${code}: ${k} must have plural forms { one, other }`);
    const ev = vars(a.join(' ')), dv = vars(b.join(' '));
    if (ev !== dv) err(`${code}: ${k} placeholders {${dv}} ≠ en {${ev}}`);
    if (tags(a[0]) !== tags(b[0])) warn(`${code}: ${k} HTML tags differ from en`);
    if (b.some((x) => typeof x !== 'string' || !x.trim())) err(`${code}: ${k} is empty`);
  });
  console.log(`  ${code}: ${Object.keys(d).length} keys — ${miss.length} missing`);
});

/* ── 2. keys used in code exist in English ── */
console.log('\n2. Keys used in pages and scripts');
const files = [];
(function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['i18n', 'brand'].includes(e.name)) walk(p); }
    else if (/\.(html|js)$/.test(e.name) && !/legacy|survey-data|survey-bank/.test(e.name)) files.push(p);
  });
})(PUB);
const used = new Set();
files.forEach((f) => {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\bT\(\s*'([a-zA-Z0-9_.]+)'\s*[,)]/g)) used.add(m[1] + '\u0000' + f);
  for (const m of s.matchAll(/data-i18n(?:-html)?="([a-zA-Z0-9_.]+)"/g)) used.add(m[1] + '\u0000' + f);
  for (const m of s.matchAll(/data-i18n-attr="([^"]+)"/g)) m[1].split(';').forEach((p) => { const k = (p.split(':')[1] || '').trim(); if (k) used.add(k + '\u0000' + f); });
  for (const m of s.matchAll(/T\(\s*[^,)]*\?\s*'([a-zA-Z0-9_.]+)'\s*:\s*'([a-zA-Z0-9_.]+)'/g)) { used.add(m[1] + '\u0000' + f); used.add(m[2] + '\u0000' + f); }
});
const enKeys = new Set(Object.keys(en));
const enPrefixes = new Set(Object.keys(en).flatMap((k) => k.split('.').map((_, i, a) => a.slice(0, i + 1).join('.'))));
let nUsed = 0;
[...used].forEach((u) => {
  const [k, f] = u.split('\u0000');
  nUsed++;
  if (!enKeys.has(k) && !enPrefixes.has(k)) err(`${path.relative(ROOT, f)} uses unknown key ${k}`);
});
console.log(`  ${files.length} files, ${nUsed} key uses checked`);

/* ── 3. content catalogs ── */
console.log('\n3. Content (survey questions, domains, professions…)');
const msgids = extract();
const total = Object.values(msgids).reduce((a, l) => a + l.length, 0);
console.log(`  source: ${total} strings in ${Object.keys(msgids).length} domains`);
codes.filter((c) => c !== 'en').forEach((code) => {
  let miss = 0, same = 0, orphan = 0, bad = 0;
  domains.forEach((dom) => {
    const file = path.join(I18N, `locales/${code}/content/${dom}.js`);
    if (!fs.existsSync(file)) { err(`${code}: missing ${path.relative(ROOT, file)}`); miss += (msgids[dom] || []).length; return; }
    const cat = loadLocaleFile(file).content;
    const ids = new Set(msgids[dom] || []);
    (msgids[dom] || []).forEach((id) => {
      if (!(id in cat)) { miss++; if (miss <= 25) err(`${code}/${dom}: missing "${id.slice(0, 70)}"`); }
      else if (typeof cat[id] !== 'string' || !cat[id].trim()) { bad++; err(`${code}/${dom}: empty "${id.slice(0, 70)}"`); }
      else if (cat[id] === id && /[a-z]{3,} [a-z]{3,}/.test(id)) { same++; if (strict) err(`${code}/${dom}: untranslated "${id.slice(0, 70)}"`); }
    });
    Object.keys(cat).forEach((id) => { if (!ids.has(id) && !id.includes('\u0004')) { orphan++; warn(`${code}/${dom}: not in source "${id.slice(0, 70)}"`); } });
  });
  if (miss > 25) err(`${code}: … ${miss - 25} more missing`);
  console.log(`  ${code}: ${total - miss}/${total} translated — ${miss} missing, ${same} same as English, ${orphan} orphan`);
});

/* ── 4. backend email dictionaries ── */
console.log('\n4. Backend (emails)');
const B = path.join(ROOT, 'backend/src/i18n/locales');
const benFlat = flatten(JSON.parse(fs.readFileSync(path.join(B, 'en.json'), 'utf8')));
const bSupported = (fs.readFileSync(path.join(ROOT, 'backend/src/i18n/index.js'), 'utf8').match(/SUPPORTED = \[([^\]]*)\]/)[1].match(/[a-z]{2}/g));
codes.forEach((c) => { if (!bSupported.includes(c)) err(`backend: ${c} is not in SUPPORTED (backend/src/i18n/index.js)`); });
codes.filter((c) => c !== 'en').forEach((code) => {
  const f = path.join(B, code + '.json');
  if (!fs.existsSync(f)) return err(`backend: missing ${path.relative(ROOT, f)}`);
  const d = flatten(JSON.parse(fs.readFileSync(f, 'utf8')));
  Object.keys(benFlat).forEach((k) => { if (!(k in d)) err(`backend ${code}: missing ${k}`); else if (vars(d[k]) !== vars(benFlat[k])) err(`backend ${code}: ${k} placeholders differ`); });
  console.log(`  ${code}: ${Object.keys(d).length}/${Object.keys(benFlat).length} keys`);
});

console.log(`\n${errors ? '✗' : '✓'} ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
