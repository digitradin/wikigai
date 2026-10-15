const crypto = require('crypto');

const HASH_SALT = process.env.SURVEY_HASH_SALT || process.env.SESSION_SECRET;
if (!HASH_SALT) {
  throw new Error('SURVEY_HASH_SALT (or SESSION_SECRET) environment variable is required');
}

/**
 * Hash an email into a stable, non-reversible identifier.
 * Lowercased + trimmed so case/space variants map to the same user.
 * @param {string} email
 * @returns {string} sha256 hex digest
 */
function hashEmail(email) {
  if (!email || typeof email !== 'string') {
    throw new Error('Invalid email');
  }
  return crypto
    .createHash('sha256')
    .update(email.toLowerCase().trim() + HASH_SALT)
    .digest('hex');
}

/**
 * Hash a GHL contact ID to produce an anonymized identifier
 * Uses SHA-256 with a secret salt — one-way, irreversible
 * @param {string} contactId - GHL contact ID
 * @returns {string} SHA-256 hex digest
 */
function hashContactId(contactId) {
  if (!contactId || typeof contactId !== 'string') {
    throw new Error('Invalid contact ID');
  }
  return crypto
    .createHash('sha256')
    .update(contactId + HASH_SALT)
    .digest('hex');
}

/**
 * Constant-time comparison of two strings (prevents timing attacks).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Generate a cryptographically secure random session token
 * @returns {string} hex token
 */
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a numeric PIN of the given length (default 6).
 * Uses crypto.randomInt for unbiased digits.
 * @param {number} length
 * @returns {string}
 */
function generatePin(length = 6) {
  let pin = '';
  for (let i = 0; i < length; i++) {
    pin += crypto.randomInt(0, 10).toString();
  }
  return pin;
}

/**
 * Hash a PIN together with an email hash (so pins are never stored in clear).
 * @param {string} pin
 * @param {string} emailHash
 * @returns {string}
 */
function hashPin(pin, emailHash) {
  return crypto
    .createHash('sha256')
    .update(`pin:${pin}:${emailHash}:${HASH_SALT}`)
    .digest('hex');
}

/**
 * Generate a one-time use token (for result sharing)
 * @returns {string} hex token
 */
function generateOneTimeToken() {
  return crypto.randomBytes(48).toString('hex');
}

/**
 * Sanitize input to prevent XSS / injection
 * Strips HTML tags from a string
 * @param {string} str
 * @returns {string}
 */
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim();
}

/**
 * Hash a password with scrypt (salted, tunable cost).
 * Format: scrypt$N$r$p$<saltHex>$<hashHex>
 * @param {string} password
 * @returns {string}
 */
function hashPassword(password) {
  const N = 16384, r = 8, p = 1, keyLen = 64;
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, keyLen, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Verify a password against a stored scrypt hash (constant-time).
 * @param {string} password
 * @param {string} stored
 * @returns {boolean}
 */
function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, Ns, rs, ps, saltHex, hashHex] = parts;
  const N = parseInt(Ns, 10), r = parseInt(rs, 10), p = parseInt(ps, 10);
  try {
    const derived = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), hashHex.length / 2, {
      N, r, p, maxmem: 64 * 1024 * 1024,
    });
    return safeEqual(derived.toString('hex'), hashHex);
  } catch {
    return false;
  }
}

/**
 * Basic password policy. Returns { ok, error }.
 * Minimum 8 chars, at least one letter and one number.
 */
function checkPasswordStrength(password) {
  const pw = String(password || '');
  if (pw.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
  if (pw.length > 128) return { ok: false, error: 'Password is too long (max 128).' };
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
    return { ok: false, error: 'Password must include at least one letter and one number.' };
  }
  return { ok: true };
}

module.exports = {
  hashEmail,
  hashContactId,
  hashPin,
  hashPassword,
  verifyPassword,
  checkPasswordStrength,
  safeEqual,
  generateSessionToken,
  generatePin,
  generateOneTimeToken,
  sanitize,
};
