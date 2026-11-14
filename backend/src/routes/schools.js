/* Wikigai Schools — directory API (v20261112d → v20261114b).
   GET  /api/schools              search + filters. Works WITHOUT an account (public directory) — but
                                  then every insight (cost, salaries, employment, ROI, admission chance,
                                  scholarships, match) is REMOVED server-side, so the blurred cards in the
                                  public page cannot be "un-blurred" from the browser. With a valid session
                                  token (Bearer) the full record + personal match score is returned.
   GET  /api/schools/saved        the user's saved programmes (shortlist)            — members only
   POST /api/schools/saved        { id }  save                                         — members only
   POST /api/schools/saved/remove { id }  remove                                       — members only
   v20261114b — real data + stable ids:
   · Data: backend/src/data/schools/catalog/*.json (tools/schools/import.js: official open data, one file per
     market) + demo.json (the old fictional records, only listed for markets without real data yet).
     Loader: lib/schoolsCatalog.js. Old SCHOOLS_DATA=file.json still works.
   · Unknown values stay null (no estimates): every filter, sort, score and insight below is null-safe.
   · Saved programmes never break: merged ids follow their alias, courses no longer offered and retired demo
     records come back with listed:false (the shortlist shows them as "no longer listed"). */
'use strict';
const express = require('express');
const db = require('../lib/db');
const { verifySessionToken } = require('../lib/session');
const { requireUser } = require('./auth');
const catalog = require('../lib/schoolsCatalog');

const router = express.Router();
const CAT = catalog.load();
const ITEMS = CAT.ITEMS;
const BY_ID = CAT.BY_ID;

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const list = (v, max = 40) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, max);
const num = (v) => (v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const known = (v) => v !== null && v !== undefined && !Number.isNaN(v);
const band = (a) => (!known(a) ? null : a >= 0.7 ? 'safety' : a >= 0.3 ? 'target' : 'reach');
const fx = (p) => (CAT.currencies[p.country] || {}).fx || 1;
const toEur = (p, v) => (known(v) ? Math.round(v * fx(p)) : null);
const tuitionEur = (p) => (known(p.tuitionEur) ? p.tuitionEur : toEur(p, p.tuition));
const costEur = (p) => (known(p.costYearEur) ? p.costYearEur : tuitionEur(p));      // cost known so far
// search text per programme (all languages of the field + institution + city + careers)
ITEMS.forEach((p) => { const f = p.field || {}; p._txt = norm([p.title, f.en, f.es, f.fr, p.fieldNative, p.institution && p.institution.name, p.city, ...(p.careers || [])].join(' | ')); });

/* signed-in? (signature check only: the directory holds no personal data) */
function member(req) {
  const auth = req.headers.authorization || '';
  const payload = auth.startsWith('Bearer ') ? verifySessionToken(auth.slice(7)) : null;
  return !!(payload && payload.sub);
}

function publicView(p) {
  return {
    id: p.id, title: p.title, field: p.field, level: p.level, domain: p.domain, subfield: p.subfield,
    institution: { name: p.institution.name, kind: p.institution.kind, control: p.institution.control },
    country: p.country, city: p.city, durationYears: known(p.durationYears) ? p.durationYears : null, langs: p.langs || [], mode: p.mode || null,
    tuitionBand: known(p.tuitionBand) ? p.tuitionBand : null, careers: p.careers || [], currency: p.currency, locked: true,
    demo: !!p.demo, workStudy: !!p.workStudy, selective: p.selective == null ? null : p.selective, lowData: !!p.lowData, dataScore: p.dataScore ?? null,
    sources: p.sources || (p.demo ? [{ id: 'demo' }] : []), url: p.url || null,
    trust: p.trust || (p.demo ? null : 'official'), links: p.links || null,   // v20261114b: official / public / unverified
  };
}
function memberView(p, ctx) {
  const v = publicView(p);
  delete v.locked;
  Object.assign(v, {
    tuition: p.tuition ?? null, tuitionIntl: p.tuitionIntl ?? null, livingCost: p.livingCost ?? null, costYearEur: p.costYearEur ?? null,
    tuitionEur: tuitionEur(p), salaryY1: p.salaryY1 ?? null, salaryY5: p.salaryY5 ?? null, salaryY1Eur: known(p.salaryY1Eur) ? p.salaryY1Eur : toEur(p, p.salaryY1),
    employment: p.employment ?? null, acceptance: p.acceptance ?? null, admission: band(p.acceptance),
    scholarshipShare: p.scholarshipShare ?? null, avgAward: p.avgAward ?? null, intlPct: p.intlPct ?? null,
    roiScore: p.roiScore ?? null, paybackYears: p.paybackYears ?? null, confidence: p.confidence || null,
    applicants: p.applicants ?? null, capacity: p.capacity ?? null, admitted: p.admitted ?? null, femalePct: p.femalePct ?? null,
    studentSize: p.studentSize ?? null, ranges: p.ranges || null, editions: p.editions || null, scope: p.scope || null,
    durationBasis: p.durationBasis || null, langsBasis: p.langsBasis || null, dq: p.dq || null,
    trustBy: p.trustBy || null, gradRate: p.gradRate ?? null,
  });
  if (ctx) {
    const sel = new Set(ctx.careers), mine = new Set(ctx.mine), doms = new Set(ctx.domains);
    const cs = p.careers || [];
    const hit = cs.filter((c) => sel.has(c));
    const near = cs.filter((c) => mine.has(c) && !sel.has(c));
    // weighted mean over the parts we KNOW (unknown ROI / admission are left out, not counted as 0)
    const parts = [[0.45, hit.length ? 1 : near.length ? 0.55 : 0], [0.15, doms.has(p.domain) ? 1 : 0]];
    if (known(p.roiScore)) parts.push([0.25, p.roiScore / 100]);
    if (known(p.acceptance)) parts.push([0.15, Math.min(1, p.acceptance * 1.3)]);
    const w = parts.reduce((s, [a]) => s + a, 0);
    v.match = Math.round((100 * parts.reduce((s, [a, b]) => s + a * b, 0)) / w);
    v.why = { careers: hit.length ? hit : near.slice(0, 3), exact: !!hit.length };
  }
  return v;
}

/* GET /api/schools */
router.get('/', (req, res) => {
  const isMember = member(req);
  const q = norm(req.query.q).slice(0, 80);
  const qCareers = new Set(list(req.query.qc, 60));                 // careers whose LOCAL name matched the words (sent by the page)
  const countries = new Set(list(req.query.country).map((x) => x.toUpperCase()));
  const levels = new Set(list(req.query.level));
  const control = String(req.query.control || '');
  const langs = new Set(list(req.query.lang));
  const modes = new Set(list(req.query.mode));
  const maxCost = num(req.query.maxCost);                           // € per year (members) / tuition band (everyone)
  const tband = num(req.query.band);
  // members-only filters & sorts (ignored for visitors — the page shows them with a lock)
  const careers = isMember ? list(req.query.careers) : [];
  const domains = list(req.query.domains);   // v20261114: areas filter for visitors too (a fact); professions stay members-only
  const mine = isMember ? list(req.query.mine, 60) : [];
  const within = isMember && req.query.within === '1';
  const notCareers = new Set(isMember ? list(req.query.notCareers) : []);
  const minRoi = isMember ? num(req.query.minRoi) : null;
  const minEmp = isMember ? num(req.query.minEmp) : null;
  const admission = isMember ? new Set(list(req.query.admission)) : new Set();
  const scholar = isMember && req.query.scholar === '1';
  let sort = String(req.query.sort || (isMember && (careers.length || domains.length) ? 'match' : 'relevance'));
  if (!isMember && !['relevance', 'cost', 'name'].includes(sort)) sort = 'relevance';

  const words = q ? q.split(/\s+/).filter((w) => w.length > 1) : [];
  const selCareers = new Set(careers), selDomains = new Set(domains);
  const domWithCareer = new Set(ITEMS.filter((p) => (p.careers || []).some((c) => selCareers.has(c))).map((p) => p.domain));
  const lvl = (p) => (p.level === 'mba' ? 'master' : p.level);

  // an active filter on a value we don't know excludes the programme (we can't promise it matches)
  const baseOk = (p) => {
    if (countries.size && !countries.has(p.country)) return false;
    if (levels.size && !levels.has(lvl(p)) && !levels.has(p.level)) return false;
    if (control && p.institution.control !== control) return false;
    if (langs.size && !(p.langs || []).some((l) => langs.has(l))) return false;
    if (modes.size && !modes.has(p.mode)) return false;
    if (tband && !(known(p.tuitionBand) && p.tuitionBand <= tband)) return false;
    if (isMember && maxCost != null && !(known(costEur(p)) && costEur(p) <= maxCost)) return false;
    if (minRoi != null && !(known(p.roiScore) && p.roiScore >= minRoi)) return false;
    if (minEmp != null && !(known(p.employment) && p.employment * 100 >= minEmp)) return false;
    if (admission.size && !admission.has(band(p.acceptance))) return false;
    if (scholar && !(known(p.scholarshipShare) && p.scholarshipShare >= 0.25)) return false;
    if (words.length || qCareers.size) {
      const textHit = words.length && words.every((w) => p._txt.includes(w));
      const careerHit = (p.careers || []).some((c) => qCareers.has(c));
      if (!textHit && !careerHit) return false;
    }
    return true;
  };
  let rows = ITEMS.filter((p) => {
    if (!baseOk(p)) return false;
    if (notCareers.size && (p.careers || []).some((c) => notCareers.has(c))) return false;
    if (within) {
      if (selDomains.size && !selDomains.has(p.domain)) return false;
      if (selCareers.size && !(p.careers || []).some((c) => selCareers.has(c))) return false;
      return true;
    }
    if (selCareers.size || selDomains.size) {
      const byCareer = (p.careers || []).some((c) => selCareers.has(c));
      const byDomain = selDomains.has(p.domain) && !domWithCareer.has(p.domain);
      if (!byCareer && !byDomain) return false;
    }
    return true;
  });

  const facets = { country: {}, level: {}, domain: {} };
  rows.forEach((p) => { facets.country[p.country] = (facets.country[p.country] || 0) + 1; const l = lvl(p); facets.level[l] = (facets.level[l] || 0) + 1; if (p.domain) facets.domain[p.domain] = (facets.domain[p.domain] || 0) + 1; });
  if (within && mine.length) {
    facets.career = {}; facets.area = 0;
    const want = new Set(mine);
    ITEMS.forEach((p) => {
      if (!baseOk(p) || (selDomains.size && !selDomains.has(p.domain))) return;
      facets.area += 1;
      (p.careers || []).forEach((c) => { if (want.has(c)) facets.career[c] = (facets.career[c] || 0) + 1; });
    });
  }

  const ctx = isMember ? { careers, domains, mine } : null;
  let views = rows.map((p) => (isMember ? memberView(p, ctx) : publicView(p)));
  const rel = (v) => { const p = BY_ID.get(v.id); return (words.length && norm(p.title).includes(words[0]) ? 2 : 0) + ((p.careers || []).some((c) => qCareers.has(c)) ? 1 : 0) + (p.demo ? 0 : 0.5); };
  const desc = (k) => (a, b) => (known(b[k]) ? b[k] : -Infinity) - (known(a[k]) ? a[k] : -Infinity);   // unknown last
  const asc = (f) => (a, b) => { const x = f(a), y = f(b); return (known(x) ? x : Infinity) - (known(y) ? y : Infinity); };
  const sorters = {
    match: (a, b) => (b.match || 0) - (a.match || 0) || desc('roiScore')(a, b),
    roi: desc('roiScore'),
    salary: desc('salaryY1Eur'),
    cost: isMember ? (a, b) => asc((v) => (known(v.costYearEur) ? v.costYearEur : v.tuitionEur))(a, b) || a.title.localeCompare(b.title)
      : (a, b) => asc((v) => v.tuitionBand)(a, b) || a.title.localeCompare(b.title),
    name: (a, b) => a.title.localeCompare(b.title),
    relevance: (a, b) => rel(b) - rel(a) || a.country.localeCompare(b.country) || a.title.localeCompare(b.title),
  };
  // v20261114b: courses with limited data always at the bottom, whatever the sort
  const chosen = sorters[sort] || sorters.relevance;
  views.sort(catalog.lowLast((a, b) => { const r = chosen(a, b); return Number.isNaN(r) ? 0 : r; }));

  let insights = null;
  if (isMember && rows.length) {
    const vals = (f) => rows.map(f).filter(known);
    const med = (arr) => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const withRoi = rows.filter((p) => known(p.roiScore));
    const best = withRoi.sort((a, b) => b.roiScore - a.roiScore)[0];
    const emp = vals((p) => p.employment);
    insights = {
      medianCostYearEur: med(vals(costEur)),
      avgEmployment: emp.length ? Math.round((100 * emp.reduce((s, x) => s + x, 0)) / emp.length) : null,
      medianSalaryY1Eur: med(vals((p) => (known(p.salaryY1Eur) ? p.salaryY1Eur : toEur(p, p.salaryY1)))),
      medianAcceptance: med(vals((p) => p.acceptance)),
      bestRoi: best ? { id: best.id, title: best.title, institution: best.institution.name, roiScore: best.roiScore } : null,
      withScholarships: rows.filter((p) => known(p.scholarshipShare) && p.scholarshipShare >= 0.25).length,
      known: { cost: vals(costEur).length, salary: vals((p) => p.salaryY1).length, employment: emp.length, total: rows.length },
    };
  }

  const offset = Math.max(0, Math.min(5000, num(req.query.offset) || 0));
  const limit = Math.max(1, Math.min(48, num(req.query.limit) || 12));
  const page = views.slice(offset, offset + limit);
  res.set('Cache-Control', isMember ? 'private, no-store' : 'public, max-age=300');
  res.set('Vary', 'Authorization');
  res.json({ ok: true, demo: page.some((v) => v.demo), member: isMember, total: views.length, offset, items: page, facets, insights, sort, markets: CAT.markets, version: CAT.version });
});

/* saved programmes (shortlist) — never loses a saved id: aliases are followed, unlisted ones are flagged */
router.get('/saved', async (req, res, next) => {
  try {
    const user = await requireUser(req, res); if (!user) return;
    const rows = await db.getAll('SELECT program_id, created_at FROM favorite_schools WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200', [user.id]);
    const items = [];
    const seen = new Set();
    rows.forEach((r) => {
      const hit = CAT.resolve(r.program_id);
      if (!hit || seen.has(hit.id)) return;
      seen.add(hit.id);
      items.push(Object.assign(memberView(hit.item, null), { savedId: r.program_id, listed: hit.listed, status: hit.status }));
    });
    res.set('Cache-Control', 'private, no-store');
    // ids: what the user saved AND what it resolves to, so "★ Saved" lights up on the current card too
    res.json({ ok: true, ids: [...new Set([...rows.map((r) => r.program_id), ...seen])], items });
  } catch (err) { next(err); }
});
router.post('/saved', async (req, res, next) => {
  try {
    const user = await requireUser(req, res); if (!user) return;
    const hit = CAT.resolve(String((req.body || {}).id || ''));
    if (!hit || !hit.listed) return res.status(400).json({ error: 'Unknown programme', code: 'BAD_ID' });
    const n = await db.getOne('SELECT COUNT(*)::int AS n FROM favorite_schools WHERE user_id = $1', [user.id]);
    if (n && n.n >= 200) return res.status(400).json({ error: 'Shortlist is full (200)', code: 'FULL' });
    await db.query('INSERT INTO favorite_schools (user_id, program_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.id, hit.id]);
    res.json({ ok: true, id: hit.id });
  } catch (err) { next(err); }
});
router.post('/saved/remove', async (req, res, next) => {
  try {
    const user = await requireUser(req, res); if (!user) return;
    const id = String((req.body || {}).id || '');
    const hit = CAT.resolve(id);
    const target = hit ? hit.id : id;
    // the user sees ONE card per programme: remove every saved id that resolves to it (old aliases included)
    const rows = await db.getAll('SELECT program_id FROM favorite_schools WHERE user_id = $1', [user.id]);
    const ids = rows.map((r) => r.program_id).filter((x) => x === id || x === target || ((CAT.resolve(x) || {}).id === target));
    for (const x of ids) await db.query('DELETE FROM favorite_schools WHERE user_id = $1 AND program_id = $2', [user.id, x]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
