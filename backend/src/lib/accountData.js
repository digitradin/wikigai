/* Wikigai — one place that knows where a person's data lives (v20261111b).
   Used by: Account page "Delete my account" (password), the public /delete-my-data page
   (emailed code, works without a password) and Account page "Download my data".
   Tables holding personal data, all keyed by users.id (or the email hash for older rows):
     users (email + phone encrypted, name, birthday, countries, language)
     user_results (survey answers + results; older rows keyed by the email hash)
     learning_research, learning_plans, favorite_videos, plan_ai_log, video_search_log  (ON DELETE CASCADE)
     auth_pins (one-time codes, keyed by the email hash)
   Not personal: analytics_events (cookieless, daily-rotating anonymous id, never linked to an account),
   shared caches (plan_outlook_cache, video_search_cache: no user id). */
'use strict';
const db = require('./db');
const { hashEmail } = require('./crypto');

const norm = (e) => String(e || '').trim().toLowerCase();

/* Permanently delete an account and everything linked to it, in one transaction. */
async function deleteAccount(userId, email) {
  const emailHash = email ? hashEmail(norm(email)) : null;
  const counts = {};
  await db.transaction(async (c) => {
    const run = async (name, sql, params) => { const r = await c.query(sql, params); counts[name] = r.rowCount || 0; };
    await run('user_results', 'DELETE FROM user_results WHERE user_id = $1 OR ($2::text IS NOT NULL AND user_email = $2)', [userId, emailHash]);
    // explicit deletes (also covered by ON DELETE CASCADE) so nothing depends on foreign-key settings
    await run('learning_plans', 'DELETE FROM learning_plans WHERE user_id = $1', [userId]);
    await run('learning_research', 'DELETE FROM learning_research WHERE user_id = $1', [userId]);
    await run('favorite_videos', 'DELETE FROM favorite_videos WHERE user_id = $1', [userId]);
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
  const emailHash = hashEmail(norm(user.email));
  const meta = await db.getOne('SELECT created_at, updated_at, email_verified, locale, password_updated_at FROM users WHERE id = $1', [user.id]) || {};
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
    surveyResults: await rows('SELECT stage, results, created_at, updated_at FROM user_results WHERE user_id = $1 OR user_email = $2 ORDER BY created_at', [user.id, emailHash]),
    learningPlans: await rows('SELECT * FROM learning_plans WHERE user_id = $1 ORDER BY created_at', [user.id]),
    learningResearch: await rows('SELECT * FROM learning_research WHERE user_id = $1 ORDER BY created_at', [user.id]),
    savedVideos: await rows('SELECT * FROM favorite_videos WHERE user_id = $1 ORDER BY created_at', [user.id]),
  };
}

module.exports = { deleteAccount, exportAccount };
