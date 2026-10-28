/* Wikigai — free-first LLM access: one call, many FREE providers (v20261028: list checked Oct 2026).
   Every provider below speaks the OpenAI-compatible /chat/completions API. The server uses
   every key that is configured, spreads requests across them (round-robin, so each free
   quota lasts longer) and fails over to the next one on errors, rate limits, timeouts or
   unreadable answers. A provider that answers 429/5xx/timeout rests for AI_COOLDOWN_S.

   Free tiers (no card), Oct 2026 — see deploy/AI_RESEARCH_SETUP.md:
     AI_ROUTER_TOKEN (+ AI_ROUTER_URL, AI_ROUTER_MODEL)   your Digitradin AI router
     GROQ_API_KEY        (GROQ_MODEL)        console.groq.com — free: gpt-oss / Qwen (Llama left the free tier Aug 2026)
     OPENROUTER_API_KEY  (OPENROUTER_MODEL)  openrouter.ai — "openrouter/free" picks a free model; 50 req/day
     MISTRAL_API_KEY     (MISTRAL_MODEL)     console.mistral.ai — free Experiment plan (phone check; data may train models)
     CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (CLOUDFLARE_MODEL)  Workers AI — 10,000 neurons/day free
     ZAI_API_KEY         (ZAI_MODEL)         z.ai — free GLM Flash models
     GEMINI_API_KEY      (GEMINI_MODEL)      aistudio.google.com — NOTE: Google's free tier is not for apps serving EU/UK users
     NVIDIA_API_KEY      (NVIDIA_MODEL)      build.nvidia.com — free endpoints, prototyping only
   Removed (no longer free): Cerebras (card trial since Jul 2026), GitHub Models (retired Jul 2026), SambaNova.
     AI_PROVIDER_ORDER   e.g. "router,groq,mistral" — limits/orders the providers (default: all, in the order above)
     AI_STRATEGY         "rotate" (default: spread load) or "ordered" (always try the first one first)
     AI_TIMEOUT_MS       per call, default 60000
     AI_COOLDOWN_S       rest after a rate limit / failure, default 120
     AI_MAX_ATTEMPTS     providers tried per request, default 4 */
'use strict';

const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

const CATALOG = [
  { id: 'router', base: () => (process.env.AI_ROUTER_URL || 'https://router.digitradin.cloud').replace(/\/+$/, '') + '/v1', key: 'AI_ROUTER_TOKEN', model: 'AI_ROUTER_MODEL', def: 'auto' },
  { id: 'groq', base: () => 'https://api.groq.com/openai/v1', key: 'GROQ_API_KEY', model: 'GROQ_MODEL', def: 'openai/gpt-oss-120b', extra: { reasoning_effort: 'low' } },
  { id: 'openrouter', base: () => 'https://openrouter.ai/api/v1', key: 'OPENROUTER_API_KEY', model: 'OPENROUTER_MODEL', def: 'openrouter/free' },
  { id: 'mistral', base: () => 'https://api.mistral.ai/v1', key: 'MISTRAL_API_KEY', model: 'MISTRAL_MODEL', def: 'mistral-small-latest' },
  { id: 'cloudflare', base: () => `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID || 'missing-account-id'}/ai/v1`, key: 'CLOUDFLARE_API_TOKEN', need: 'CLOUDFLARE_ACCOUNT_ID', model: 'CLOUDFLARE_MODEL', def: '@cf/openai/gpt-oss-120b' },
  { id: 'zai', base: () => 'https://api.z.ai/api/paas/v4', key: 'ZAI_API_KEY', model: 'ZAI_MODEL', def: 'glm-4.5-flash' },
  { id: 'gemini', base: () => 'https://generativelanguage.googleapis.com/v1beta/openai', key: 'GEMINI_API_KEY', model: 'GEMINI_MODEL', def: 'gemini-flash-latest' },
  { id: 'nvidia', base: () => 'https://integrate.api.nvidia.com/v1', key: 'NVIDIA_API_KEY', model: 'NVIDIA_MODEL', def: 'openai/gpt-oss-120b' },
];
// tests can point any provider at a stand-in: AI_BASE_<ID>=http://127.0.0.1:9999/v1
const baseOf = (p) => (process.env['AI_BASE_' + p.id.toUpperCase()] || p.base()).replace(/\/+$/, '');

const resting = new Map(); // id → time it may be used again
let turn = 0;

function providers() {
  const order = (process.env.AI_PROVIDER_ORDER || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const all = CATALOG.filter((p) => process.env[p.key] && (!p.need || process.env[p.need]));
  const picked = order.length ? order.map((id) => all.find((p) => p.id === id)).filter(Boolean) : all;
  return picked.map((p) => ({ id: p.id, url: baseOf(p) + '/chat/completions', token: process.env[p.key], model: process.env[p.model] || p.def, extra: (process.env[p.model] || p.def).includes('gpt-oss') ? (p.extra || {}) : {} }));
}
const configured = () => providers().length > 0;
const status = () => providers().map((p) => ({ id: p.id, model: p.model, resting: (resting.get(p.id) || 0) > Date.now() }));

/* tolerant JSON extraction: strips code fences / thinking / text around the object */
function parseJson(text) {
  if (!text) return null;
  let t = String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim().replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch { /* try the outermost object */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) {
    const s = t.slice(a, b + 1);
    try { return JSON.parse(s); } catch { /* light repair: trailing commas */ }
    try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch { /* give up */ }
  }
  return null;
}

async function callOne(p, messages, opts) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeout);
  try {
    const r = await fetch(p.url, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + p.token, 'HTTP-Referer': 'https://wikigai.com', 'X-Title': 'Wikigai' },
      // reasoning models (gpt-oss) also spend tokens thinking: give them extra room
      body: JSON.stringify({ model: p.model, messages, temperature: opts.temperature, max_tokens: p.model.includes('gpt-oss') ? opts.maxTokens + 2000 : opts.maxTokens, ...p.extra }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(p.id + ' ' + r.status + ': ' + clip(data.error && (data.error.message || data.error), 160));
      e.status = r.status; throw e;
    }
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return { text: text || '', model: data.model || p.model };
  } catch (err) {
    if (err.name === 'AbortError') { const e = new Error(p.id + ' timeout'); e.status = 504; throw e; }
    throw err;
  } finally { clearTimeout(timer); }
}

/* Ask for JSON. validate(obj) → cleaned object or null. Tries up to AI_MAX_ATTEMPTS providers;
   each gets one "repair" turn if its first answer is not usable. */
async function chatJSON(messages, { validate = (x) => x, maxTokens = 3000, temperature = 0.4 } = {}) {
  const list = providers();
  if (!list.length) { const e = new Error('No AI provider configured'); e.code = 'AI_UNAVAILABLE'; throw e; }
  const timeout = parseInt(process.env.AI_TIMEOUT_MS || '60000', 10);
  const cool = parseInt(process.env.AI_COOLDOWN_S || '120', 10) * 1000;
  const maxAttempts = Math.max(1, parseInt(process.env.AI_MAX_ATTEMPTS || '4', 10));
  const rotate = (process.env.AI_STRATEGY || 'rotate') !== 'ordered';
  const start = rotate ? (turn++ % list.length) : 0;
  const ordered = list.slice(start).concat(list.slice(0, start));
  const now = Date.now();
  const queue = ordered.filter((p) => (resting.get(p.id) || 0) <= now).concat(ordered.filter((p) => (resting.get(p.id) || 0) > now));
  const tried = [];
  for (const p of queue.slice(0, maxAttempts)) {
    try {
      let r = await callOne(p, messages, { timeout, maxTokens, temperature });
      let out = validate(parseJson(r.text));
      if (!out) {
        r = await callOne(p, [...messages, { role: 'assistant', content: clip(r.text, 6000) }, { role: 'user', content: 'That was not valid JSON in the requested shape. Reply again with ONLY the JSON object, nothing else.' }], { timeout, maxTokens, temperature: 0.2 });
        out = validate(parseJson(r.text));
      }
      if (out) { resting.delete(p.id); return { data: out, provider: p.id, model: clip(r.model, 80), tried }; }
      tried.push(p.id + ':bad_json');
    } catch (err) {
      tried.push(p.id + ':' + (err.status || 'err'));
      if (!err.status || err.status === 429 || err.status >= 500 || err.status === 401 || err.status === 403) resting.set(p.id, Date.now() + cool);
      console.warn('[llm]', err.message);
    }
  }
  const e = new Error('All AI providers failed: ' + tried.join(', '));
  e.code = tried.length && tried.every((t) => t.endsWith(':bad_json')) ? 'AI_BAD_OUTPUT' : 'AI_FAILED';
  throw e;
}

module.exports = { chatJSON, configured, status, parseJson, providers, _test: { resting, CATALOG } };
