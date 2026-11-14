// v20261114b — Schools with real open data + stable ids: API smoke test.
// Needs a running local Wikigai (EXPOSE_PINS=true) and DATABASE_URL of its database (to simulate a favourite saved
// before this release).   BASE_URL=http://127.0.0.1:8080 DATABASE_URL=… node backend/scripts/schools_realdata_smoke.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
let passed = 0, failed = 0;
const check = (n, c, x = '') => { if (c) { passed++; console.log(`  ✅ ${n}`); } else { failed++; console.log(`  ❌ ${n} ${x}`); } };
async function j(path, opts = {}) {
  const res = await fetch(BASE + path, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const text = await res.text(); let data = {}; try { data = JSON.parse(text); } catch { data = { text }; }
  return { status: res.status, data };
}
const GATED = ['tuition', 'tuitionIntl', 'livingCost', 'costYearEur', 'tuitionEur', 'salaryY1', 'salaryY5', 'salaryY1Eur', 'employment', 'acceptance', 'admission',
  'scholarshipShare', 'avgAward', 'intlPct', 'roiScore', 'paybackYears', 'confidence', 'match', 'why', 'applicants', 'capacity', 'admitted', 'femalePct', 'ranges', 'studentSize', 'trustBy', 'gradRate'];

console.log('\n▶ Schools real-data smoke —', BASE);
console.log('— public —');
const all = await j('/api/schools?limit=48');
check('public search 200', all.status === 200 && all.data.ok);
check('only real programmes listed: FR 79 + US 24 + UK 10 + DE 6, no demo', all.data.total === 79 + 24 + 10 + 6 && all.data.demo === false, all.data.total);
check('markets with data reported to the page', JSON.stringify(all.data.markets) === '["DE","FR","UK","US"]', JSON.stringify(all.data.markets));
check('every course carries a trust tag (official / public / unverified)', all.data.items.every((x) => ['official', 'public', 'unverified'].includes(x.trust)));
const de = await j('/api/schools?country=DE&limit=48');
check('Germany (DAAD) listed, all unverified', de.data.total === 6 && de.data.items.every((x) => x.trust === 'unverified' && x.links && x.links['dir.daad']), de.data.total);
const uk = await j('/api/schools?country=UK&limit=48');
check('UK (Whatuni, Studyportals, educations.com) listed, link-outs to the directory page', uk.data.total === 10 && uk.data.items.every((x) => x.links && Object.keys(x.links).some((k) => k.startsWith('dir.'))), uk.data.total);
check('no insight fields reach visitors (incl. new ones)', all.data.items.flatMap((it) => GATED.filter((k) => k in it)).length === 0);
const fr = await j('/api/schools?country=FR&limit=48');
check('France: 78 official + 1 Studyportals course, no DEMO', fr.data.total === 79 && fr.data.items.every((x) => x.demo === false), fr.data.total);
const aud = await j('/api/schools?country=FR&q=audencia');
check('Studyportals-only French course tagged unverified, link back to Studyportals', aud.data.total === 1 && aud.data.items[0].trust === 'unverified' && /mastersportal/.test(aud.data.items[0].links['dir.studyportals']), aud.data.total);
const es = await j('/api/schools?country=ES&limit=48');
check('Spain: demo courses removed (0 until official data is loaded)', es.data.total === 0, es.data.total);
check('every item carries lowData + dataScore', all.data.items.every((x) => typeof x.lowData === 'boolean' && typeof x.dataScore === 'number'));
check('limited-data courses are never above complete ones', all.data.items.every((x, i, a) => i === 0 || !(a[i - 1].lowData && !x.lowData)));
const dr = await j('/api/schools?country=FR&q=droit');
check('search "droit" in France finds the law licences', dr.data.total >= 4 && dr.data.items.some((x) => /Panthéon Sorbonne/.test(x.institution.name)), dr.data.total);
const bts = await j('/api/schools?country=FR&level=short');
check('new level "short" (BTS) filter', bts.data.total === 6 && bts.data.items.every((x) => x.level === 'short'), bts.data.total);
const band = await j('/api/schools?band=2&country=FR');
check('tuition band filter: unknown tuition is not promised as cheap', band.data.total === 0, band.data.total);
check('public items carry their official source', fr.data.items.every((x) => x.sources && x.sources[0] && x.sources[0].id.startsWith('fr.')));

console.log('— member —');
const email = `schools_real_${Date.now()}@example.com`;
const sol = await j('/api/captcha/_debug/solve');
const su = await j('/api/auth/signup', { method: 'POST', body: { email, password: 'Sunshine42', name: 'Test', captcha_id: sol.data.captcha_id, captcha_answer: sol.data.answer } });
const ver = await j('/api/auth/verify', { method: 'POST', body: { email, pin: su.data.dev_pin } });
const H = { Authorization: 'Bearer ' + ver.data.token };
check('member signed up', !!ver.data.token);
const law = await j('/api/schools?country=FR&q=droit&domains=LAW_GOV&careers=Lawyer&mine=Lawyer', { headers: H });
const p1 = law.data.items.find((x) => /Panthéon Sorbonne/.test(x.institution.name) && /^Licence - Droit$/.test(x.title));
check('Paris 1 Licence Droit: real 2025 access rate 11 %', p1 && p1.acceptance === 0.11, p1 && p1.acceptance);
check('… with the 2024–2025 range 11–15 %', p1 && JSON.stringify(p1.ranges.acceptance) === '[0.11,0.15]');
check('… tuition / salary unknown → null, not invented', p1 && p1.tuition === null && p1.salaryY1 === null && p1.roiScore === null);
check('match score is a number even with unknown ROI', law.data.items.every((x) => Number.isFinite(x.match)));
check('admission band from the real rate', p1 && p1.admission === 'reach');
const us = await j('/api/schools?country=US&sort=salary', { headers: H });
check('US sorted by real median earnings (year 1)', us.data.items.every((x, i, a) => i === 0 || (a[i - 1].salaryY1Eur ?? -1) >= (x.salaryY1Eur ?? -1)));
check('US insights from real values', us.data.insights && us.data.insights.medianSalaryY1Eur > 0 && us.data.insights.known.salary === 20);
const bu = us.data.items.find((x) => /Boston University/.test(x.institution.name) && /Computer Science/.test(x.title));
check('BU: official acceptance 11.11 % with directory range 11.1–13 %, per-figure trust', bu && bu.acceptance === 0.1111 && JSON.stringify(bu.ranges.acceptance) === '[0.111,0.13]' && bu.trustBy.acceptance === 'official' && bu.trustBy.livingCost === 'public');
check('BU: real cost of a year = tuition + living (both known)', bu && bu.livingCost === 19970 && bu.costYearEur === Math.round((bu.tuition + 19970) * 0.92));
const frIns = await j('/api/schools?country=FR', { headers: H });
check('FR insights: no fake cost/salary, real median acceptance', frIns.data.insights.medianCostYearEur === null && frIns.data.insights.medianSalaryY1Eur === null && frIns.data.insights.medianAcceptance > 0);
const sortCost = await j('/api/schools?sort=cost&limit=48', { headers: H });
check('cost sort: known costs first, unknown last', sortCost.status === 200 && sortCost.data.items[0].tuitionEur != null);

console.log('— favourites survive —');
check('save a real programme', (await j('/api/schools/saved', { method: 'POST', headers: H, body: { id: p1.id } })).status === 200);
check('a retired demo id cannot be newly saved', (await j('/api/schools/saved', { method: 'POST', headers: H, body: { id: 'fr-science_tech-sw' } })).status === 400);
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
// simulate favourites saved BEFORE this release: a France demo programme (now retired) + a Spain demo one (still listed)
await db.query(`INSERT INTO favorite_schools (user_id, program_id) SELECT user_id, x FROM favorite_schools, (VALUES ('fr-science_tech-sw'), ('es-health-mind')) v(x) WHERE program_id = $1 ON CONFLICT DO NOTHING`, [p1.id]);
await db.end();
const sv = await j('/api/schools/saved', { headers: H });
const old = sv.data.items.find((x) => x.id === 'fr-science_tech-sw');
check('old France demo favourite still in the shortlist', !!old, JSON.stringify(sv.data.ids));
check('… flagged listed:false / retired', old && old.listed === false && old.status === 'retired');
check('Spain demo favourite still in the shortlist, flagged no longer listed', sv.data.items.some((x) => x.id === 'es-health-mind' && x.listed === false && x.status === 'retired'));
check('real favourite listed with real data', sv.data.items.some((x) => x.id === p1.id && x.listed && x.acceptance === 0.11));
check('retired favourite can be removed', (await j('/api/schools/saved/remove', { method: 'POST', headers: H, body: { id: 'fr-science_tech-sw' } })).status === 200);
const sv2 = await j('/api/schools/saved', { headers: H });
check('shortlist updated', sv2.data.items.length === 2 && !sv2.data.ids.includes('fr-science_tech-sw'));
const st = await j('/api/schools?sort=salary&limit=48', { headers: H });
check('member sort by salary: limited-data courses still last', st.data.items.every((x, i, a) => i === 0 || !(a[i - 1].lowData && !x.lowData)));

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
