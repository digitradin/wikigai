/* Wikigai admin — statistics and SEO health (owner only).
   Access: signed-in users whose email is listed in ADMIN_EMAILS (comma-separated)
   in the server environment. Everyone else gets 403. */
'use strict';
const express = require('express');
const http = require('http');
const { requireUser } = require('./auth');
const { buildStats } = require('../analytics/stats');
const { audit } = require('../seo/audit');
const seo = require('../seo');

const router = express.Router();
const admins = () => (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const isAdminEmail = (email) => !!email && admins().includes(String(email).toLowerCase());

async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!isAdminEmail(user.email)) {
    res.status(403).json({ error: 'Admin access required', code: 'NOT_ADMIN' });
    return null;
  }
  return user;
}

router.get('/stats', async (req, res, next) => {
  try {
    if (!(await requireAdmin(req, res))) return;
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
    if (!(await requireAdmin(req, res))) return;
    res.set('Cache-Control', 'no-store').json({ ok: true, ...(await audit(selfFetch)) });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.isAdminEmail = isAdminEmail;
