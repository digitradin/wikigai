// Local stand-in for the sign-in apps — v20261112c (was tiktok_standin.mjs in v20261112b):
//   TikTok (Login Kit + OAuth + user info + Content Posting API), Google (OpenID Connect), Facebook (Login + Graph /me).
// Lets every sign-in / link / delete / share flow be tested end to end with no account or keys at those apps.
// Run:  node backend/scripts/oauth_standin.mjs 9911
// Backend env (S = http://localhost:9911):
//   TIKTOK_CLIENT_KEY=test TIKTOK_CLIENT_SECRET=test TIKTOK_LOGIN=true TIKTOK_SHARE=true TIKTOK_AUTH_URL=$S/v2/auth/authorize/ TIKTOK_API_BASE=$S
//   GOOGLE_CLIENT_ID=test GOOGLE_CLIENT_SECRET=test GOOGLE_LOGIN=true GOOGLE_AUTH_URL=$S/google/authorize GOOGLE_API_BASE=$S
//   FACEBOOK_APP_ID=test FACEBOOK_APP_SECRET=test FACEBOOK_LOGIN=true FACEBOOK_AUTH_URL=$S/fb/dialog FACEBOOK_API_BASE=$S/fb
// Test controls: GET /__as?open_id=X&name=Y[&email=E&verified=1]  (who "logs in" at the app next)  ·  GET /__deny  (next consent refused)
//                GET /__log  (what the backend sent: token exchanges, revokes, posts and whether TikTok could fetch the images)
import http from 'node:http';

const port = parseInt(process.argv[2] || '9911', 10);
let who = { open_id: 'tt_user_1', name: 'Lucía TT' }, deny = false;
const codes = new Map(), log = { tokens: [], revoked: [], posts: [], fetched: [] };
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const ok = { code: 'ok', message: '' };
const bodyOf = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => { d += c; }); req.on('end', () => r(d)); });
const tokenOf = (req) => String(req.headers.authorization || '').replace(/^Bearer /, '');

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const raw = await bodyOf(req);
  if (u.pathname === '/__as') { who = { open_id: u.searchParams.get('open_id'), name: u.searchParams.get('name') || 'TT user', email: u.searchParams.get('email') || null, verified: u.searchParams.get('verified') === '1' }; deny = false; return json(res, 200, { ok: true, who }); }
  if (u.pathname === '/__deny') { deny = true; return json(res, 200, { ok: true }); }
  if (u.pathname === '/__log') return json(res, 200, log);
  if (u.pathname === '/v2/auth/authorize/' || u.pathname === '/google/authorize' || u.pathname === '/fb/dialog') {
    const back = new URL(u.searchParams.get('redirect_uri'));
    back.searchParams.set('state', u.searchParams.get('state'));
    if (deny) { deny = false; back.searchParams.set('error', 'access_denied'); }
    else { const code = 'c_' + Math.random().toString(36).slice(2); codes.set(code, { ...who, scope: u.searchParams.get('scope'), app: u.pathname.split('/')[1] === 'v2' ? 'tiktok' : u.pathname.split('/')[1] }); back.searchParams.set('code', code); }
    res.writeHead(302, { Location: back.toString() }); return res.end();
  }
  if (u.pathname === '/v2/oauth/token/') {
    const f = new URLSearchParams(raw), c = codes.get(f.get('code'));
    if (!c || c.app !== 'tiktok' || !f.get('client_secret')) return json(res, 400, { error: 'invalid_grant', error_description: 'bad code' });
    codes.delete(f.get('code'));
    const at = 'at_' + c.open_id + '_' + Math.random().toString(36).slice(2, 8);
    log.tokens.push({ open_id: c.open_id, scope: c.scope });
    codes.set('tok:' + at, c);
    return json(res, 200, { access_token: at, expires_in: 86400, open_id: c.open_id, refresh_token: 'rt_never_stored', refresh_expires_in: 31536000, scope: c.scope, token_type: 'Bearer' });
  }
  /* Google */
  if (u.pathname === '/google/token') {
    const f = new URLSearchParams(raw), c = codes.get(f.get('code'));
    if (!c || c.app !== 'google' || !f.get('client_secret')) return json(res, 400, { error: 'invalid_grant', error_description: 'bad code' });
    codes.delete(f.get('code'));
    const at = 'gat_' + Math.random().toString(36).slice(2, 10); codes.set('tok:' + at, c); log.tokens.push({ app: 'google', open_id: c.open_id, scope: c.scope });
    return json(res, 200, { access_token: at, expires_in: 3599, scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile', token_type: 'Bearer', id_token: 'x.y.z' });
  }
  if (u.pathname === '/google/revoke') { log.revoked.push(new URLSearchParams(raw).get('token')); return json(res, 200, {}); }
  if (u.pathname === '/google/userinfo') {
    const g = codes.get('tok:' + tokenOf(req));
    if (!g) return json(res, 401, { error: 'invalid_token', error_description: 'Invalid Credentials' });
    return json(res, 200, { sub: g.open_id, name: g.name, picture: 'https://lh3.example.com/a.jpg', email: g.email, email_verified: !!g.verified });
  }
  /* Facebook (Graph) */
  const fb = u.pathname.match(/^\/fb\/v[\d.]+\/(oauth\/access_token|me\/permissions|me)$/);
  if (fb) {
    if (fb[1] === 'oauth/access_token') {
      const c = codes.get(u.searchParams.get('code'));
      if (!c || c.app !== 'fb' || !u.searchParams.get('client_secret')) return json(res, 400, { error: { message: 'Invalid verification code format.', type: 'OAuthException', code: 100 } });
      codes.delete(u.searchParams.get('code'));
      const at = 'fbat_' + Math.random().toString(36).slice(2, 10); codes.set('tok:' + at, c); log.tokens.push({ app: 'facebook', open_id: c.open_id, scope: c.scope });
      return json(res, 200, { access_token: at, token_type: 'bearer', expires_in: 5183944 });
    }
    const f = codes.get('tok:' + u.searchParams.get('access_token'));
    if (!f) return json(res, 400, { error: { message: 'Invalid OAuth access token.', type: 'OAuthException', code: 190 } });
    if (fb[1] === 'me/permissions') { log.revoked.push(u.searchParams.get('access_token')); return json(res, 200, { success: true }); }
    return json(res, 200, { id: f.open_id, name: f.name, ...(f.email ? { email: f.email } : {}), picture: { data: { url: 'https://fb.example.com/p.jpg', is_silhouette: false } } });
  }
  if (u.pathname === '/v2/oauth/revoke/') { log.revoked.push(new URLSearchParams(raw).get('token')); return json(res, 200, {}); }
  const t = codes.get('tok:' + tokenOf(req));
  if (!t) return json(res, 401, { data: {}, error: { code: 'access_token_invalid', message: 'invalid token' } });
  if (u.pathname === '/v2/user/info/') return json(res, 200, { data: { user: { open_id: t.open_id, display_name: t.name, avatar_url: 'https://p16.example.com/avatar.jpg' } }, error: ok });
  if (u.pathname === '/v2/post/publish/creator_info/query/') {
    return json(res, 200, { data: { creator_avatar_url: 'https://p16.example.com/avatar.jpg', creator_username: t.open_id, creator_nickname: t.name,
      privacy_level_options: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'], comment_disabled: false, duet_disabled: false, stitch_disabled: true, max_video_post_duration_sec: 600 }, error: ok });
  }
  if (u.pathname === '/v2/post/publish/content/init/') {
    const b = JSON.parse(raw || '{}');
    const urls = (b.source_info && b.source_info.photo_images) || [];
    const fetched = [];
    for (const url of urls) { // PULL_FROM_URL: TikTok downloads every image — must be 200 + image/jpeg, no redirect
      try { const r = await fetch(url, { redirect: 'manual' }); fetched.push({ url, status: r.status, type: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength }); }
      catch (e) { fetched.push({ url, error: e.message }); }
    }
    log.posts.push({ open_id: t.open_id, body: b }); log.fetched.push(...fetched);
    if (fetched.some((f) => f.status !== 200)) return json(res, 400, { data: {}, error: { code: 'url_ownership_unverified', message: 'cannot fetch' } });
    return json(res, 200, { data: { publish_id: 'p_' + log.posts.length + '_' + b.post_mode }, error: ok });
  }
  if (u.pathname === '/v2/post/publish/status/fetch/') {
    const b = JSON.parse(raw || '{}');
    return json(res, 200, { data: { status: /MEDIA_UPLOAD/.test(b.publish_id) ? 'SEND_TO_USER_INBOX' : 'PUBLISH_COMPLETE' }, error: ok });
  }
  json(res, 404, { error: { code: 'not_found' } });
}).listen(port, () => console.log(`[oauth-standin] listening on ${port}`));
