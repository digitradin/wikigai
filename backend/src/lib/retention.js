/* Wikigai — daily clean-up of learning data (v20261101e). Keeps the database small and tidy:
     • unsaved plans (never added to My favourites) older than PLAN_UNSAVED_DAYS (default 30)
     • shared caches past their reuse window: plan overviews (PLAN_OUTLOOK_CACHE_DAYS, 30) and
       video searches (VIDEO_CACHE_HOURS, 24)
     • daily-limit logs (plan_ai_log, video_search_log) older than 7 days
   Saved plans and saved WikiVids are never touched here (only the user or account deletion removes them). */
'use strict';
const db = require('./db');

const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };

async function purgeLearning() {
  const unsavedDays = num(process.env.PLAN_UNSAVED_DAYS, 30);
  const outlookDays = num(process.env.PLAN_OUTLOOK_CACHE_DAYS, 30);
  const videoHours = num(process.env.VIDEO_CACHE_HOURS, 24);
  const jobs = [
    ['unsaved plans', `DELETE FROM learning_plans WHERE NOT saved AND created_at < NOW() - make_interval(days => $1)`, [unsavedDays]],
    ['plan overview cache', `DELETE FROM plan_outlook_cache WHERE created_at < NOW() - make_interval(days => $1)`, [outlookDays]],
    ['video search cache', `DELETE FROM video_search_cache WHERE created_at < NOW() - make_interval(hours => $1)`, [videoHours]],
    ['plan AI log', `DELETE FROM plan_ai_log WHERE created_at < NOW() - INTERVAL '7 days'`, []],
    ['video search log', `DELETE FROM video_search_log WHERE created_at < NOW() - INTERVAL '7 days'`, []],
  ];
  const out = {};
  for (const [name, sql, params] of jobs) {
    try { const r = await db.query(sql, params); out[name] = r.rowCount || 0; }
    catch (e) { console.warn('[retention]', name, e.message); }
  }
  const n = Object.values(out).reduce((a, b) => a + b, 0);
  if (n) console.log('[retention] learning data purged:', JSON.stringify(out));
  return out;
}

function startLearningRetention() {
  setTimeout(purgeLearning, 90 * 1000).unref();
  setInterval(purgeLearning, 24 * 3600 * 1000).unref();
}

module.exports = { purgeLearning, startLearningRetention };
