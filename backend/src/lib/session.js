const crypto = require('crypto');

/**
 * Signed, tamper-proof session tokens for normal (non-GHL) user sessions.
 *
 * Format: base64url(payloadJson) + "." + base64url(hmacSha256(payload, secret))
 * The payload carries the user id (uuid) + issued-at + expiry. No PII.
 *
 * This replaces the earlier insecure pattern where the raw user UUID was
 * used directly as a bearer token.
 */

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SURVEY_JWT_SECRET;
if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET (or SURVEY_JWT_SECRET) environment variable is required');
}

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  str = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function sign(payloadB64) {
  return b64url(
    crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest()
  );
}

/**
 * Create a signed session token.
 * @param {string} userId - user uuid
 * @param {number} [ttlMs]
 * @returns {string}
 */
function createSessionToken(userId, ttlMs = DEFAULT_TTL_MS) {
  if (!userId) throw new Error('userId required');
  const now = Date.now();
  const payload = { sub: userId, iat: now, exp: now + ttlMs };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

/**
 * Verify a signed session token.
 * @param {string} token
 * @returns {{sub: string, iat: number, exp: number} | null}
 */
function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(fromB64url(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.sub !== 'string') return null;
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  return payload;
}

module.exports = {
  createSessionToken,
  verifySessionToken,
  DEFAULT_TTL_MS,
};
