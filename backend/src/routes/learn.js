/* Wikigai — My learning › Plans: AI research ("I want to learn about X").
   The browser never talks to the AI directly: this route builds the prompt, calls the
   Digitradin AI router (OpenAI-compatible /v1/chat/completions, free models) with the
   server's token, validates the JSON answer and saves it for the user.

   Env:
     AI_ROUTER_URL     default https://router.digitradin.cloud
     AI_ROUTER_TOKEN   required — an rt_… token created in the router's "My Tools"
     AI_ROUTER_MODEL   default "auto" (router picks the best free model)
     AI_DAILY_LIMIT    research requests per user per day (default 10)
     AI_TIMEOUT_MS     default 90000

   Privacy: only the topic, the user's Wikigai results summary (areas, professions,
   strongest subjects) and — if they gave a birthday — their age in years are sent;
   never name, email, birth date or ids. */
'use strict';
const express = require('express');
const db = require('../lib/db');
const { requireUser } = require('./auth');
const { ageOn } = require('../lib/birthdate');
const llm = require('../lib/llm');

const router = express.Router();
const LANGS = { en: 'English', fr: 'French', es: 'Spanish' };
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const list = (a, n, len) => (Array.isArray(a) ? a : []).map((x) => clip(x, len)).filter(Boolean).slice(0, n);
const cfg = () => ({
  url: (process.env.AI_ROUTER_URL || 'https://router.digitradin.cloud').replace(/\/+$/, ''),
  token: process.env.AI_ROUTER_TOKEN || '',
  model: process.env.AI_ROUTER_MODEL || 'auto',
  limit: parseInt(process.env.AI_DAILY_LIMIT || '10', 10),
  timeout: parseInt(process.env.AI_TIMEOUT_MS || '90000', 10),
});

function prompts(topic, lang, ctx) {
  const language = LANGS[lang] || 'English';
  const system = `You are Wikigai's learning coach for students and early-career people choosing a career path.
Answer ONLY with one JSON object, no markdown, no text before or after it. Write every text value in ${language}.
Be concrete, practical and encouraging. Do not invent statistics, prices, school names or URLs.
JSON shape (keep the keys in English exactly as written):
{
  "topic": "short name of the topic",
  "outlook": {
    "summary": "2-3 sentences: what it takes to become great in this domain",
    "keyAreas": [{"title": "", "detail": ""}],          // 3 to 5 key areas to master
    "decisions": [{"title": "", "detail": ""}],         // 2 to 4 key decisions to make (paths, specialisations, study routes)
    "considerations": [""]                              // 3 to 5 things to keep in mind (market, lifestyle, risks)
  },
  "focus": [{"skill": "", "why": "", "videoSearch": ""}], // 5 to 10 key skills, most important first; videoSearch = a short ${language} search query to find good tutorial videos for this skill
  "plan30": [{"days": "1-7", "title": "", "actions": [""]}],   // exactly 4 blocks covering days 1-30, 2-4 concrete daily/weekly actions each, aimed at the key skills
  "plan1y": [{"period": "", "title": "", "actions": [""]}],    // 3 to 4 milestones for the first year
  "plan3y": [{"period": "", "title": "", "actions": [""]}]     // 2 to 3 milestones for years 2-3
}`;
  const about = [
    ctx.domains.length ? `Top areas of work I love: ${ctx.domains.join(', ')}.` : '',
    ctx.professions.length ? `Professions on my shortlist: ${ctx.professions.join(', ')}.` : '',
    ctx.strengths.length ? `My strongest school subjects: ${ctx.strengths.join(', ')}.` : '',
  ].filter(Boolean).join(' ');
  const user = `I want to learn about: ${topic}.
${about ? 'About me (from my Wikigai results): ' + about : 'I have not finished my Wikigai results yet.'}
${lifeStage(ctx.age)} Tailor the outlook, the key skills, the learning resources and the pace of the plans to my age and stage.`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

/* the user's age (from their optional birthday) → how to pitch the plan */
function lifeStage(age) {
  if (age == null) return 'I am a student or early in my career.';
  if (age < 12) return `I am ${age} years old, in primary school: keep it playful, safe, short and suitable for a child, with a parent or teacher involved.`;
  if (age < 16) return `I am ${age} years old, in lower secondary school: suggest school subjects, clubs, safe free resources and small projects; plans must fit around school, and anything involving money, travel or the internet should involve a parent.`;
  if (age < 19) return `I am ${age} years old, in upper secondary school: help me choose subjects, upcoming studies or vocational routes, and first projects; plans must fit around school and exams.`;
  if (age < 25) return `I am ${age} years old, a student or at the very start of my career: cover study routes, internships, first jobs and portfolio building.`;
  if (age < 40) return `I am ${age} years old and may be changing careers: build on transferable experience, part-time or online learning that fits around work, and a realistic transition path.`;
  return `I am ${age} years old and considering a career change or a new field: value my experience, suggest flexible part-time learning, certifications and a realistic transition.`;
}
const ageBand = (age) => (age == null ? 'na' : age < 12 ? 'c' : age < 16 ? 'ls' : age < 19 ? 'us' : age < 25 ? 'ya' : age < 40 ? 'a' : 'm');

/* tolerant JSON extraction: strips code fences / text around the object */
function parseJson(text) {
  if (!text) return null;
  let t = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch { /* try the outermost object */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fallthrough */ } }
  return null;
}

/* keep only the expected shape, with sane lengths */
function normalize(raw, topic) {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw.outlook || {};
  const items = (a, n) => (Array.isArray(a) ? a : []).map((x) => (typeof x === 'string' ? { title: clip(x, 120), detail: '' } : { title: clip(x && x.title, 120), detail: clip(x && x.detail, 500) })).filter((x) => x.title).slice(0, n);
  const steps = (a, n, k) => (Array.isArray(a) ? a : []).map((x) => ({ [k]: clip(x && (x[k] || x.period || x.days), 40), title: clip(x && x.title, 140), actions: list(x && x.actions, 6, 300) })).filter((x) => x.title || x.actions.length).slice(0, n);
  const out = {
    topic: clip(raw.topic || topic, 120),
    outlook: { summary: clip(o.summary, 900), keyAreas: items(o.keyAreas, 6), decisions: items(o.decisions, 5), considerations: list(o.considerations, 6, 300) },
    focus: (Array.isArray(raw.focus) ? raw.focus : []).map((f) => (typeof f === 'string' ? { skill: clip(f, 100), why: '', videoSearch: '' } : { skill: clip(f && f.skill, 100), why: clip(f && f.why, 400), videoSearch: clip(f && f.videoSearch, 120) })).filter((f) => f.skill).slice(0, 10),
    plan30: steps(raw.plan30, 6, 'days'),
    plan1y: steps(raw.plan1y, 5, 'period'),
    plan3y: steps(raw.plan3y, 4, 'period'),
  };
  if (!out.outlook.summary && !out.focus.length && !out.plan30.length) return null;
  return out;
}

const fail = (res, status, code, error) => res.status(status).json({ error, code });

/* POST /api/learn/research  { topic, lang, context: { domains[], professions[], strengths[] }, force? } */
router.post('/research', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const c = cfg();
    const b = req.body || {};
    const topic = clip(b.topic, 120);
    if (topic.length < 2) return fail(res, 400, 'BAD_TOPIC', 'Please tell us what you want to learn about.');
    const lang = LANGS[b.lang] ? b.lang : 'en';
    const age = user.birthDate ? ageOn(user.birthDate) : null;
    const key = topic.toLowerCase() + '|age:' + ageBand(age); // a plan for a 14-year-old differs from one for a 30-year-old
    if (!b.force) {
      const hit = await db.getOne(`SELECT id, topic, lang, result, created_at FROM learning_research
        WHERE user_id = $1 AND topic_key = $2 AND lang = $3 AND created_at > NOW() - INTERVAL '7 days' ORDER BY created_at DESC LIMIT 1`, [user.id, key, lang]);
      if (hit) return res.json({ ok: true, cached: true, research: hit });
    }
    if (!llm.configured()) return fail(res, 503, 'AI_UNAVAILABLE', 'The AI research service is not configured yet.');
    const used = await db.getOne(`SELECT count(*)::int AS n FROM learning_research WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'`, [user.id]);
    if ((used && used.n) >= c.limit) return fail(res, 429, 'AI_LIMIT', 'You reached today’s research limit. Please try again tomorrow.');
    const ctx = b.context || {};
    const messages = prompts(topic, lang, { domains: list(ctx.domains, 5, 80), professions: list(ctx.professions, 6, 80), strengths: list(ctx.strengths, 4, 60), age });
    let out = null, model = c.model;
    try { // v20261026: every free provider configured on the server (lib/llm.js), rotated with fail-over
      const r = await llm.chatJSON(messages, { validate: (x) => normalize(x, topic), maxTokens: 3000 });
      out = r.data; model = r.provider + '/' + r.model;
    } catch (err) {
      console.warn('[learn] AI call failed:', err.message);
      if (err.code === 'AI_BAD_OUTPUT') return fail(res, 502, 'AI_BAD_OUTPUT', 'The AI answer could not be read. Please try again.');
      return fail(res, 502, 'AI_FAILED', 'The AI could not answer right now. Please try again in a moment.');
    }
    if (!out) return fail(res, 502, 'AI_BAD_OUTPUT', 'The AI answer could not be read. Please try again.');
    const row = await db.getOne(`INSERT INTO learning_research (user_id, topic, topic_key, lang, result, model) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, topic, lang, result, created_at`, [user.id, topic, key, lang, JSON.stringify(out), clip(model, 80)]);
    res.json({ ok: true, cached: false, research: row, remaining: Math.max(0, c.limit - ((used && used.n) || 0) - 1) });
  } catch (err) { next(err); }
});

/* GET /api/learn/research — the user's recent research (titles only) */
router.get('/research', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const r = await db.query(`SELECT id, topic, lang, created_at FROM learning_research WHERE user_id = $1 ORDER BY created_at DESC LIMIT 12`, [user.id]);
    res.json({ ok: true, items: r.rows, configured: llm.configured() });
  } catch (err) { next(err); }
});

/* GET /api/learn/research/:id */
router.get('/research/:id', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'Not found');
    const row = await db.getOne(`SELECT id, topic, lang, result, created_at FROM learning_research WHERE id = $1 AND user_id = $2`, [req.params.id, user.id]);
    if (!row) return fail(res, 404, 'NOT_FOUND', 'Not found');
    res.json({ ok: true, research: row });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports._test = { parseJson, normalize, prompts, lifeStage };
