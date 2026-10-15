const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

/**
 * Minimal mailer.
 * - If SMTP_HOST is configured, sends real email via nodemailer.
 * - Otherwise (preprod/testing) writes .eml files to /data/outbox so we can
 *   still verify the full flow without an SMTP provider.
 */

let transporter = null;
const OUTBOX = process.env.OUTBOX_DIR || '/data/outbox';

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const from = process.env.MAIL_FROM || 'Digitradin <no-reply@digitradin.cloud>';
  const t = getTransporter();
  if (t) {
    return t.sendMail({ from, to, subject, text, html });
  }
  // Dry transport → outbox file
  try {
    fs.mkdirSync(OUTBOX, { recursive: true });
    const file = path.join(
      OUTBOX,
      `${Date.now()}-${String(to).replace(/[^a-z0-9@._-]/gi, '_')}.eml`
    );
    const body = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      html || text || '',
    ].join('\n');
    fs.writeFileSync(file, body, 'utf8');
    console.log(`[mailer] dry transport → wrote ${file}`);
    return { dry: true, file };
  } catch (e) {
    console.error('[mailer] failed to write outbox:', e.message);
    return { dry: true, error: e.message };
  }
}

module.exports = { sendMail };
