/* Wikigai — TikTok API client (v20261112b): Login Kit for Web + Content Posting API (photo carousel).
   Docs: developers.tiktok.com — Login Kit for Web, OAuth token / revoke, Display API user info,
   Content Posting API (creator_info/query, content/init, status/fetch).
   Settings (server .env only — the secret never reaches the browser):
     TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET   app keys (sandbox keys on preprod)
     TIKTOK_REDIRECT_URI                       default <PUBLIC_URL>/auth/tiktok/callback (must match the app exactly)
     TIKTOK_MEDIA_BASE_URL                     default <PUBLIC_URL> (domain verified in the TikTok app; images at /tt-media/…)
     TIKTOK_LOGIN=true|false                   show "Continue with TikTok" (default false)
     TIKTOK_SHARE=true|false                   show "Share to TikTok" (default false)
     TIKTOK_AUTH_URL, TIKTOK_API_BASE          only for tests (stand-in server)                                  */
'use strict';

const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://wikigai.com').replace(/\/+$/, '');
const AUTH_URL = process.env.TIKTOK_AUTH_URL || 'https://www.tiktok.com/v2/auth/authorize/';
const API = (process.env.TIKTOK_API_BASE || 'https://open.tiktokapis.com').replace(/\/+$/, '');
const KEY = () => process.env.TIKTOK_CLIENT_KEY || '';
const SECRET = () => process.env.TIKTOK_CLIENT_SECRET || '';
const REDIRECT = () => process.env.TIKTOK_REDIRECT_URI || PUBLIC_URL + '/auth/tiktok/callback';
const MEDIA_BASE = () => (process.env.TIKTOK_MEDIA_BASE_URL || PUBLIC_URL).replace(/\/+$/, '');

const configured = () => !!(KEY() && SECRET());
const flags = () => ({
  login: configured() && process.env.TIKTOK_LOGIN === 'true',
  share: configured() && process.env.TIKTOK_SHARE === 'true',
});

/* scopes per intent: sign-in needs only the basic profile; posting asks for more, only when the user shares */
const SCOPES = {
  login: 'user.info.basic',
  link: 'user.info.basic',
  delete: 'user.info.basic',
  share: 'user.info.basic,video.publish,video.upload',
};

function authorizeUrl(state, intent) {
  const q = new URLSearchParams({
    client_key: KEY(), response_type: 'code', scope: SCOPES[intent] || SCOPES.login,
    redirect_uri: REDIRECT(), state,
  });
  return AUTH_URL + '?' + q.toString();
}

class TikTokError extends Error {
  constructor(code, message, status) { super(message || code); this.code = code; this.status = status; }
}

async function call(path, { method = 'POST', form, json, token, timeoutMs = 15000 } = {}) {
  const headers = {};
  let body;
  if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
  if (json) { headers['Content-Type'] = 'application/json; charset=UTF-8'; body = JSON.stringify(json); }
  if (token) headers.Authorization = 'Bearer ' + token;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  let res, data;
  try {
    res = await fetch(API + path, { method, headers, body, signal: ctl.signal });
    data = await res.json().catch(() => ({}));
  } catch (e) {
    throw new TikTokError('network', 'TikTok could not be reached', 0);
  } finally { clearTimeout(t); }
  // OAuth endpoints answer { error, error_description }; v2 APIs answer { data, error: { code, message } }
  const err = data && data.error;
  if (typeof err === 'string' && err) throw new TikTokError(err, data.error_description, res.status);
  if (err && typeof err === 'object' && err.code && err.code !== 'ok') throw new TikTokError(err.code, err.message, res.status);
  if (!res.ok) throw new TikTokError('http_' + res.status, 'TikTok error', res.status);
  return data;
}

/* code → { access_token, expires_in, open_id, scope } (the refresh token is discarded on purpose) */
async function exchangeCode(code) {
  const d = await call('/v2/oauth/token/', {
    form: { client_key: KEY(), client_secret: SECRET(), code, grant_type: 'authorization_code', redirect_uri: REDIRECT() },
  });
  if (!d.access_token || !d.open_id) throw new TikTokError('bad_token_response');
  return { accessToken: d.access_token, expiresIn: Number(d.expires_in) || 86400, openId: d.open_id, scope: d.scope || '' };
}

async function userInfo(accessToken) {
  const d = await call('/v2/user/info/?fields=open_id,avatar_url,display_name', { method: 'GET', token: accessToken });
  const u = (d.data && d.data.user) || {};
  return { openId: u.open_id, displayName: String(u.display_name || '').slice(0, 80), avatarUrl: String(u.avatar_url || '').slice(0, 500) };
}

async function revoke(accessToken) {
  try { await call('/v2/oauth/revoke/', { form: { client_key: KEY(), client_secret: SECRET(), token: accessToken }, timeoutMs: 8000 }); return true; }
  catch (e) { console.warn('[tiktok] revoke failed:', e.code); return false; }
}

async function creatorInfo(accessToken) {
  const d = await call('/v2/post/publish/creator_info/query/', { token: accessToken, json: {} });
  return d.data || {};
}

/* photo carousel: DIRECT_POST (with the user's settings) or MEDIA_UPLOAD (goes to the user's TikTok inbox) */
async function initPhotoPost(accessToken, { urls, mode, title, description, privacyLevel, disableComment, autoAddMusic, brandContent, brandOrganic }) {
  const direct = mode === 'DIRECT_POST';
  const post_info = { title: title || '', description: description || '' };
  if (direct) Object.assign(post_info, {
    privacy_level: privacyLevel, disable_comment: !!disableComment, auto_add_music: !!autoAddMusic,
    brand_content_toggle: !!brandContent, brand_organic_toggle: !!brandOrganic,
  });
  const d = await call('/v2/post/publish/content/init/', {
    token: accessToken,
    json: { post_info, source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: urls }, post_mode: direct ? 'DIRECT_POST' : 'MEDIA_UPLOAD', media_type: 'PHOTO' },
  });
  if (!d.data || !d.data.publish_id) throw new TikTokError('no_publish_id');
  return d.data.publish_id;
}

async function postStatus(accessToken, publishId) {
  const d = await call('/v2/post/publish/status/fetch/', { token: accessToken, json: { publish_id: publishId } });
  return d.data || {};
}

module.exports = { configured, flags, authorizeUrl, exchangeCode, userInfo, revoke, creatorInfo, initPhotoPost, postStatus, TikTokError, MEDIA_BASE, REDIRECT, SCOPES };
