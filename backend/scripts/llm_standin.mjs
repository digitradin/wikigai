// Stand-in for free AI providers (OpenAI-compatible) — used only by plans_smoke.mjs.
//   /ok/v1/chat/completions    answers like a good model (outlook or plan JSON, from the prompt)
//   /fail/v1/chat/completions  always 429 (rate limited) → tests fail-over
//   /bad/v1/chat/completions   always unreadable text → tests repair + fail-over
// Usage: node llm_standin.mjs [port=9797]
import http from 'node:http';
const port = +(process.argv[2] || 9797);
const hits = {};
const outlook = (lang) => ({
  profession: 'X',
  summary: lang === 'es' ? 'Un trabajo práctico y creativo.' : 'A hands-on, creative job where you solve real problems.',
  outlook: 'Demand is steady; AI tools change daily tasks, so learning them early helps.',
  questions: Array.from({ length: 7 }, (_, i) => ({ q: `Key question ${i + 1}?`, why: `Because reason ${i + 1}.` })),
  skills: Array.from({ length: 10 }, (_, i) => ({ skill: `Skill ${i + 1}`, why: `Why skill ${i + 1} matters.`, level: i < 3 ? 'core' : i < 7 ? 'important' : 'useful', videoQuery: `learn to skill ${i + 1}` })),
});
const plan = (n) => ({
  title: 'Your path to mastery', intro: 'You will be able to do real work.', weeklyHours: '3-5 h/week',
  phases: Array.from({ length: n }, (_, i) => ({ label: `Block ${i + 1}`, title: `Phase ${i + 1}`, skills: ['Skill 1'], goal: 'A clear goal.', actions: ['Do A', 'Do B', 'Do C'], practice: 'Build a tiny thing.', checkpoint: 'You can show it.' })),
  routine: ['20 minutes a day', 'Review on Sunday', 'Share progress'], finalProject: 'A small portfolio project.', nextSteps: ['Find a mentor', 'Apply for an internship'],
});
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const kind = (req.url.match(/^\/(ok|fail|bad)\//) || [])[1] || 'ok';
    hits[kind] = (hits[kind] || 0) + 1;
    if (req.url === '/__hits') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(hits)); }
    if (kind === 'fail') { res.writeHead(429, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'rate limited' } })); }
    let msgs = [];
    try { msgs = JSON.parse(body).messages || []; } catch { /* ignore */ }
    const sys = (msgs[0] && msgs[0].content) || '';
    let content;
    if (kind === 'bad') content = 'Sure! Here is your plan: step one, step two.';
    else if (/"phases"/.test(sys)) { const n = +((sys.match(/\((\d+) items\)/) || [])[1] || 4); content = '```json\n' + JSON.stringify(plan(n)) + '\n```'; }
    else content = JSON.stringify(outlook(/Spanish/.test(sys) ? 'es' : 'en'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ model: 'standin-' + kind, choices: [{ message: { role: 'assistant', content } }] }));
  });
}).listen(port, '127.0.0.1', () => console.log('LLM stand-in on', port));
