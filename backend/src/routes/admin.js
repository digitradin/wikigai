/* Wikigai owner statistics API — used by the stand-alone stats page on
   dashboard.digitradin.cloud (deploy/dashboard/wikigai-stats.html). It is NOT part of
   the Wikigai site: there is no stats page or menu for site users.

   Access: Authorization: Bearer <STATS_API_TOKEN>  (server env, 24+ random characters).
   Without STATS_API_TOKEN the API is switched off (503). Wrong token → 401.
   Cross-site calls are allowed only from the dashboard origin(s) (see CORS in index.js).
     GET /api/admin/stats?days=7|21|30|90   aggregates only, no personal data
     GET /api/admin/seo                      SEO audit of the public pages */
'use strict';
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { buildStats } = require('../analytics/stats');
const { audit } = require('../seo/audit');
const seo = require('../seo');

const router = express.Router();

function requireStatsToken(req, res) {
  const expected = process.env.STATS_API_TOKEN || '';
  if (expected.length < 24) {
    res.status(503).json({ error: 'Statistics API is not configured.', code: 'STATS_DISABLED' });
    return false;
  }
  const auth = req.get('authorization') || '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!given || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Invalid statistics token.', code: 'BAD_STATS_TOKEN' });
    return false;
  }
  return true;
}

router.get('/stats', async (req, res, next) => {
  try {
    if (!requireStatsToken(req, res)) return;
    res.set('Cache-Control', 'no-store').json({ ok: true, ...(await buildStats(req.query.days)) });
  } catch (err) { next(err); }
});

/* runs the SEO audit against this server, as the public domain */
function selfFetch(p) {
  return new Promise((resolve, reject) => {
    const r = http.request({
      host: '127.0.0.1', port: process.env.PORT || 3000, path: p, method: 'GET',
      headers: { 'X-Forwarded-Host': seo.CANONICAL_HOST, 'X-Forwarded-Proto': 'https', Host: seo.CANONICAL_HOST, 'User-Agent': 'WikigaiSEOAudit/1.0 (bot)' },
    }, (res) => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    r.on('error', reject); r.setTimeout(10000, () => r.destroy(new Error('timeout'))); r.end();
  });
}
router.get('/seo', async (req, res, next) => {
  try {
    if (!requireStatsToken(req, res)) return;
    res.set('Cache-Control', 'no-store').json({ ok: true, ...(await audit(selfFetch)) });
  } catch (err) { next(err); }
});

module.exports = router;
