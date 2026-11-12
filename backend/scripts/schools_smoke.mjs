// v20261112d — Schools directory smoke test (public gating, member data, filters, shortlist, pages, SEO).
// Needs a running local Wikigai with EXPOSE_PINS=true.   BASE_URL=http://127.0.0.1:8080 node backend/scripts/schools_smoke.mjs
// Prints the test user's token on the last line (TOKEN=…) so the browser screenshots can reuse it.
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
let passed = 0, failed = 0;
const check = (n, c, x = '') => { if (c) { passed++; console.log(`  ✅ ${n}`); } else { failed++; console.log(`  ❌ ${n} ${x}`); } };
async function j(path, opts = {}) {
  const res = await fetch(BASE + path, { method: opts.method || 'GET', redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = {}; const text = await res.text(); try { data = JSON.parse(text); } catch { data = { text }; }
  return { status: res.status, data, headers: res.headers };
}
const GATED = ['tuition', 'tuitionIntl', 'livingCost', 'costYearEur', 'tuitionEur', 'salaryY1', 'salaryY5', 'salaryY1Eur', 'employment', 'acceptance',
  'admission', 'scholarshipShare', 'avgAward', 'intlPct', 'roiScore', 'paybackYears', 'confidence', 'match', 'why'];

console.log('\n▶ Schools smoke —', BASE);
console.log('— public (no account) —');
const pub = await j('/api/schools?limit=48');
check('public search 200', pub.status === 200 && pub.data.ok);
check('192 demo programmes, demo flag on', pub.data.total === 192 && pub.data.demo === true, pub.data.total);
const leaked = pub.data.items.flatMap((it) => GATED.filter((k) => k in it));
check('NO insight fields sent to visitors (server-side gating)', leaked.length === 0, leaked.join(','));
check('every public item is marked locked', pub.data.items.every((it) => it.locked === true));
check('no aggregate insights for visitors', pub.data.insights === null);
check('public response is cacheable', /public/.test(pub.headers.get('cache-control') || ''));
const pubSort = await j('/api/schools?sort=roi');
check('members-only sort ignored for visitors', pubSort.data.sort === 'relevance');
const pubRoi = await j('/api/schools?minRoi=95&careers=UX%20Designer');
check('members-only filters ignored for visitors', pubRoi.data.total === 192, pubRoi.data.total);
const q1 = await j('/api/schools?q=madrid');
check('text search "madrid" finds Madrid programmes only', q1.data.total > 0 && q1.data.items.every((x) => x.city === 'Madrid'), q1.data.total);
const q2 = await j('/api/schools?q=dise%C3%B1ador&qc=UX%20Designer,Product%20Designer');
check('localized career words (qc) find UX programmes', q2.data.total >= 6 && q2.data.items.every((x) => x.subfield === 'CREATIVE.DIG' || /dise/i.test(x.title)), q2.data.total);
const f1 = await j('/api/schools?country=IE,MX&level=master');
check('country + level filters', f1.data.total > 0 && f1.data.items.every((x) => ['IE', 'MX'].includes(x.country) && ['master', 'mba'].includes(x.level)), f1.data.total);
check('facets by country', Object.keys(f1.data.facets.country).every((c) => ['IE', 'MX'].includes(c)));
const f2 = await j('/api/schools?control=private&band=2');
check('control + tuition band', f2.data.items.every((x) => x.institution.control === 'private' && x.tuitionBand <= 2), f2.data.total);
const sav = await j('/api/schools/saved');
check('shortlist needs an account', sav.status === 401);

console.log('— pages & SEO —');
for (const p of ['/schools', '/fr/schools', '/es/schools']) {
  const r = await j(p);
  check(`${p} renders 200`, r.status === 200 && /id="schPublic"/.test(r.data.text || ''));
  check(`${p} is noindex while on demo data`, /<meta name="robots" content="noindex, follow">/.test(r.data.text || ''));
}
const fr = await j('/fr/schools');
check('/fr/schools is translated server-side', /Trouve l’école qui mène à/.test(fr.data.text || '') && /<html lang="fr"/.test(fr.data.text || ''));
check('/fr/schools has hreflang alternates', /hreflang="es" href="[^"]*\/es\/schools"/.test(fr.data.text || ''));
const sm = await j('/sitemap.xml');
check('sitemap leaves out /schools while on demo data', !/\/schools/.test(sm.data.text || ''));
const old = await j('/schools.html');
check('/schools.html → 301 /schools', old.status === 301);
const lr = await j('/learning/schools');
check('/learning/schools needs a session (redirect to login)', lr.status === 302 && /\/login\?next=%2Flearning%2Fschools/.test(lr.headers.get('location') || ''));

console.log('— member —');
const email = `schools_${Date.now()}@example.com`, PASSWORD = 'Sunshine42';
const sol = await j('/api/captcha/_debug/solve');
const su = await j('/api/auth/signup', { method: 'POST', body: { email, password: PASSWORD, name: 'Lucía', captcha_id: sol.data.captcha_id, captcha_answer: sol.data.answer } });
const ver = await j('/api/auth/verify', { method: 'POST', body: { email, pin: su.data.dev_pin } });
const token = ver.data.token;
check('test member signed up + verified', !!token, JSON.stringify(su.data).slice(0, 120));
const H = { Authorization: 'Bearer ' + token };
// a realistic path: Creative first, then Science & Tech, Business; UX Designer is the top profession
const s1 = { ranked: [['CREATIVE', 82], ['SCIENCE_TECH', 74], ['BUSINESS', 61], ['SOCIAL', 48], ['HEALTH', 40], ['LAW_GOV', 35], ['BUILT_ENV', 33], ['NATURE', 30]].map(([area, score]) => ({ area, score })) };
const love = [['UX Designer', 'CREATIVE', 'CREATIVE.DIG', 92], ['Product Designer', 'CREATIVE', 'CREATIVE.DIG', 88], ['Software Engineer', 'SCIENCE_TECH', 'SCIENCE_TECH.SW', 80],
  ['Game Designer', 'CREATIVE', 'CREATIVE.DIG', 76], ['Data Scientist', 'SCIENCE_TECH', 'SCIENCE_TECH.DATA', 70], ['Brand Designer', 'CREATIVE', 'CREATIVE.VIS', 66],
  ['Motion Designer', 'CREATIVE', 'CREATIVE.FILM', 60], ['Marketing Manager', 'BUSINESS', 'BUSINESS.MKT', 58], ['Startup Founder', 'BUSINESS', 'BUSINESS.STRAT', 55],
  ['Machine Learning Engineer', 'SCIENCE_TECH', 'SCIENCE_TECH.DATA', 52]].map(([career, domain, subfield, L]) => ({ career, domain, subfield, L }));
await j('/api/user/results', { method: 'POST', headers: H, body: { stage: 1, results: s1 } });
await j('/api/user/results', { method: 'POST', headers: H, body: { stage: 2, results: { love } } });
const r3 = await j('/api/user/results', { method: 'POST', headers: H, body: { stage: 3, results: { completedAt: new Date().toISOString(),
  top: [['UX Designer', 91], ['Product Designer', 87], ['Software Engineer', 83], ['Data Scientist', 78], ['Game Designer', 74]].map(([career, match]) => ({ career, match })) } } });
check('path saved (stages 1-3)', r3.status === 200 || r3.status === 201, r3.status);
const mem = await j('/api/schools?domains=CREATIVE&careers=UX%20Designer&mine=UX%20Designer,Product%20Designer,Software%20Engineer', { headers: H });
check('member search 200 + member flag', mem.status === 200 && mem.data.member === true);
check('default (1st area + 1st profession) → UX programmes in 6 countries', mem.data.total === 6 && mem.data.items.every((x) => x.subfield === 'CREATIVE.DIG'), mem.data.total);
check('member items carry insights', mem.data.items.every((x) => x.roiScore != null && x.salaryY1 != null && x.employment != null && x.admission));
check('member items carry a match score + why', mem.data.items.every((x) => x.match > 0 && x.why && x.why.exact));
check('sorted by best match', mem.data.items.every((x, i, a) => i === 0 || a[i - 1].match >= x.match));
check('aggregate insights for members', mem.data.insights && mem.data.insights.bestRoi && mem.data.insights.avgEmployment > 0);
check('member response is private', /private/.test(mem.headers.get('cache-control') || ''));
const wide = await j('/api/schools?domains=CREATIVE,SCIENCE_TECH&careers=UX%20Designer', { headers: H });
check('adding an area with no chosen profession widens the search', wide.data.total === 6 + 24, wide.data.total);
const roi = await j('/api/schools?minRoi=70&sort=roi', { headers: H });
check('members-only filter minRoi works', roi.data.items.every((x) => x.roiScore >= 70) && roi.data.sort === 'roi');
const adm = await j('/api/schools?admission=reach', { headers: H });
check('admission chance filter', adm.data.total > 0 && adm.data.items.every((x) => x.admission === 'reach'), adm.data.total);
const id = mem.data.items[0].id;
check('save a programme', (await j('/api/schools/saved', { method: 'POST', headers: H, body: { id } })).status === 200);
check('saving twice is harmless', (await j('/api/schools/saved', { method: 'POST', headers: H, body: { id } })).status === 200);
check('unknown programme refused', (await j('/api/schools/saved', { method: 'POST', headers: H, body: { id: 'nope' } })).status === 400);
const list1 = await j('/api/schools/saved', { headers: H });
check('shortlist lists it with full data', list1.data.ids.includes(id) && list1.data.items[0].roiScore != null);
await j('/api/schools/saved', { method: 'POST', headers: H, body: { id: mem.data.items[1].id } });
const exp = await j('/api/user/export', { headers: H });
check('account export includes saved schools', exp.status === 200 && (exp.data.savedSchools || []).some((r) => r.program_id === id), exp.status);
check('remove from shortlist', (await j('/api/schools/saved/remove', { method: 'POST', headers: H, body: { id } })).status === 200);
const list2 = await j('/api/schools/saved', { headers: H });
check('shortlist updated', !list2.data.ids.includes(id) && list2.data.ids.length === 1);

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed`);
console.log('TOKEN=' + token);
process.exit(failed ? 1 : 0);
