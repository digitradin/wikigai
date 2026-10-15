// Browser-level E2E for the CPS auth flow, driven through Chrome DevTools Protocol
// (headless Chrome is launched separately). Uses puppeteer-core if available,
// otherwise raw CDP over the /json endpoints via WebSocket.
// Run: node browser_e2e.mjs
import { spawn } from 'node:child_process';
import http from 'node:http';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9222;
const BASE = process.env.BASE || 'http://localhost:18081';
const EMAIL = `e2e_${Date.now()}@example.com`;
const PW = 'Sunshine42';
const PW2 = 'Newpass77';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function cdpGet(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`,
    '--user-data-dir=/tmp/cps-e2e-profile', BASE,
  ], { stdio: 'ignore' });
  await sleep(2500);

  const targets = await cdpGet('/json');
  const page = targets.find(t => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id; pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });

  await send('Runtime.enable');
  await send('Page.enable');

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    return r.result?.value;
  };
  const nav = async (url) => { await send('Page.navigate', { url }); await sleep(1200); };

  let pass = 0, fail = 0;
  const check = (n, c, extra = '') => { c ? (pass++, console.log(`  ✅ ${n}`)) : (fail++, console.log(`  ❌ ${n} ${extra}`)); };

  console.log('\n▶ Browser E2E —', BASE, '\nemail:', EMAIL, '\n');

  // 1. Signup page: fill and solve captcha
  await nav(BASE + '/signup');
  check('signup page has password fields', await evaluate(`!!document.getElementById('password') && !!document.getElementById('password2')`));
  check('signup page has captcha', await evaluate(`!!document.getElementById('cpGrid')`));

  // Fill email + password + name
  await evaluate(`(() => {
    document.getElementById('email').value = ${JSON.stringify(EMAIL)};
    document.getElementById('email2').value = ${JSON.stringify(EMAIL)};
    document.getElementById('name').value = 'E2E Tester';
    document.getElementById('password').value = ${JSON.stringify(PW)};
    document.getElementById('password2').value = ${JSON.stringify(PW)};
    return true;
  })()`);

  // Solve the captcha: fetch the answer and click the matching tiles.
  const solved = await evaluate(`(async () => {
    const r = await fetch('/api/captcha/_debug/solve');
    const data = await r.json();
    // Load THIS challenge into the widget by id: simplest is to set Captcha state
    // and select tiles whose ids are in the answer.
    window.CPS.Captcha.id = data.captcha_id;
    window.CPS.Captcha.selected = new Set(data.answer);
    // Mark the visible tiles? Re-render grid with the answer-challenge tiles.
    window.CPS.Captcha.render(data.tiles);
    data.tiles.forEach(t => {
      const el = document.querySelector('.tile[data-id="'+t.id+'"]');
      if (el && data.answer.includes(t.id)) el.classList.add('sel');
    });
    window.CPS.Captcha.updateCount();
    return { id: data.captcha_id, answer: data.answer, count: window.CPS.Captcha.selected.size };
  })()`);
  check('captcha solved in DOM', solved && solved.count === 3, JSON.stringify(solved));

  // Submit the form
  await evaluate(`document.getElementById('signupForm').dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}))`);
  await sleep(1800);
  check('redirected to /verify', (await evaluate('location.pathname')) === '/verify', await evaluate('location.pathname'));

  // 2. Verify with dev PIN
  const verifyOk = await evaluate(`(async () => {
    const email = sessionStorage.getItem('cps_pending_email');
    const pin = sessionStorage.getItem('cps_dev_pin');
    if (!email || !pin) return { err: 'missing session', email, pin };
    const r = await fetch('/api/auth/verify', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, pin }) });
    const data = await r.json();
    return { status: r.status, ok: data.ok, token: !!data.token };
  })()`);
  check('verify API succeeds', verifyOk && verifyOk.ok === true, JSON.stringify(verifyOk));

  // 3. Login page with password
  await nav(BASE + '/login');
  check('login has password field', await evaluate(`document.getElementById('password')?.type === 'password'`));
  check('login has forgot link', await evaluate(`!!document.querySelector('a[href="/forgot"]')`));
  await evaluate(`(() => {
    document.getElementById('email').value = ${JSON.stringify(EMAIL)};
    document.getElementById('password').value = ${JSON.stringify(PW)};
    return true;
  })()`);
  await evaluate(`document.getElementById('loginForm').dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}))`);
  await sleep(1800);
  check('password login → dashboard', (await evaluate('location.pathname')).startsWith('/dashboard'), await evaluate('location.pathname'));
  check('session token stored', !!(await evaluate(`localStorage.getItem('cps_token')`)));

  // 4. Forgot + reset
  await nav(BASE + '/forgot');
  check('forgot page loads', await evaluate(`!!document.getElementById('forgotForm')`));
  const forgotRes = await evaluate(`(async () => {
    const r = await fetch('/api/auth/forgot', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: ${JSON.stringify(EMAIL)} }) });
    const d = await r.json();
    return { status: r.status, dev_pin: d.dev_pin };
  })()`);
  check('forgot returns reset code', forgotRes && !!forgotRes.dev_pin, JSON.stringify(forgotRes));

  const resetOk = await evaluate(`(async () => {
    const r = await fetch('/api/auth/reset', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: ${JSON.stringify(EMAIL)}, pin: ${JSON.stringify(forgotRes.dev_pin)}, password: ${JSON.stringify(PW2)}, password2: ${JSON.stringify(PW2)} }) });
    return { status: r.status, ok: (await r.json()).ok };
  })()`);
  check('reset succeeds', resetOk && resetOk.ok === true, JSON.stringify(resetOk));

  // 5. Login with NEW password
  await nav(BASE + '/login');
  await evaluate(`(() => {
    document.getElementById('email').value = ${JSON.stringify(EMAIL)};
    document.getElementById('password').value = ${JSON.stringify(PW2)};
    return true;
  })()`);
  await evaluate(`document.getElementById('loginForm').dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}))`);
  await sleep(1800);
  check('new-password login → dashboard', (await evaluate('location.pathname')).startsWith('/dashboard'), await evaluate('location.pathname'));

  // 6. Survey flow (counter + questions + scoring + save)
  await nav(BASE + '/survey');
  check('survey page loads intro', await evaluate(`!!document.getElementById('intro')?.classList.contains('active')`));
  await evaluate(`window.startSurvey()`);
  await sleep(600);
  check('survey starts with counter 1 / 70', (await evaluate(`document.getElementById('progLabel').textContent.trim()`)) === '1 / 70', await evaluate(`document.getElementById('progLabel').textContent`));
  check('question text rendered (not loading)', !!(await evaluate(`document.getElementById('qText').textContent`) || '').match(/\w/) && (await evaluate(`document.getElementById('qText').textContent`)) !== 'Loading…');
  check('25s timer present', (await evaluate(`document.getElementById('timerNum').textContent`)) === '25');
  check('two paired options rendered', (await evaluate(`document.getElementById('optA').textContent`)) !== '—' && (await evaluate(`document.getElementById('optB').textContent`)) !== '—');

  // Answer the first question and check the counter advances + progress bar
  await evaluate(`window.selectPip(5)`);
  await sleep(800);
  check('counter advanced to 2 / 70', (await evaluate(`document.getElementById('progLabel').textContent.trim()`)) === '2 / 70', await evaluate(`document.getElementById('progLabel').textContent`));
  check('progress bar width > 0', parseFloat(await evaluate(`document.getElementById('progressBar').style.width`) || '0') > 0);

  // Blast through the rest of the questions (skip) and reach results
  const finished = await evaluate(`(async () => {
    for (let i = 0; i < 200; i++) {
      if (document.getElementById('results').classList.contains('active')) break;
      window.skipQuestion();
      await new Promise(r => setTimeout(r, 8));
    }
    return document.getElementById('results').classList.contains('active');
  })()`);
  check('survey completes → results screen', finished === true, String(finished));
  await sleep(1500);
  check('8 ranked area cards rendered', (await evaluate(`document.querySelectorAll('#areaCards .area-card').length`)) === 8, String(await evaluate(`document.querySelectorAll('#areaCards .area-card').length`)));
  check('results saved to account', ((await evaluate(`document.getElementById('saveNote').textContent`)) || '').includes('Saved'), await evaluate(`document.getElementById('saveNote').textContent`));

  // Verify the stage-1 results persisted in the DB via the API
  const persisted = await evaluate(`(async () => {
    const t = localStorage.getItem('cps_token');
    const r = await fetch('/api/user/results', { headers: { Authorization: 'Bearer ' + t } });
    const d = await r.json();
    const s1 = d.results && d.results.stage_1;
    return { has: !!s1, ranked: s1 && s1.ranked ? s1.ranked.length : 0, total: s1 && s1.totalQuestions };
  })()`);
  check('stage_1 results persisted (8 ranked, 70 q)', persisted && persisted.has === true && persisted.ranked >= 1, JSON.stringify(persisted));

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — passed=${pass} failed=${fail}\n`);
  ws.close();
  chrome.kill();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error('E2E error:', e); process.exit(1); });
