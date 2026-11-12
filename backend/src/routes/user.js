const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { hashEmail, verifyPassword } = require('../lib/crypto');
const { parseBirthDate } = require('../lib/birthdate');
const { clearSessionCookie } = require('../lib/pageGuard');
const { requireUser } = require('./auth');
const i18n = require('../i18n');

const { isCountry } = require('../lib/countries'); // Account page countries (v20261028b)
const { findResultsRow } = require('../lib/results'); // results belong to users.id (v20261028b)
const { deleteAccount, exportAccount, resultsKey } = require('../lib/accountData'); // v20261111b: privacy (delete + download my data)
const MAX_TARGET_COUNTRIES = 10;

/**
 * All /api/user/* routes now authenticate with the signed session token
 * (Authorization: Bearer <token>) and are scoped to the real logged-in user.
 * This replaces the earlier raw-UUID token pattern.
 */

/**
 * GET /api/user/profile — signed-in user + a summary of their results.
 */
router.get('/profile', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const results = await findResultsRow(user);
    // v20261112b: sign-in methods (Account page) + whether to show the "add your email" card
    const m = await db.getOne('SELECT (password_hash IS NOT NULL) AS has_password, email_prompt_dismissals FROM users WHERE id = $1', [user.id]) || {};
    const ids = (await db.query('SELECT provider, display_name, avatar_url, linked_at FROM user_identities WHERE user_id = $1 ORDER BY linked_at', [user.id])).rows;
    const tt = ids.find((x) => x.provider === 'tiktok');

    res.json({
      ok: true,
      user,
      methods: {
        email: !!user.email,
        password: !!m.has_password,
        tiktok: tt ? { name: tt.display_name || '', avatar: tt.avatar_url || '', linkedAt: tt.linked_at } : null,
        // v20261112c: every connected sign-in app (TikTok, Google, Facebook, Instagram)
        providers: ids.map((x) => ({ id: x.provider, name: x.display_name || '', avatar: x.avatar_url || '', linkedAt: x.linked_at })),
      },
      emailPrompt: !user.email && (m.email_prompt_dismissals || 0) < 2,
      progress: results
        ? {
            stage: results.stage,
            stages: Object.keys(results.results || {}).sort(),
            hasResults: Object.keys(results.results || {}).length > 0,
            registeredAt: results.created_at,
            lastUpdated: results.updated_at,
          }
        : { stage: 1, stages: [], hasResults: false },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/user/results — all stage results for the signed-in user.
 */
router.get('/results', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const row = await findResultsRow(user);
    if (!row) {
      return res.json({ ok: true, user, stage: 1, results: {}, registeredAt: null, lastUpdated: null });
    }
    res.json({
      ok: true,
      user,
      stage: row.stage,
      results: row.results,
      registeredAt: row.created_at,
      lastUpdated: row.updated_at,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/user/locale — remember the interface language on the account
 * (used for emails and as the default on other devices).
 * Body: { locale: 'en' | 'fr' | 'es' | … any code in i18n.SUPPORTED }
 */
router.put('/locale', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const locale = i18n.normalize(req.body && req.body.locale);
    if (!locale) return res.status(400).json({ error: 'Unsupported language', code: 'BAD_LOCALE', supported: i18n.SUPPORTED });
    await db.query('UPDATE users SET locale = $1 WHERE id = $2', [locale, user.id]);
    res.json({ ok: true, locale });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/user/profile — update the Account page fields. Send only what changes.
 * Body: { name?: string (1–80 chars), birthDate?: 'YYYY-MM-DD' | '' | null (optional, '' clears),
 *         residenceCountry?: 'ES' | '' (clears), targetCountries?: ['DE','FR',…] (max 10, [] clears),
 *         phone?: '+34 600 000 000' | '' (clears) — international format, stored encrypted }
 */
router.put('/profile', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const b = req.body || {};
    const sets = [], vals = [user.id], out = {};
    if (Object.prototype.hasOwnProperty.call(b, 'name')) {
      const name = String(b.name || '').replace(/[\u0000-\u001f<>]/g, '').trim();
      if (!name || name.length > 80) return res.status(400).json({ error: 'Please enter a name (max 80 characters).', code: 'BAD_NAME' });
      vals.push(name); sets.push(`name = $${vals.length}`); out.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(b, 'birthDate')) {
      const birth = parseBirthDate(b.birthDate);
      if (!birth.ok) return res.status(400).json({ error: 'Please enter a valid birthday (or leave it empty).', code: 'BAD_BIRTHDATE' });
      vals.push(birth.value); sets.push(`birth_date = $${vals.length}::date`); out.birthDate = birth.value;
    }
    if (Object.prototype.hasOwnProperty.call(b, 'residenceCountry')) {
      const c = String(b.residenceCountry || '').trim().toUpperCase();
      if (c && !isCountry(c)) return res.status(400).json({ error: 'Please choose a country from the list.', code: 'BAD_COUNTRY' });
      vals.push(c || null); sets.push(`residence_country = $${vals.length}`); out.residenceCountry = c || null;
    }
    if (Object.prototype.hasOwnProperty.call(b, 'targetCountries')) {
      if (!Array.isArray(b.targetCountries)) return res.status(400).json({ error: 'Please choose countries from the list.', code: 'BAD_COUNTRY' });
      const list = [...new Set(b.targetCountries.map((x) => String(x || '').trim().toUpperCase()))];
      if (list.some((c) => !isCountry(c))) return res.status(400).json({ error: 'Please choose countries from the list.', code: 'BAD_COUNTRY' });
      if (list.length > MAX_TARGET_COUNTRIES) return res.status(400).json({ error: `You can choose up to ${MAX_TARGET_COUNTRIES} countries.`, code: 'TOO_MANY_COUNTRIES' });
      vals.push(list); sets.push(`target_countries = $${vals.length}::text[]`); out.targetCountries = list;
    }
    if (Object.prototype.hasOwnProperty.call(b, 'phone')) {
      // international format: + (or 00) then 7-15 digits; spaces, dots, dashes and brackets are ignored
      let ph = String(b.phone || '').trim().replace(/[\s().-]/g, '');
      if (ph.startsWith('00')) ph = '+' + ph.slice(2);
      if (ph && !/^\+[1-9]\d{6,14}$/.test(ph)) return res.status(400).json({ error: 'Please enter your phone in international format, e.g. +34 600 000 000.', code: 'BAD_PHONE' });
      if (ph) { vals.push(ph); sets.push(`phone_enc = pgp_sym_encrypt($${vals.length}, current_setting('app.survey_encryption_key'))`); }
      else sets.push('phone_enc = NULL');
      out.phone = ph || null;
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update.', code: 'NOTHING_TO_UPDATE' });
    await db.query(`UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, vals);
    res.json({ ok: true, ...out });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/user/delete-account — permanently delete the signed-in account (Account page).
 * Body: { email: string (must be retyped exactly), password: string (current password) }
 * Deletes the user, their results, plans, research, saved videos and pending codes. Anonymous
 * analytics rows contain no personal data and are not linked to the account.
 */
router.post('/delete-account', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');
    // v20261112: an account without a stored email confirms with the password only (it has no address to retype)
    if (user.email && (!email || email !== String(user.email).trim().toLowerCase())) {
      return res.status(400).json({ error: 'The email does not match your account.', code: 'DELETE_EMAIL_MISMATCH' });
    }
    const row = await db.getOne('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    if (!row || !row.password_hash || !password || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: 'Incorrect password.', code: 'DELETE_BAD_PASSWORD' });
    }
    await deleteAccount(user.id, user.email); // v20261111b: shared with the public /delete-my-data page
    clearSessionCookie(req, res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/user/email-prompt/dismiss — "Not now" on the add-your-email card (shown at most twice) — v20261112b
 */
router.post('/email-prompt/dismiss', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    await db.query('UPDATE users SET email_prompt_dismissals = email_prompt_dismissals + 1 WHERE id = $1', [user.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * GET /api/user/export — "Download my data" (Account page, v20261111b). GDPR access + portability:
 * every piece of personal data linked to the signed-in account, as one JSON file.
 */
router.get('/export', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const data = await exportAccount(user);
    res.set('Cache-Control', 'private, no-store');
    res.set('Content-Disposition', `attachment; filename="wikigai-my-data-${new Date().toISOString().slice(0, 10)}.json"`);
    res.type('application/json').send(JSON.stringify(data, null, 2));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/user/results — save results for a stage (jsonb merge per stage).
 * Body: { stage: number, results: object }
 */
router.post('/results', async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const stage = parseInt(req.body.stage, 10);
    const results = req.body.results;
    if (!Number.isInteger(stage) || stage < 1 || stage > 3) {
      return res.status(400).json({ error: 'stage must be 1..3', code: 'BAD_STAGE' });
    }
    if (!results || typeof results !== 'object') {
      return res.status(400).json({ error: 'results object required', code: 'BAD_RESULTS' });
    }

    const emailHash = resultsKey(user); // v20261112b: "uid:<id>" for accounts without email (TikTok sign-up)
    const existing = await findResultsRow(user, 'id, results');

    // Guard: never let a late "partial" autosave overwrite a completed summary
    // for the same stage (prevents the skip-through race).
    if (results && results.partial === true && existing) {
      const prev = (typeof existing.results === 'object' && existing.results) ? existing.results : {};
      const prior = prev['stage_' + stage];
      if (prior && prior.partial !== true) {
        return res.json({ ok: true, stage, nextStage: stage < 3 ? stage + 1 : 3, skipped: 'partial-overwrite' });
      }
    }

    const nextStage = stage < 3 ? stage + 1 : 3;
    if (!existing) {
      await db.query(
        `INSERT INTO user_results (user_email, user_id, user_name, stage, results)
         VALUES ($1, $5, $2, $3, $4::jsonb)`,
        [emailHash, user.name, nextStage, JSON.stringify({ ['stage_' + stage]: results }), user.id]
      );
    } else {
      const merged = (typeof existing.results === 'object' && existing.results) ? existing.results : {};
      const prevStage = (merged['stage_' + stage] && typeof merged['stage_' + stage] === 'object') ? merged['stage_' + stage] : {};
      // Deep-merge the incoming payload into the existing stage object so a
      // partial update (e.g. only { domainPrefs }) never wipes prior fields
      // like { ranked, scores, completedAt }. Incoming keys win.
      merged['stage_' + stage] = { ...prevStage, ...results };
      await db.query(
        `UPDATE user_results
         SET results = $1::jsonb, stage = GREATEST(stage, $2), user_name = $3, updated_at = NOW()
         WHERE id = $4`,
        [JSON.stringify(merged), nextStage, user.name, existing.id]
      );
    }

    res.json({ ok: true, stage, nextStage });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
