// Plans v20261026 API test. Needs the backend running with EXPOSE_PINS=true and the AI stand-in:
//   node backend/scripts/llm_standin.mjs 9797 &
//   GROQ_API_KEY=t AI_BASE_GROQ=http://127.0.0.1:9797/fail/v1 \
//   OPENROUTER_API_KEY=t AI_BASE_OPENROUTER=http://127.0.0.1:9797/bad/v1 \
//   MISTRAL_API_KEY=t AI_BASE_MISTRAL=http://127.0.0.1:9797/ok/v1 AI_STRATEGY=ordered AI_PROVIDER_ORDER=groq,openrouter,mistral  node backend/src/index.js
//   BASE_URL=http://127.0.0.1:8080 node backend/scripts/plans_smoke.mjs
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const STANDIN = process.env.STANDIN_URL || 'http://127.0.0.1:9797';
let passed = 0, failed = 0;
const check = (name, cond, extra = '') => { if (cond) { passed++; console.log('  ✅ ' + name); } else { failed++; console.log('  ❌ ' + name + ' ' + extra); } };
async function j(path, opts = {}) {
  const r = await fetch(BASE + path, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: 'Bearer ' + opts.token } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = {}; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
console.log('\n▶ Plans smoke —', BASE);
const email = `plans_${Date.now()}@example.com`, PW = 'Sunshine42';
const sol = await j('/api/captcha/_debug/solve');
const su = await j('/api/auth/signup', { method: 'POST', body: { email, email2: email, password: PW, password2: PW, name: 'Plan Tester', captcha_id: sol.data.captcha_id, captcha_answer: sol.data.answer } });
const v = await j('/api/auth/verify', { method: 'POST', body: { email, pin: su.data.dev_pin } });
const token = v.data.token;
check('signed in', !!token, JSON.stringify(su.data));

console.log('— auth —');
check('outlook needs sign-in', (await j('/api/plans/outlook', { method: 'POST', body: { profession: 'Nurse' } })).status === 401);
check('list needs sign-in', (await j('/api/plans')).status === 401);

console.log('— step 1: outlook —');
const list0 = await j('/api/plans', { token });
check('empty list + AI configured', list0.status === 200 && list0.data.items.length === 0 && list0.data.configured === true, JSON.stringify(list0.data));
check('bad profession → 400', (await j('/api/plans/outlook', { method: 'POST', token, body: { profession: 'x' } })).data.code === 'BAD_PROFESSION');
const o1 = await j('/api/plans/outlook', { method: 'POST', token, body: { profession: 'Software Engineer', lang: 'en', country: 'ES' } });
check('outlook ok (after 429 + bad JSON fail-over)', o1.status === 200 && o1.data.cached === false, JSON.stringify(o1.data).slice(0, 300));
const o = o1.data.outlook || {};
check('exactly 10 ranked skills', o.skills && o.skills.length === 10 && o.skills[0].skill === 'Skill 1');
check('6-8 key questions', o.questions && o.questions.length >= 6 && o.questions.length <= 8);
check('video query per skill', o.skills && o.skills.every((s) => s.videoQuery));
check('profession kept as asked', o.profession === 'Software Engineer');
const o2 = await j('/api/plans/outlook', { method: 'POST', token, body: { profession: 'software engineer', lang: 'en', country: 'ES' } });
check('same profession/lang/age/country → shared cache', o2.data.cached === true);
const o3 = await j('/api/plans/outlook', { method: 'POST', token, body: { profession: 'Software Engineer', lang: 'en', country: 'FR' } });
check('other country → fresh answer', o3.data.cached === false);

console.log('— step 2: plans —');
const mk = (skills, duration) => j('/api/plans', { method: 'POST', token, body: { profession: 'Software Engineer', lang: 'en', country: 'ES', skills, duration, answers: { level: 'some', goal: 'job', hours: '6-10' }, outlook: o } });
const p2 = await mk(['Skill 1', 'Skill 2']);
check('2 skills → 30 days, 4 blocks', p2.status === 200 && p2.data.plan.duration === '30d' && p2.data.plan.plan.phases.length === 4, JSON.stringify(p2.data).slice(0, 300));
const p4 = await mk(['Skill 3', 'Skill 1', 'Skill 2', 'Skill 4']);
check('4 skills → 3 months, 6 blocks', p4.data.plan && p4.data.plan.duration === '3m' && p4.data.plan.plan.phases.length === 6);
check('skills kept in priority order', p4.data.plan && JSON.stringify(p4.data.plan.skills) === JSON.stringify(['Skill 1', 'Skill 2', 'Skill 3', 'Skill 4']));
const p7 = await mk(o.skills.slice(0, 7).map((s) => s.skill));
check('7 skills → 1 year, 12 blocks', p7.data.plan && p7.data.plan.duration === '1y' && p7.data.plan.plan.phases.length === 12);
const pOver = await mk(['Skill 1'], '1y');
check('user override: 1 skill as a 1-year plan', pOver.data.plan && pOver.data.plan.duration === '1y');
check('unknown skills refused', (await mk(['Hacking the Gibson'])).data.code === 'BAD_SKILLS');
check('answers kept', p2.data.plan && p2.data.plan.answers.goal === 'job');
const bad = await j('/api/plans', { method: 'POST', token, body: { profession: 'Software Engineer', skills: ['Skill 1'], outlook: { skills: [] } } });
check('missing outlook refused', bad.data.code === 'BAD_OUTLOOK');

console.log('— saved plans —');
const l = await j('/api/plans', { token });
check('4 plans listed, newest first', l.data.items.length === 4 && l.data.items[0].id === pOver.data.plan.id);
const one = await j('/api/plans/' + p2.data.plan.id, { token });
check('open one plan (outlook + plan)', one.data.plan && one.data.plan.outlook.questions.length >= 6 && one.data.plan.plan.phases.length === 4);
check('bad id → 404', (await j('/api/plans/nope', { token })).status === 404);
const other = await (async () => { const e2 = `plans2_${Date.now()}@example.com`; const s = await j('/api/captcha/_debug/solve'); const u = await j('/api/auth/signup', { method: 'POST', body: { email: e2, email2: e2, password: PW, password2: PW, captcha_id: s.data.captcha_id, captcha_answer: s.data.answer } }); return (await j('/api/auth/verify', { method: 'POST', body: { email: e2, pin: u.data.dev_pin } })).data.token; })();
check("another user can't open it", (await j('/api/plans/' + p2.data.plan.id, { token: other })).status === 404);
await j('/api/plans/' + p2.data.plan.id + '/delete', { method: 'POST', token: other });
check("another user can't delete it", (await j('/api/plans/' + p2.data.plan.id, { token })).status === 200);
const del = await j('/api/plans/' + p2.data.plan.id + '/delete', { method: 'POST', token });
check('delete', del.status === 200 && (await j('/api/plans/' + p2.data.plan.id, { token })).status === 404);

console.log('— analytics events allowed —');
const ev = await fetch(BASE + '/api/t', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: 'event', n: 'plan_create', p: '/learning/plans' }) });
check('plan_create event accepted', ev.status < 400);

try { const h = await (await fetch(STANDIN + '/__hits')).json(); check('fail-over used: 429 provider and bad-JSON provider were tried', h.fail >= 1 && h.bad >= 2, JSON.stringify(h)); } catch { /* stand-in not reachable */ }

console.log(`\n${failed === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — passed=${passed} failed=${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
