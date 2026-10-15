const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { hashContactId, generateSessionToken } = require('../lib/crypto');
const { requireAuth } = require('../middleware/auth');

/**
 * POST /api/survey/start
 * Initialize a new survey session
 * Body: { survey_slug: string, contact_id: string }
 * Auth: Valid JWT (from GHL)
 */
router.post('/start', requireAuth, async (req, res, next) => {
  try {
    const { survey_slug } = req.body;
    
    if (!survey_slug) {
      return res.status(400).json({ error: 'survey_slug is required' });
    }

    // Get survey definition
    const survey = await db.getOne(
      'SELECT id, slug, config FROM surveys WHERE slug = $1 AND is_active = true',
      [survey_slug]
    );

    if (!survey) {
      return res.status(404).json({ error: 'Survey not found or inactive' });
    }

    // Create session with hashed user ID (no PII)
    const userHash = req.user.sub;  // Already hashed by JWT creation
    const session = await db.getOne(
      `INSERT INTO sessions (survey_id, ghl_user_hash, status, ip_address, user_agent)
       VALUES ($1, $2, 'started', $3::inet, $4)
       RETURNING id, status, created_at`,
      [
        survey.id,
        userHash,
        req.ip || '0.0.0.0',
        (req.headers['user-agent'] || '').substring(0, 255),
      ]
    );

    res.status(201).json({
      session_id: session.id,
      survey_slug: survey.slug,
      survey_config: survey.config,
      status: session.status,
      started_at: session.created_at,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/survey/answer
 * Submit an answer to a question
 * Body: { session_id: string, question_id: string, answer: any }
 * Auth: Valid JWT
 */
router.post('/answer', requireAuth, async (req, res, next) => {
  try {
    const { session_id, question_id, answer } = req.body;

    if (!session_id || !question_id || answer === undefined) {
      return res.status(400).json({ error: 'session_id, question_id, and answer are required' });
    }

    // Verify session belongs to this user
    const session = await db.getOne(
      'SELECT id, status FROM sessions WHERE id = $1 AND ghl_user_hash = $2',
      [session_id, req.user.sub]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status === 'completed') {
      return res.status(400).json({ error: 'Survey already completed' });
    }

    // Update session status to in_progress
    await db.query(
      'UPDATE sessions SET status = $1 WHERE id = $2',
      ['in_progress', session_id]
    );

    // Store answer
    await db.query(
      `INSERT INTO survey_answers (session_id, question_id, answer)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [session_id, question_id, JSON.stringify(answer)]
    );

    res.json({ success: true, question_id, answered_at: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/survey/complete
 * Finalize survey and calculate scores
 * Body: { session_id: string }
 * Auth: Valid JWT
 */
router.post('/complete', requireAuth, async (req, res, next) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    // Verify session belongs to user
    const session = await db.getOne(
      'SELECT s.id, s.survey_id, s.answers, surv.config, surv.slug FROM sessions s JOIN surveys surv ON s.survey_id = surv.id WHERE s.id = $1 AND s.ghl_user_hash = $2',
      [session_id, req.user.sub]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status === 'completed') {
      return res.status(400).json({ error: 'Survey already completed' });
    }

    // Collect all answers
    const answers = await db.getAll(
      'SELECT question_id, answer FROM survey_answers WHERE session_id = $1',
      [session_id]
    );

    // Calculate scores (server-side, not exposed to client)
    const scoreData = calculateScores(session.config, answers);

    // Store encrypted score data + update status
    await db.query(
      `UPDATE sessions SET
        answers = $1::jsonb,
        score_data = pgp_sym_encrypt($2::text, current_setting('app.survey_encryption_key')),
        status = 'completed',
        completed_at = NOW()
      WHERE id = $3`,
      [JSON.stringify(answers.map(a => ({ q: a.question_id, a: a.answer }))), JSON.stringify(scoreData), session_id]
    );

    res.json({
      success: true,
      session_id,
      summary: scoreData.summary,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Server-side scoring algorithm
 * Takes survey config and answers, returns calculated scores
 * This is the "secret sauce" — never exposed to the client
 */
function calculateScores(config, answers) {
  const cfg = typeof config === 'string' ? JSON.parse(config) : config;
  const weights = cfg.scoring || { passion_weight: 0.25, skills_weight: 0.25, market_weight: 0.25, compensation_weight: 0.25 };

  // Default scoring logic — extend per survey type
  const categories = {
    passion: { total: 0, count: 0, maxScore: 100 },
    skills: { total: 0, count: 0, maxScore: 100 },
    market_demand: { total: 0, count: 0, maxScore: 100 },
    compensation: { total: 0, count: 0, maxScore: 100 },
  };

  // Categorize and sum answers
  for (const answer of answers) {
    const qId = answer.question_id || answer.q;
    const val = answer.answer || answer.a;

    // Determine category from question_id prefix
    let category = 'passion';
    if (qId.startsWith('skill_')) category = 'skills';
    else if (qId.startsWith('market_')) category = 'market_demand';
    else if (qId.startsWith('comp_')) category = 'compensation';

    if (categories[category]) {
      const numericVal = typeof val === 'number' ? val : (val?.value || parseFloat(val) || 0);
      categories[category].total += numericVal;
      categories[category].count++;
    }
  }

  // Calculate weighted score
  const scores = {};
  let weightedTotal = 0;

  for (const [catKey, data] of Object.entries(categories)) {
    const avgScore = data.count > 0 ? data.total / data.count : 0;
    const normalizedScore = Math.min(100, Math.max(0, (avgScore / data.maxScore) * 100));
    scores[catKey] = Math.round(normalizedScore);
    
    const weightKey = catKey + '_weight';
    const weight = weights[weightKey] || 0.25;
    weightedTotal += normalizedScore * weight;
  }

  const overallScore = Math.round(weightedTotal);
  scores.overall = overallScore;

  // Generate career matches (simplified — extend with real matching)
  const matches = generateCareerMatches(scores, cfg);

  const summary = {
    scores,
    topMatch: matches[0] || null,
    allMatches: matches,
    percentile: Math.round(Math.random() * 100),  // TODO: real percentile calculation
  };

  return {
    summary,
    raw: {
      answerCount: answers.length,
      categoryBreakdown: scores,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Career matching algorithm
 * Maps scores to career suggestions
 */
function generateCareerMatches(scores, config) {
  const careerDatabase = [
    { title: 'AI/ML Engineer', requirements: { passion: 70, skills: 80, market_demand: 90, compensation: 80 } },
    { title: 'Product Manager', requirements: { passion: 60, skills: 70, market_demand: 85, compensation: 75 } },
    { title: 'UX Designer', requirements: { passion: 80, skills: 60, market_demand: 75, compensation: 65 } },
    { title: 'Data Scientist', requirements: { passion: 65, skills: 85, market_demand: 85, compensation: 80 } },
    { title: 'Full-Stack Developer', requirements: { passion: 60, skills: 90, market_demand: 80, compensation: 75 } },
    { title: 'DevOps Engineer', requirements: { passion: 55, skills: 85, market_demand: 90, compensation: 85 } },
    { title: 'Technical Writer', requirements: { passion: 75, skills: 50, market_demand: 60, compensation: 55 } },
    { title: 'Cybersecurity Analyst', requirements: { passion: 60, skills: 80, market_demand: 95, compensation: 85 } },
    { title: 'Cloud Architect', requirements: { passion: 65, skills: 85, market_demand: 90, compensation: 90 } },
    { title: 'Blockchain Developer', requirements: { passion: 70, skills: 75, market_demand: 70, compensation: 80 } },
  ];

  const scored = careerDatabase.map(career => {
    let matchScore = 0;
    let maxPossible = 0;

    for (const [category, required] of Object.entries(career.requirements)) {
      const userScore = scores[category] || 50;
      const diff = Math.abs(userScore - required);
      const categoryScore = Math.max(0, 100 - diff * 2);
      matchScore += categoryScore;
      maxPossible += 100;
    }

    const percentage = Math.round((matchScore / maxPossible) * 100);
    return { ...career, match: percentage };
  });

  return scored
    .sort((a, b) => b.match - a.match)
    .slice(0, 5)
    .map(c => ({ title: c.title, match: c.match }));
}

module.exports = router;
