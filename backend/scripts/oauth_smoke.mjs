// End-to-end test of sign-in with apps — v20261112c (was tiktok_smoke.mjs in v20261112b):
// "Continue with TikTok / Google / Facebook", linked sign-in methods, merge, deletion, "Share to TikTok", apps hidden when off.
// Needs: the backend with EXPOSE_PINS=true + the env of oauth_standin.mjs (TikTok, Google, Facebook on; Instagram OFF), and the stand-in running.
// Run:   BASE_URL=http://localhost:8095 TT=http://localhost:9911 node backend/scripts/oauth_smoke.mjs
//        HIDDEN=1 … oauth_smoke.mjs   → only checks a stack where NO app is switched on (the production default)
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const TT = process.env.TT || 'http://127.0.0.1:9911';
let passed = 0, failed = 0;
const check = (name, cond, extra = '') => { if (cond) { passed++; console.log(`  ✅ ${name}`); } else { failed++; console.log(`  ❌ ${name} ${extra}`); } };

async function j(path, { method = 'GET', body, token, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  let data = {}; try { data = await res.json(); } catch { /* not json */ }
  return { status: res.status, data, setCookie: res.headers.get('set-cookie') || '' };
}
const ck = (sc) => (sc.match(/wk_session=[^;]*/) || [''])[0];

/* one round trip with a sign-in app: start → (stand-in consent) → callback; returns the final redirect */
async function app(provider, intent, { as, token, cookie, deny, next, email, verified, path } = {}) {
  if (deny) await fetch(TT + '/__deny');
  else await fetch(`${TT}/__as?open_id=${encodeURIComponent(as)}&name=${encodeURIComponent(as + ' name')}${email ? '&email=' + encodeURIComponent(email) : ''}${verified ? '&verified=1' : ''}`);
  const st = await j(`${path || `/api/oauth/${provider}/start`}?intent=${intent}&lang=es${next ? '&next=' + encodeURIComponent(next) : ''}`, { token, cookie });
  if (!st.data.url) return { error: st };
  const c = cookie || ck(st.setCookie);
  const a = await fetch(st.data.url, { redirect: 'manual' });                    // TikTok consent → 302 to our callback
  const cb = await fetch(a.headers.get('location'), { redirect: 'manual', headers: c ? { Cookie: c } : {} });
  const loc = cb.headers.get('location') || '';
  const frag = new URLSearchParams(loc.split('#')[1] || '');
  return { loc, token: frag.get('t'), isNew: frag.get('new') === '1', next: frag.get('n'), setCookie: cb.headers.get('set-cookie') || '', cookie: c };
}
const tiktok = (intent, o) => app('tiktok', intent, o);
const q = (code, p = 'tiktok') => `?auth=${code}&via=${p}`;
async function signupEmail(email) {
  const s = await j('/api/captcha/_debug/solve');
  const r = await j('/api/auth/signup', { method: 'POST', body: { email, password: 'Sunshine42', name: 'Mail User', captcha_id: s.data.captcha_id, captcha_answer: s.data.answer } });
  const v = await j('/api/auth/verify', { method: 'POST', body: { email, pin: r.data.dev_pin } });
  return { token: v.data.token, id: v.data.user && v.data.user.id };
}
const profile = async (token) => (await j('/api/user/profile', { token })).data;
/* minimal JPEG header with a SOF0 of w×h (the server reads the size from the file) */
function jpeg(w, h) {
  const b = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);
  return b.toString('base64');
}
const stamp = Date.now();

console.log(`\n▶ Sign-in apps smoke — ${BASE} (stand-in ${TT})\n`);
const cfg = (await j('/api/config')).data;
if (process.env.HIDDEN === '1') {
  console.log('— hidden by default (no app switched on) —');
  check('config: no sign-in app, TikTok login + share off', Array.isArray(cfg.auth && cfg.auth.providers) && cfg.auth.providers.length === 0 && !cfg.tiktok.login && !cfg.tiktok.share, JSON.stringify([cfg.auth, cfg.tiktok]));
  for (const p of ['tiktok', 'google', 'facebook', 'instagram']) {
    const r = await j(`/api/oauth/${p}/start?intent=login`);
    check(`${p}: start refused (PROVIDER_OFF)`, r.status === 404 && r.data.code === 'PROVIDER_OFF', JSON.stringify(r.data));
  }
  for (const l of ['', '/fr', '/es']) {
    const h = await (await fetch(`${BASE}${l}/privacy`)).text();
    check(`privacy${l || ' (en)'}: no Google / Facebook sign-in text, no template tags`, !/(Signing in with|Connexion avec|Iniciar sesión con) (Google|Facebook|Instagram)/.test(h) && !/<!--\/?(if|ifnot)|\{\{/.test(h)
      && /(do not offer sign-in with Facebook|ne proposons pas de connexion via Facebook|No ofrecemos inicio de sesión con Facebook)/.test(h));
  }
  console.log(`\n${failed ? '❌ FAILURES' : '✅ ALL PASS'} — passed=${passed} failed=${failed}`);
  process.exit(failed ? 1 : 0);
}
check('config exposes tiktok login + share', cfg.tiktok && cfg.tiktok.login === true && cfg.tiktok.share === true, JSON.stringify(cfg.tiktok));
check('config lists the apps switched on (TikTok, Google, Facebook — not Instagram)', JSON.stringify((cfg.auth.providers || []).map((p) => p.id).sort()) === '["facebook","google","tiktok"]', JSON.stringify(cfg.auth));

console.log('— A. new user with "Continue with TikTok" —');
const old = await j('/api/tiktok/start?intent=login&lang=en');
check('v20261112b start URL still works (/api/tiktok/start)', old.status === 200 && /\/v2\/auth\/authorize\//.test(old.data.url));
const A = await tiktok('login', { as: 'ttA' + stamp });
check('callback → /auth/done with a session', /^\/auth\/done#/.test(A.loc) && !!A.token, A.loc);
check('new account goes to the survey', A.isNew && A.next === '/survey');
check('session cookie set for member pages', /wk_session=/.test(A.setCookie));
let pA = await profile(A.token);
check('account has no email, TikTok linked, add-email card on', pA.user && !pA.user.email && pA.methods.tiktok && !pA.methods.email && pA.emailPrompt === true, JSON.stringify(pA.methods));
check('language from the TikTok sign-in (es)', pA.user.locale === 'es');
const save = await j('/api/user/results', { method: 'POST', token: A.token, body: { stage: 1, results: { ranked: [{ area: 'Technology', score: 9 }], completedAt: new Date().toISOString() } } });
check('results save without an email', save.status === 200, JSON.stringify(save.data));
const A2 = await tiktok('login', { as: 'ttA' + stamp });
check('second TikTok login → same account, to dashboard', !A2.isNew && A2.next === '/dashboard' && (await profile(A2.token)).user.id === pA.user.id);
const exp = await fetch(BASE + '/api/user/export', { headers: { Authorization: 'Bearer ' + A.token } });
const expJ = await exp.json();
check('export works for a TikTok-only account and lists sign-in methods', exp.status === 200 && expJ.signInMethods.some((m) => m.method === 'tiktok') && expJ.surveyResults.length === 1);
const dis0 = await j('/api/oauth/tiktok/disconnect', { method: 'POST', token: A.token });
check('disconnect refused without an email', dis0.status === 400 && dis0.data.code === 'NEED_EMAIL');
const dismiss = await j('/api/user/email-prompt/dismiss', { method: 'POST', token: A.token });
check('"Not now" counted', dismiss.status === 200);

console.log('— B. add an email after the results (no password needed) —');
const emailA = `tt_${stamp}@example.com`;
const st1 = await j('/api/auth/email-change/start', { method: 'POST', token: A.token, body: { newEmail: emailA } });
check('code sent to the new email', st1.status === 200 && !!st1.data.dev_pin, JSON.stringify(st1.data));
const cf1 = await j('/api/auth/email-change/confirm', { method: 'POST', token: A.token, body: { newEmail: emailA, pin: st1.data.dev_pin } });
check('email added', cf1.status === 200 && cf1.data.email === emailA, JSON.stringify(cf1.data));
pA = await profile(A.token);
check('profile: email + TikTok, card gone, results kept', pA.methods.email && pA.methods.tiktok && !pA.emailPrompt && pA.progress.hasResults);
const fg = await j('/api/auth/forgot', { method: 'POST', body: { email: emailA } });
const rs = await j('/api/auth/reset', { method: 'POST', body: { email: emailA, pin: fg.data.dev_pin, password: 'Moonlight77', password2: 'Moonlight77' } });
const s1 = await j('/api/captcha/_debug/solve');
const lg = await j('/api/auth/login', { method: 'POST', body: { email: emailA, password: 'Moonlight77', captcha_id: s1.data.captcha_id, captcha_answer: s1.data.answer } });
check('email + password login → the SAME account', rs.status === 200 && lg.status === 200 && lg.data.user.id === pA.user.id, JSON.stringify(lg.data).slice(0, 120));
const dis1 = await j('/api/oauth/tiktok/disconnect', { method: 'POST', token: A.token });
check('disconnect allowed once the email exists', dis1.status === 200 && !(await profile(A.token)).methods.tiktok);

console.log('— C. email user connects TikTok —');
const B = await signupEmail(`mail_b_${stamp}@example.com`);
const Bl = await tiktok('link', { as: 'ttB' + stamp, token: B.token });
check('link → /account?auth=linked', Bl.loc === '/account' + q('linked'), Bl.loc);
const Bt = await tiktok('login', { as: 'ttB' + stamp });
check('"Continue with TikTok" → the email account', !Bt.isNew && (await profile(Bt.token)).user.id === B.id);
const C = await signupEmail(`mail_c_${stamp}@example.com`);
const Ct = await tiktok('link', { as: 'ttB' + stamp, token: C.token });
check('TikTok already used by another email account → refused', Ct.loc === '/account' + q('taken'), Ct.loc);
const Co = await tiktok('link', { as: 'ttOther' + stamp, token: B.token });
check('second TikTok on the same account → refused', Co.loc === '/account' + q('other'), Co.loc);
const nocookie = await tiktok('link', { as: 'ttZ' + stamp, token: C.token, cookie: 'wk_session=forged' });
check('link without the matching session cookie → refused', nocookie.loc === '/account' + q('session'), nocookie.loc);

console.log('— D. TikTok-only account merged into an email account —');
const D = await tiktok('login', { as: 'ttD' + stamp });
await j('/api/user/results', { method: 'POST', token: D.token, body: { stage: 1, results: { ranked: [{ area: 'Health', score: 8 }], completedAt: new Date().toISOString() } } });
const dId = (await profile(D.token)).user.id;
const E = await signupEmail(`mail_e_${stamp}@example.com`);
const taken = await j('/api/auth/email-change/start', { method: 'POST', token: D.token, body: { newEmail: `mail_e_${stamp}@example.com` } });
check('TikTok user typing an existing email → EMAIL_TAKEN + link hint', taken.status === 409 && taken.data.code === 'EMAIL_TAKEN' && taken.data.linkHint === true);
const Em = await tiktok('link', { as: 'ttD' + stamp, token: E.token });
check('connect from the email account → merged', Em.loc === '/account' + q('merged'), Em.loc);
const eRes = (await j('/api/user/results', { token: E.token })).data;
check('results moved into the email account', !!(eRes.results && eRes.results.stage_1));
const Dt = await tiktok('login', { as: 'ttD' + stamp });
check('TikTok now opens the email account; old account gone', (await profile(Dt.token)).user.id === E.id && (await j('/api/user/profile', { token: D.token })).status === 404);

console.log('— E. Share to TikTok —');
const sh0 = await j('/api/tiktok/status', { token: E.token });
check('status: not connected for posting yet', sh0.status === 200 && sh0.data.enabled && !sh0.data.connected);
const Es = await tiktok('share', { as: 'ttD' + stamp, token: E.token });
check('share consent → back to /share/tiktok?auth=connected', Es.loc === '/share/tiktok' + q('connected'), Es.loc);
const lg2 = await (await fetch(TT + '/__log')).json();
check('posting scopes asked only for sharing', /video\.publish/.test(lg2.tokens.at(-1).scope) && !/video/.test(lg2.tokens.find((t) => t.open_id === 'ttA' + stamp).scope));
const sh1 = await j('/api/tiktok/status', { token: E.token });
check('status: connected, direct post + upload', sh1.data.connected && sh1.data.canDirectPost && sh1.data.canUpload);
const ci = await j('/api/tiktok/creator-info', { method: 'POST', token: E.token });
check('creator info (nickname + privacy options)', ci.status === 200 && ci.data.creator.nickname && ci.data.creator.privacyOptions.length === 3);
const bad = await j('/api/tiktok/media', { method: 'POST', token: E.token, body: { images: [jpeg(1080, 1080), jpeg(1080, 1920)] } });
check('wrong image size refused', bad.status === 400 && bad.data.code === 'BAD_MEDIA');
const md = await j('/api/tiktok/media', { method: 'POST', token: E.token, body: { images: [jpeg(1080, 1920), jpeg(1080, 1920), jpeg(1080, 1920)] } });
check('3 slides stored', md.status === 200 && md.data.count === 3);
const img = await fetch(`${BASE}/tt-media/${md.data.token}/1.jpg`, { redirect: 'manual' });
check('/tt-media image: 200, image/jpeg, no redirect', img.status === 200 && img.headers.get('content-type') === 'image/jpeg');
const p0 = await j('/api/tiktok/post', { method: 'POST', token: E.token, body: { mediaToken: md.data.token, mode: 'DIRECT_POST', title: 't', description: 'd' } });
check('Direct Post without a privacy choice → refused', p0.status === 400 && p0.data.code === 'BAD_PRIVACY');
const p1 = await j('/api/tiktok/post', { method: 'POST', token: E.token, body: { mediaToken: md.data.token, mode: 'DIRECT_POST', title: 't', description: 'd', privacyLevel: 'SELF_ONLY', brandContent: true } });
check('branded content + "Only me" → refused', p1.status === 400 && p1.data.code === 'BRANDED_PRIVATE');
const p2 = await j('/api/tiktok/post', { method: 'POST', token: E.token, body: { mediaToken: md.data.token, mode: 'DIRECT_POST', title: 'Mi mapa', description: 'caption #ikigai', privacyLevel: 'MUTUAL_FOLLOW_FRIENDS', disableComment: true, autoAddMusic: true } });
check('Direct Post accepted', p2.status === 200 && !!p2.data.publishId, JSON.stringify(p2.data));
const lg3 = await (await fetch(TT + '/__log')).json();
const last = lg3.posts.at(-1).body;
check('sent to TikTok as typed: PHOTO, PULL_FROM_URL, 3 images, privacy + comments + music', last.media_type === 'PHOTO' && last.source_info.source === 'PULL_FROM_URL'
  && last.source_info.photo_images.length === 3 && last.post_info.privacy_level === 'MUTUAL_FOLLOW_FRIENDS' && last.post_info.disable_comment === true && last.post_info.auto_add_music === true && last.post_info.title === 'Mi mapa');
check('TikTok could fetch every image (200, image/jpeg)', lg3.fetched.slice(-3).every((f) => f.status === 200 && f.type === 'image/jpeg'));
const ps = await j('/api/tiktok/post-status', { method: 'POST', token: E.token, body: { publishId: p2.data.publishId } });
check('status → PUBLISH_COMPLETE', ps.data.status === 'PUBLISH_COMPLETE');
const p3 = await j('/api/tiktok/post', { method: 'POST', token: E.token, body: { mediaToken: md.data.token, mode: 'MEDIA_UPLOAD', title: 'x', description: 'y' } });
const ps3 = await j('/api/tiktok/post-status', { method: 'POST', token: E.token, body: { publishId: p3.data.publishId } });
check('"Open in TikTok" (MEDIA_UPLOAD) → inbox, no privacy fields sent', p3.status === 200 && ps3.data.status === 'SEND_TO_USER_INBOX' && !('privacy_level' in (await (await fetch(TT + '/__log')).json()).posts.at(-1).body.post_info));
const other = await signupEmail(`mail_x_${stamp}@example.com`);
const steal = await j('/api/tiktok/post', { method: 'POST', token: other.token, body: { mediaToken: md.data.token, mode: 'MEDIA_UPLOAD' } });
check("another user can't post someone else's images", steal.status === 401 || steal.status === 400);
const expE = await (await fetch(BASE + '/api/user/export', { headers: { Authorization: 'Bearer ' + E.token } })).json();
check('export shows the posting token window + pending images', !!expE.tiktok.postingTokenStoredUntil && expE.tiktok.pendingImages === 3);

console.log('— F. cancel, expired state —');
const cancel = await tiktok('login', { deny: true });
check('cancel at TikTok → /login?auth=cancel', cancel.loc === '/login' + q('cancel'), cancel.loc);
const stale = await fetch(BASE + '/auth/tiktok/callback?code=x&state=nope', { redirect: 'manual' });
check('unknown state → /login?auth=expired', stale.headers.get('location') === '/login' + q('expired'));

console.log('— G. delete a TikTok-only account by confirming with TikTok —');
const G = await tiktok('login', { as: 'ttG' + stamp }); if (!G.token) console.log('G =', JSON.stringify(G).slice(0, 300));
const gId = (await profile(G.token)).user.id;
await j('/api/user/results', { method: 'POST', token: G.token, body: { stage: 1, results: { ranked: [], completedAt: new Date().toISOString() } } });
const Gs = await tiktok('share', { as: 'ttG' + stamp, token: G.token, cookie: ck(G.setCookie) });
await j('/api/tiktok/media', { method: 'POST', token: G.token, body: { images: [jpeg(1080, 1920), jpeg(1080, 1920)] } });
const wrong = await tiktok('delete', { as: 'ttSomeoneElse' + stamp, token: G.token, cookie: ck(G.setCookie) });
check('confirming with a different TikTok → nothing deleted', wrong.loc === '/account' + q('mismatch') && (await j('/api/user/profile', { token: G.token })).status === 200, wrong.loc);
const revokedBefore = (await (await fetch(TT + '/__log')).json()).revoked.length;
const del = await tiktok('delete', { as: 'ttG' + stamp, token: G.token, cookie: ck(G.setCookie) });
check('confirm with TikTok → /auth/done#deleted=1', del.loc === '/auth/done#deleted=1', del.loc);
check('account gone (profile 404)', (await j('/api/user/profile', { token: G.token })).status === 404);
const lg4 = await (await fetch(TT + '/__log')).json();
check('posting token revoked at TikTok on deletion', lg4.revoked.length > revokedBefore);
console.log(`\n  (deleted account id for the DB check: ${gId})`);

console.log('— H. Google (gives a verified email) —');
const gEmail = `g_${stamp}@example.com`;
const H1 = await app('google', 'login', { as: 'g1' + stamp, email: gEmail, verified: true });
let pH = await profile(H1.token);
check('new Google user: account WITH the verified email, no add-email card', H1.isNew && pH.user.email === gEmail && pH.methods.email && !pH.emailPrompt, JSON.stringify(pH.methods));
check('profile lists Google under sign-in methods', (pH.methods.providers || []).some((p) => p.id === 'google' && p.name));
const H1b = await app('google', 'login', { as: 'g1' + stamp, email: gEmail, verified: true });
check('second Google login → same account', !H1b.isNew && (await profile(H1b.token)).user.id === pH.user.id);
const mailOwner = await signupEmail(`owner_${stamp}@example.com`);
const H2 = await app('google', 'login', { as: 'g2' + stamp, email: `owner_${stamp}@example.com`, verified: true });
check('Google email already has an account → /login?auth=email_exists (no silent merge)', H2.loc === '/login' + q('email_exists', 'google') && !H2.token, H2.loc);
const H3 = await app('google', 'login', { as: 'g3' + stamp, email: `unverified_${stamp}@example.com`, verified: false });
const pH3 = await profile(H3.token);
check('unverified Google email is NOT used → account without email, card on', H3.isNew && !pH3.user.email && pH3.emailPrompt === true);
const H4 = await app('google', 'link', { as: 'g2' + stamp, token: mailOwner.token });
check('email user connects that Google account → linked', H4.loc === '/account' + q('linked', 'google'), H4.loc);
const H5 = await app('google', 'login', { as: 'g2' + stamp, email: `owner_${stamp}@example.com`, verified: true });
check('"Continue with Google" now opens the email account', !H5.isNew && (await profile(H5.token)).user.id === mailOwner.id);
const H6 = await app('google', 'login', { deny: true });
check('cancel at Google → /login?auth=cancel&via=google', H6.loc === '/login' + q('cancel', 'google'), H6.loc);

console.log('— I. several apps on one account (TikTok + Facebook, no email) —');
const I1 = await tiktok('login', { as: 'ttI' + stamp });
const iC = ck(I1.setCookie);
const I2 = await app('facebook', 'link', { as: 'fbI' + stamp, token: I1.token, cookie: iC });
let pI = await profile(I1.token);
check('TikTok-only account connects Facebook (Facebook gives no email here)', I2.loc === '/account' + q('linked', 'facebook') && JSON.stringify(pI.methods.providers.map((p) => p.id).sort()) === '["facebook","tiktok"]', I2.loc + ' ' + JSON.stringify(pI.methods));
const I3 = await app('facebook', 'login', { as: 'fbI' + stamp });
check('"Continue with Facebook" → the same account', !I3.isNew && (await profile(I3.token)).user.id === pI.user.id);
const I4 = await j('/api/oauth/tiktok/disconnect', { method: 'POST', token: I1.token });
check('disconnect TikTok allowed: Facebook still signs in', I4.status === 200 && (await profile(I1.token)).methods.providers.map((p) => p.id).join() === 'facebook');
const I5 = await j('/api/oauth/facebook/disconnect', { method: 'POST', token: I1.token });
check('disconnect the LAST app without an email → refused', I5.status === 400 && I5.data.code === 'NEED_EMAIL');
const I6 = await app('facebook', 'link', { as: 'fbOther' + stamp, token: I1.token, cookie: iC });
check('a second Facebook account on the same Wikigai → refused', I6.loc === '/account' + q('other', 'facebook'), I6.loc);
const fbEmail = `fb_${stamp}@example.com`;
const I7 = await app('facebook', 'login', { as: 'fbJ' + stamp, email: fbEmail });
check('new Facebook user with an email → account with that email', I7.isNew && (await profile(I7.token)).user.email === fbEmail);
const I8 = await app('facebook', 'delete', { as: 'fbI' + stamp, token: I1.token, cookie: iC });
check('delete an app-only account by confirming with Facebook', I8.loc === '/auth/done#deleted=1' && (await j('/api/user/profile', { token: I1.token })).status === 404, I8.loc);

console.log('— J. apps that are off / unknown —');
const J1 = await j('/api/oauth/instagram/start?intent=login');
check('Instagram (keys not set) → hidden, start refused', J1.status === 404 && J1.data.code === 'PROVIDER_OFF');
const J2 = await j('/api/oauth/myspace/start?intent=login');
check('unknown app → BAD_PROVIDER', J2.status === 404 && J2.data.code === 'BAD_PROVIDER');
const J3 = await j('/api/oauth/google/start?intent=share', { token: E.token });
check('share intent only for TikTok', J3.status === 404);
const J4 = await fetch(BASE + '/auth/myspace/callback?code=x&state=y', { redirect: 'manual' });
check('callback of an unknown app → /login?auth=error', (J4.headers.get('location') || '').startsWith('/login?auth=error'));
const privOn = await (await fetch(`${BASE}/privacy`)).text();
check('privacy page names the apps that are on (Google and Facebook), not Instagram', /Signing in with Google and Facebook/.test(privOn) && !/Signing in with[^<]*Instagram/.test(privOn) && !/<!--\/?(if|ifnot)|\{\{/.test(privOn));

console.log(`\n${failed ? '❌ FAILURES' : '✅ ALL PASS'} — passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
