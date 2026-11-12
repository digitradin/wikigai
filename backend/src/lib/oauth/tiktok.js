/* TikTok — Login Kit for Web (sign-in, linking, delete-confirm) + the posting scopes for "Share to TikTok".
   Env: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI, TIKTOK_LOGIN=true (TIKTOK_SHARE: see lib/tiktok.js).
   TikTok never gives an email. */
'use strict';
const tt = require('../tiktok');
const { clip } = require('./common');

module.exports = {
  id: 'tiktok',
  label: 'TikTok',
  givesEmail: false,
  configured: () => tt.configured(),
  loginEnabled: () => tt.flags().login,
  intents: ['login', 'link', 'delete', 'share'],
  authorizeUrl: (state, intent) => tt.authorizeUrl(state, intent),
  async exchange(code) {
    const t = await tt.exchangeCode(code);
    return { accessToken: t.accessToken, expiresIn: t.expiresIn, scope: t.scope, uid: t.openId };
  },
  async profile(tok) {
    const u = await tt.userInfo(tok.accessToken).catch(() => ({ openId: tok.uid }));
    return { uid: tok.uid || u.openId, displayName: clip(u.displayName, 80), avatarUrl: String(u.avatarUrl || '').slice(0, 500), email: null, emailVerified: false };
  },
  revoke: (accessToken) => tt.revoke(accessToken),
};
