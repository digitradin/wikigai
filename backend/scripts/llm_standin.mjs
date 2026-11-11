// Stand-in for free AI providers (OpenAI-compatible) — used only by plans_smoke.mjs (v20261029: overview v2 + plan v2).
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
const outlook2 = (lang) => ({
  profession: 'X',
  whatIs: lang === 'es' ? 'Es un trabajo en el que construyes cosas útiles.' : 'You build useful things with computers, a bit like LEGO for apps.',
  pros: ['Creative work', 'Good pay', 'Remote options'], cons: ['Long screen time', 'Fast-changing tools'],
  trends: ['AI coding assistants', 'Cloud everywhere', 'Security first'],
  future: 'By 2030-2035 you will guide AI tools more than type every line yourself.',
  demand: { direction: 'Growing', now: 'Many companies are hiring.', next: 'Demand keeps rising for people who use AI well.' },
  ai: { takeOver: ['Boilerplate code', 'Simple tests'], humans: ['Understanding people', 'Design decisions'], adapt: ['Learn AI tools', 'Focus on problem solving'] },
  career: { paths: ['Junior developer', 'Senior engineer', 'Tech lead', 'Freelancer'], salary: { entry: '€24,000–32,000/year', mid: '€38,000–50,000/year', top: '€70,000–110,000/year', note: 'Specialising raises pay.' }, lifestyle: 'Remote and freelance work are common.' },
  skills: Array.from({ length: 10 }, (_, i) => ({ skill: `Skill ${i + 1}`, why: `Why skill ${i + 1} matters.`, difficulty: ['beginner', 'Intermediate', 'ADVANCED (hard)'][i % 3], videoQuery: `learn to skill ${i + 1}` })),
});
const plan2 = (n, skills) => ({
  title: 'Your path to mastery', weeklyHours: '5 hours per week', goal: 'Be ready for a first junior job.',
  skills: skills.map((k) => ({ skill: k.toLowerCase(), target: 'Intermediate', outcome: 'You can use it on real work.' })),
  strategy: { combine: 'Each week mixes the skills in one mini project.', sequence: 'Foundations first, then projects.' },
  phases: [{ name: 'Foundations', period: 'Week 1', focus: 'Basics', outcome: 'You know the basics.' }, { name: 'Build', period: 'Weeks 2-3', focus: 'Projects', outcome: 'You built something.' }, { name: 'Show', period: 'Week 4', focus: 'Portfolio', outcome: 'You can show it.' }],
  schedule: Array.from({ length: n }, (_, i) => ({ label: `Block ${i + 1}`, title: `Block title ${i + 1}`, skills: [skills[0]], activities: ['Do A', 'Do B', 'Do C'], resources: ['freeCodeCamp', 'YouTube tutorials'], project: 'Build a tiny thing.', review: 'Explain it to a friend.' })),
  tracking: { measure: ['Hours logged', 'Projects finished', 'Quiz scores'], milestones: [{ when: 'Week 1', milestone: 'First script' }, { when: 'Week 2', milestone: 'First app' }, 'A portfolio page'] },
  advice: { motivation: ['Celebrate small wins'], consistency: ['Same time every day', 'Never miss twice'] },
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
    else if (/"schedule"/.test(sys)) { const n = +((sys.match(/\((\d+) items\)/) || [])[1] || 4); const user = (msgs[1] && msgs[1].content) || ''; const skills = [...user.matchAll(/\d+\. ([^;.]+)/g)].map((m) => m[1].trim()); content = '```json\n' + JSON.stringify(plan2(n, skills.length ? skills : ['Skill 1'])) + '\n```'; }
    else if (/"whatIs"/.test(sys)) content = JSON.stringify(outlook2(/Spanish/.test(sys) ? 'es' : 'en'));
    else if (/"phases"/.test(sys)) { const n = +((sys.match(/\((\d+) items\)/) || [])[1] || 4); content = '```json\n' + JSON.stringify(plan(n)) + '\n```'; }
    else content = JSON.stringify(outlook(/Spanish/.test(sys) ? 'es' : 'en'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ model: 'standin-' + kind, choices: [{ message: { role: 'assistant', content } }] }));
  });
}).listen(port, '127.0.0.1', () => console.log('LLM stand-in on', port));
