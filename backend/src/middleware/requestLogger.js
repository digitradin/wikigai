/**
 * Request logger — logs minimal data, no PII
 * IP addresses are logged only for operational debugging
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(2, 10);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLine = [
      `[${new Date().toISOString()}]`,
      `[${requestId}]`,
      req.method,
      req.originalUrl,
      res.statusCode,
      `${duration}ms`,
    ].join(' ');

    if (res.statusCode >= 400) {
      console.warn(logLine);
    } else {
      console.log(logLine);
    }
  });

  next();
}

module.exports = { requestLogger };
