// Full end-to-end smoke test for the CPS API (password auth).
// Requires EXPOSE_PINS=true for /api/captcha/_debug/solve and dev_pin echo.
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}
async function j(path, opts = {}) {
  const res = await fetch(BASE + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const email = `smoke_${Date.now()}@example.com`;
const PASSWORD = 'Sunshine42';

console.log('\n▶ CPS smoke test (password auth) —', BASE, '\nemail:', email, '\n');

console.log('— captcha —');
const sol = await j('/api/captcha/_debug/solve');
check('9 tiles, 3 drink answers', sol.data.tiles?.length === 9 && sol.data.answer?.length === 3);
const pub = await j('/api/captcha/new');
check('public captcha hides answer', pub.data.answer === undefined && pub.data.tiles?.length === 9);

console.log('— signup —');
const weak = await j('/api/auth/signup', { method: 'POST', body: {
  email, email2: email, password: 'short', password2: 'short',
  captcha_id: sol.data.captcha_id, captcha_answer: sol.data.answer,
}});
check('weak password rejected', weak.status === 400 && weak.data.code === 'WEAK_PASSWORD', JSON.stringify(weak.data));

const solA = await j('/api/captcha/_debug/solve');
const mismatch = await j('/api/auth/signup', { method: 'POST', body: {
  email, email2: 'other@example.com', password: PASSWORD, password2: PASSWORD,
  captcha_id: solA.data.captcha_id, captcha_answer: solA.data.answer,
}});
check('email mismatch rejected', mismatch.status === 400 && mismatch.data.code === 'EMAIL_MISMATCH');

const solB = await j('/api/captcha/_debug/solve');
const pwdMismatch = await j('/api/auth/signup', { method: 'POST', body: {
  email, email2: email, password: PASSWORD, password2: 'Different99',
  captcha_id: solB.data.captcha_id, captcha_answer: solB.data.answer,
}});
check('password mismatch rejected', pwdMismatch.status === 400 && pwdMismatch.data.code === 'PASSWORD_MISMATCH');

const solC = await j('/api/captcha/_debug/solve');
const signup = await j('/api/auth/signup', { method: 'POST', body: {
  email, email2: email, password: PASSWORD, password2: PASSWORD, name: 'Smoke Tester',
  captcha_id: solC.data.captcha_id, captcha_answer: solC.data.answer,
}});
check('signup succeeds', signup.status === 201 && !!signup.data.dev_pin, JSON.stringify(signup.data));
const pin = signup.data.dev_pin;

console.log('— verify —');
const badPin = await j('/api/auth/verify', { method: 'POST', body: { email, pin: '000000' } });
check('wrong pin rejected', badPin.status === 400);
const verify = await j('/api/auth/verify', { method: 'POST', body: { email, pin } });
check('verify succeeds + token', verify.status === 200 && typeof verify.data.token === 'string' && verify.data.token.includes('.'));
const token = verify.data.token;

console.log('— login with password —');
const wrongPw = await j('/api/auth/login', { method: 'POST', body: { email, password: 'WrongPass1' } });
check('wrong password → 401', wrongPw.status === 401 && wrongPw.data.code === 'BAD_CREDENTIALS');
const login = await j('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
check('correct password → token', login.status === 200 && typeof login.data.token === 'string');
const unknownPw = await j('/api/auth/login', { method: 'POST', body: { email: 'nobody_' + Date.now() + '@example.com', password: PASSWORD } });
check('unknown email → uniform 401', unknownPw.status === 401 && unknownPw.data.code === 'BAD_CREDENTIALS');

console.log('— session + results —');
const me = await j('/api/auth/me', { headers: { Authorization: 'Bearer ' + login.data.token } });
check('me returns user', me.status === 200 && me.data.user?.email === email);
const tampered = await j('/api/auth/me', { headers: { Authorization: 'Bearer ' + login.data.token + 'x' } });
check('tampered token → 401', tampered.status === 401);
const save1 = await j('/api/user/results', { method: 'POST', headers: { Authorization: 'Bearer ' + token },
  body: { stage: 1, results: { score: 72 } } });
check('save stage 1', save1.status === 200 && save1.data.nextStage === 2, JSON.stringify(save1.data));
const allres = await j('/api/user/results', { headers: { Authorization: 'Bearer ' + token } });
check('results persisted', allres.data.results?.stage_1?.score === 72);

console.log('— forgot / reset password —');
const forgot = await j('/api/auth/forgot', { method: 'POST', body: { email } });
check('forgot returns reset code (preprod)', forgot.status === 200 && !!forgot.data.dev_pin);
const forgotUnknown = await j('/api/auth/forgot', { method: 'POST', body: { email: 'nobody_' + Date.now() + '@example.com' } });
check('forgot unknown → ok (no enumeration)', forgotUnknown.status === 200 && !forgotUnknown.data.dev_pin);

const resetPin = forgot.data.dev_pin;
const NEWPW = 'Newpass77';
const resetWeak = await j('/api/auth/reset', { method: 'POST', body: { email, pin: resetPin, password: 'x', password2: 'x' } });
check('reset weak password rejected', resetWeak.status === 400 && resetWeak.data.code === 'WEAK_PASSWORD');
const reset = await j('/api/auth/reset', { method: 'POST', body: { email, pin: resetPin, password: NEWPW, password2: NEWPW } });
check('reset succeeds', reset.status === 200, JSON.stringify(reset.data));
const loginOld = await j('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
check('old password no longer works', loginOld.status === 401);
const loginNew = await j('/api/auth/login', { method: 'POST', body: { email, password: NEWPW } });
check('new password works', loginNew.status === 200 && typeof loginNew.data.token === 'string');

console.log(`\n${failed === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — passed=${passed} failed=${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
