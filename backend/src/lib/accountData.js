/* Wikigai — one place that knows where a person's data lives (v20261111b).
   Used by: Account page "Delete my account" (password), the public /delete-my-data page
   (emailed code, works without a password) and Account page "Download my data".
   Tables holding personal data, all keyed by users.id (or the email hash for older rows):
     users (email + phone encrypted, name, birthday, countries, language)
     user_results (survey answers + results; older rows keyed by the email hash)
     learning_research, learning_plans, favorite_videos, plan_ai_log, video_search_log  (ON DELETE CASCADE)
     favorite_schools (My learning › Schools shortlist, ON DELETE CASCADE)                            — v20261112d
     auth_pins (one-time codes, keyed by the email hash)
     user_identities (TikTok sign-in), tiktok_tokens (24 h posting token), tiktok_media (24 h carousel images),
     oauth_states (10 min)                                                                          — v20261112b
   Not personal: analytics_events (cookieless, daily-rotating anonymous id, never linked to an account),
   shared caches (plan_outlook_cache, video_search_cache: no user id). */
'use strict';
const db = require('./db');
const { hashEmail } = require('./crypto');

const norm = (e) => String(e || '').trim().toLowerCase();

/* key used in user_results.user_email (NOT NULL): the email hash, or "uid:<id>" for accounts without an email (TikTok sign-up) */
const resultsKey = (user) => { const e = norm(user && user.email); return e ? hashEmail(e) : 'uid:' + user.id; };

/* revoke a stored TikTok posting token at TikTok (best effort — never blocks a deletion) */
async function revokeTikTok(userId) {
  try {
    const row = await db.getOne(`SELECT pgp_sym_decrypt(token_enc, current_setting('app.survey_encryption_key')) AS t FROM tiktok_tokens WHERE user_id = $1`, [userId]);
    if (row && row.t) await require('./tiktok').revoke(row.t);
  } catch (e) { console.warn('[privacy] tiktok revoke skipped:', e.message); }
}

/* Permanently delete an account and everything linked to it, in one transaction. */
async function deleteAccount(userId, email) {
  const e = norm(email);
  const emailHash = e ? hashEmail(e) : null; // v20261112: accounts without a stored email (e.g. OAuth that withholds it) must still delete
  const counts = {};
  await revokeTikTok(userId);
  await db.transaction(async (c) => {
    const run = async (name, sql, params) => { const r = await c.query(sql, params); counts[name] = r.rowCount || 0; };
    await run('tiktok_tokens', 'DELETE FROM tiktok_tokens WHERE user_id = $1', [userId]);
    await run('tiktok_media', 'DELETE FROM tiktok_media WHERE user_id = $1', [userId]);
    await run('oauth_states', 'DELETE FROM oauth_states WHERE user_id = $1', [userId]);
    await run('user_identities', 'DELETE FROM user_identities WHERE user_id = $1', [userId]);
    await run('user_results', 'DELETE FROM user_results WHERE user_id = $1 OR ($2::text IS NOT NULL AND user_email = $2) OR user_email = $3', [userId, emailHash, 'uid:' + userId]);
    // explicit deletes (also covered by ON DELETE CASCADE) so nothing depends on foreign-key settings
    await run('learning_plans', 'DELETE FROM learning_plans WHERE user_id = $1', [userId]);
    await run('learning_research', 'DELETE FROM learning_research WHERE user_id = $1', [userId]);
    await run('favorite_videos', 'DELETE FROM favorite_videos WHERE user_id = $1', [userId]);
    await run('favorite_schools', 'DELETE FROM favorite_schools WHERE user_id = $1', [userId]); // v20261112d
    await run('plan_ai_log', 'DELETE FROM plan_ai_log WHERE user_id = $1', [userId]);
    await run('video_search_log', 'DELETE FROM video_search_log WHERE user_id = $1', [userId]);
    if (emailHash) await run('auth_pins', 'DELETE FROM auth_pins WHERE email_hash = $1', [emailHash]);
    await run('users', 'DELETE FROM users WHERE id = $1', [userId]);
  });
  console.log('[privacy] account deleted', JSON.stringify(counts)); // row counts only — no id, no email
  return counts;
}

/* Everything we hold about the signed-in person, as one JSON document (GDPR access + portability). */
async function exportAccount(user) {
  const rows = async (sql, params) => { try { return (await db.query(sql, params)).rows; } catch (e) { return []; } };
  const e = norm(user.email);
  const emailHash = e ? hashEmail(e) : null; // v20261112: no stored email → no legacy email-hash rows to look up (hashEmail throws on empty)
  const meta = await db.getOne('SELECT created_at, updated_at, email_verified, locale, password_updated_at, (password_hash IS NOT NULL) AS has_password FROM users WHERE id = $1', [user.id]) || {};
  return {
    exportedAt: new Date().toISOString(),
    service: 'Wikigai — https://wikigai.com',
    controller: `${process.env.LEGAL_ENTITY_NAME || 'Digitradin OÜ'} (Estonia) — ${process.env.LEGAL_EMAIL || 'admin@digitradin.cloud'}`,
    note: 'All personal data Wikigai holds about your account. Your password is stored only as a one-way hash and is not included.',
    account: {
      id: user.id,
      email: user.email,
      name: user.name,
      language: meta.locale || user.locale || null,
      birthDate: user.birthDate || null,
      phone: user.phone || null,
      residenceCountry: user.residenceCountry || null,
      targetCountries: user.targetCountries || [],
      emailVerified: !!meta.email_verified,
      createdAt: meta.created_at || null,
      updatedAt: meta.updated_at || null,
      passwordLastChanged: meta.password_updated_at || null,
    },
    surveyResults: await rows(
      `SELECT stage, results, created_at, updated_at FROM user_results WHERE user_id = $1${emailHash ? ' OR user_email = $2' : ''} ORDER BY created_at`,
      emailHash ? [user.id, emailHash] : [user.id]),
    learningPlans: await rows('SELECT * FROM learning_plans WHERE user_id = $1 ORDER BY created_at', [user.id]),
    learningResearch: await rows('SELECT * FROM learning_research WHERE user_id = $1 ORDER BY created_at', [user.id]),
    savedVideos: await rows('SELECT * FROM favorite_videos WHERE user_id = $1 ORDER BY created_at', [user.id]),
    savedSchools: await rows('SELECT program_id, created_at FROM favorite_schools WHERE user_id = $1 ORDER BY created_at', [user.id]), // v20261112d
    signInMethods: [
      ...(user.email ? [{ method: 'email', email: user.email, password: !!meta.has_password }] : []),
      ...(await rows('SELECT provider AS method, display_name, linked_at, last_login_at FROM user_identities WHERE user_id = $1', [user.id])),
    ],
    tiktok: {
      postingTokenStoredUntil: ((await rows('SELECT expires_at FROM tiktok_tokens WHERE user_id = $1', [user.id]))[0] || {}).expires_at || null,
      pendingImages: ((await rows('SELECT count(*)::int AS n FROM tiktok_media WHERE user_id = $1', [user.id]))[0] || {}).n || 0,
    },
  };
}

/* v20261112b/c — move everything of a sign-in-app-only account (no email, no password) into the account that just proved it owns
   the same TikTok / Google / Facebook / Instagram account. The target account wins on conflicts. Then the empty source account is deleted. Returns a summary. */
/* v20261114: opts.preferSource — the source holds the NEWEST results (a TikTok-only account claiming an existing email account):
   its stages replace the same stages of the target (a partial stage never replaces a finished one); other target stages stay. */
async function mergeAccounts(fromId, intoId, intoUser, opts = {}) {
  if (fromId === intoId) return { merged: false };
  const out = { stagesAdded: [], plans: 0, videos: 0, research: 0, identities: 0 };
  await db.transaction(async (c) => {
    const src = (await c.query('SELECT id, results FROM user_results WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [fromId])).rows[0];
    const dst = (await c.query('SELECT id, results FROM user_results WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [intoId])).rows[0];
    if (src) {
      const sr = (src.results && typeof src.results === 'object') ? src.results : {};
      if (!dst) {
        await c.query('UPDATE user_results SET user_id = $1, user_email = $2 WHERE id = $3', [intoId, resultsKey(intoUser), src.id]);
        out.stagesAdded = Object.keys(sr);
      } else {
        const dr = (dst.results && typeof dst.results === 'object') ? dst.results : {};
        Object.keys(sr).forEach((k) => {
          const srcDone = !(sr[k] && sr[k].partial === true), dstDone = (k in dr) && !(dr[k] && dr[k].partial === true);
          if (!(k in dr)) { dr[k] = sr[k]; out.stagesAdded.push(k); }
          else if (opts.preferSource && (srcDone || !dstDone)) { dr[k] = sr[k]; (out.stagesReplaced = out.stagesReplaced || []).push(k); }
        });
        const stage = Math.max(1, ...Object.keys(dr).map((k) => Math.min(3, (parseInt(k.split('_')[1], 10) || 0) + 1)));
        await c.query('UPDATE user_results SET results = $1::jsonb, stage = GREATEST(stage, $2), updated_at = NOW() WHERE id = $3', [JSON.stringify(dr), stage, dst.id]);
      }
    }
    out.plans = (await c.query('UPDATE learning_plans SET user_id = $1 WHERE user_id = $2', [intoId, fromId])).rowCount || 0;
    out.research = (await c.query('UPDATE learning_research SET user_id = $1 WHERE user_id = $2', [intoId, fromId])).rowCount || 0;
    out.videos = (await c.query(`INSERT INTO favorite_videos (user_id, video_id, title, channel, thumb, duration_s, views, domain, query, created_at)
      SELECT $1, video_id, title, channel, thumb, duration_s, views, domain, query, created_at FROM favorite_videos WHERE user_id = $2
      ON CONFLICT (user_id, video_id) DO NOTHING`, [intoId, fromId])).rowCount || 0;
    out.schools = (await c.query(`INSERT INTO favorite_schools (user_id, program_id, created_at)
      SELECT $1, program_id, created_at FROM favorite_schools WHERE user_id = $2
      ON CONFLICT (user_id, program_id) DO NOTHING`, [intoId, fromId])).rowCount || 0; // v20261112d
    // v20261112c: sign-in methods move too (any provider the target doesn't already have); the rest go with the source
    out.identities = (await c.query(`UPDATE user_identities SET user_id = $1 WHERE user_id = $2
      AND provider NOT IN (SELECT provider FROM user_identities WHERE user_id = $1)`, [intoId, fromId])).rowCount || 0;
  });
  await deleteAccount(fromId, null);
  console.log('[tiktok] accounts merged', JSON.stringify({ stages: out.stagesAdded.length, plans: out.plans, videos: out.videos }));
  return { merged: true, ...out };
}

module.exports = { deleteAccount, exportAccount, mergeAccounts, resultsKey, revokeTikTok };
