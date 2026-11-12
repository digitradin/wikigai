/* Shared helpers for sign-in providers (v20261112c). */
'use strict';
const PUBLIC_URL = () => (process.env.PUBLIC_URL || 'https://wikigai.com').replace(/\/+$/, '');

class OAuthError extends Error {
  constructor(code, message, status) { super(message || code); this.code = code; this.status = status; }
}

/* small fetch wrapper: form or JSON body, bearer token, timeout; understands the error shapes of TikTok / Google / Meta */
async function call(url, { method = 'GET', form, json, token, timeoutMs = 15000 } = {}) {
  const headers = { Accept: 'application/json' };
  let body;
  if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
  if (json) { headers['Content-Type'] = 'application/json; charset=UTF-8'; body = JSON.stringify(json); }
  if (token) headers.Authorization = 'Bearer ' + token;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  let res, data;
  try {
    res = await fetch(url, { method, headers, body, signal: ctl.signal });
    data = await res.json().catch(() => ({}));
  } catch (e) {
    throw new OAuthError('network', 'The sign-in service could not be reached', 0);
  } finally { clearTimeout(t); }
  const err = data && data.error;
  if (typeof err === 'string' && err) throw new OAuthError(err, data.error_description, res.status);            // OAuth 2 (TikTok, Google)
  if (err && typeof err === 'object' && err.code && err.code !== 'ok') throw new OAuthError(String(err.code), err.message, res.status); // TikTok v2, Meta Graph
  if (!res.ok) throw new OAuthError('http_' + res.status, 'Sign-in service error', res.status);
  return data;
}

const env = (name, def = '') => (process.env[name] || def).trim();
const on = (name) => env(name) === 'true';
const redirectUri = (id, envName) => env(envName) || `${PUBLIC_URL()}/auth/${id}/callback`;
const clip = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, n);

module.exports = { call, OAuthError, env, on, redirectUri, clip, PUBLIC_URL };
