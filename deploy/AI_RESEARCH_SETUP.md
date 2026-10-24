# Wikigai — AI research (My learning › Plans)

The Plans page lets a signed-in user type "I want to learn about X" (or pick an area/profession
from their path) and get three blocks: **Outlook**, **Focus** (5–10 key skills, each with a
video-search button) and **Plan** (next 30 days, 1 year, 3 years).

## How it works
Browser → `POST /api/learn/research` (Wikigai backend) → your AI router
`https://router.digitradin.cloud/v1/chat/completions` (OpenAI-compatible, free models) → JSON
answer validated by the backend → saved in `learning_research` → shown to the user.
The router token stays on the server; the browser never sees it.

Sent to the AI: the topic, the user's language, and a summary of their Wikigai results
(top areas, shortlisted professions, strongest subjects). **Never** name, email or ids.

## Server settings (add to /opt/cps/.env.production)
```
AI_ROUTER_URL=https://router.digitradin.cloud
AI_ROUTER_TOKEN=rt_...            # create it in the router: My Tools → API tokens
AI_ROUTER_MODEL=auto              # or a specific free model id from your router
AI_DAILY_LIMIT=10                 # research requests per user per day
AI_TIMEOUT_MS=90000
```
Without `AI_ROUTER_TOKEN` the page still works but shows "AI research isn't switched on yet".

## Cost & abuse controls
- Per-user daily limit (`AI_DAILY_LIMIT`), plus the site-wide rate limit.
- Same user + same topic + same language within 7 days → answered from the saved result (no AI call);
  "Ask again" forces a fresh answer.
- Answers are capped in size and stripped of anything outside the expected JSON shape.

## Analytics
`research_start`, `research_done` and `video_search` events appear under Engagement on the owner statistics page (dashboard.digitradin.cloud).
