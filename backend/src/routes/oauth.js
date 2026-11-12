/* Wikigai — sign in with apps (v20261112c): TikTok today; Google, Facebook, Instagram ready but hidden.
   One account, many ways in. Rules (brief: CMO/…/wikigai/briefs/tiktok-login-linking.md, generalised to every provider):
   - login: known identity → that account. Unknown identity → new account; if the app gives a VERIFIED email that no account
     uses, the account gets it (no "add your email" card); if an account already uses that email we never merge silently:
     the person is asked to sign in with their email and connect the app from Account › Sign-in methods.
   - link (signed in): one app account ↔ one Wikigai account. If it belongs to an account with no email and no password,
     that account is merged into this one (target wins on conflicts) and deleted; otherwise refused.
   - delete: accounts with no email and no password confirm deletion by signing in again with the SAME app account.
   - disconnect: only while another way in remains (an email or another app).
   - share: TikTok only — keeps a 24 h posting token (routes/tiktok.js does the posting).

   GET  /api/oauth/providers                         → enabled providers (also in /api/config → auth.providers)
   GET  /api/oauth/:provider/start?intent=&next=&lang= → { url }   (link/delete/share need a session)
   GET  /auth/:provider/callback                      (mounted in index.js; the app redirects here)
   POST /api/oauth/:provider/disconnect */
'use strict';
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../lib/db');
const oauth = require('../lib/oauth');
const tt = require('../lib/tiktok');
const { hashEmail } = require('../lib/crypto');
const { createSessionToken, verifySessionToken } = require('../lib/session');
const { setSessionCookie, clearSessionCookie, readCookie, COOKIE } = require('../lib/pageGuard');
const { deleteAccount, mergeAccounts } = require('../lib/accountData');
const auth = require('./auth');
const i18n = require('../i18n');

const STATE_TTL_MIN = 10;
const safeNext = (n) => (typeof n === 'string' && /^\/[a-z0-9/_?=&.-]*$/i.test(n) && !n.startsWith('//') ? n.slice(0, 200) : null);
const cookieUserId = (req) => { const p = verifySessionToken(readCookie(req, COOKIE)); return p && p.sub; };
const HOME = { login: '/login', link: '/account', delete: '/account', share: '/share/tiktok' };
const decEmail = `CASE WHEN email_enc IS NULL THEN NULL ELSE pgp_sym_decrypt(email_enc, current_setting('app.survey_encryption_key')) END`;

router.get('/providers', (req, res) => res.json({ ok: true, providers: oauth.publicList() }));

/* is this intent allowed for this provider right now? (delete stays possible while keys exist, even if the button is hidden) */
function allowed(p, intent) {
  if (!p || !p.intents.includes(intent)) return false;
  if (intent === 'share') return p.id === 'tiktok' && tt.flags().share;
  if (intent === 'delete') return p.configured();
  return p.loginEnabled();
}

async function start(req, res, next, providerId, intentIn) {
  try {
    const p = oauth.get(providerId);
    const intent = String(intentIn || req.query.intent || 'login');
    if (!p) return res.status(404).json({ error: 'Unknown sign-in app', code: 'BAD_PROVIDER' });
    if (!['login', 'link', 'delete', 'share'].includes(intent)) return res.status(400).json({ error: 'Unknown intent', code: 'BAD_INTENT' });
    if (!allowed(p, intent)) return res.status(404).json({ error: `${p.label} is not available right now.`, code: 'PROVIDER_OFF' });
    let userId = null;
    if (intent !== 'login') {
      const user = await auth.requireUser(req, res);
      if (!user) return;
      userId = user.id;
      // the callback is a top-level page load: it identifies the user by the session cookie, which must match
      if (cookieUserId(req) !== userId) setSessionCookie(req, res, String(req.headers.authorization || '').slice(7));
    }
    const nonce = crypto.randomBytes(24).toString('base64url');
    const lang = i18n.normalize(req.query.lang) || i18n.fromRequest(req);
    await db.query('INSERT INTO oauth_states (nonce, provider, intent, user_id, lang, next) VALUES ($1, $2, $3, $4, $5, $6)',
      [nonce, p.id, intent, userId, lang, safeNext(req.query.next)]);
    res.set('Cache-Control', 'no-store').json({ ok: true, url: p.authorizeUrl(nonce, intent) });
  } catch (err) { next(err); }
}
router.get('/:provider/start', (req, res, next) => start(req, res, next, req.params.provider));

/* new account for someone who signed in with an app (email only if the app vouches for it and nobody uses it) */
async function createAccount(p, prof, lang) {
  const name = (prof.displayName || p.label + ' user').replace(/[\u0000-\u001f<>]/g, '').slice(0, 80);
  const email = prof.email && prof.emailVerified ? prof.email : null;
  let userId;
  await db.transaction(async (c) => {
    const enc = email ? (await c.query(`SELECT pgp_sym_encrypt($1, current_setting('app.survey_encryption_key')) AS enc`, [email])).rows[0].enc : null;
    const u = (await c.query(`INSERT INTO users (email_hash, email_enc, name, locale, email_verified, provider)
                              VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [email ? hashEmail(email) : null, enc, name, lang || 'en', !!email, p.id])).rows[0];
    userId = u.id;
    await c.query(`INSERT INTO user_identities (user_id, provider, provider_uid, display_name, avatar_url, last_login_at)
                   VALUES ($1, $2, $3, $4, $5, NOW())`, [userId, p.id, prof.uid, prof.displayName || null, prof.avatarUrl || null]);
    await c.query(`INSERT INTO user_results (user_email, user_id, user_name, stage, results) VALUES ($1, $2, $3, 1, '{}'::jsonb)`,
      [email ? hashEmail(email) : 'uid:' + userId, userId, name]);
  });
  return userId;
}

async function callback(req, res) {
  const providerId = String(req.params.provider || '');
  const back = (path, code) => res.redirect(302, `${path}${path.includes('?') ? '&' : '?'}auth=${code}&via=${encodeURIComponent(providerId)}`);
  let st = null;
  try {
    const p = oauth.get(providerId);
    if (!p) return back('/login', 'error');
    const nonce = String(req.query.state || '');
    st = nonce && await db.getOne(`DELETE FROM oauth_states WHERE nonce = $1 AND provider = $2 AND created_at > NOW() - make_interval(mins => $3)
                                   RETURNING intent, user_id, lang, next`, [nonce, p.id, STATE_TTL_MIN]);
    if (!st) return back('/login', 'expired');
    const home = HOME[st.intent];
    if (req.query.error || !req.query.code) return back(home, 'cancel');
    if (st.intent !== 'login' && cookieUserId(req) !== st.user_id) return back(home, 'session');

    const tok = await p.exchange(String(req.query.code));
    const prof = await p.profile(tok);
    if (!prof.uid) throw Object.assign(new Error('no uid'), { code: 'no_uid' });
    if (st.intent !== 'share') p.revoke(tok.accessToken); // not needed after reading the profile (data minimisation)
    const ident = await db.getOne(`SELECT i.user_id, (u.email_hash IS NULL AND u.password_hash IS NULL) AS app_only
                                   FROM user_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = $1 AND i.provider_uid = $2`, [p.id, prof.uid]);
    const touch = () => db.query(`UPDATE user_identities SET display_name = COALESCE(NULLIF($3, ''), display_name),
                                  avatar_url = COALESCE(NULLIF($4, ''), avatar_url) WHERE provider = $1 AND provider_uid = $2`,
                                  [p.id, prof.uid, prof.displayName || '', prof.avatarUrl || '']);

    if (st.intent === 'login') {
      let userId, isNew = false;
      if (ident) {
        const u = await db.getOne('SELECT id, status FROM users WHERE id = $1', [ident.user_id]);
        if (!u || u.status !== 'active') return back('/login', 'disabled');
        userId = u.id;
        await touch();
        await db.query('UPDATE user_identities SET last_login_at = NOW() WHERE provider = $1 AND provider_uid = $2', [p.id, prof.uid]);
      } else {
        if (prof.email && prof.emailVerified) {
          const taken = await db.getOne('SELECT id FROM users WHERE email_hash = $1', [hashEmail(prof.email)]);
          if (taken) return back('/login', 'email_exists'); // never merge silently: sign in with the email, then connect the app
        }
        userId = await createAccount(p, prof, st.lang);
        isNew = true;
      }
      await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [userId]);
      const user = await db.getOne(`SELECT id, name, locale, ${decEmail} AS email FROM users WHERE id = $1`, [userId]);
      const token = createSessionToken(userId);
      setSessionCookie(req, res, token);
      const frag = new URLSearchParams({
        t: token, n: safeNext(st.next) || (isNew ? '/survey' : '/dashboard'), new: isNew ? '1' : '0', via: p.id,
        u: Buffer.from(JSON.stringify({ id: user.id, email: user.email || null, name: user.name, locale: user.locale, verified: !!user.email })).toString('base64url'),
      });
      return res.redirect(302, '/auth/done#' + frag.toString());
    }

    const userId = st.user_id;
    const me = await db.getOne(`SELECT u.id, (SELECT provider_uid FROM user_identities WHERE user_id = u.id AND provider = $2) AS mine, ${decEmail} AS email
                                FROM users u WHERE u.id = $1`, [userId, p.id]);
    if (!me) return back('/login', 'session');

    if (st.intent === 'delete') {
      if (!me.mine || me.mine !== prof.uid) return back('/account', 'mismatch');
      await deleteAccount(userId, me.email);
      clearSessionCookie(req, res);
      return res.redirect(302, '/auth/done#deleted=1');
    }

    if (st.intent === 'link') {
      if (ident && ident.user_id === userId) return back('/account', 'linked');
      if (me.mine && me.mine !== prof.uid) return back('/account', 'other');
      if (ident && !ident.app_only) return back('/account', 'taken');
      let merged = false;
      if (ident && ident.app_only) { await mergeAccounts(ident.user_id, userId, { id: userId, email: me.email }); merged = true; }
      await db.query(`INSERT INTO user_identities (user_id, provider, provider_uid, display_name, avatar_url) VALUES ($1, $2, $3, $4, $5)
                      ON CONFLICT (provider, provider_uid) DO UPDATE SET user_id = EXCLUDED.user_id`, [userId, p.id, prof.uid, prof.displayName || null, prof.avatarUrl || null]);
      return back('/account', merged ? 'merged' : 'linked');
    }

    // share (TikTok): keep the access token encrypted ≤ 24 h; also link TikTok as a sign-in method when it is free
    const scope = String(tok.scope || '');
    if (!/video\.publish/.test(scope) && !/video\.upload/.test(scope)) { p.revoke(tok.accessToken); return back('/share/tiktok', 'scope'); }
    const hours = Math.min(24, Math.max(1, Math.floor((tok.expiresIn || 86400) / 3600)));
    await db.query(`INSERT INTO tiktok_tokens (user_id, open_id, token_enc, scope, expires_at)
                    VALUES ($1, $2, pgp_sym_encrypt($3, current_setting('app.survey_encryption_key')), $4, NOW() + make_interval(hours => $5))
                    ON CONFLICT (user_id) DO UPDATE SET open_id = EXCLUDED.open_id, token_enc = EXCLUDED.token_enc, scope = EXCLUDED.scope,
                      expires_at = EXCLUDED.expires_at, created_at = NOW()`, [userId, prof.uid, tok.accessToken, scope, hours]);
    if (!ident && !me.mine) {
      await db.query(`INSERT INTO user_identities (user_id, provider, provider_uid, display_name, avatar_url) VALUES ($1, 'tiktok', $2, $3, $4)
                      ON CONFLICT DO NOTHING`, [userId, prof.uid, prof.displayName || null, prof.avatarUrl || null]);
    } else if (ident) await touch();
    return back(safeNext(st.next) || '/share/tiktok', 'connected');
  } catch (err) {
    console.warn(`[oauth] ${providerId} callback failed:`, err.code || err.message);
    return back(st ? (HOME[st.intent] || '/login') : '/login', 'error');
  }
}

router.post('/:provider/disconnect', async (req, res, next) => {
  try {
    const user = await auth.requireUser(req, res);
    if (!user) return;
    const p = oauth.get(req.params.provider);
    if (!p) return res.status(404).json({ error: 'Unknown sign-in app', code: 'BAD_PROVIDER' });
    const others = await db.getOne('SELECT count(*)::int AS n FROM user_identities WHERE user_id = $1 AND provider <> $2', [user.id, p.id]);
    if (!user.email && !(others && others.n > 0)) {
      return res.status(400).json({ error: 'Add your email first, or you will lose access to this account.', code: 'NEED_EMAIL' });
    }
    if (p.id === 'tiktok') {
      const t = await db.getOne(`SELECT pgp_sym_decrypt(token_enc, current_setting('app.survey_encryption_key')) AS t FROM tiktok_tokens WHERE user_id = $1`, [user.id]);
      if (t && t.t) await tt.revoke(t.t);
      await db.query('DELETE FROM tiktok_tokens WHERE user_id = $1', [user.id]);
    }
    await db.query('DELETE FROM user_identities WHERE user_id = $1 AND provider = $2', [user.id, p.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.callback = callback;
module.exports.start = start;
