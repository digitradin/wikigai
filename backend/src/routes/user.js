const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { hashEmail } = require('../lib/crypto');
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
