/* Wikigai analytics — aggregate statistics for the admin dashboard.
   Everything returned is a count or a share; no row-level personal data.
   "Visits" = daily unique visitors summed over the period (the anonymous id
   rotates daily, so a person visiting on 3 days counts as 3 visits).
   Test accounts (names starting smoke_ / e2e) are excluded from user figures. */
'use strict';
const db = require('../lib/db');

const NOT_TEST = `NOT (coalesce(name,'') ILIKE 'smoke%' OR coalesce(name,'') ILIKE 'e2e%')`;
const NOT_TEST_R = `NOT (coalesce(user_name,'') ILIKE 'smoke%' OR coalesce(user_name,'') ILIKE 'e2e%')`;
const rows = async (sql, p) => (await db.query(sql, p)).rows;
const one = async (sql, p) => (await db.query(sql, p)).rows[0] || {};
const n = (v) => (v == null ? 0 : Number(v));

function range(days) {
  const d = Math.min(Math.max(parseInt(days, 10) || 21, 1), 366);
  const end = new Date(); end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end); start.setUTCDate(end.getUTCDate() - (d - 1));
  const pEnd = new Date(start); pEnd.setUTCDate(start.getUTCDate() - 1);
  const pStart = new Date(pEnd); pStart.setUTCDate(pEnd.getUTCDate() - (d - 1));
  const iso = (x) => x.toISOString().slice(0, 10);
  return { days: d, start: iso(start), end: iso(end), prevStart: iso(pStart), prevEnd: iso(pEnd) };
}

async function kpis(a, b) {
  const t = await one(`
    WITH pv AS (SELECT day, visitor, count(*) c FROM analytics_events WHERE type='pageview' AND day BETWEEN $1 AND $2 GROUP BY 1,2)
    SELECT count(*) AS visits, coalesce(sum(c),0) AS pageviews, count(*) FILTER (WHERE c = 1) AS bounces FROM pv`, [a, b]);
  const ev = await one(`
    SELECT count(DISTINCT (day, visitor)) FILTER (WHERE name='signup_submit') AS signup_submits,
           count(DISTINCT (day, visitor)) FILTER (WHERE name='verify_done') AS verify_done,
           count(DISTINCT (day, visitor)) FILTER (WHERE name='stage1_done') AS stage1,
           count(DISTINCT (day, visitor)) FILTER (WHERE name='stage2_done') AS stage2,
           count(DISTINCT (day, visitor)) FILTER (WHERE name IN ('grades_saved','grades_skipped')) AS stage3,
           count(*) FILTER (WHERE name='share_click') AS shares
    FROM analytics_events WHERE type='event' AND day BETWEEN $1 AND $2`, [a, b]);
  const u = await one(`
    SELECT count(*) AS signups, count(*) FILTER (WHERE email_verified) AS verified
    FROM users WHERE created_at::date BETWEEN $1 AND $2 AND ${NOT_TEST}`, [a, b]);
  const visits = n(t.visits);
  return {
    visits, pageviews: n(t.pageviews),
    pagesPerVisit: visits ? +(n(t.pageviews) / visits).toFixed(2) : 0,
    bounceRate: visits ? Math.round((n(t.bounces) / visits) * 100) : 0,
    signups: n(u.signups), verified: n(u.verified),
    // tracked visitors who verified their email ÷ tracked visits (both from the same anonymous data)
    conversion: visits ? +((n(ev.verify_done) / visits) * 100).toFixed(1) : 0,
    stage1: n(ev.stage1), stage2: n(ev.stage2), stage3: n(ev.stage3), shares: n(ev.shares),
  };
}

async function buildStats(daysParam) {
  const R = range(daysParam);
  const [cur, prev] = await Promise.all([kpis(R.start, R.end), kpis(R.prevStart, R.prevEnd)]);

  const series = await rows(`
    WITH d AS (SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day),
    pv AS (SELECT day, count(DISTINCT visitor) v, count(*) p FROM analytics_events WHERE type='pageview' AND day BETWEEN $1 AND $2 GROUP BY 1),
    us AS (SELECT created_at::date AS day, count(*) s, count(*) FILTER (WHERE email_verified) vf FROM users WHERE created_at::date BETWEEN $1 AND $2 AND ${NOT_TEST} GROUP BY 1)
    SELECT to_char(d.day,'YYYY-MM-DD') AS day, coalesce(pv.v,0) AS visits, coalesce(pv.p,0) AS pageviews, coalesce(us.s,0) AS signups, coalesce(us.vf,0) AS verified
    FROM d LEFT JOIN pv ON pv.day=d.day LEFT JOIN us ON us.day=d.day ORDER BY d.day`, [R.start, R.end]);

  const dim = (col, extra = '') => rows(`
    SELECT coalesce(${col}, '') AS key, count(DISTINCT (day, visitor)) AS visits, count(*) AS views
    FROM analytics_events WHERE type='pageview' AND day BETWEEN $1 AND $2 ${extra}
    GROUP BY 1 ORDER BY 2 DESC, 3 DESC LIMIT 15`, [R.start, R.end]);

  const [pages, referrers, languages, countries, devices, browsers, oses] = await Promise.all([
    dim('path'), dim('ref_host'), dim('lang'), dim('country'), dim('device'), dim('browser'), dim('os'),
  ]);

  const campaigns = await rows(`
    WITH c AS (SELECT DISTINCT day, visitor, coalesce(utm_source,'') s, coalesce(utm_medium,'') m, coalesce(utm_campaign,'') cp
               FROM analytics_events WHERE type='pageview' AND day BETWEEN $1 AND $2 AND (utm_source IS NOT NULL OR utm_campaign IS NOT NULL)),
         conv AS (SELECT DISTINCT day, visitor FROM analytics_events WHERE type='event' AND name='signup_submit' AND day BETWEEN $1 AND $2)
    SELECT c.s AS source, c.m AS medium, c.cp AS campaign, count(*) AS visits, count(conv.visitor) AS signups
    FROM c LEFT JOIN conv ON conv.day=c.day AND conv.visitor=c.visitor
    GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 15`, [R.start, R.end]);

  const funnel = await one(`
    WITH vd AS (SELECT DISTINCT day, visitor FROM analytics_events WHERE day BETWEEN $1 AND $2)
    SELECT
      (SELECT count(*) FROM (SELECT DISTINCT day, visitor FROM analytics_events WHERE type='pageview' AND day BETWEEN $1 AND $2) x) AS visited,
      (SELECT count(*) FROM (SELECT DISTINCT day, visitor FROM analytics_events WHERE type='pageview' AND path ~ '^(/[a-z]{2})?/signup$' AND day BETWEEN $1 AND $2) x) AS signup_page,
      (SELECT count(*) FROM (SELECT DISTINCT day, visitor FROM analytics_events WHERE name='signup_submit' AND day BETWEEN $1 AND $2) x) AS signup_submit,
      (SELECT count(*) FROM (SELECT DISTINCT day, visitor FROM analytics_events WHERE name='verify_done' AND day BETWEEN $1 AND $2) x) AS verified,
      (SELECT count(*) FROM (SELECT DISTINCT day, visitor FROM analytics_events WHERE name='stage1_done' AND day BETWEEN $1 AND $2) x) AS stage1,
      (SELECT count(*) FROM (SELECT DISTINCT day, visitor FROM analytics_events WHERE name='stage2_done' AND day BETWEEN $1 AND $2) x) AS stage2,
      (SELECT count(*) FROM (SELECT DISTINCT day, visitor FROM analytics_events WHERE name IN ('grades_saved','grades_skipped') AND day BETWEEN $1 AND $2) x) AS stage3`,
  [R.start, R.end]);

  const events = await rows(`
    SELECT name, coalesce(props->>'channel', props->>'to', '') AS detail, count(*) AS n
    FROM analytics_events WHERE type='event' AND day BETWEEN $1 AND $2 AND name IN ('share_click','lang_change','donate_click','retake','refresh_optin','research_done','video_search')
    GROUP BY 1,2 ORDER BY 3 DESC`, [R.start, R.end]);

  const accounts = await one(`
    SELECT count(*) AS total, count(*) FILTER (WHERE email_verified) AS verified,
           count(*) FILTER (WHERE last_login_at::date BETWEEN $1 AND $2) AS active,
           to_char(min(created_at),'YYYY-MM-DD') AS first_signup
    FROM users WHERE ${NOT_TEST}`, [R.start, R.end]);
  const locales = await rows(`SELECT locale AS key, count(*) AS n FROM users WHERE ${NOT_TEST} GROUP BY 1 ORDER BY 2 DESC`);
  const progress = await one(`
    SELECT count(*) AS with_results,
      count(*) FILTER (WHERE results->'stage_1' ? 'completedAt' OR (results->'stage_1' ? 'ranked' AND coalesce(results->'stage_1'->>'partial','false') <> 'true')) AS stage1,
      count(*) FILTER (WHERE jsonb_typeof(results->'stage_2'->'love') = 'array') AS stage2,
      count(*) FILTER (WHERE results->'stage_3' ? 'completedAt') AS stage3,
      count(*) FILTER (WHERE results->'stage_3'->'refresh'->>'optIn' = 'true') AS refresh_optin
    FROM user_results WHERE ${NOT_TEST_R}`);
  const tracking = await one(`SELECT to_char(min(day),'YYYY-MM-DD') AS since, count(*) AS rows FROM analytics_events`);

  const numify = (list) => list.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && /^\d+$/.test(v) && k !== 'key' ? Number(v) : v])));
  return {
    generatedAt: new Date().toISOString(),
    range: R,
    trackingSince: tracking.since ? String(tracking.since).slice(0, 10) : null,
    kpis: cur, previous: prev,
    series: numify(series),
    pages: numify(pages), referrers: numify(referrers), campaigns: numify(campaigns),
    languages: numify(languages), countries: numify(countries), devices: numify(devices), browsers: numify(browsers), os: numify(oses),
    funnel: Object.fromEntries(Object.entries(funnel).map(([k, v]) => [k, n(v)])),
    events: numify(events),
    accounts: { total: n(accounts.total), verified: n(accounts.verified), active: n(accounts.active), firstSignup: accounts.first_signup ? String(accounts.first_signup).slice(0, 10) : null, locales: numify(locales) },
    progress: Object.fromEntries(Object.entries(progress).map(([k, v]) => [k, n(v)])),
  };
}

module.exports = { buildStats, range };
