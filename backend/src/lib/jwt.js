const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.SURVEY_JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('SURVEY_JWT_SECRET environment variable is required');
}

/**
 * Verify a JWT token and return its payload
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    algorithms: ['HS256'],
    audience: 'survey.digitradin.cloud',
    maxAge: '15m',
  });
}

/**
 * Create a JWT for a user session
 * @param {string} contactId - GHL contact ID
 * @param {string} sessionId - survey session ID
 * @param {string} scope - 'survey:read' | 'survey:write' | 'survey:admin'
 * @returns {string} signed JWT
 */
function createToken(contactId, sessionId, scope = 'survey:read') {
  const { hashContactId } = require('./crypto');
  
  return jwt.sign(
    {
      sub: hashContactId(contactId),
      session_id: sessionId,
      scope,
    },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      audience: 'survey.digitradin.cloud',
      expiresIn: '15m',
      issuer: 'survey.digitradin.cloud',
    }
  );
}

/**
 * Create a long-lived admin token (for cron jobs, debugging)
 * @param {string} reason
 * @returns {string} signed JWT
 */
function createAdminToken(reason) {
  return jwt.sign(
    {
      sub: 'admin',
      scope: 'survey:admin',
      reason,
    },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      audience: 'survey.digitradin.cloud',
      expiresIn: '1h',
      issuer: 'survey.digitradin.cloud',
    }
  );
}

module.exports = {
  verifyToken,
  createToken,
  createAdminToken,
};
