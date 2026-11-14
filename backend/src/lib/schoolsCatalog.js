/* Wikigai Schools — catalogue loader for the API (v20261114b).
   The course DB lives OUTSIDE the website, in <project>/schools-db (own pipeline, own schedule).
   Catalogue folder, first that has *.json:
     1. env SCHOOLS_CATALOG_DIR (servers, tests)
     2. <project>/schools-db/releases/current/catalog   (published release — what users see)
     3. <project>/schools-db/data/catalog               (working copy, local dev before a first publish)
     4. backend/src/data/schools/catalog                (snapshot bundled by the deploy script — servers)
   No catalogue → empty list (no demo courses). SCHOOLS_DATA=file.json (old demo shape) only when set.
   live(): same data, re-read automatically when a new release lands (checked every 60 s).
   A copy of this file is kept in schools-db/pipeline/contract/ — the DB tests run against it.
   Statuses: active (listed) · demo (listed, sample data, only where a market has no real data yet)
             inactive (no longer offered — kept for saved favourites) · retired (old demo record)
             merged (duplicate — resolves to its survivor through `aliases`). Ids are never deleted. */
'use strict';
const fs = require('fs');
const path = require('path');

const LISTED = new Set(['active', 'demo']);
const FX = { ES: { cur: 'EUR', fx: 1 }, FR: { cur: 'EUR', fx: 1 }, UK: { cur: 'GBP', fx: 1.17 }, IE: { cur: 'EUR', fx: 1 }, US: { cur: 'USD', fx: 0.92 }, MX: { cur: 'MXN', fx: 0.05 } };

function strip(p) { const o = { ...p }; delete o._obs; delete o._src; return o; }

/* v20261114b: how complete is a course? Share of the facts a student looks at that we actually know.
   Courses with LIMITED data (≤ 3 of these 11) always go to the bottom of every list (lowData). */
const DATA_KEYS = ['acceptance', 'tuition', 'livingCost', 'salaryY1', 'salaryY5', 'employment', 'scholarshipShare', 'capacity', 'applicants', 'durationYears', 'domain'];
const LOW_MAX = 3;
function completeness(p) {
  const n = DATA_KEYS.filter((k) => p[k] !== null && p[k] !== undefined && !Number.isNaN(p[k])).length;
  return { dataScore: +(n / DATA_KEYS.length).toFixed(2), lowData: n <= LOW_MAX };
}
/** wrap any sort: limited-data courses last, then the chosen order, then the more complete course first */
const TRUST = { official: 0, public: 1, unverified: 2 };
const lowLast = (cmp) => (a, b) => (a.lowData === b.lowData ? 0 : a.lowData ? 1 : -1) || cmp(a, b)
  || (TRUST[a.trust] ?? 3) - (TRUST[b.trust] ?? 3) || (b.dataScore || 0) - (a.dataScore || 0);   // ties: official first, then more complete

const hasJson = (d) => { try { return fs.readdirSync(d).some((f) => f.endsWith('.json')); } catch { return false; } };
function catalogDir() {
  const db = process.env.SCHOOLS_DB_DIR || path.join(__dirname, '..', '..', '..', '..', '..', 'schools-db');
  const bundled = path.join(__dirname, '..', 'data', 'schools', 'catalog');   // snapshot copied in at deploy time (servers)
  const cands = [process.env.SCHOOLS_CATALOG_DIR, path.join(db, 'releases', 'current', 'catalog'), path.join(db, 'data', 'catalog'), bundled].filter(Boolean);
  return cands.find(hasJson) || null;
}
/** newest mtime of the catalogue files — changes when a release is published */
function stampOf(dir) {
  if (!dir) return 'none';
  try { return dir + ':' + fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => fs.statSync(path.join(dir, f)).mtimeMs).sort().join(','); } catch { return 'none'; }
}

function load(opts = {}) {
  const dir = opts.dir || catalogDir();
  const legacyFile = process.env.SCHOOLS_DATA;
  const all = [], aliases = {}, sources = {};
  let version = 'catalog';
  if (!legacyFile && dir) {
    // SCHOOLS_MARKETS=FR,ES,UK… loads only those markets (memory on small servers); default: every market file
    const want = process.env.SCHOOLS_MARKETS ? new Set(process.env.SCHOOLS_MARKETS.toLowerCase().split(',').map((x) => x.trim())) : null;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && (!want || x === 'demo.json' || want.has(x.replace('.json', '')))).sort()) {
      const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      (c.programmes || []).forEach((p) => all.push(strip(p)));
      Object.assign(aliases, c.aliases || {});
      if (c.sources) sources[c.market] = c.sources;
      if (c.generated && c.generated > version) version = c.generated;
    }
  } else if (legacyFile) {
    const d = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
    d.programmes.forEach((p) => all.push({ ...p, demo: /demo/i.test(d.version || ''), status: 'demo' }));
    version = d.version || 'legacy';
  }
  // a demo programme never hides a real one with the same id (cannot happen with the id formats, but be safe)
  const BY_ID = new Map();
  all.forEach((p) => { Object.assign(p, completeness(p)); if (!BY_ID.has(p.id) || !p.demo) BY_ID.set(p.id, p); });
  const ITEMS = [...BY_ID.values()].filter((p) => LISTED.has(p.status || 'active'));
  const markets = [...new Set(ITEMS.map((p) => p.country))].sort();
  return {
    ITEMS, BY_ID, aliases, sources, version, markets, currencies: FX,
    /** follow merge aliases, then look up. → { id, item, listed, status } or null */
    resolve(id) {
      let cur = String(id || ''); const seen = new Set();
      while (aliases[cur] && !seen.has(cur)) { seen.add(cur); cur = aliases[cur]; }
      const item = BY_ID.get(cur);
      if (!item) return null;
      return { id: cur, item, status: item.status || 'active', listed: LISTED.has(item.status || 'active') };
    },
  };
}

/** hot-reloading catalogue: properties always point at the newest loaded snapshot.
    A broken release never replaces a good one (the error is logged, the old data keeps serving). */
function live({ prepare = () => {}, everyMs = Number(process.env.SCHOOLS_RELOAD_MS) || 60000 } = {}) {
  let cur = load(); prepare(cur);
  let stamp = stampOf(catalogDir()); let checked = Date.now();
  const refresh = () => {
    if (Date.now() - checked < everyMs || process.env.SCHOOLS_DATA) return;
    checked = Date.now();
    const s = stampOf(catalogDir()); if (s === stamp) return;
    try { const next = load(); prepare(next); cur = next; stamp = s; console.log(`[schools] catalogue reloaded · ${next.ITEMS.length} listed · ${next.version}`); }
    catch (e) { stamp = s; console.error('[schools] new catalogue rejected, keeping the previous one:', e.message); }
  };
  const api = {};
  ['ITEMS', 'BY_ID', 'aliases', 'sources', 'version', 'markets', 'currencies'].forEach((k) => Object.defineProperty(api, k, { enumerable: true, get() { refresh(); return cur[k]; } }));
  api.resolve = (id) => { refresh(); return cur.resolve(id); };
  api.reload = () => { checked = 0; stamp = 'force'; refresh(); return cur; };
  return api;
}

module.exports = { load, live, catalogDir, LISTED, lowLast, completeness, DATA_KEYS };
