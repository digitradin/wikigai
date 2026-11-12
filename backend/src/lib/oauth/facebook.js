/* Facebook — "Continue with Facebook" (Facebook Login). Hidden until FACEBOOK_LOGIN=true.
   Env: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FACEBOOK_REDIRECT_URI (default <PUBLIC_URL>/auth/facebook/callback), FACEBOOK_LOGIN,
   FACEBOOK_GRAPH_VERSION (default v21.0). Tests: FACEBOOK_AUTH_URL, FACEBOOK_API_BASE.
   Scopes: public_profile, email → id, name, picture, email (only when the person has a confirmed email on Facebook).
   NB: a separate Meta app from the Postiz one (that one publishes to our own Page/IG and never signs users in). */
'use strict';
const { call, env, on, redirectUri, clip } = require('./common');

const V = () => env('FACEBOOK_GRAPH_VERSION', 'v21.0');
const AUTH = () => env('FACEBOOK_AUTH_URL', `https://www.facebook.com/${V()}/dialog/oauth`);
const GRAPH = () => env('FACEBOOK_API_BASE', 'https://graph.facebook.com') + '/' + V();
const REDIRECT = () => redirectUri('facebook', 'FACEBOOK_REDIRECT_URI');

module.exports = {
  id: 'facebook',
  label: 'Facebook',
  givesEmail: true,
  configured: () => !!(env('FACEBOOK_APP_ID') && env('FACEBOOK_APP_SECRET')),
  loginEnabled() { return this.configured() && on('FACEBOOK_LOGIN'); },
  intents: ['login', 'link', 'delete'],
  authorizeUrl(state, intent) {
    const q = { client_id: env('FACEBOOK_APP_ID'), redirect_uri: REDIRECT(), state, response_type: 'code', scope: 'public_profile,email' };
    if (intent !== 'login') q.auth_type = 'reauthenticate';
    return AUTH() + '?' + new URLSearchParams(q).toString();
  },
  async exchange(code) {
    const d = await call(GRAPH() + '/oauth/access_token?' + new URLSearchParams({ client_id: env('FACEBOOK_APP_ID'), client_secret: env('FACEBOOK_APP_SECRET'), redirect_uri: REDIRECT(), code }).toString());
    return { accessToken: d.access_token, expiresIn: Number(d.expires_in) || 3600, scope: '' };
  },
  async profile(tok) {
    const u = await call(GRAPH() + '/me?' + new URLSearchParams({ fields: 'id,name,email,picture.type(large)', access_token: tok.accessToken }).toString());
    return { uid: String(u.id || ''), displayName: clip(u.name, 80), avatarUrl: String((u.picture && u.picture.data && u.picture.data.url) || '').slice(0, 500),
      email: u.email ? String(u.email).toLowerCase() : null, emailVerified: !!u.email }; // Facebook only returns a confirmed address
  },
  async revoke(accessToken) {
    try { await call(GRAPH() + '/me/permissions?' + new URLSearchParams({ access_token: accessToken }).toString(), { method: 'DELETE', timeoutMs: 8000 }); return true; } catch { return false; }
  },
};
