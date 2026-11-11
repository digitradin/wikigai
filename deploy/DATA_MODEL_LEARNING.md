# Wikigai — data model: My learning & My favourites (v20261101e)

All tables live in the same PostgreSQL database as the accounts. Every per-user row references
`users(id)` with **ON DELETE CASCADE** → deleting an account removes all of its plans, favourites and logs.
No name, e-mail or birth date is stored in these tables.

## Per-user content (kept until the user removes it)
| Table | One row = | Key columns | Rules |
|---|---|---|---|
| `learning_plans` | a study plan (Plans step 4) | `user_id`, `profession`, `lang`, `duration` (30d/3m/1y), `skills` (JSON array 1–10), `answers`, `outlook` (overview snapshot), `plan`, `saved`, `saved_at`, `created_at` | `saved = true` ⇔ in My favourites (`saved_at` set). Max 100 saved per user (API, `PLAN_SAVED_MAX`). **Unsaved plans are deleted after 30 days** (`PLAN_UNSAVED_DAYS`). |
| `favorite_videos` | a saved WikiVid | `user_id`, `video_id` (YouTube id, 11 chars), `title`, `channel`, `thumb`, `duration_s`, `views`, `domain`, `query`, `created_at` | Unique per user + video. Max 200 per user (API). |
| `learning_research` | old "research" answer (v20261024) | `user_id`, `topic`, `result` | Legacy, still readable; no new UI writes it. |

`user_favorites` (**view**) = one row per favourite item across kinds: `user_id, kind ('plan'|'video'), ref, title, saved_at`.
New favourite kinds (courses, schools, tools, jobs) get their **own table** with their own columns and rules, plus one
`UNION ALL` branch in the view — so every type stays properly typed while "My favourites" can still be read in one query.

## Shared caches (not personal, safe to lose)
| Table | Reused for | Purged after |
|---|---|---|
| `plan_outlook_cache` | AI profession overview per profession + language + age band + country | 30 days (`PLAN_OUTLOOK_CACHE_DAYS`) |
| `video_search_cache` | filtered YouTube results per search | 24 h (`VIDEO_CACHE_HOURS`) |

## Limit logs (only for the daily limits)
`plan_ai_log` (fresh AI calls: kind `outlook`/`plan`, provider) and `video_search_log` — purged after **7 days**.

## Integrity rules in the database (migration `013_favorites_structure.sql`)
- `learning_plans`: lang ∈ en/fr/es · skills is a JSON array of 1–10 · outlook and plan are JSON objects ·
  saved ⇔ saved_at · profession 2–120 characters · duration ∈ 30d/3m/1y (since 008).
- `favorite_videos`: valid 11-character YouTube id · durations/views ≥ 0 · unique (user, video).
- `plan_outlook_cache.lang` ∈ en/fr/es · `plan_ai_log.kind` ∈ outlook/plan.
- Added as `NOT VALID`: enforced for every new or changed row; existing rows are never blocked at start-up.

## Indexes (matched to the queries the site runs)
My plans list `(user_id, saved_at DESC) WHERE saved` · unsaved clean-up `(created_at) WHERE NOT saved` ·
WikiVids `(user_id, created_at DESC)` · caches/logs `(created_at)` for the purge · limit logs `(user_id, created_at DESC)`.

## Clean-up job
`backend/src/lib/retention.js` runs 90 s after start and then daily (next to the analytics retention). It never touches
saved plans or saved WikiVids. Each run logs what it removed, e.g. `[retention] learning data purged: {...}`.

## Backups
These tables are in the same database, so the prod backup (pg_dump, N and N-1) includes them automatically.
