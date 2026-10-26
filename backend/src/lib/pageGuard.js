/* Members-only pages — server-side guard.
   The API is authenticated with the Bearer token (localStorage). Page loads can't send that
   header, so after sign-in we also set an httpOnly session cookie (same signed token) and
   the server refuses to serve member pages without it: visitors are redirected to /login.
   The cookie is never used to authorise API calls (no CSRF exposure). */
'use strict';
const db = require('./db');
const { verifySessionToken, DEFAULT_TTL_MS } = require('./session');

const COOKIE = 'wk_session';
// /dashboard, /dashboard/…, /ikigai, /ikigai/…, /learning…, /account and their raw .html files
const MEMBER_PAGE = /^\/(dashboard|ikigai|learning|account)(\/.*|\.html)?$/;

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
const secure = (req) => req.secure || process.env.NODE_ENV === 'production';

function setSessionCookie(req, res, token) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: secure(req), path: '/', maxAge: DEFAULT_TTL_MS });
}
function clearSessionCookie(req, res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: secure(req), path: '/' });
}

/* express middleware: block member pages for visitors */
async function guardMemberPages(req, res, next) {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || !MEMBER_PAGE.test(req.path)) return next();
  res.set('Cache-Control', 'no-store');
  try {
    const payload = verifySessionToken(readCookie(req, COOKIE));
    if (payload && payload.sub) {
      const u = await db.getOne('SELECT id FROM users WHERE id = $1 AND status = $2', [payload.sub, 'active']);
      if (u) return next();
    }
  } catch (err) {
    console.warn('[guard] check failed:', err.message);
  }
  clearSessionCookie(req, res);
  const back = req.originalUrl.startsWith('/') && !req.originalUrl.startsWith('//') ? req.originalUrl.slice(0, 300) : '/dashboard';
  return res.redirect(302, '/login?next=' + encodeURIComponent(back));
}

module.exports = { guardMemberPages, setSessionCookie, clearSessionCookie, readCookie, COOKIE, MEMBER_PAGE };
