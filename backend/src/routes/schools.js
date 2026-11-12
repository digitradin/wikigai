/* Wikigai Schools — directory API (v20261112d).
   GET  /api/schools              search + filters. Works WITHOUT an account (public directory) — but
                                  then every insight (cost, salaries, employment, ROI, admission chance,
                                  scholarships, match) is REMOVED server-side, so the blurred cards in the
                                  public page cannot be "un-blurred" from the browser. With a valid session
                                  token (Bearer) the full record + personal match score is returned.
   GET  /api/schools/saved        the user's saved programmes (shortlist)            — members only
   POST /api/schools/saved        { id }  save                                         — members only
   POST /api/schools/saved/remove { id }  remove                                       — members only
   Data: backend/src/data/schools-demo.json (DEMO: fictional "Demo" institutions, illustrative figures;
   rebuilt by tools/schools/build-demo.js). SCHOOLS_DATA=/path/file.json swaps in another dataset. */
'use strict';
const express = require('express');
const path = require('path');
const db = require('../lib/db');
const { verifySessionToken } = require('../lib/session');
const { requireUser } = require('./auth');

const router = express.Router();
const DATA = require(process.env.SCHOOLS_DATA || path.join(__dirname, '..', 'data', 'schools-demo.json'));
const ITEMS = DATA.programmes;
const BY_ID = new Map(ITEMS.map((p) => [p.id, p]));
const DEMO = /demo/i.test(DATA.version || '');

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const list = (v, max = 40) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, max);
const num = (v) => (v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const band = (a) => (a >= 0.7 ? 'safety' : a >= 0.3 ? 'target' : 'reach');
const toEur = (p, v) => Math.round(v * ((DATA.currencies[p.country] || {}).fx || 1));
// search text per programme (all languages of the field + institution + city + careers)
ITEMS.forEach((p) => { p._txt = norm([p.title, p.field.en, p.field.es, p.field.fr, p.institution.name, p.city, ...p.careers].join(' | ')); });

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
    country: p.country, city: p.city, durationYears: p.durationYears, langs: p.langs, mode: p.mode,
    tuitionBand: p.tuitionBand, careers: p.careers, currency: p.currency, locked: true,
  };
}
function memberView(p, ctx) {
  const v = publicView(p);
  delete v.locked;
  Object.assign(v, {
    tuition: p.tuition, tuitionIntl: p.tuitionIntl, livingCost: p.livingCost, costYearEur: p.costYearEur,
    tuitionEur: toEur(p, p.tuition), salaryY1: p.salaryY1, salaryY5: p.salaryY5, salaryY1Eur: toEur(p, p.salaryY1),
    employment: p.employment, acceptance: p.acceptance, admission: band(p.acceptance),
    scholarshipShare: p.scholarshipShare, avgAward: p.avgAward, intlPct: p.intlPct,
    roiScore: p.roiScore, paybackYears: p.paybackYears, confidence: p.confidence,
  });
  if (ctx) {
    const sel = new Set(ctx.careers), mine = new Set(ctx.mine), doms = new Set(ctx.domains);
    const hit = p.careers.filter((c) => sel.has(c));
    const near = p.careers.filter((c) => mine.has(c) && !sel.has(c));
    const careerFit = hit.length ? 1 : near.length ? 0.55 : 0;
    const domainFit = doms.has(p.domain) ? 1 : 0;
    const admit = Math.min(1, p.acceptance * 1.3);
    v.match = Math.round(100 * (0.45 * careerFit + 0.15 * domainFit + 0.25 * (p.roiScore / 100) + 0.15 * admit));
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
  const maxCost = num(req.query.maxCost);                           // € per year, tuition + living (members) / tuition band (everyone)
  const tband = num(req.query.band);
  // members-only filters & sorts (ignored for visitors — the page shows them with a lock)
  const careers = isMember ? list(req.query.careers) : [];
  const domains = isMember ? list(req.query.domains) : [];
  const mine = isMember ? list(req.query.mine, 60) : [];
  const minRoi = isMember ? num(req.query.minRoi) : null;
  const minEmp = isMember ? num(req.query.minEmp) : null;
  const admission = isMember ? new Set(list(req.query.admission)) : new Set();
  const scholar = isMember && req.query.scholar === '1';
  let sort = String(req.query.sort || (isMember && (careers.length || domains.length) ? 'match' : 'relevance'));
  if (!isMember && !['relevance', 'cost', 'name'].includes(sort)) sort = 'relevance';

  const words = q ? q.split(/\s+/).filter((w) => w.length > 1) : [];
  const selCareers = new Set(careers), selDomains = new Set(domains);
  const domWithCareer = new Set(ITEMS.filter((p) => p.careers.some((c) => selCareers.has(c))).map((p) => p.domain));

  let rows = ITEMS.filter((p) => {
    if (countries.size && !countries.has(p.country)) return false;
    if (levels.size && !levels.has(p.level === 'mba' ? 'master' : p.level) && !levels.has(p.level)) return false;
    if (control && p.institution.control !== control) return false;
    if (langs.size && !p.langs.some((l) => langs.has(l))) return false;
    if (modes.size && !modes.has(p.mode)) return false;
    if (tband && p.tuitionBand > tband) return false;
    if (isMember && maxCost != null && p.costYearEur > maxCost) return false;
    if (minRoi != null && p.roiScore < minRoi) return false;
    if (minEmp != null && p.employment * 100 < minEmp) return false;
    if (admission.size && !admission.has(band(p.acceptance))) return false;
    if (scholar && p.scholarshipShare < 0.25) return false;
    // members: chosen professions, or a chosen area that has no chosen profession in it
    if (selCareers.size || selDomains.size) {
      const byCareer = p.careers.some((c) => selCareers.has(c));
      const byDomain = selDomains.has(p.domain) && !domWithCareer.has(p.domain);
      if (!byCareer && !byDomain) return false;
    }
    if (words.length || qCareers.size) {
      const textHit = words.length && words.every((w) => p._txt.includes(w));
      const careerHit = p.careers.some((c) => qCareers.has(c));
      if (!textHit && !careerHit) return false;
    }
    return true;
  });

  const facets = { country: {}, level: {} };
  rows.forEach((p) => { facets.country[p.country] = (facets.country[p.country] || 0) + 1; const l = p.level === 'mba' ? 'master' : p.level; facets.level[l] = (facets.level[l] || 0) + 1; });

  const ctx = isMember ? { careers, domains, mine } : null;
  let views = rows.map((p) => (isMember ? memberView(p, ctx) : publicView(p)));
  const rel = (v) => { const p = BY_ID.get(v.id); return (words.length && norm(p.title).includes(words[0]) ? 2 : 0) + (p.careers.some((c) => qCareers.has(c)) ? 1 : 0); };
  const sorters = {
    match: (a, b) => (b.match || 0) - (a.match || 0) || b.roiScore - a.roiScore,
    roi: (a, b) => b.roiScore - a.roiScore,
    salary: (a, b) => b.salaryY1Eur - a.salaryY1Eur,
    cost: isMember ? (a, b) => a.costYearEur - b.costYearEur : (a, b) => a.tuitionBand - b.tuitionBand || a.title.localeCompare(b.title),
    name: (a, b) => a.title.localeCompare(b.title),
    relevance: (a, b) => rel(b) - rel(a) || a.country.localeCompare(b.country) || a.title.localeCompare(b.title),
  };
  views.sort(sorters[sort] || sorters.relevance);

  let insights = null;
  if (isMember && rows.length) {
    const med = (arr) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const best = rows.slice().sort((a, b) => b.roiScore - a.roiScore)[0];
    insights = {
      medianCostYearEur: med(rows.map((p) => p.costYearEur)),
      avgEmployment: Math.round((100 * rows.reduce((s, p) => s + p.employment, 0)) / rows.length),
      medianSalaryY1Eur: med(rows.map((p) => toEur(p, p.salaryY1))),
      bestRoi: { id: best.id, title: best.title, institution: best.institution.name, roiScore: best.roiScore },
      withScholarships: rows.filter((p) => p.scholarshipShare >= 0.25).length,
    };
  }

  const offset = Math.max(0, Math.min(1000, num(req.query.offset) || 0));
  const limit = Math.max(1, Math.min(48, num(req.query.limit) || 12));
  res.set('Cache-Control', isMember ? 'private, no-store' : 'public, max-age=300');
  res.set('Vary', 'Authorization');
  res.json({ ok: true, demo: DEMO, member: isMember, total: views.length, offset, items: views.slice(offset, offset + limit), facets, insights, sort, markets: DATA.markets });
});

/* saved programmes (shortlist) */
router.get('/saved', async (req, res, next) => {
  try {
    const user = await requireUser(req, res); if (!user) return;
    const rows = await db.getAll('SELECT program_id, created_at FROM favorite_schools WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200', [user.id]);
    res.set('Cache-Control', 'private, no-store');
    res.json({ ok: true, ids: rows.map((r) => r.program_id), items: rows.map((r) => BY_ID.get(r.program_id)).filter(Boolean).map((p) => memberView(p, null)) });
  } catch (err) { next(err); }
});
router.post('/saved', async (req, res, next) => {
  try {
    const user = await requireUser(req, res); if (!user) return;
    const id = String((req.body || {}).id || '');
    if (!BY_ID.has(id)) return res.status(400).json({ error: 'Unknown programme', code: 'BAD_ID' });
    const n = await db.getOne('SELECT COUNT(*)::int AS n FROM favorite_schools WHERE user_id = $1', [user.id]);
    if (n && n.n >= 200) return res.status(400).json({ error: 'Shortlist is full (200)', code: 'FULL' });
    await db.query('INSERT INTO favorite_schools (user_id, program_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.id, id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
router.post('/saved/remove', async (req, res, next) => {
  try {
    const user = await requireUser(req, res); if (!user) return;
    await db.query('DELETE FROM favorite_schools WHERE user_id = $1 AND program_id = $2', [user.id, String((req.body || {}).id || '')]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
