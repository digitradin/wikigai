const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../lib/db');
const { buildChallenge } = require('../lib/captcha');

const TTL_MS = 5 * 60 * 1000; // 5 minutes

function answerHash(answerIds) {
  const salt = process.env.SURVEY_HASH_SALT || process.env.SESSION_SECRET || '';
  const normalized = [...new Set(answerIds.map(String))].sort().join(',');
  return crypto.createHash('sha256').update(`captcha:${normalized}:${salt}`).digest('hex');
}

/**
 * GET /api/captcha/_debug/answer?id=<captcha_id>
 * Preprod/testing ONLY — enabled when EXPOSE_PINS=true. Reveals the drink ids
 * for a pending challenge so automated smoke tests can solve the captcha.
 */
router.get('/_debug/answer', async (req, res, next) => {
  if (process.env.EXPOSE_PINS !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const row = await db.getOne(
      `SELECT id, consumed, expires_at FROM captcha_challenges WHERE id = $1::uuid`,
      [id]
    );
    if (!row) return res.status(404).json({ error: 'challenge not found' });
    // The answer hash is one-way, so we regenerate a matching challenge is not possible.
    // Instead, tests can use /_debug/solve which creates a fresh solvable challenge.
    res.json({ ok: true, note: 'use /api/captcha/_debug/solve' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/captcha/_debug/solve
 * Preprod ONLY (EXPOSE_PINS=true). Returns a fresh challenge WITH its answer,
 * so smoke tests can complete signup/signin end to end.
 */
router.get('/_debug/solve', async (req, res, next) => {
  if (process.env.EXPOSE_PINS !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const { buildChallenge } = require('../lib/captcha');
    const { tiles, answer, prompt } = buildChallenge();
    const row = await db.getOne(
      `INSERT INTO captcha_challenges (answer_hash, expires_at)
       VALUES ($1, NOW() + make_interval(secs => $2))
       RETURNING id`,
      [answerHash(answer), TTL_MS / 1000]
    );
    res.json({ ok: true, captcha_id: row.id, prompt, tiles, answer, ttl_ms: TTL_MS });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/captcha/new
 * Returns a fresh 9-tile brand grid: 3 drink brands + 6 decoys (cars/sports).
 * The answer is stored server-side; the client only gets a captcha_id.
 */
router.get('/new', async (req, res, next) => {
  try {
    const { tiles, answer, prompt } = buildChallenge();
    const row = await db.getOne(
      `INSERT INTO captcha_challenges (answer_hash, expires_at)
       VALUES ($1, NOW() + make_interval(secs => $2))
       RETURNING id`,
      [answerHash(answer), TTL_MS / 1000]
    );
    res.json({
      ok: true,
      captcha_id: row.id,
      prompt,
      tiles: tiles.map(t => ({ id: t.id, name: t.name, emoji: t.emoji })),
      ttl_ms: TTL_MS,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
