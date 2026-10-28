/* Wikigai — My learning › Plans (v20261026): pick ONE profession, then a 2-step plan.
     Step 1  POST /api/plans/outlook   { profession, lang, country }
             → simple-language outlook: key questions to think about + the 10 key skills
               (most → least relevant), each with a "learn to …" video search for WikiVids.
     Step 2  POST /api/plans           { profession, lang, country, skills[1..10], duration, answers }
             → a detailed plan on the chosen skills: 30d (1-2 skills), 3m (3-5), 1y (6+);
               the user may override the duration before confirming. Saved for the user.
     GET  /api/plans            the user's saved plans (titles) + whether AI is configured
     GET  /api/plans/:id        one saved plan (outlook snapshot + plan)
     POST /api/plans/:id/delete remove a saved plan

   Hidden filters (never shown in the UI): the user's age band (from the optional birthday),
   country (from their Wikigai region / grading country / browser), language, and the
   3 "skill mastery" answers (level, goal, time per week) shape vocabulary, examples and pace.
   AI: lib/llm.js — every free provider configured on the server, rotated with fail-over.
   Step 1 is shared between users with the same profession + language + age band + country
   (cached 30 days), so most visitors never spend an AI call on it.

   Privacy: only the profession, chosen skills, age band, country code, language and the three
   answers are sent to the AI — never name, email, birth date or ids. */
'use strict';
const express = require('express');
const crypto = require('crypto');
const db = require('../lib/db');
const llm = require('../lib/llm');
const { requireUser } = require('./auth');
const { ageOn } = require('../lib/birthdate');

const router = express.Router();
const LANGS = { en: 'English', fr: 'French', es: 'Spanish' };
const LEARN_TO = { en: 'learn to', fr: 'apprendre à', es: 'aprender a' };
const DURATIONS = ['30d', '3m', '1y'];
const LEVELS = { new: 'complete beginner', some: 'knows the basics', good: 'already fairly good, wants to go deeper' };
const GOALS = { explore: 'explore whether this career is for them', study: 'prepare for studies or training in this field', job: 'get a first job, internship or apprenticeship', switch: 'switch career into this field', grow: 'grow in a job they already have' };
const HOURS = { '1-2': '1-2 hours per week', '3-5': '3-5 hours per week', '6-10': '6-10 hours per week', '10+': 'more than 10 hours per week' };

const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const list = (a, n, len) => (Array.isArray(a) ? a : []).map((x) => clip(x, len)).filter(Boolean).slice(0, n);
const fail = (res, status, code, error) => res.status(status).json({ error, code });
const cfg = () => ({
  limit: parseInt(process.env.PLAN_DAILY_LIMIT || '15', 10),
  cacheDays: parseInt(process.env.PLAN_OUTLOOK_CACHE_DAYS || '30', 10),
});

/* 1-2 skills → 30 days · 3-5 → 3 months · 6+ → 1 year */
const recommend = (n) => (n <= 2 ? '30d' : n <= 5 ? '3m' : '1y');
const SHAPE = {
  '30d': { n: 4, unit: 'four blocks labelled with day ranges: days 1-7, 8-14, 15-21, 22-30', actions: '3-5', tokens: 2800 },
  '3m': { n: 6, unit: 'six two-week blocks labelled weeks 1-2, 3-4, 5-6, 7-8, 9-10, 11-12', actions: '3-5', tokens: 3800 },
  '1y': { n: 12, unit: 'twelve blocks, one per month, labelled month 1 to month 12', actions: '2-4', tokens: 5200 },
};

/* ── hidden filters → how to talk to this person ── */
const ageBand = (age) => (age == null ? 'na' : age < 12 ? 'c' : age < 16 ? 'ls' : age < 19 ? 'us' : age < 25 ? 'ya' : age < 40 ? 'a' : 'm');
const AUDIENCE = {
  na: 'a student or young adult (age unknown): plain, friendly words, short sentences, no jargon without a quick explanation',
  c: 'a child of primary-school age: very simple words, short playful sentences, safe activities, a parent or teacher involved',
  ls: 'a young teenager (12-15) in lower secondary school: simple everyday words, relatable examples from school and hobbies, safe free resources, a parent involved for anything with money, travel or meeting people online',
  us: 'a teenager (16-18) in upper secondary school: clear, direct and motivating, explain any jargon, link to school subjects, exams and next study choices',
  ya: 'a young adult (19-24), student or first job: direct and practical, light professional vocabulary, internships, portfolios and first jobs',
  a: 'an adult (25-39), possibly changing careers: professional but plain language, value existing experience, learning that fits around a job',
  m: 'an experienced adult (40+) considering a change: respectful, concise, build on long experience, flexible part-time options',
};
function countryName(cc) {
  if (!cc) return '';
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) || ''; } catch { return ''; }
}
function context(user, b) {
  const age = user.birthDate ? ageOn(user.birthDate) : null;
  const band = ageBand(age);
  const lang = LANGS[b.lang] ? b.lang : 'en';
  const cc = /^[A-Z]{2}$/.test(String(b.country || '').toUpperCase()) ? String(b.country).toUpperCase() : '';
  const country = cc === 'EU' ? 'Europe' : countryName(cc);
  return { age, band, lang, language: LANGS[lang], cc, country };
}
const placeLine = (x) => (x.country
  ? `They live in ${x.country}: make examples, study routes and workplace culture fit ${x.country} (its education system, typical qualifications, how people get hired there). Do not invent school names, salaries, statistics or URLs.`
  : 'Keep examples international. Do not invent school names, salaries, statistics or URLs.');

/* ── Step 1: outlook (key questions + 10 key skills) ── */
function outlookPrompt(profession, x) {
  const system = `You are Wikigai's career coach. Answer ONLY with one JSON object — no markdown, no text before or after.
Write every text value in ${x.language}, speaking directly to the reader as "you".
Your reader is ${AUDIENCE[x.band]}. ${placeLine(x)}
JSON shape (keys exactly as written, in English):
{
  "profession": "the profession name",
  "summary": "2-3 simple sentences: what this job really is, day to day",
  "outlook": "2-3 simple sentences: how this job is changing (technology, AI, demand) and what that means for someone starting now; no numbers unless you are certain",
  "questions": [{"q": "a key question you need to think about", "why": "one sentence: why it matters"}],
  "skills": [{"skill": "short action-style name, 2-6 words", "why": "one simple sentence", "level": "core | important | useful", "videoQuery": "a short ${x.language} video search that starts with \\"${LEARN_TO[x.lang]}\\""}]
}
Rules: "questions" has 6 to 8 items covering personal fit, daily life, study/training route, money and time, risks and the impact of AI.
"skills" has EXACTLY 10 items ordered from the MOST relevant to the LEAST relevant for this profession today; mix hard and soft skills.`;
  const user = `Profession: ${profession}.`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}
function validOutlook(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const skills = (Array.isArray(raw.skills) ? raw.skills : []).map((s) => (typeof s === 'string' ? { skill: clip(s, 80) } : s || {}))
    .map((s) => ({ skill: clip(s.skill || s.name, 80), why: clip(s.why, 300), level: ['core', 'important', 'useful'].includes(String(s.level || '').toLowerCase()) ? String(s.level).toLowerCase() : '', videoQuery: clip(s.videoQuery, 90) }))
    .filter((s) => s.skill);
  const seen = new Set();
  const uniq = skills.filter((s) => { const k = s.skill.toLowerCase(); return !seen.has(k) && seen.add(k); }).slice(0, 10);
  const questions = (Array.isArray(raw.questions) ? raw.questions : []).map((q) => (typeof q === 'string' ? { q: clip(q, 220), why: '' } : { q: clip(q && (q.q || q.question), 220), why: clip(q && q.why, 300) })).filter((q) => q.q).slice(0, 8);
  if (uniq.length < 6 || questions.length < 3) return null;
  return { profession: clip(raw.profession, 120), summary: clip(raw.summary, 700), outlook: clip(raw.outlook, 700), questions, skills: uniq };
}

/* ── Step 2: detailed plan on the chosen skills ── */
function planPrompt(profession, skills, duration, ans, x) {
  const s = SHAPE[duration];
  const system = `You are Wikigai's learning coach. Answer ONLY with one JSON object — no markdown, no text before or after.
Write every text value in ${x.language}, speaking directly to the reader as "you".
Your reader is ${AUDIENCE[x.band]}. ${placeLine(x)}
Build the plan with the skill-mastery method:
- break each skill into its sub-skills and start with the few that give most of the results (80/20);
- every block mixes a little learning, a lot of hands-on practice, feedback (from a person, a community or self-checking) and a small proof of progress;
- follow the skill priority order (first skill first), revisit earlier skills so nothing is forgotten, and finish with a real project;
- be realistic for the time available; prefer free resources and describe them by type (e.g. "a free beginner course", "YouTube tutorials") — never invent URLs, brands of courses or prices.
JSON shape (keys exactly as written, in English):
{
  "title": "short motivating plan title",
  "intro": "2 simple sentences: what you will be able to do at the end",
  "weeklyHours": "the time per week this plan expects",
  "phases": [{"label": "", "title": "", "skills": ["exact skill names from the list"], "goal": "one sentence", "actions": ["concrete action"], "practice": "one hands-on exercise or mini-project", "checkpoint": "how you know this block is done"}],
  "routine": ["3 to 5 simple habits that keep you going"],
  "finalProject": "one project that proves the skills at the end",
  "nextSteps": ["2 to 4 things to do after this plan"]
}
"phases" has ${s.unit} (${s.n} items), each with ${s.actions} concrete actions.`;
  const user = `Profession: ${profession}.
Skills to work on, in priority order: ${skills.map((k, i) => `${i + 1}. ${k}`).join('; ')}.
Plan length: ${duration === '30d' ? '30 days' : duration === '3m' ? '3 months' : '1 year'}.
About me — current level: ${LEVELS[ans.level]}; my goal: ${GOALS[ans.goal]}; time I can give: ${HOURS[ans.hours]}.`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}
function validPlan(duration) {
  const want = SHAPE[duration].n;
  return (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const phases = (Array.isArray(raw.phases) ? raw.phases : []).map((p) => ({
      label: clip(p && (p.label || p.period || p.days), 40), title: clip(p && p.title, 140), skills: list(p && p.skills, 6, 80),
      goal: clip(p && p.goal, 300), actions: list(p && p.actions, 6, 300), practice: clip(p && p.practice, 400), checkpoint: clip(p && p.checkpoint, 300),
    })).filter((p) => p.title || p.actions.length).slice(0, want + 2);
    if (phases.length < Math.ceil(want / 2)) return null;
    return { title: clip(raw.title, 140), intro: clip(raw.intro, 600), weeklyHours: clip(raw.weeklyHours, 60), phases, routine: list(raw.routine, 6, 240), finalProject: clip(raw.finalProject, 500), nextSteps: list(raw.nextSteps, 5, 240) };
  };
}

/* ── limits ── */
async function underLimit(userId) {
  const used = await db.getOne(`SELECT count(*)::int AS n FROM plan_ai_log WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'`, [userId]);
  return ((used && used.n) || 0) < cfg().limit;
}
const logUse = (userId, kind, provider) => db.query(`INSERT INTO plan_ai_log (user_id, kind, provider) VALUES ($1, $2, $3)`, [userId, kind, clip(provider, 40)]);
function aiError(res, err) {
  if (err.code === 'AI_UNAVAILABLE') return fail(res, 503, 'AI_UNAVAILABLE', 'The AI planning service is not configured yet.');
  console.warn('[plans] AI failed:', err.message);
  if (err.code === 'AI_BAD_OUTPUT') return fail(res, 502, 'AI_BAD_OUTPUT', 'The AI answer could not be read. Please try again.');
  return fail(res, 502, 'AI_FAILED', 'The AI could not answer right now. Please try again in a moment.');
}

/* POST /api/plans/outlook — Step 1 */
router.post('/outlook', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const b = req.body || {};
    const profession = clip(b.profession, 120);
    if (profession.length < 2) return fail(res, 400, 'BAD_PROFESSION', 'Please choose a profession.');
    const x = context(user, b);
    const key = crypto.createHash('sha256').update([profession.toLowerCase(), x.lang, x.band, x.cc].join('|')).digest('hex');
    if (!b.force) {
      const hit = await db.getOne(`SELECT result, created_at FROM plan_outlook_cache WHERE cache_key = $1 AND created_at > NOW() - make_interval(days => $2)`, [key, cfg().cacheDays]);
      if (hit) return res.json({ ok: true, cached: true, profession, outlook: hit.result, recommend: { '1-2': '30d', '3-5': '3m', '6+': '1y' } });
    }
    if (!llm.configured()) return fail(res, 503, 'AI_UNAVAILABLE', 'The AI planning service is not configured yet.');
    if (!(await underLimit(user.id))) return fail(res, 429, 'AI_LIMIT', 'You reached today’s planning limit. Please try again tomorrow.');
    let r;
    try { r = await llm.chatJSON(outlookPrompt(profession, x), { validate: validOutlook, maxTokens: 2400 }); } catch (err) { return aiError(res, err); }
    const out = r.data;
    out.profession = profession; // keep the user's profession name (the model may rephrase it)
    out.skills.forEach((s) => { if (!s.videoQuery) s.videoQuery = `${LEARN_TO[x.lang]} ${s.skill}`.slice(0, 90); });
    await db.query(`INSERT INTO plan_outlook_cache (cache_key, profession, lang, result, model) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (cache_key) DO UPDATE SET result = EXCLUDED.result, model = EXCLUDED.model, created_at = NOW()`, [key, profession, x.lang, JSON.stringify(out), r.provider + '/' + r.model]);
    await logUse(user.id, 'outlook', r.provider);
    res.json({ ok: true, cached: false, profession, outlook: out });
  } catch (err) { next(err); }
});

/* POST /api/plans — Step 2: create and save the detailed plan */
router.post('/', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const b = req.body || {};
    const profession = clip(b.profession, 120);
    if (profession.length < 2) return fail(res, 400, 'BAD_PROFESSION', 'Please choose a profession.');
    const outlook = validOutlook(b.outlook);
    if (!outlook) return fail(res, 400, 'BAD_OUTLOOK', 'Please start again from step 1.');
    // only skills from step 1, always in step 1's priority order (most relevant first)
    const picked = new Set(list(b.skills, 10, 80).map((s) => s.toLowerCase()));
    const skills = outlook.skills.map((s) => s.skill).filter((s) => picked.has(s.toLowerCase()));
    if (!skills.length) return fail(res, 400, 'BAD_SKILLS', 'Choose between 1 and 10 skills.');
    const duration = DURATIONS.includes(b.duration) ? b.duration : recommend(skills.length);
    const a = b.answers || {};
    const ans = { level: LEVELS[a.level] ? a.level : 'new', goal: GOALS[a.goal] ? a.goal : 'explore', hours: HOURS[a.hours] ? a.hours : '3-5' };
    const x = context(user, b);
    if (!llm.configured()) return fail(res, 503, 'AI_UNAVAILABLE', 'The AI planning service is not configured yet.');
    if (!(await underLimit(user.id))) return fail(res, 429, 'AI_LIMIT', 'You reached today’s planning limit. Please try again tomorrow.');
    let r;
    try { r = await llm.chatJSON(planPrompt(profession, skills, duration, ans, x), { validate: validPlan(duration), maxTokens: SHAPE[duration].tokens }); } catch (err) { return aiError(res, err); }
    // keep the profession, the outlook the user saw (with the skills they picked) and the plan together
    outlook.profession = profession;
    const row = await db.getOne(`INSERT INTO learning_plans (user_id, profession, lang, duration, skills, answers, outlook, plan, model)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, profession, lang, duration, skills, answers, outlook, plan, created_at`,
    [user.id, profession, x.lang, duration, JSON.stringify(skills), JSON.stringify(ans), JSON.stringify(outlook), JSON.stringify(r.data), r.provider + '/' + r.model]);
    await logUse(user.id, 'plan', r.provider);
    res.json({ ok: true, plan: row, recommended: recommend(skills.length) });
  } catch (err) { next(err); }
});

/* GET /api/plans — saved plans */
router.get('/', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const r = await db.query(`SELECT id, profession, duration, skills, created_at FROM learning_plans WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [user.id]);
    res.json({ ok: true, items: r.rows, configured: llm.configured() });
  } catch (err) { next(err); }
});

const isId = (s) => /^[0-9a-f-]{36}$/i.test(String(s || ''));
router.get('/:id', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!isId(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'Not found');
    const row = await db.getOne(`SELECT id, profession, lang, duration, skills, answers, outlook, plan, created_at FROM learning_plans WHERE id = $1 AND user_id = $2`, [req.params.id, user.id]);
    if (!row) return fail(res, 404, 'NOT_FOUND', 'Not found');
    res.json({ ok: true, plan: row });
  } catch (err) { next(err); }
});
router.post('/:id/delete', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!isId(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'Not found');
    await db.query(`DELETE FROM learning_plans WHERE id = $1 AND user_id = $2`, [req.params.id, user.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports._test = { recommend, validOutlook, validPlan, outlookPrompt, planPrompt, ageBand, context };
