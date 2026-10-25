const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const {
  hashEmail,
  hashPin,
  hashPassword,
  verifyPassword,
  checkPasswordStrength,
  safeEqual,
  generatePin,
} = require('../lib/crypto');
const { createSessionToken, verifySessionToken } = require('../lib/session');
const { sendMail } = require('../lib/mailer');
const i18n = require('../i18n');
const { parseBirthDate, toIso } = require('../lib/birthdate');

/* language for emails: the account's saved locale, else the request's */
function userLang(user, req) { return i18n.normalize(user && user.locale) || i18n.fromRequest(req); }

const PIN_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PIN_ATTEMPTS = 5;
const MAX_PW_FAILS = 8;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

async function encryptEmail(email) {
  return db.getOne(
    `SELECT pgp_sym_encrypt($1, current_setting('app.survey_encryption_key')) AS enc`,
    [email]
  );
}

async function issuePin(emailHash, purpose) {
  const pin = generatePin(6);
  await db.query(
    `INSERT INTO auth_pins (email_hash, pin_hash, purpose, expires_at)
     VALUES ($1, $2, $3, NOW() + make_interval(secs => $4))`,
    [emailHash, hashPin(pin, emailHash), purpose, PIN_TTL_MS / 1000]
  );
  return pin;
}

async function verifyPin(emailHash, pin, purpose) {
  const row = await db.getOne(
    `SELECT id, pin_hash, attempts, consumed, expires_at
     FROM auth_pins
     WHERE email_hash = $1 AND purpose = $2 AND consumed = false
     ORDER BY created_at DESC LIMIT 1`,
    [emailHash, purpose]
  );
  if (!row) return { ok: false, reason: 'no_pin' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if (row.attempts >= MAX_PIN_ATTEMPTS) return { ok: false, reason: 'locked' };

  if (!safeEqual(hashPin(String(pin || ''), emailHash), row.pin_hash)) {
    await db.query('UPDATE auth_pins SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    return { ok: false, reason: 'mismatch' };
  }
  await db.query('UPDATE auth_pins SET consumed = true WHERE id = $1', [row.id]);
  return { ok: true };
}

/* ─────────────────────────────────────────────────────────────
 * POST /api/auth/signup
 * Body: { email, email2, password, password2, name?, locale?,
 *         captcha_id, captcha_answer[] }
 * Creates an unverified user with a password and emails a 6-digit PIN.
 * ───────────────────────────────────────────────────────────── */
router.post('/signup', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const email2 = normalizeEmail(req.body.email2);
    const password = String(req.body.password || '');
    const password2 = String(req.body.password2 ?? req.body.password ?? '');
    const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
    const locale = i18n.fromRequest(req);
    const { captcha_id, captcha_answer } = req.body;
    const birth = parseBirthDate(req.body.birth_date); // optional

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.', code: 'BAD_EMAIL' });
    }
    if (email !== email2) {
      return res.status(400).json({ error: 'Email addresses do not match.', code: 'EMAIL_MISMATCH' });
    }
    const pwCheck = checkPasswordStrength(password);
    if (!pwCheck.ok) {
      return res.status(400).json({ error: pwCheck.error, code: 'WEAK_PASSWORD' });
    }
    if (password !== password2) {
      return res.status(400).json({ error: 'Passwords do not match.', code: 'PASSWORD_MISMATCH' });
    }

    if (!birth.ok) {
      return res.status(400).json({ error: 'Please enter a valid birthday (or leave it empty).', code: 'BAD_BIRTHDATE' });
    }

    const captcha = await checkCaptcha(captcha_id, captcha_answer);
    if (!captcha.ok) {
      return res.status(400).json({ error: 'Captcha failed. Please try again.', code: 'CAPTCHA_FAIL' });
    }

    const emailHash = hashEmail(email);
    const existing = await db.getOne(
      'SELECT id, email_verified FROM users WHERE email_hash = $1',
      [emailHash]
    );
    if (existing && existing.email_verified) {
      return res.status(409).json({
        error: 'An account with this email already exists. Please sign in.',
        code: 'ALREADY_EXISTS',
      });
    }

    const enc = await encryptEmail(email);
    const pwHash = hashPassword(password);
    let userId;
    if (existing) {
      userId = existing.id;
      await db.query(
        `UPDATE users SET name = COALESCE(NULLIF($2,''), name), locale = $3, email_enc = $4,
                password_hash = $5, password_updated_at = NOW(), updated_at = NOW(),
                birth_date = COALESCE($6::date, birth_date)
         WHERE id = $1`,
        [userId, name, locale, enc.enc, pwHash, birth.value]
      );
    } else {
      const created = await db.getOne(
        `INSERT INTO users (email_hash, email_enc, name, locale, email_verified, provider, password_hash, password_updated_at, birth_date)
         VALUES ($1, $2, $3, $4, false, 'password', $5, NOW(), $6::date)
         RETURNING id`,
        [emailHash, enc.enc, name || email.split('@')[0], locale, pwHash, birth.value]
      );
      userId = created.id;
    }

    const pin = await issuePin(emailHash, 'signup');
    await sendMail({
      to: email,
      subject: i18n.t(locale, 'email.subjectVerify'),
      html: pinEmailHtml(pin, name || email.split('@')[0], 'verify', locale),
    });

    res.status(201).json({
      ok: true,
      email,
      message: 'Verification code sent. Check your inbox.',
      ...(process.env.EXPOSE_PINS === 'true' ? { dev_pin: pin } : {}),
    });
  } catch (err) {
    next(err);
  }
});

/* POST /api/auth/verify  { email, pin } → activates account + session */
router.post('/verify', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const pin = String(req.body.pin || '').trim();
    if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: 'Invalid email or code.', code: 'BAD_INPUT' });
    }

    const emailHash = hashEmail(email);
    const user = await db.getOne(
      'SELECT id, name, locale, email_verified FROM users WHERE email_hash = $1',
      [emailHash]
    );
    if (!user) {
      return res.status(404).json({ error: 'Account not found. Please sign up.', code: 'NO_USER' });
    }

    const check = await verifyPin(emailHash, pin, 'signup');
    if (!check.ok) return pinError(res, check);

    await db.query(
      'UPDATE users SET email_verified = true, last_login_at = NOW(), updated_at = NOW() WHERE id = $1',
      [user.id]
    );
    await ensureResultsRow(emailHash, user.name);

    const token = createSessionToken(user.id);
    res.json({
      ok: true,
      token,
      user: { id: user.id, email, name: user.name, locale: user.locale, verified: true },
    });
  } catch (err) {
    next(err);
  }
});

/* POST /api/auth/resend  { email } → re-issue signup PIN */
router.post('/resend', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email.', code: 'BAD_EMAIL' });
    const emailHash = hashEmail(email);
    const user = await db.getOne('SELECT id, name, locale, email_verified FROM users WHERE email_hash = $1', [emailHash]);
    if (!user) return res.status(404).json({ error: 'Account not found.', code: 'NO_USER' });
    if (user.email_verified) return res.status(409).json({ error: 'Account already verified. Please sign in.', code: 'ALREADY_VERIFIED' });

    const pin = await issuePin(emailHash, 'signup');
    await sendMail({
      to: email,
      subject: i18n.t(userLang(user, req), 'email.subjectVerify'),
      html: pinEmailHtml(pin, user.name || email.split('@')[0], 'verify', userLang(user, req)),
    });
    res.json({
      ok: true,
      message: 'A new code has been sent.',
      ...(process.env.EXPOSE_PINS === 'true' ? { dev_pin: pin } : {}),
    });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────
 * POST /api/auth/login  { email, password, captcha_id?, captcha_answer?[] }
 * Password authentication. Returns a signed session on success.
 * ───────────────────────────────────────────────────────────── */
router.post('/login', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!EMAIL_RE.test(email) || !password) {
      return res.status(400).json({ error: 'Enter your email and password.', code: 'BAD_INPUT' });
    }

    // Human check (same 3-drink-brands grid as signup). Checked before the
    // password so bots cannot test passwords; each challenge works once.
    // Emergency switch: LOGIN_CAPTCHA=false in the server environment.
    if (process.env.LOGIN_CAPTCHA !== 'false') {
      const captcha = await checkCaptcha(req.body.captcha_id, req.body.captcha_answer);
      if (!captcha.ok) {
        return res.status(400).json({ error: 'Captcha failed. Please try again.', code: 'CAPTCHA_FAIL' });
      }
    }

    const emailHash = hashEmail(email);
    const user = await db.getOne(
      `SELECT id, name, locale, email_verified, status, password_hash, failed_logins, locked_until
       FROM users WHERE email_hash = $1`,
      [emailHash]
    );

    // Uniform failure message — do not reveal whether the email exists.
    const BAD = { error: 'Incorrect email or password.', code: 'BAD_CREDENTIALS' };

    if (!user || !user.password_hash) {
      // Still compare against a dummy hash to keep timing consistent.
      verifyPassword(password, 'scrypt$16384$8$1$00$00');
      return res.status(401).json(BAD);
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'This account is disabled.', code: 'DISABLED' });
    }
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return res.status(429).json({ error: 'Too many attempts. Please try again in a few minutes.', code: 'LOCKED' });
    }

    if (!verifyPassword(password, user.password_hash)) {
      const fails = (user.failed_logins || 0) + 1;
      const lock = fails >= MAX_PW_FAILS;
      await db.query(
        `UPDATE users SET failed_logins = $2, locked_until = $3 WHERE id = $1`,
        [user.id, lock ? 0 : fails, lock ? new Date(Date.now() + LOCK_MS) : null]
      );
      return res.status(401).json(BAD);
    }

    if (!user.email_verified) {
      // Allow verification completion: send a fresh code and tell the client.
      const pin = await issuePin(emailHash, 'signup');
      await sendMail({
        to: email,
        subject: i18n.t(userLang(user, req), 'email.subjectVerify'),
        html: pinEmailHtml(pin, user.name || email.split('@')[0], 'verify', userLang(user, req)),
      });
      return res.status(403).json({
        error: 'Please verify your email first — we just sent a new code.',
        code: 'EMAIL_NOT_VERIFIED',
        ...(process.env.EXPOSE_PINS === 'true' ? { dev_pin: pin } : {}),
      });
    }

    await db.query(
      'UPDATE users SET last_login_at = NOW(), failed_logins = 0, locked_until = NULL WHERE id = $1',
      [user.id]
    );
    await ensureResultsRow(emailHash, user.name);

    const token = createSessionToken(user.id);
    res.json({
      ok: true,
      token,
      user: { id: user.id, email, name: user.name, locale: user.locale, verified: true },
    });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────
 * POST /api/auth/forgot  { email }
 * Sends a password-reset code. Always returns ok (no enumeration).
 * ───────────────────────────────────────────────────────────── */
router.post('/forgot', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email.', code: 'BAD_EMAIL' });

    const emailHash = hashEmail(email);
    const user = await db.getOne('SELECT id, name, locale, status FROM users WHERE email_hash = $1', [emailHash]);
    if (user && user.status === 'active') {
      const pin = await issuePin(emailHash, 'reset');
      await sendMail({
        to: email,
        subject: i18n.t(userLang(user, req), 'email.subjectReset'),
        html: pinEmailHtml(pin, user.name || email.split('@')[0], 'reset', userLang(user, req)),
      });
      // Dev/preprod only.
      if (process.env.EXPOSE_PINS === 'true') {
        return res.json({ ok: true, message: 'If that account exists, a reset code has been sent.', dev_pin: pin });
      }
    }
    res.json({ ok: true, message: 'If that account exists, a reset code has been sent.' });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────
 * POST /api/auth/reset  { email, pin, password, password2 }
 * Verifies the reset code and sets a new password.
 * ───────────────────────────────────────────────────────────── */
router.post('/reset', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const pin = String(req.body.pin || '').trim();
    const password = String(req.body.password || '');
    const password2 = String(req.body.password2 ?? req.body.password ?? '');
    if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: 'Invalid email or code.', code: 'BAD_INPUT' });
    }
    const pwCheck = checkPasswordStrength(password);
    if (!pwCheck.ok) return res.status(400).json({ error: pwCheck.error, code: 'WEAK_PASSWORD' });
    if (password !== password2) {
      return res.status(400).json({ error: 'Passwords do not match.', code: 'PASSWORD_MISMATCH' });
    }

    const emailHash = hashEmail(email);
    const user = await db.getOne('SELECT id, email_verified FROM users WHERE email_hash = $1', [emailHash]);
    if (!user) return res.status(404).json({ error: 'Account not found.', code: 'NO_USER' });

    const check = await verifyPin(emailHash, pin, 'reset');
    if (!check.ok) return pinError(res, check);

    await db.query(
      `UPDATE users SET password_hash = $2, password_updated_at = NOW(),
              failed_logins = 0, locked_until = NULL, updated_at = NOW()
       WHERE id = $1`,
      [user.id, hashPassword(password)]
    );
    // Invalidate any outstanding reset/login codes for this user.
    await db.query(`UPDATE auth_pins SET consumed = true WHERE email_hash = $1 AND consumed = false`, [emailHash]);

    res.json({ ok: true, message: 'Password updated. You can now sign in.' });
  } catch (err) {
    next(err);
  }
});

/* POST /api/auth/change-password  { current, password } — for signed-in users */
router.post('/change-password', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const current = String(req.body.current || '');
    const password = String(req.body.password || '');
    const pwCheck = checkPasswordStrength(password);
    if (!pwCheck.ok) return res.status(400).json({ error: pwCheck.error, code: 'WEAK_PASSWORD' });

    const row = await db.getOne('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    if (!row || !verifyPassword(current, row.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.', code: 'BAD_CREDENTIALS' });
    }
    await db.query(
      'UPDATE users SET password_hash = $2, password_updated_at = NOW(), updated_at = NOW() WHERE id = $1',
      [user.id, hashPassword(password)]
    );
    res.json({ ok: true, message: 'Password updated.' });
  } catch (err) {
    next(err);
  }
});

/* GET /api/auth/me  → current user from Bearer session token */
router.get('/me', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    res.json({ ok: true, user });
  } catch (err) {
    next(err);
  }
});

/* POST /api/auth/logout — stateless; client discards token */
router.post('/logout', (req, res) => {
  res.json({ ok: true });
});

// ── helpers ───────────────────────────────────────────────────────
function pinError(res, check) {
  const msgs = {
    no_pin: 'No active code. Please request a new one.',
    expired: 'This code has expired. Please request a new one.',
    locked: 'Too many attempts. Please request a new code.',
    mismatch: 'Incorrect code. Please try again.',
  };
  const status = check.reason === 'locked' ? 429 : 400;
  return res.status(status).json({ error: msgs[check.reason] || 'Invalid code.', code: 'PIN_' + check.reason.toUpperCase() });
}

async function requireUser(req, res) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : req.query.token;
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Not authenticated', code: 'NO_SESSION' });
    return null;
  }
  const row = await db.getOne(
    `SELECT id, name, locale, email_verified, provider, birth_date,
            pgp_sym_decrypt(email_enc, current_setting('app.survey_encryption_key')) AS email
     FROM users WHERE id = $1`,
    [payload.sub]
  );
  if (!row) {
    res.status(404).json({ error: 'User not found', code: 'NO_USER' });
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    locale: row.locale,
    verified: row.email_verified,
    provider: row.provider,
    birthDate: toIso(row.birth_date),
  };
}

async function ensureResultsRow(emailHash, name) {
  const existing = await db.getOne(
    'SELECT id FROM user_results WHERE user_email = $1 ORDER BY created_at DESC LIMIT 1',
    [emailHash]
  );
  if (!existing) {
    await db.query(
      `INSERT INTO user_results (user_email, user_name, stage, results)
       VALUES ($1, $2, 1, '{}'::jsonb)`,
      [emailHash, name || '']
    );
  }
}

async function checkCaptcha(captchaId, answer) {
  if (!captchaId || !Array.isArray(answer)) return { ok: false };
  const row = await db.getOne(
    `SELECT id, answer_hash, consumed, expires_at FROM captcha_challenges WHERE id = $1::uuid`,
    [captchaId]
  );
  if (!row || row.consumed) return { ok: false };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false };

  const normalized = [...new Set(answer.map(String))].sort().join(',');
  const { createHash } = require('crypto');
  const salt = process.env.SURVEY_HASH_SALT || process.env.SESSION_SECRET || '';
  const h = createHash('sha256').update(`captcha:${normalized}:${salt}`).digest('hex');

  await db.query('UPDATE captcha_challenges SET consumed = true WHERE id = $1', [row.id]);
  return { ok: h === row.answer_hash };
}

function pinEmailHtml(pin, name, kind = 'verify', lang = 'en') {
  const t = (k, v) => i18n.t(lang, 'email.' + k, v);
  return `<!doctype html><html lang="${escapeHtml(lang)}"><body style="margin:0;background:#0f172a;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:32px">
    <h1 style="color:#fff;font-size:20px;margin:0 0 4px">${t('brand')}</h1>
    <p style="color:#94a3b8;margin:0 0 24px;font-size:13px">${escapeHtml(t('tagline'))}</p>
    <div style="background:#1e293b;border-radius:16px;padding:28px;color:#e2e8f0">
      <p style="margin:0 0 8px">${escapeHtml(t('hi', { name }))}</p>
      <p style="margin:0 0 20px;color:#cbd5e1;font-size:14px">${escapeHtml(t(kind === 'reset' ? 'bodyReset' : 'bodyVerify'))}</p>
      <div style="font-size:34px;letter-spacing:8px;font-weight:700;color:#fff;background:#0f172a;border-radius:12px;padding:18px;text-align:center">${pin}</div>
      <p style="margin:20px 0 0;color:#64748b;font-size:12px">${escapeHtml(t('ignore'))}</p>
    </div>
  </div></body></html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

module.exports = router;
module.exports.requireUser = requireUser;
