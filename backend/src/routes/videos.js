/* Wikigai — My learning › Videos ("WikiVids").
   GET  /api/videos/search?q=&domain=&lang=   filtered, ranked YouTube results (filters are hidden: see lib/videoRank.js)
   GET  /api/videos/saved                      the user's saved WikiVids
   POST /api/videos/saved                      { video: {id,title,channel,thumb,durationS,views}, domain, query } → save
   POST /api/videos/saved/remove               { id } → remove

   Env:
     YOUTUBE_API_KEY        required for search (Google Cloud → YouTube Data API v3 → API key)
     YOUTUBE_API_BASE       default https://www.googleapis.com/youtube/v3 (tests use a stand-in)
     VIDEO_DAILY_LIMIT      searches per user per day (default 30) — cached searches don't count
     VIDEO_CACHE_HOURS      how long a search result is reused for everyone (default 24)
   Quota: one fresh search costs ~201 YouTube units (2 searches + 1 details call); the free daily
   quota is 10,000 units, so the shared cache matters. */
'use strict';
const express = require('express');
const crypto = require('crypto');
const db = require('../lib/db');
const { requireUser } = require('./auth');
const { ageOn } = require('../lib/birthdate');
const { rank, words, INTENT, DOMAIN_TERMS } = require('../lib/videoRank');

const router = express.Router();
const LANGS = ['en', 'fr', 'es'];
const cfg = () => ({
  key: process.env.YOUTUBE_API_KEY || '',
  base: (process.env.YOUTUBE_API_BASE || 'https://www.googleapis.com/youtube/v3').replace(/\/+$/, ''),
  limit: parseInt(process.env.VIDEO_DAILY_LIMIT || '30', 10),
  cacheHours: parseInt(process.env.VIDEO_CACHE_HOURS || '24', 10),
});
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const fail = (res, status, code, error) => res.status(status).json({ error, code });

async function yt(c, path, params) {
  const qs = new URLSearchParams({ ...params, key: c.key });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(`${c.base}/${path}?${qs}`, { signal: ctl.signal });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error('YouTube ' + r.status + ': ' + clip(d.error && d.error.message, 160)); e.status = r.status; e.reason = d.error && d.error.errors && d.error.errors[0] && d.error.errors[0].reason; throw e; }
    return d;
  } finally { clearTimeout(t); }
}

router.get('/search', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const c = cfg();
    const q = clip(req.query.q, 80);
    if (q.length < 2) return fail(res, 400, 'BAD_QUERY', 'Type what you want to watch (at least 2 characters).');
    const domain = DOMAIN_TERMS[req.query.domain] ? req.query.domain : '';
    const lang = LANGS.includes(req.query.lang) ? req.query.lang : 'en';
    const age = user.birthDate ? ageOn(user.birthDate) : null;
    const safe = age != null && age >= 18 ? 'moderate' : 'strict'; // minors and unknown ages: strict
    const key = crypto.createHash('sha256').update([words(q).join(' '), domain, lang, safe].join('|')).digest('hex');

    const hit = await db.getOne(`SELECT result FROM video_search_cache WHERE cache_key = $1 AND created_at > NOW() - make_interval(hours => $2)`, [key, c.cacheHours]);
    if (hit) return res.json({ ok: true, cached: true, ...hit.result });

    if (!c.key) return fail(res, 503, 'VIDEOS_UNAVAILABLE', 'Video search is not switched on yet.');
    const used = await db.getOne(`SELECT count(*)::int AS n FROM video_search_log WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'`, [user.id]);
    if ((used && used.n) >= c.limit) return fail(res, 429, 'VIDEOS_LIMIT', 'You reached today’s video search limit. Try again tomorrow, or open your saved WikiVids.');

    const query = `${q} ${INTENT[lang]}`;
    const base = { part: 'snippet', type: 'video', q: query, safeSearch: safe, videoEmbeddable: 'true', relevanceLanguage: lang, maxResults: '50' };
    let ids = [];
    try {
      const [byRel, byViews] = await Promise.all([
        yt(c, 'search', { ...base, order: 'relevance' }),
        yt(c, 'search', { ...base, order: 'viewCount', maxResults: '25' }),
      ]);
      ids = [...new Set([...(byRel.items || []), ...(byViews.items || [])].map((i) => i.id && i.id.videoId).filter(Boolean))];
      let details = [];
      for (let i = 0; i < ids.length; i += 50) {
        const d = await yt(c, 'videos', { part: 'snippet,statistics,contentDetails', id: ids.slice(i, i + 50).join(','), maxResults: '50' });
        details = details.concat(d.items || []);
      }
      const ranked = rank(details, { query: q, domain, minViews: 1000 });
      const result = { items: ranked.items };
      await db.query(`INSERT INTO video_search_cache (cache_key, result, created_at) VALUES ($1, $2, NOW())
        ON CONFLICT (cache_key) DO UPDATE SET result = EXCLUDED.result, created_at = NOW()`, [key, JSON.stringify(result)]);
      await db.query('INSERT INTO video_search_log (user_id) VALUES ($1)', [user.id]);
      console.log(`[videos] search ok — ${ids.length} found, ${ranked.items.length} kept`);
      return res.json({ ok: true, cached: false, ...result });
    } catch (err) {
      console.warn('[videos] search failed:', err.name === 'AbortError' ? 'timeout' : err.message);
      if (err.reason === 'quotaExceeded') return fail(res, 503, 'VIDEOS_QUOTA', 'Video search is busy today. Please try again tomorrow.');
      return fail(res, 502, 'VIDEOS_FAILED', 'Video search is not available right now. Please try again in a moment.');
    }
  } catch (err) { next(err); }
});

router.get('/saved', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const r = await db.query(`SELECT video_id AS id, title, channel, thumb, duration_s AS "durationS", views, domain, query, created_at AS "savedAt"
      FROM favorite_videos WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`, [user.id]);
    res.json({ ok: true, items: r.rows.map((x) => ({ ...x, views: x.views == null ? null : Number(x.views) })) });
  } catch (err) { next(err); }
});

router.post('/saved', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const v = (req.body && req.body.video) || {};
    const id = String(v.id || '');
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return fail(res, 400, 'BAD_VIDEO', 'Unknown video.');
    const count = await db.getOne('SELECT count(*)::int AS n FROM favorite_videos WHERE user_id = $1', [user.id]);
    if ((count && count.n) >= 200) return fail(res, 400, 'VIDEOS_FULL', 'You can save up to 200 videos. Remove some first.');
    await db.query(`INSERT INTO favorite_videos (user_id, video_id, title, channel, thumb, duration_s, views, domain, query)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (user_id, video_id) DO NOTHING`,
    [user.id, id, clip(v.title, 200) || id, clip(v.channel, 120), /^https:\/\/i\.ytimg\.com\//.test(v.thumb || '') ? String(v.thumb).slice(0, 300) : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      Number.isFinite(+v.durationS) ? Math.round(+v.durationS) : null, Number.isFinite(+v.views) ? Math.round(+v.views) : null,
      DOMAIN_TERMS[req.body.domain] ? req.body.domain : null, clip(req.body.query, 80) || null]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/saved/remove', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    await db.query('DELETE FROM favorite_videos WHERE user_id = $1 AND video_id = $2', [user.id, String((req.body && req.body.id) || '')]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
