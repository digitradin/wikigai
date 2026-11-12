/* Google — "Sign in with Google" (OpenID Connect). Hidden until GOOGLE_LOGIN=true.
   Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI (default <PUBLIC_URL>/auth/google/callback), GOOGLE_LOGIN.
   Tests: GOOGLE_AUTH_URL, GOOGLE_API_BASE (stand-in).
   Scopes: openid email profile → sub, name, picture, email + email_verified. */
'use strict';
const { call, env, on, redirectUri, clip } = require('./common');

const AUTH = () => env('GOOGLE_AUTH_URL', 'https://accounts.google.com/o/oauth2/v2/auth');
const TOKEN = () => (env('GOOGLE_API_BASE') ? env('GOOGLE_API_BASE') + '/google/token' : 'https://oauth2.googleapis.com/token');
const USERINFO = () => (env('GOOGLE_API_BASE') ? env('GOOGLE_API_BASE') + '/google/userinfo' : 'https://openidconnect.googleapis.com/v1/userinfo');
const REVOKE = () => (env('GOOGLE_API_BASE') ? env('GOOGLE_API_BASE') + '/google/revoke' : 'https://oauth2.googleapis.com/revoke');
const REDIRECT = () => redirectUri('google', 'GOOGLE_REDIRECT_URI');

module.exports = {
  id: 'google',
  label: 'Google',
  givesEmail: true,
  configured: () => !!(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET')),
  loginEnabled() { return this.configured() && on('GOOGLE_LOGIN'); },
  intents: ['login', 'link', 'delete'],
  authorizeUrl(state, intent) {
    return AUTH() + '?' + new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: REDIRECT(), response_type: 'code', scope: 'openid email profile',
      state, prompt: intent === 'login' ? 'select_account' : 'login', include_granted_scopes: 'true',
    }).toString();
  },
  async exchange(code) {
    const d = await call(TOKEN(), { method: 'POST', form: { client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), code, grant_type: 'authorization_code', redirect_uri: REDIRECT() } });
    return { accessToken: d.access_token, expiresIn: Number(d.expires_in) || 3600, scope: d.scope || '' };
  },
  async profile(tok) {
    const u = await call(USERINFO(), { token: tok.accessToken });
    return { uid: String(u.sub || ''), displayName: clip(u.name, 80), avatarUrl: String(u.picture || '').slice(0, 500),
      email: u.email ? String(u.email).toLowerCase() : null, emailVerified: u.email_verified === true || u.email_verified === 'true' };
  },
  async revoke(accessToken) {
    try { await call(REVOKE(), { method: 'POST', form: { token: accessToken }, timeoutMs: 8000 }); return true; } catch { return false; }
  },
};
