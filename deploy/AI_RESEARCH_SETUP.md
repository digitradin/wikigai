# Wikigai — AI for My learning › Plans (v20261026)

## What the user sees
1. **Choose a profession** — only the list of professions from their Wikigai path (Stage 3 match first,
   then their Stage 2 shortlist). No filters, no free text.
2. **Step 1 — Outlook & skills** (simple language): what the job is, how it is changing, 6–8 key
   questions to think about, and the **10 key skills ranked from most to least relevant**. Each skill has
   a **▶ Learn it** button → WikiVids search "learn to <skill>" (query written by the AI in the user's language).
3. **Step 2 — Create the plan**: tick 1–10 skills, answer 3 quick questions (level, goal, hours/week),
   pick the length. Recommended: 1–2 skills → **30 days** (4 blocks) · 3–5 → **3 months** (6 two-week blocks)
   · 6+ → **1 year** (12 months). The user can switch 30d / 3m / 1y before confirming.
4. The plan is **saved** ("My saved plans"); each can be **downloaded as a stand-alone HTML file** or
   **printed / saved as PDF** (clean printable page, browser print dialog → "Save as PDF").

## Hidden filters (server-side / never shown)
Age band (from the optional birthday), country (My path region → grading country → browser region),
language, and the 3 answers shape vocabulary, examples and pace. Plans follow a skill-mastery method:
80/20 sub-skills first, learn → practise → feedback → small proof, priority order, final project.

## Free AI providers (backend/src/lib/llm.js) — checked 28 Oct 2026, no credit card
Every key that is filled in is used. Requests rotate across providers (so each free quota lasts longer)
and fail over to the next one on rate limits, errors, timeouts or unreadable answers (provider rests 2 min).

| Setting(s) | Get the free key at | Default model | Free limit (approx.) | Notes |
|---|---|---|---|---|
| AI_ROUTER_TOKEN | router.digitradin.cloud → My Tools → API tokens | auto | your router | your own router |
| GROQ_API_KEY | console.groq.com → API Keys | openai/gpt-oss-120b | 30 req/min, 1,000 req/day | Llama 3.3 is no longer free (Aug 2026) |
| OPENROUTER_API_KEY | openrouter.ai → Keys | openrouter/free | 20 req/min, 50 req/day | picks any free model |
| MISTRAL_API_KEY | console.mistral.ai → Experiment plan | mistral-small-latest | low, shown in console | phone check; requests may be used to train their models |
| CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN | dash.cloudflare.com → AI → Workers AI (token with "Workers AI" permission) | @cf/openai/gpt-oss-120b | 10,000 neurons/day | |
| ZAI_API_KEY | z.ai → API keys | glm-4.5-flash | free model | China-based provider |
| GEMINI_API_KEY | aistudio.google.com | gemini-flash-latest | ~20 req/day (Flash) | ⚠ Google's free tier is not for apps serving EU/UK users — leave empty for Wikigai |
| NVIDIA_API_KEY | build.nvidia.com | openai/gpt-oss-120b | ~40 req/min | free endpoints are for prototyping only |

No longer free (removed): Cerebras (card-only trial since Jul 2026), GitHub Models (retired Jul 2026), SambaNova (no new credits).
Best start: **Groq + Cloudflare + OpenRouter** (+ your router). Free model names change — if the deploy check shows ✖,
set that provider's `*_MODEL` (e.g. GROQ_MODEL=qwen/qwen3-32b).
Optional: `AI_PROVIDER_ORDER=router,groq,cloudflare`, `AI_STRATEGY=ordered`, `AI_TIMEOUT_MS=60000`,
`AI_COOLDOWN_S=120`, `AI_MAX_ATTEMPTS=4`, `PLAN_DAILY_LIMIT=15`, `PLAN_OUTLOOK_CACHE_DAYS=30`.

**Where to put keys:** `tools/local/local.env` (local test). `Deploy Wikigai.command` copies every filled-in
key to the server's `/opt/cps/.env.production` (values never printed) and then tests each provider from the server.

## Cost controls
- Step 1 is cached and **shared** between users with the same profession + language + age band + country
  (30 days) → most users never trigger an AI call for it.
- Per-user daily limit of fresh AI calls (`PLAN_DAILY_LIMIT`, default 15); cached answers don't count.
- Answers are validated and trimmed to the expected JSON shape.

## Privacy
Sent to the AI: profession, chosen skills, age band, country code, language, the 3 answers. Never name,
email, birth date or ids.

## API
`POST /api/plans/outlook` · `POST /api/plans` · `GET /api/plans` · `GET /api/plans/:id` · `POST /api/plans/:id/delete`
(the older `/api/learn/research` still works and now uses the same provider pool).
Analytics events: `plan_outlook`, `plan_create`, `plan_download`, `plan_print`.
