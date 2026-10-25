const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { hashEmail, verifyPassword } = require('../lib/crypto');
const { parseBirthDate } = require('../lib/birthdate');
const { requireUser } = require('./auth');
const i18n = require('../i18n');

/**
 * All /api/user/* routes now authenticate with the signed session token
 * (Authorization: Bearer <token>) and are scoped to the real logged-in user.
 * This replaces the earlier raw-UUID token pattern.
 */

/**
 * GET /api/user/profile — signed-in user + a summary of their results.
 */
router.get('/profile', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const results = await db.getOne(
      `SELECT id, user_name, stage, results, created_at, updated_at
       FROM user_results WHERE user_email = $1 ORDER BY created_at DESC LIMIT 1`,
      [hashEmail(user.email)]
    );

    res.json({
      ok: true,
      user,
      progress: results
        ? {
            stage: results.stage,
            stages: Object.keys(results.results || {}).sort(),
            hasResults: Object.keys(results.results || {}).length > 0,
            registeredAt: results.created_at,
            lastUpdated: results.updated_at,
          }
        : { stage: 1, stages: [], hasResults: false },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/user/results — all stage results for the signed-in user.
 */
router.get('/results', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const row = await db.getOne(
      `SELECT id, user_name, stage, results, created_at, updated_at
       FROM user_results WHERE user_email = $1 ORDER BY created_at DESC LIMIT 1`,
      [hashEmail(user.email)]
    );
    if (!row) {
      return res.json({ ok: true, user, stage: 1, results: {}, registeredAt: null, lastUpdated: null });
    }
    res.json({
      ok: true,
      user,
      stage: row.stage,
      results: row.results,
      registeredAt: row.created_at,
      lastUpdated: row.updated_at,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/user/locale — remember the interface language on the account
 * (used for emails and as the default on other devices).
 * Body: { locale: 'en' | 'fr' | 'es' | … any code in i18n.SUPPORTED }
 */
router.put('/locale', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const locale = i18n.normalize(req.body && req.body.locale);
    if (!locale) return res.status(400).json({ error: 'Unsupported language', code: 'BAD_LOCALE', supported: i18n.SUPPORTED });
    await db.query('UPDATE users SET locale = $1 WHERE id = $2', [locale, user.id]);
    res.json({ ok: true, locale });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/user/profile — update the Account page fields. Send only what changes.
 * Body: { name?: string (1–80 chars), birthDate?: 'YYYY-MM-DD' | '' | null (optional, '' clears) }
 */
router.put('/profile', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const b = req.body || {};
    const sets = [], vals = [user.id], out = {};
    if (Object.prototype.hasOwnProperty.call(b, 'name')) {
      const name = String(b.name || '').replace(/[\u0000-\u001f<>]/g, '').trim();
      if (!name || name.length > 80) return res.status(400).json({ error: 'Please enter a name (max 80 characters).', code: 'BAD_NAME' });
      vals.push(name); sets.push(`name = $${vals.length}`); out.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(b, 'birthDate')) {
      const birth = parseBirthDate(b.birthDate);
      if (!birth.ok) return res.status(400).json({ error: 'Please enter a valid birthday (or leave it empty).', code: 'BAD_BIRTHDATE' });
      vals.push(birth.value); sets.push(`birth_date = $${vals.length}::date`); out.birthDate = birth.value;
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update.', code: 'NOTHING_TO_UPDATE' });
    await db.query(`UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, vals);
    res.json({ ok: true, ...out });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/user/delete-account — permanently delete the signed-in account (Account page).
 * Body: { email: string (must be retyped exactly), password: string (current password) }
 * Deletes the user, their saved results, AI research and pending codes. Anonymous
 * analytics rows contain no personal data and are not linked to the account.
 */
router.post('/delete-account', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');
    if (!email || email !== String(user.email || '').trim().toLowerCase()) {
      return res.status(400).json({ error: 'The email does not match your account.', code: 'DELETE_EMAIL_MISMATCH' });
    }
    const row = await db.getOne('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    if (!row || !row.password_hash || !password || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: 'Incorrect password.', code: 'DELETE_BAD_PASSWORD' });
    }
    const emailHash = hashEmail(user.email);
    await db.transaction(async (c) => {
      await c.query('DELETE FROM user_results WHERE user_email = $1', [emailHash]);
      await c.query('DELETE FROM auth_pins WHERE email_hash = $1', [emailHash]);
      await c.query('DELETE FROM users WHERE id = $1', [user.id]); // cascades to learning_research
    });
    console.log('[user] account deleted');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/user/results — save results for a stage (jsonb merge per stage).
 * Body: { stage: number, results: object }
 */
router.post('/results', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const stage = parseInt(req.body.stage, 10);
    const results = req.body.results;
    if (!Number.isInteger(stage) || stage < 1 || stage > 3) {
      return res.status(400).json({ error: 'stage must be 1..3', code: 'BAD_STAGE' });
    }
    if (!results || typeof results !== 'object') {
      return res.status(400).json({ error: 'results object required', code: 'BAD_RESULTS' });
    }

    const emailHash = hashEmail(user.email);
    const existing = await db.getOne(
      'SELECT id, results FROM user_results WHERE user_email = $1 ORDER BY created_at DESC LIMIT 1',
      [emailHash]
    );

    // Guard: never let a late "partial" autosave overwrite a completed summary
    // for the same stage (prevents the skip-through race).
    if (results && results.partial === true && existing) {
      const prev = (typeof existing.results === 'object' && existing.results) ? existing.results : {};
      const prior = prev['stage_' + stage];
      if (prior && prior.partial !== true) {
        return res.json({ ok: true, stage, nextStage: stage < 3 ? stage + 1 : 3, skipped: 'partial-overwrite' });
      }
    }

    const nextStage = stage < 3 ? stage + 1 : 3;
    if (!existing) {
      await db.query(
        `INSERT INTO user_results (user_email, user_name, stage, results)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [emailHash, user.name, nextStage, JSON.stringify({ ['stage_' + stage]: results })]
      );
    } else {
      const merged = (typeof existing.results === 'object' && existing.results) ? existing.results : {};
      const prevStage = (merged['stage_' + stage] && typeof merged['stage_' + stage] === 'object') ? merged['stage_' + stage] : {};
      // Deep-merge the incoming payload into the existing stage object so a
      // partial update (e.g. only { domainPrefs }) never wipes prior fields
      // like { ranked, scores, completedAt }. Incoming keys win.
      merged['stage_' + stage] = { ...prevStage, ...results };
      await db.query(
        `UPDATE user_results
         SET results = $1::jsonb, stage = GREATEST(stage, $2), user_name = $3, updated_at = NOW()
         WHERE id = $4`,
        [JSON.stringify(merged), nextStage, user.name, existing.id]
      );
    }

    res.json({ ok: true, stage, nextStage });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
