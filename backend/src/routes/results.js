const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

/**
 * GET /api/results/:sessionId
 * Get decrypted results for a specific session
 * Auth: Valid JWT (user must own the session)
 */
router.get('/:sessionId', requireAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const session = await db.getOne(
      `SELECT
        s.id,
        s.survey_id,
        s.status,
        s.answers,
        pgp_sym_decrypt(s.score_data, current_setting('app.survey_encryption_key'))::jsonb AS scores,
        s.started_at,
        s.completed_at,
        surv.title AS survey_title,
        surv.slug AS survey_slug
      FROM sessions s
      JOIN surveys surv ON s.survey_id = surv.id
      WHERE s.id = $1 AND s.ghl_user_hash = $2`,
      [sessionId, req.user.sub]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'completed') {
      return res.status(400).json({ error: 'Survey not yet completed' });
    }

    // Return ONLY the summary scores — no raw DB structure
    res.json({
      id: session.id,
      survey_title: session.survey_title,
      survey_slug: session.survey_slug,
      completed_at: session.completed_at,
      started_at: session.started_at,
      scores: session.scores?.summary?.scores || {},
      topMatch: session.scores?.summary?.topMatch || null,
      allMatches: session.scores?.summary?.allMatches || [],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/results
 * List all completed sessions for the authenticated user
 * Auth: Valid JWT
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const sessions = await db.getAll(
      `SELECT
        s.id,
        surv.title AS survey_title,
        surv.slug AS survey_slug,
        s.status,
        s.started_at,
        s.completed_at,
        pgp_sym_decrypt(s.score_data, current_setting('app.survey_encryption_key'))::jsonb->'summary'->'scores'->'overall' AS overall_score
      FROM sessions s
      JOIN surveys surv ON s.survey_id = surv.id
      WHERE s.ghl_user_hash = $1
      ORDER BY s.completed_at DESC NULLS LAST`,
      [req.user.sub]
    );

    res.json({
      sessions: sessions.map(s => ({
        id: s.id,
        title: s.survey_title,
        slug: s.survey_slug,
        status: s.status,
        overallScore: s.overall_score,
        startedAt: s.started_at,
        completedAt: s.completed_at,
      })),
      total: sessions.length,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/results/admin/stats
 * Aggregated, anonymized statistics (admin only)
 * Auth: Admin JWT
 */
router.get('/admin/stats', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const stats = await db.getAll(`
      SELECT
        surv.slug,
        COUNT(s.id) AS total_sessions,
        COUNT(s.id) FILTER (WHERE s.status = 'completed') AS completed,
        COUNT(s.id) FILTER (WHERE s.status = 'started') AS started,
        COUNT(DISTINCT s.ghl_user_hash) AS unique_users,
        AVG(
          (pgp_sym_decrypt(s.score_data, current_setting('app.survey_encryption_key'))::jsonb->'summary'->'scores'->>'overall')::numeric
        ) FILTER (WHERE s.status = 'completed') AS avg_overall_score,
        MIN(s.created_at) AS first_session,
        MAX(s.created_at) AS last_session
      FROM sessions s
      JOIN surveys surv ON s.survey_id = surv.id
      GROUP BY surv.slug
      ORDER BY total_sessions DESC
    `);

    res.json({ stats, generated_at: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
