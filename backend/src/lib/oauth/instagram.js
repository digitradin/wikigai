/* Instagram — "Continue with Instagram" (Instagram API with Instagram Login). Hidden until INSTAGRAM_LOGIN=true.
   ⚠ Meta only allows this for Instagram PROFESSIONAL accounts (Business/Creator) since the Basic Display API ended (Dec 2024);
   personal Instagram accounts cannot sign in with it. For most students, "Continue with Facebook" is the Meta option that works.
   Env: INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI (default <PUBLIC_URL>/auth/instagram/callback), INSTAGRAM_LOGIN.
   Tests: INSTAGRAM_AUTH_URL, INSTAGRAM_API_BASE, INSTAGRAM_GRAPH_BASE. Instagram never gives an email. */
'use strict';
const { call, env, on, redirectUri, clip } = require('./common');

const AUTH = () => env('INSTAGRAM_AUTH_URL', 'https://www.instagram.com/oauth/authorize');
const TOKEN = () => env('INSTAGRAM_API_BASE', 'https://api.instagram.com') + '/oauth/access_token';
const GRAPH = () => env('INSTAGRAM_GRAPH_BASE', 'https://graph.instagram.com') + '/' + env('INSTAGRAM_GRAPH_VERSION', 'v21.0');
const REDIRECT = () => redirectUri('instagram', 'INSTAGRAM_REDIRECT_URI');

module.exports = {
  id: 'instagram',
  label: 'Instagram',
  givesEmail: false,
  configured: () => !!(env('INSTAGRAM_APP_ID') && env('INSTAGRAM_APP_SECRET')),
  loginEnabled() { return this.configured() && on('INSTAGRAM_LOGIN'); },
  intents: ['login', 'link', 'delete'],
  authorizeUrl(state) {
    return AUTH() + '?' + new URLSearchParams({ client_id: env('INSTAGRAM_APP_ID'), redirect_uri: REDIRECT(), response_type: 'code', scope: 'instagram_business_basic', state }).toString();
  },
  async exchange(code) {
    const d = await call(TOKEN(), { method: 'POST', form: { client_id: env('INSTAGRAM_APP_ID'), client_secret: env('INSTAGRAM_APP_SECRET'), grant_type: 'authorization_code', redirect_uri: REDIRECT(), code } });
    const x = Array.isArray(d.data) ? d.data[0] || {} : d;
    return { accessToken: x.access_token, expiresIn: 3600, scope: '', uid: x.user_id ? String(x.user_id) : null };
  },
  async profile(tok) {
    const u = await call(GRAPH() + '/me?' + new URLSearchParams({ fields: 'user_id,username,name,profile_picture_url', access_token: tok.accessToken }).toString());
    return { uid: String(u.user_id || u.id || tok.uid || ''), displayName: clip(u.name || u.username, 80), avatarUrl: String(u.profile_picture_url || '').slice(0, 500), email: null, emailVerified: false };
  },
  revoke: async () => true, // Instagram Login has no revoke endpoint; the short-lived token is simply discarded
};
