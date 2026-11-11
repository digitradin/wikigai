/* Wikigai — My learning › Plans (v20261029: "Career & Learning Architect"). Pick ONE profession, then 2 steps.
     Step 1  POST /api/plans/outlook   { profession, lang, country }
             → the profession explained simply: A1 what it is (like you're 12), A2 pros & cons,
               A3 current trends; B4 future 2030-2035, B5 growing or shrinking, B6 AI & robots,
               B7 career perspectives (paths, salary entry → top, lifestyle), B8 top 10 skills
               ranked (why + difficulty), each with a "learn to …" video search for WikiVids.
             (v20261026 outlooks — key questions + skills — are still read for saved plans.)
     Step 2  POST /api/plans           { profession, lang, country, skills[1..10], duration, answers }
             → personalised study plan on the chosen skills: 30d (1-2 skills), 3m (3-5), 1y (6-10);
               overview (title, duration, weekly time, goal, skills + target level), learning strategy,
               phase breakdown, weekly / monthly schedule (activities, free resources, project, review),
               progress tracking (measures + milestones), final advice. Never before skills are chosen.
               The user may override the duration before confirming. Saved for the user.
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
  '30d': { n: 4, unit: 'four weekly blocks labelled Week 1 (days 1-7), Week 2 (days 8-14), Week 3 (days 15-21), Week 4 (days 22-30)', example: 'Week 1', actions: '3-5', tokens: 3400 },
  '3m': { n: 6, unit: 'six two-week blocks labelled Weeks 1-2, 3-4, 5-6, 7-8, 9-10, 11-12', example: 'Weeks 1-4', actions: '3-5', tokens: 4600 },
  '1y': { n: 12, unit: 'twelve monthly blocks labelled Month 1 to Month 12', example: 'Months 1-3', actions: '2-4', tokens: 6400 },
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
  ? `They live in ${x.country}: make examples, study routes and workplace culture fit ${x.country} (its education system, typical qualifications, how people get hired there). Do not invent school names, statistics or URLs.`
  : 'Keep examples international. Do not invent school names, statistics or URLs.');

/* ── Step 1: profession overview (A1-A3 understand it, B4-B7 its future) + top 10 skills ── */
const OUTLOOK_V = 2;
function outlookPrompt(profession, x) {
  const money = x.country ? `the local currency of ${x.country}` : 'US dollars and euros (e.g. "$40,000–55,000 / €30,000–40,000")';
  const system = `You are Wikigai's elite Career & Learning Architect. You help people understand a profession in the simplest possible way.
Answer ONLY with one JSON object — no markdown, no text before or after.
Write every text value in ${x.language}, speaking directly to the reader as "you". Use simple, clear, friendly language.
Your reader is ${AUDIENCE[x.band]}. ${placeLine(x)}
JSON shape (keys exactly as written, in English):
{
  "profession": "the profession name",
  "whatIs": "Explain the profession like the reader is 12 years old: 3-5 short friendly sentences, no jargon — what these people do all day, where, with whom and why it matters",
  "pros": ["3 to 5 advantages: what people love about this job"],
  "cons": ["3 to 5 disadvantages: what people dislike"],
  "trends": ["3 to 5 things that are changing right now in this profession"],
  "future": "2-4 simple sentences: how this profession will look in 2030-2035",
  "demand": {"direction": "growing | stable | shrinking", "now": "1-2 sentences: the current situation", "next": "1-2 sentences: future demand in the next 5-10 years"},
  "ai": {"takeOver": ["2 to 4 tasks AI and robots will take over"], "humans": ["2 to 4 things humans will still need to do"], "adapt": ["2 to 4 ways professionals must adapt"]},
  "career": {"paths": ["3 to 5 best possible career paths"], "salary": {"entry": "yearly gross range at entry level", "mid": "yearly gross range after about 5 years", "top": "yearly gross range at the top level", "note": "one short sentence: what makes pay go up"}, "lifestyle": "1-2 sentences: freedom and lifestyle possibilities (hours, remote work, freelancing, travel)"},
  "skills": [{"skill": "short skill name, 2-6 words", "why": "ONE short sentence: why it is important", "difficulty": "beginner | intermediate | advanced", "videoQuery": "a short ${x.language} video search that starts with \\"${LEARN_TO[x.lang]}\\""}]
}
Rules: "skills" has EXACTLY 10 items, ranked from the MOST important to the LEAST important to become a top professional in the FUTURE; mix hard skills, soft skills and, when relevant, AI/digital skills.
Salaries are realistic estimates written as ranges in ${money}; when unsure, give a wider range rather than a precise number.
The values of "direction" and "difficulty" stay in English, lowercase, exactly one of the listed words.`;
  const user = `Profession: ${profession}.`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}
const pickWord = (v, words, alias = {}) => {
  const s = String(v || '').toLowerCase();
  const hit = words.find((w) => s.includes(w)) || Object.keys(alias).find((a) => s.includes(a));
  return hit ? (alias[hit] || hit) : '';
};
const DIFF = ['beginner', 'intermediate', 'advanced'];
const DIRS = ['growing', 'stable', 'shrinking'];
const DIR_ALIAS = { grow: 'growing', rising: 'growing', increas: 'growing', declin: 'shrinking', shrink: 'shrinking', decreas: 'shrinking', steady: 'stable' };
const DIFF_ALIAS = { basic: 'beginner', easy: 'beginner', medium: 'intermediate', moderate: 'intermediate', hard: 'advanced', expert: 'advanced' };
function cleanSkills(a) {
  const skills = (Array.isArray(a) ? a : []).map((s) => (typeof s === 'string' ? { skill: s } : s || {}))
    .map((s) => ({ skill: clip(s.skill || s.name, 80), why: clip(s.why || s.reason, 300), difficulty: pickWord(s.difficulty || s.level, DIFF, DIFF_ALIAS), level: '', videoQuery: clip(s.videoQuery, 90) }))
    .filter((s) => s.skill);
  const seen = new Set();
  return skills.filter((s) => { const k = s.skill.toLowerCase(); return !seen.has(k) && seen.add(k); }).slice(0, 10);
}
/* v2 (this version): the full overview. Strict: exactly 10 skills. */
function validOutlookV2(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const skills = cleanSkills(raw.skills);
  const d = raw.demand || {}, ai = raw.ai || {}, c = raw.career || {}, sal = c.salary || {};
  const out = {
    v: OUTLOOK_V, profession: clip(raw.profession, 120), whatIs: clip(raw.whatIs || raw.summary, 900),
    pros: list(raw.pros, 6, 240), cons: list(raw.cons, 6, 240), trends: list(raw.trends, 6, 260), future: clip(raw.future, 800),
    demand: { direction: pickWord(d.direction, DIRS, DIR_ALIAS), now: clip(d.now, 400), next: clip(d.next, 400) },
    ai: { takeOver: list(ai.takeOver, 5, 240), humans: list(ai.humans, 5, 240), adapt: list(ai.adapt, 5, 240) },
    career: { paths: list(c.paths, 6, 200), salary: { entry: clip(sal.entry, 90), mid: clip(sal.mid, 90), top: clip(sal.top, 90), note: clip(sal.note, 240) }, lifestyle: clip(c.lifestyle, 400) },
    skills,
  };
  if (!out.whatIs || skills.length !== 10 || out.pros.length < 2 || out.cons.length < 2) return null;
  return out;
}
/* v1 (v20261026 plans already saved by users): summary + key questions + skills */
function validOutlookV1(raw) {
  const skills = (Array.isArray(raw.skills) ? raw.skills : []).map((s) => (typeof s === 'string' ? { skill: clip(s, 80) } : s || {}))
    .map((s) => ({ skill: clip(s.skill || s.name, 80), why: clip(s.why, 300), level: ['core', 'important', 'useful'].includes(String(s.level || '').toLowerCase()) ? String(s.level).toLowerCase() : '', videoQuery: clip(s.videoQuery, 90) }))
    .filter((s) => s.skill);
  const seen = new Set();
  const uniq = skills.filter((s) => { const k = s.skill.toLowerCase(); return !seen.has(k) && seen.add(k); }).slice(0, 10);
  const questions = (Array.isArray(raw.questions) ? raw.questions : []).map((q) => (typeof q === 'string' ? { q: clip(q, 220), why: '' } : { q: clip(q && (q.q || q.question), 220), why: clip(q && q.why, 300) })).filter((q) => q.q).slice(0, 8);
  if (uniq.length < 6 || questions.length < 3) return null;
  return { profession: clip(raw.profession, 120), summary: clip(raw.summary, 700), outlook: clip(raw.outlook, 700), questions, skills: uniq };
}
function validOutlook(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return raw.whatIs || raw.v === OUTLOOK_V ? validOutlookV2(raw) : validOutlookV1(raw);
}

/* ── Step 2: personalised study plan on the chosen skills ── */
function planPrompt(profession, skills, duration, ans, x) {
  const s = SHAPE[duration];
  const system = `You are Wikigai's elite Career & Learning Architect. You create highly effective multi-skill study plans.
Answer ONLY with one JSON object — no markdown, no text before or after.
Write every text value in ${x.language}, speaking directly to the reader as "you".
Your reader is ${AUDIENCE[x.band]}. ${placeLine(x)}
Important rules:
- use simple and clear language; make the plan motivating and practical;
- be realistic with time: everything must fit the time per week the reader can give;
- focus on high-leverage actions: break each skill into sub-skills and start with the few that give most of the results (80/20);
- combine the skills so they reinforce each other, follow their priority order (first skill first) and revisit earlier skills so nothing is forgotten;
- every block mixes a little learning, a lot of hands-on practice, a practice project and a review point; finish with a real project;
- prefer free or accessible resources: name well-known free platforms or resource types (e.g. "Khan Academy", "freeCodeCamp", "YouTube tutorials", "your local library", "a free online course"); never write URLs or prices.
JSON shape (keys exactly as written, in English):
{
  "title": "short motivating plan title",
  "weeklyHours": "realistic time per week, e.g. \\"4-5 hours per week\\"",
  "goal": "one sentence: the main goal of this plan",
  "skills": [{"skill": "exact skill name from the list", "target": "beginner | intermediate | advanced", "outcome": "one sentence: what you will be able to do at the end"}],
  "strategy": {"combine": "2-3 sentences: how the skills will be combined", "sequence": "2-3 sentences: why this sequence"},
  "phases": [{"name": "phase name", "period": "e.g. ${s.example}", "focus": "one sentence", "outcome": "one sentence: what you can do at the end of the phase"}],
  "schedule": [{"label": "", "title": "", "skills": ["exact skill names from the list"], "activities": ["specific activity"], "resources": ["free resource"], "project": "one practice project or exercise", "review": "the review point: how you check this block"}],
  "tracking": {"measure": ["3 to 5 simple ways to measure progress"], "milestones": [{"when": "e.g. ${s.example}", "milestone": "what you can show"}]},
  "advice": {"motivation": ["2 or 3 motivation tips"], "consistency": ["2 or 3 consistency tips"]}
}
"skills" lists every chosen skill once. "phases" has between 2 and 4 items. "milestones" has 3 to 5 items.
"schedule" has ${s.unit} (${s.n} items), each with ${s.actions} specific activities and 1 to 3 free resources.
The value of "target" stays in English, lowercase.`;
  const user = `Profession: ${profession}.
Skills I selected, in priority order: ${skills.map((k, i) => `${i + 1}. ${k}`).join('; ')}.
Plan duration: ${duration === '30d' ? '30 days' : duration === '3m' ? '3 months' : '1 year'}.
About me — current level: ${LEVELS[ans.level]}; my goal: ${GOALS[ans.goal]}; time I can give: ${HOURS[ans.hours]}.`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}
function validPlan(duration, chosen) {
  const want = SHAPE[duration].n;
  const names = new Map((chosen || []).map((k) => [k.toLowerCase(), k]));
  return (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const schedule = (Array.isArray(raw.schedule) ? raw.schedule : []).map((p) => ({
      label: clip(p && (p.label || p.period || p.week || p.month), 40), title: clip(p && p.title, 140), skills: list(p && p.skills, 6, 80),
      activities: list(p && (p.activities || p.actions), 6, 300), resources: list(p && p.resources, 4, 200), project: clip(p && (p.project || p.practice), 400), review: clip(p && (p.review || p.checkpoint), 300),
    })).filter((p) => p.title || p.activities.length).slice(0, want + 2);
    const phases = (Array.isArray(raw.phases) ? raw.phases : []).map((p) => ({ name: clip(p && (p.name || p.title), 120), period: clip(p && (p.period || p.label), 60), focus: clip(p && p.focus, 300), outcome: clip(p && p.outcome, 300) })).filter((p) => p.name).slice(0, 5);
    if (schedule.length < Math.ceil(want / 2) || !phases.length) return null;
    const sk = (Array.isArray(raw.skills) ? raw.skills : []).map((s) => (typeof s === 'string' ? { skill: s } : s || {}))
      .map((s) => ({ skill: names.get(clip(s.skill, 80).toLowerCase()) || clip(s.skill, 80), target: pickWord(s.target, DIFF, DIFF_ALIAS), outcome: clip(s.outcome, 300) })).filter((s) => s.skill);
    const st = raw.strategy || {}, tr = raw.tracking || {}, ad = raw.advice || {};
    return {
      v: 2, title: clip(raw.title, 140), weeklyHours: clip(raw.weeklyHours, 60), goal: clip(raw.goal || raw.intro, 400), skills: sk,
      strategy: { combine: clip(st.combine, 600), sequence: clip(st.sequence, 600) }, phases, schedule,
      tracking: { measure: list(tr.measure, 6, 240), milestones: (Array.isArray(tr.milestones) ? tr.milestones : []).map((m) => (typeof m === 'string' ? { when: '', milestone: clip(m, 240) } : { when: clip(m && m.when, 60), milestone: clip(m && (m.milestone || m.what), 240) })).filter((m) => m.milestone).slice(0, 6) },
      advice: { motivation: list(ad.motivation, 4, 240), consistency: list(ad.consistency, 4, 240) },
    };
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
    const key = crypto.createHash('sha256').update(['v' + OUTLOOK_V, profession.toLowerCase(), x.lang, x.band, x.cc].join('|')).digest('hex');
    if (!b.force) {
      const hit = await db.getOne(`SELECT result, created_at FROM plan_outlook_cache WHERE cache_key = $1 AND created_at > NOW() - make_interval(days => $2)`, [key, cfg().cacheDays]);
      if (hit) return res.json({ ok: true, cached: true, profession, outlook: hit.result, recommend: { '1-2': '30d', '3-5': '3m', '6+': '1y' } });
    }
    if (!llm.configured()) return fail(res, 503, 'AI_UNAVAILABLE', 'The AI planning service is not configured yet.');
    if (!(await underLimit(user.id))) return fail(res, 429, 'AI_LIMIT', 'You reached today’s planning limit. Please try again tomorrow.');
    let r;
    try { r = await llm.chatJSON(outlookPrompt(profession, x), { validate: validOutlookV2, maxTokens: 3600 }); } catch (err) { return aiError(res, err); }
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
    try { r = await llm.chatJSON(planPrompt(profession, skills, duration, ans, x), { validate: validPlan(duration, skills), maxTokens: SHAPE[duration].tokens }); } catch (err) { return aiError(res, err); }
    // keep the profession, the outlook the user saw (with the skills they picked) and the plan together
    outlook.profession = profession;
    const row = await db.getOne(`INSERT INTO learning_plans (user_id, profession, lang, duration, skills, answers, outlook, plan, model, saved)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE) RETURNING id, profession, lang, duration, skills, answers, outlook, plan, saved, created_at`,
    [user.id, profession, x.lang, duration, JSON.stringify(skills), JSON.stringify(ans), JSON.stringify(outlook), JSON.stringify(r.data), r.provider + '/' + r.model]);
    await logUse(user.id, 'plan', r.provider);
    res.json({ ok: true, plan: row, recommended: recommend(skills.length) });
  } catch (err) { next(err); }
});

/* GET /api/plans — the plans the user saved to "My favourites" (v20261101c: step 4 → ⭐ Save) */
router.get('/', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const r = await db.query(`SELECT id, profession, duration, skills, saved_at, created_at FROM learning_plans WHERE user_id = $1 AND saved ORDER BY saved_at DESC NULLS LAST, created_at DESC LIMIT 100`, [user.id]);
    res.json({ ok: true, items: r.rows, configured: llm.configured() });
  } catch (err) { next(err); }
});

const isId = (s) => /^[0-9a-f-]{36}$/i.test(String(s || ''));
router.get('/:id', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!isId(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'Not found');
    const row = await db.getOne(`SELECT id, profession, lang, duration, skills, answers, outlook, plan, saved, created_at FROM learning_plans WHERE id = $1 AND user_id = $2`, [req.params.id, user.id]);
    if (!row) return fail(res, 404, 'NOT_FOUND', 'Not found');
    res.json({ ok: true, plan: row });
  } catch (err) { next(err); }
});
/* POST /api/plans/:id/save { saved: true|false } — add to / remove from "My favourites" */
router.post('/:id/save', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!isId(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'Not found');
    const saved = !(req.body && req.body.saved === false);
    if (saved) { // cap My favourites › My plans (PLAN_SAVED_MAX, default 100)
      const max = parseInt(process.env.PLAN_SAVED_MAX || '100', 10);
      const c = await db.getOne(`SELECT count(*)::int AS n FROM learning_plans WHERE user_id = $1 AND saved AND id <> $2`, [user.id, req.params.id]);
      if ((c && c.n) >= max) return fail(res, 400, 'PLANS_FULL', `You can save up to ${max} plans. Remove some first.`);
    }
    const row = await db.getOne(`UPDATE learning_plans SET saved = $3, saved_at = CASE WHEN $3 THEN COALESCE(saved_at, NOW()) ELSE NULL END
      WHERE id = $1 AND user_id = $2 RETURNING id, profession, duration, skills, saved, saved_at, created_at`, [req.params.id, user.id, saved]);
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
module.exports._test = { recommend, validOutlook, validOutlookV2, validPlan, outlookPrompt, planPrompt, ageBand, context };
