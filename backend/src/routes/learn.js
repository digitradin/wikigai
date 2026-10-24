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

   Privacy: only the topic and the user's Wikigai results summary (areas, professions,
   strongest subjects) are sent — never name, email or ids. */
'use strict';
const express = require('express');
const db = require('../lib/db');
const { requireUser } = require('./auth');

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
I am a student or early in my career. Tailor the outlook, the key skills and the plans to me.`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

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

async function callAI(messages, c) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), c.timeout);
  try {
    const r = await fetch(c.url + '/v1/chat/completions', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.token },
      body: JSON.stringify({ model: c.model, messages, temperature: 0.4, max_tokens: 3000 }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error('AI router ' + r.status + ': ' + clip(data.error && (data.error.message || data.error) || '', 200)); e.status = r.status; throw e; }
    return { text: data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content, model: data.model || c.model };
  } finally { clearTimeout(timer); }
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
    const key = topic.toLowerCase();
    if (!b.force) {
      const hit = await db.getOne(`SELECT id, topic, lang, result, created_at FROM learning_research
        WHERE user_id = $1 AND topic_key = $2 AND lang = $3 AND created_at > NOW() - INTERVAL '7 days' ORDER BY created_at DESC LIMIT 1`, [user.id, key, lang]);
      if (hit) return res.json({ ok: true, cached: true, research: hit });
    }
    if (!c.token) return fail(res, 503, 'AI_UNAVAILABLE', 'The AI research service is not configured yet.');
    const used = await db.getOne(`SELECT count(*)::int AS n FROM learning_research WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'`, [user.id]);
    if ((used && used.n) >= c.limit) return fail(res, 429, 'AI_LIMIT', 'You reached today’s research limit. Please try again tomorrow.');
    const ctx = b.context || {};
    const messages = prompts(topic, lang, { domains: list(ctx.domains, 5, 80), professions: list(ctx.professions, 6, 80), strengths: list(ctx.strengths, 4, 60) });
    let out = null, model = c.model;
    try {
      let r = await callAI(messages, c);
      model = r.model;
      out = normalize(parseJson(r.text), topic);
      if (!out) { // one repair attempt
        r = await callAI([...messages, { role: 'assistant', content: clip(r.text, 6000) }, { role: 'user', content: 'That was not valid JSON in the requested shape. Reply again with ONLY the JSON object.' }], c);
        model = r.model;
        out = normalize(parseJson(r.text), topic);
      }
    } catch (err) {
      console.warn('[learn] AI call failed:', err.name === 'AbortError' ? 'timeout' : err.message);
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
    res.json({ ok: true, items: r.rows, configured: !!cfg().token });
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
module.exports._test = { parseJson, normalize, prompts };
