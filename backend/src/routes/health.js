const express = require('express');
const router = express.Router();
const db = require('../lib/db');

/**
 * GET /health — Basic health check
 */
router.get('/', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage().rss,
  };

  try {
    await db.query('SELECT 1');
    health.database = 'connected';
  } catch (err) {
    console.error('[health] DB check failed:', err.message);
    health.database = 'disconnected';
    health.status = 'degraded';
    health.error = err.message;
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

module.exports = router;
