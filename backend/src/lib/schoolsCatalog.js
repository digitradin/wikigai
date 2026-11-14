/* Wikigai Schools — catalogue loader for the API (v20261114b).
   Reads backend/src/data/schools/catalog/*.json (one file per market + demo.json), built by
   tools/schools/import.js. Falls back to the old single demo file when no catalogue exists, so an
   older data folder keeps working. Env SCHOOLS_CATALOG_DIR overrides the folder (tests);
   SCHOOLS_DATA (old variable: one JSON file in the demo shape) is still honoured.
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

function load(opts = {}) {
  const dir = opts.dir || process.env.SCHOOLS_CATALOG_DIR || path.join(__dirname, '..', 'data', 'schools', 'catalog');
  const legacyFile = process.env.SCHOOLS_DATA || path.join(__dirname, '..', 'data', 'schools-demo.json');
  const all = [], aliases = {}, sources = {};
  let version = 'catalog';
  if (!process.env.SCHOOLS_DATA && fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.json'))) {
    // SCHOOLS_MARKETS=FR,ES,UK… loads only those markets (memory on small servers); default: every market file
    const want = process.env.SCHOOLS_MARKETS ? new Set(process.env.SCHOOLS_MARKETS.toLowerCase().split(',').map((x) => x.trim())) : null;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && (!want || x === 'demo.json' || want.has(x.replace('.json', '')))).sort()) {
      const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      (c.programmes || []).forEach((p) => all.push(strip(p)));
      Object.assign(aliases, c.aliases || {});
      if (c.sources) sources[c.market] = c.sources;
      if (c.generated && c.generated > version) version = c.generated;
    }
  } else {
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

module.exports = { load, LISTED, lowLast, completeness, DATA_KEYS };
