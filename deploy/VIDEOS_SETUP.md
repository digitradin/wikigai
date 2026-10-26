# Wikigai — WikiVids (My learning › Videos)

Users type or edit a few words (prefilled with their top profession, or the skill they clicked in Plans),
pick one of their path areas, and get a short list of good learning videos. They can watch them in a
privacy-enhanced player (youtube-nocookie.com) and ★ save them to **My WikiVids**.
All filters are applied on the server and never shown to users.

## Hidden filters and ranking (backend/src/lib/videoRank.js)
- Query = the user's words + a learning intent in their language ("tutorial explained" / "cours expliqué" / "curso explicado").
- YouTube asked twice (by relevance and by view count), embeddable videos only, the user's language,
  SafeSearch **strict** for under-18s and unknown ages (moderate for adults).
- Dropped: Shorts (< 3 min), > 3 h, live/upcoming, < 1,000 views, Music/Gaming/Comedy/Entertainment categories,
  clickbait (ALL CAPS, "!!!", prank, reaction…), videos that match neither the selected area nor the words.
- Ranked by popularity (views) and title/description match first, then fit with the selected area,
  like ratio, learning intent, education categories, a 4–45 min length and freshness. Max 3 videos per channel.

## Settings (/opt/cps/.env.production)
```
YOUTUBE_API_KEY=...          # Google Cloud console → enable "YouTube Data API v3" → Credentials → API key
                             # (restrict the key to the YouTube Data API v3)
VIDEO_DAILY_LIMIT=30         # fresh searches per user per day (cached ones are free)
VIDEO_CACHE_HOURS=24         # identical searches reuse results for everyone
```
**Automatic:** `Deploy Wikigai.command` copies `YOUTUBE_API_KEY` from `tools/local/local.env` (or from
`deploy/.secrets.env`, if you prefer a separate server key) into the server's `.env.production`, never printing it,
then asks YouTube from the server whether the key works and prints ✅ or the reason it was refused.
The key must be restricted by **IP address** (server: 76.13.248.104), not by website — the server calls YouTube directly.

Without `YOUTUBE_API_KEY` the page says "Video search isn't switched on yet"; saved WikiVids still work.

## Quota
The free YouTube quota is 10,000 units/day. One fresh search costs about 201 units (2 searches + 1 details call),
so roughly 50 fresh searches per day; the shared 24-hour cache makes repeated searches free.
Ask Google for a quota increase when traffic grows.

## Data
Migration `007_videos.sql`: `favorite_videos` (per user, max 200, deleted with the account),
`video_search_cache` (results only, no user data), `video_search_log` (for the daily limit).
Analytics events: `video_search`, `video_play`, `video_save` (visible on the owner stats page).
