/**
 * Centralized error handler
 * Never leaks stack traces in production
 */
function errorHandler(err, req, res, _next) {
  console.error('[error]', err.message);
  
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  // Known HTTP errors
  if (err.status) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code || 'ERROR',
    });
  }

  // JWT errors (passed through from upstream)
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Authentication failed', code: 'AUTH_ERROR' });
  }

  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed', code: 'CORS_ERROR' });
  }

  // Database errors (never leak details)
  if (err.code && err.code.startsWith('P')) {
    return res.status(500).json({ error: 'Database error', code: 'DB_ERROR' });
  }

  // Default: 500
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}

module.exports = { errorHandler };
