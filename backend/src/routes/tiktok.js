/* Wikigai — "Share to TikTok" (v20261112b; sign-in/linking moved to routes/oauth.js in v20261112c).
   Brief: CMO/…/wikigai/briefs/tiktok-login-linking.md + tiktok-share-feature.md.

   GET  /api/tiktok/start?intent=share[&next=/path]                    → { url }  (alias of /api/oauth/tiktok/start)
   GET  /api/tiktok/status                                              → posting connection for the share screen
   POST /api/tiktok/creator-info                                        → creator_info (fresh, every time the screen renders)
   POST /api/tiktok/media      { images: [base64 jpeg 1080×1920 ×2–4] } → { token, count }
   POST /api/tiktok/post       { mediaToken, mode, title, description, privacyLevel, disableComment, autoAddMusic, brandContent, brandOrganic }
   POST /api/tiktok/post-status { publishId }
   GET  /tt-media/:token/:n.jpg                                         (public, pulled by TikTok; deleted after 24 h)

   Data kept: TikTok open_id + display name + avatar (sign-in), an encrypted access token for posting (≤ 24 h, never a
   refresh token), carousel images (≤ 24 h). Sign-in / link / delete tokens are revoked right after use. */
'use strict';
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../lib/db');
const tt = require('../lib/tiktok');
const auth = require('./auth');

/* sign-in / link / delete / share consent now go through the generic routes/oauth.js (v20261112c);
   kept for the share screen and older pages: GET /api/tiktok/start?intent=… */
router.get('/start', (req, res, next) => require('./oauth').start(req, res, next, 'tiktok'));

/* ── posting helpers ── */
async function postingToken(userId) {
  return db.getOne(`SELECT open_id, scope, expires_at, pgp_sym_decrypt(token_enc, current_setting('app.survey_encryption_key')) AS token
                    FROM tiktok_tokens WHERE user_id = $1 AND expires_at > NOW()`, [userId]);
}
const needAuth = (res) => res.status(401).json({ error: 'Connect TikTok again to post.', code: 'TIKTOK_REAUTH' });
const ttFail = (res, e) => {
  const code = e && e.code ? String(e.code) : 'error';
  if (code === 'access_token_invalid' || code === 'scope_not_authorized' || code === 'invalid_token') return needAuth(res);
  return res.status(e && e.status === 429 ? 429 : 502).json({ error: 'TikTok did not accept the request.', code: 'TIKTOK_' + code.toUpperCase().replace(/[^A-Z0-9_]/g, '_') });
};

router.get('/status', async (req, res, next) => {
  try {
    const user = await auth.requireUser(req, res);
    if (!user) return;
    const row = await db.getOne('SELECT scope, expires_at FROM tiktok_tokens WHERE user_id = $1 AND expires_at > NOW()', [user.id]);
    res.set('Cache-Control', 'no-store').json({ ok: true, enabled: tt.flags().share, connected: !!row, canDirectPost: !!row && /video\.publish/.test(row.scope), canUpload: !!row && /video\.upload/.test(row.scope) });
  } catch (err) { next(err); }
});

router.post('/creator-info', async (req, res, next) => {
  try {
    const user = await auth.requireUser(req, res);
    if (!user) return;
    const t = await postingToken(user.id);
    if (!t) return needAuth(res);
    try {
      const d = await tt.creatorInfo(t.token);
      res.set('Cache-Control', 'no-store').json({ ok: true, creator: {
        nickname: d.creator_nickname || '', username: d.creator_username || '', avatar: d.creator_avatar_url || '',
        privacyOptions: Array.isArray(d.privacy_level_options) ? d.privacy_level_options : [],
        commentDisabled: !!d.comment_disabled, canPost: d.can_post !== false,
      } });
    } catch (e) { return ttFail(res, e); }
  } catch (err) { next(err); }
});

/* JPEG only, exactly 1080×1920, ≤ 2.5 MB — checked from the file itself (SOF marker), not from what the browser says */
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

router.post('/media', async (req, res, next) => {
  try {
    const user = await auth.requireUser(req, res);
    if (!user) return;
    if (!tt.flags().share) return res.status(404).json({ error: 'Not available', code: 'TIKTOK_OFF' });
    const imgs = Array.isArray(req.body && req.body.images) ? req.body.images : [];
    if (imgs.length < 2 || imgs.length > 4) return res.status(400).json({ error: '2 to 4 images', code: 'BAD_MEDIA' });
    const recent = await db.getOne(`SELECT count(DISTINCT token)::int AS n FROM tiktok_media WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`, [user.id]);
    if (recent && recent.n >= 20) return res.status(429).json({ error: 'Too many shares today.', code: 'MEDIA_LIMIT' });
    const bufs = [];
    for (const b64 of imgs) {
      const buf = Buffer.from(String(b64 || '').replace(/^data:image\/jpeg;base64,/, ''), 'base64');
      const d = jpegSize(buf);
      if (!d || d.w !== 1080 || d.h !== 1920 || buf.length > 2.5 * 1024 * 1024) return res.status(400).json({ error: 'Images must be 1080×1920 JPEG.', code: 'BAD_MEDIA' });
      bufs.push(buf);
    }
    const token = crypto.randomBytes(18).toString('base64url');
    await db.transaction(async (c) => {
      for (let n = 0; n < bufs.length; n++) await c.query('INSERT INTO tiktok_media (token, n, user_id, data) VALUES ($1, $2, $3, $4)', [token, n + 1, user.id, bufs[n]]);
    });
    res.json({ ok: true, token, count: bufs.length });
  } catch (err) { next(err); }
});

router.post('/post', async (req, res, next) => {
  try {
    const user = await auth.requireUser(req, res);
    if (!user) return;
    const b = req.body || {};
    const t = await postingToken(user.id);
    if (!t) return needAuth(res);
    const mode = b.mode === 'MEDIA_UPLOAD' ? 'MEDIA_UPLOAD' : 'DIRECT_POST';
    if (mode === 'DIRECT_POST' && !/video\.publish/.test(t.scope)) return needAuth(res);
    if (mode === 'MEDIA_UPLOAD' && !/video\.upload/.test(t.scope)) return needAuth(res);
    const media = await db.getOne('SELECT count(*)::int AS n FROM tiktok_media WHERE token = $1 AND user_id = $2', [String(b.mediaToken || ''), user.id]);
    if (!media || media.n < 2) return res.status(400).json({ error: 'Images missing — please try again.', code: 'BAD_MEDIA' });
    const urls = Array.from({ length: media.n }, (_, i) => `${tt.MEDIA_BASE()}/tt-media/${b.mediaToken}/${i + 1}.jpg`);
    const title = String(b.title || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 90);
    const description = String(b.description || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').slice(0, 4000);
    const opts = { urls, mode, title, description };
    if (mode === 'DIRECT_POST') {
      // TikTok's rules, re-checked on the server: privacy chosen by the user from the creator's own options,
      // branded content never private, comments off when the creator disabled them.
      let ci;
      try { ci = await tt.creatorInfo(t.token); } catch (e) { return ttFail(res, e); }
      const options = Array.isArray(ci.privacy_level_options) ? ci.privacy_level_options : [];
      if (!options.includes(b.privacyLevel)) return res.status(400).json({ error: 'Choose who can view this post.', code: 'BAD_PRIVACY' });
      if (b.brandContent && b.privacyLevel === 'SELF_ONLY') return res.status(400).json({ error: 'Branded content cannot be private.', code: 'BRANDED_PRIVATE' });
      Object.assign(opts, { privacyLevel: b.privacyLevel, disableComment: ci.comment_disabled ? true : !!b.disableComment,
        autoAddMusic: !!b.autoAddMusic, brandContent: !!b.brandContent, brandOrganic: !!b.brandOrganic });
    }
    try {
      const publishId = await tt.initPhotoPost(t.token, opts);
      res.json({ ok: true, publishId, mode });
    } catch (e) { return ttFail(res, e); }
  } catch (err) { next(err); }
});

router.post('/post-status', async (req, res, next) => {
  try {
    const user = await auth.requireUser(req, res);
    if (!user) return;
    const t = await postingToken(user.id);
    if (!t) return needAuth(res);
    try {
      const d = await tt.postStatus(t.token, String((req.body && req.body.publishId) || ''));
      res.set('Cache-Control', 'no-store').json({ ok: true, status: d.status || 'PROCESSING_DOWNLOAD', failReason: d.fail_reason || null });
    } catch (e) { return ttFail(res, e); }
  } catch (err) { next(err); }
});

// disconnect: POST /api/oauth/tiktok/disconnect (routes/oauth.js)

/* public image endpoint TikTok pulls from (PULL_FROM_URL): 200, no redirect, image/jpeg */
async function media(req, res, next) {
  try {
    const row = await db.getOne(`SELECT data FROM tiktok_media WHERE token = $1 AND n = $2 AND created_at > NOW() - INTERVAL '24 hours'`,
      [String(req.params.token || ''), parseInt(req.params.n, 10) || 0]);
    if (!row) return res.status(404).type('text/plain').send('Not found');
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=600', 'X-Robots-Tag': 'noindex' }).send(row.data);
  } catch (err) { next(err); }
}

module.exports = router;
module.exports.media = media;
