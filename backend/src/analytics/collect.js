/* Wikigai first-party analytics — collection endpoint.
   POST /api/t   body (JSON or text/plain JSON from navigator.sendBeacon):
     { t: 'pageview'|'event', n?: eventName, p: path, r?: referrer, l?: lang,
       s?: signedIn, u?: { source, medium, campaign }, x?: { ...small props } }
   Privacy: no cookies, no IP stored, visitor = daily-salted hash; bots ignored;
   honours Global Privacy Control / Do-Not-Track unless ANALYTICS_RESPECT_DNT=false. */
'use strict';
const express = require('express');
const crypto = require('crypto');
const db = require('../lib/db');

const router = express.Router();

/* Events the site is allowed to send (anything else is dropped). */
const EVENTS = new Set([
  'signup_submit', 'verify_done', 'login_done',
  'stage1_start', 'stage1_done', 'stage2_start', 'stage2_parta_done', 'stage2_done',
  'grades_saved', 'grades_skipped',
  'share_click', 'donate_click', 'lang_change', 'retake', 'refresh_optin',
]);
const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link|whatsapp|telegrambot|discordbot|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|axios|node-fetch|go-http|java\/|httpclient|semrush|ahrefs|mj12|dotbot|petalbot|yandex|baidu|applebot|duckduckbot/i;
const SELF_HOSTS = (process.env.ANALYTICS_SELF_HOSTS || 'wikigai.digitradin.cloud,survey.digitradin.cloud,wikigai.com,www.wikigai.com,localhost,127.0.0.1').split(',').map((s) => s.trim());
const RESPECT_DNT = process.env.ANALYTICS_RESPECT_DNT !== 'false';
const ENABLED = process.env.ANALYTICS_ENABLED !== 'false';

const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n).trim() || null : null);
const today = () => new Date().toISOString().slice(0, 10);

/* daily salt: HMAC(secret, date) — never stored, rotates at midnight UTC */
function visitorId(req) {
  const secret = process.env.SESSION_SECRET || process.env.SURVEY_HASH_SALT || 'wikigai';
  const salt = crypto.createHmac('sha256', secret).update('analytics:' + today()).digest('hex');
  return crypto.createHash('sha256').update(`${salt}|${req.ip}|${req.get('user-agent') || ''}`).digest('hex').slice(0, 20);
}

function parseUA(ua) {
  const s = ua || '';
  const device = /ipad|tablet|(android(?!.*mobile))/i.test(s) ? 'tablet' : /mobi|iphone|ipod|android/i.test(s) ? 'mobile' : 'desktop';
  const browser = /edg\//i.test(s) ? 'Edge' : /opr\/|opera/i.test(s) ? 'Opera' : /samsungbrowser/i.test(s) ? 'Samsung' : /firefox|fxios/i.test(s) ? 'Firefox'
    : /chrome|crios/i.test(s) ? 'Chrome' : /safari/i.test(s) ? 'Safari' : 'Other';
  const os = /windows/i.test(s) ? 'Windows' : /iphone|ipad|ipod|ios/i.test(s) ? 'iOS' : /mac os/i.test(s) ? 'macOS' : /android/i.test(s) ? 'Android' : /linux/i.test(s) ? 'Linux' : 'Other';
  return { device, browser, os };
}
function countryFrom(req) {
  const al = req.get('accept-language') || '';
  const m = al.match(/^[a-z]{2,3}-([A-Z]{2})\b/i);
  return m ? m[1].toUpperCase() : null;
}
function refHost(ref) {
  if (!ref || typeof ref !== 'string') return null;
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '').toLowerCase();
    return SELF_HOSTS.includes(h) ? null : h.slice(0, 120);
  } catch { return null; }
}
function cleanPath(p) {
  if (typeof p !== 'string' || p[0] !== '/') return '/';
  return p.split('?')[0].split('#')[0].replace(/\/+$/, '').slice(0, 160) || '/';
}
function cleanProps(x) {
  if (!x || typeof x !== 'object') return {};
  const out = {};
  Object.keys(x).slice(0, 8).forEach((k) => {
    const v = x[k];
    if (typeof v === 'string') out[k.slice(0, 30)] = v.slice(0, 60);
    else if (typeof v === 'number' && isFinite(v)) out[k.slice(0, 30)] = v;
    else if (typeof v === 'boolean') out[k.slice(0, 30)] = v;
  });
  return out;
}

router.post('/', express.text({ type: ['text/plain', 'application/json'], limit: '4kb' }), async (req, res) => {
  res.status(204).end(); // never make the page wait
  try {
    if (!ENABLED) return;
    if (RESPECT_DNT && (req.get('sec-gpc') === '1' || req.get('dnt') === '1')) return;
    const ua = req.get('user-agent') || '';
    if (!ua || BOT_RE.test(ua)) return;
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { return; } }
    if (!b || typeof b !== 'object') return;
    const type = b.t === 'event' ? 'event' : b.t === 'pageview' ? 'pageview' : null;
    if (!type) return;
    const name = type === 'event' ? clip(b.n, 40) : null;
    if (type === 'event' && !EVENTS.has(name)) return;
    const path = cleanPath(b.p);
    if (path.startsWith('/admin')) return; // don't count the owner reading stats
    const u = b.u && typeof b.u === 'object' ? b.u : {};
    const { device, browser, os } = parseUA(ua);
    await db.query(
      `INSERT INTO analytics_events (visitor, type, name, path, ref_host, utm_source, utm_medium, utm_campaign, lang, country, device, browser, os, signed_in, props)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [visitorId(req), type, name, path, refHost(b.r), clip(u.source, 60), clip(u.medium, 60), clip(u.campaign, 80),
        clip(b.l, 5), countryFrom(req), device, browser, os, b.s === true, JSON.stringify(cleanProps(b.x))]
    );
  } catch (err) {
    console.warn('[analytics] drop:', err.message);
  }
});

/* daily clean-up of old rows */
async function purgeOld() {
  const days = parseInt(process.env.ANALYTICS_RETENTION_DAYS || '395', 10);
  try {
    const r = await db.query(`DELETE FROM analytics_events WHERE day < CURRENT_DATE - $1::int`, [days]);
    if (r.rowCount) console.log(`[analytics] purged ${r.rowCount} rows older than ${days} days`);
  } catch (err) { console.warn('[analytics] purge failed:', err.message); }
}
function startRetention() {
  setTimeout(purgeOld, 60 * 1000);
  setInterval(purgeOld, 24 * 3600 * 1000).unref();
}

module.exports = { router, startRetention, EVENTS, _test: { parseUA, refHost, cleanPath, BOT_RE } };
