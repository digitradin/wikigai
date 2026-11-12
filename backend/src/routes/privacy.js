/* Wikigai — public data deletion (v20261111b). Page: /delete-my-data (also linked from /privacy,
   the Account page, every page footer, and given to Meta / TikTok as the "data deletion" URL).
   Works for everyone, signed in or not, with or without a password (a forgotten password must
   never block erasure). Ownership is proven by a 6-digit code emailed to the account address.

   POST /api/privacy/delete/start    { email, locale? }   → always { ok:true } (no account enumeration)
   POST /api/privacy/delete/confirm  { email, pin }       → deletes the account + all its data, emails a receipt

   Rate limited like sign-in (index.js). At most one code per address per minute. */
'use strict';
const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { hashEmail } = require('../lib/crypto');
const { sendMail } = require('../lib/mailer');
const { clearSessionCookie } = require('../lib/pageGuard');
const { deleteAccount } = require('../lib/accountData');
const i18n = require('../i18n');
const auth = require('./auth');

const RESEND_GAP_S = 60;
const OK_MSG = 'If an account uses this email, we have sent it a 6-digit code.';

router.post('/delete/start', async (req, res, next) => {
  try {
    const email = auth.normalizeEmail(req.body && req.body.email);
    if (!auth.EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.', code: 'BAD_EMAIL' });
    const emailHash = hashEmail(email);
    const user = await db.getOne('SELECT id, name, locale FROM users WHERE email_hash = $1', [emailHash]);
    if (!user) return res.json({ ok: true, message: OK_MSG });
    const recent = await db.getOne(
      `SELECT 1 FROM auth_pins WHERE email_hash = $1 AND purpose = 'delete' AND consumed = false
         AND created_at > NOW() - make_interval(secs => $2) LIMIT 1`, [emailHash, RESEND_GAP_S]);
    if (recent) return res.json({ ok: true, message: OK_MSG });
    const pin = await auth.issuePin(emailHash, 'delete');
    const lang = i18n.normalize(req.body && req.body.locale) || auth.userLang(user, req);
    await sendMail({
      to: email,
      subject: i18n.t(lang, 'email.subjectDelete'),
      html: auth.pinEmailHtml(pin, user.name || email.split('@')[0], 'delete', lang),
    });
    if (process.env.EXPOSE_PINS === 'true') return res.json({ ok: true, message: OK_MSG, dev_pin: pin });
    res.json({ ok: true, message: OK_MSG });
  } catch (err) {
    next(err);
  }
});

router.post('/delete/confirm', async (req, res, next) => {
  try {
    const email = auth.normalizeEmail(req.body && req.body.email);
    const pin = String((req.body && req.body.pin) || '').replace(/\D/g, '');
    if (!auth.EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.', code: 'BAD_EMAIL' });
    if (pin.length !== 6) return res.status(400).json({ error: 'Please enter the 6-digit code.', code: 'BAD_PIN' });
    const emailHash = hashEmail(email);
    const check = await auth.verifyPin(emailHash, pin, 'delete');
    if (!check.ok) return auth.pinError(res, check);
    const user = await db.getOne('SELECT id, name, locale FROM users WHERE email_hash = $1', [emailHash]);
    if (user) {
      const lang = auth.userLang(user, req);
      await deleteAccount(user.id, email);
      try {
        await sendMail({
          to: email,
          subject: i18n.t(lang, 'email.subjectDeleted'),
          html: auth.noticeEmailHtml(user.name || email.split('@')[0], i18n.t(lang, 'email.bodyDeleted'), lang),
        });
      } catch (e) { console.warn('[privacy] deletion receipt not sent:', e.message); }
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
