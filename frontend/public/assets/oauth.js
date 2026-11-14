/* Wikigai — sign in with apps (v20261112c; was assets/tiktok.js in v20261112b). Loaded on /login, /signup, /account,
   /share/tiktok. Providers come from /api/config → auth.providers (only the ones switched on for this stack — none by default):
   TikTok today; Google, Facebook, Instagram ready but hidden.
   - "Continue with <app>" buttons on the sign-in and sign-up (onboarding) cards
   - Account › Sign-in methods (first card of the page, v20261112d): Email ✓ / Add email · one row per app: Connect / Disconnect (rows also shown for apps
     already connected, even if the app was switched off later, so people can still disconnect)
   - accounts without email: "Add email" wording; accounts with neither email nor password: Delete → "Confirm with <app>"
   - messages after the round trip (?auth=cancel|linked|merged|taken|email_exists|…&via=<app>)
   Text: oauth.* in locales/<lang>/ui.js. */
(function () {
  'use strict';
  const I = () => window.WK && window.WK.i18n;
  const T = (k, v) => (I() ? I().t(k, v) : k);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CPS = () => window.CPS || {};
  let cfgP = null;
  const cfg = () => (cfgP = cfgP || fetch('/api/config').then((r) => r.json()).catch(() => ({})));

  /* brand marks (inline SVG, no external requests) + button look per app; order = order of the buttons */
  const APPS = {
    tiktok: { label: 'TikTok', cls: 'oa-tiktok',
      icon: '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M34.1 6c.6 4.6 3.2 7.6 7.9 7.9v5.3c-2.7.3-5.1-.6-7.9-2.3v10.4c0 13.2-14.4 17.3-20.2 7.9-3.7-6.1-1.4-16.8 10.6-17.2v5.6c-.9.1-1.9.4-2.7.7-2.5.8-3.9 2.4-3.5 5.2.8 5.4 10.7 7 9.9-3.6V6.1h5.9z"/></svg>' },
    google: { label: 'Google', cls: 'oa-google',
      icon: '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.4 0 24 0 14.6 0 6.6 5.4 2.7 13.3l8 6.2C12.6 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.7 28.5c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.8-4.5l-8-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l8-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.4-4.1-13.3-9.8l-8 6.2C6.6 42.6 14.6 48 24 48z"/></svg>' },
    facebook: { label: 'Facebook', cls: 'oa-facebook',
      icon: '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M48 24C48 10.7 37.3 0 24 0S0 10.7 0 24c0 12 8.8 21.9 20.2 23.7V30.9h-6.1V24h6.1v-5.3c0-6 3.6-9.3 9.1-9.3 2.6 0 5.4.5 5.4.5v5.9h-3c-3 0-3.9 1.8-3.9 3.7V24h6.6l-1.1 6.9h-5.5v16.8C39.2 45.9 48 36 48 24z"/></svg>' },
    instagram: { label: 'Instagram', cls: 'oa-instagram',
      icon: '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M24 4.3c6.4 0 7.2 0 9.7.1 6.5.3 9.6 3.4 9.9 9.9.1 2.5.1 3.3.1 9.7s0 7.2-.1 9.7c-.3 6.5-3.4 9.6-9.9 9.9-2.5.1-3.3.1-9.7.1s-7.2 0-9.7-.1c-6.6-.3-9.6-3.4-9.9-9.9-.1-2.5-.1-3.3-.1-9.7s0-7.2.1-9.7c.3-6.6 3.4-9.6 9.9-9.9 2.5-.1 3.3-.1 9.7-.1zM24 0c-6.5 0-7.3 0-9.9.1C5.4.5.5 5.3.1 14.1 0 16.7 0 17.5 0 24s0 7.3.1 9.9c.4 8.7 5.2 13.6 14 14 2.6.1 3.4.1 9.9.1s7.3 0 9.9-.1c8.7-.4 13.6-5.2 14-14 .1-2.6.1-3.4.1-9.9s0-7.3-.1-9.9C47.5 5.4 42.7.5 33.9.1 31.3 0 30.5 0 24 0zm0 11.7a12.3 12.3 0 100 24.6 12.3 12.3 0 000-24.6zM24 32a8 8 0 110-16 8 8 0 010 16zm12.8-23.7a2.9 2.9 0 100 5.8 2.9 2.9 0 000-5.8z"/></svg>' },
  };
  const ORDER = ['tiktok', 'google', 'instagram', 'facebook'];
  const appOf = (id) => APPS[id] || { label: id, cls: '', icon: '' };

  const CSS = `.oa-btns{display:flex;flex-direction:column;gap:10px}
  .oa-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;font:600 15px/1 Inter,system-ui,sans-serif;border-radius:12px;padding:13px 16px;cursor:pointer;text-decoration:none;border:1px solid transparent;transition:transform .15s,filter .15s}
  .oa-btn:hover{transform:translateY(-1px);filter:brightness(1.06)}.oa-btn:disabled{opacity:.6;cursor:wait;transform:none}
  .oa-tiktok{color:#fff;background:#000;border-color:rgba(255,255,255,.22)}.oa-tiktok svg{filter:drop-shadow(-1.5px -1px 0 #25f4ee) drop-shadow(1.5px 1px 0 #fe2c55)}
  .oa-google{color:#1f1f1f;background:#fff;border-color:#747775}
  .oa-facebook{color:#fff;background:#1877F2}
  .oa-instagram{color:#fff;background:linear-gradient(45deg,#f09433,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888)}
  .oa-or{display:flex;align-items:center;gap:12px;margin:16px 0;color:rgba(255,255,255,.45);font-size:12px;text-transform:uppercase;letter-spacing:.08em}
  .oa-or::before,.oa-or::after{content:"";flex:1;height:1px;background:rgba(255,255,255,.12)}
  .oa-note{font-size:12px;color:rgba(255,255,255,.55);text-align:center;margin-top:8px}
  .oa-msg{border-radius:12px;padding:12px 14px;font-size:14px;margin-bottom:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}
  .oa-msg.ok{background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.3)}.oa-msg.err{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.3)}
  .oa-method{display:flex;align-items:center;gap:12px}.oa-method small{display:block;color:rgba(255,255,255,.6);font-size:.8rem;margin-top:2px}
  .oa-method img{width:28px;height:28px;border-radius:50%;object-fit:cover}
  .oa-ico{width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex:none}
  .oa-ico.oa-mail{background:rgba(255,255,255,.08)}.oa-ico[hidden]{display:none}`;
  function css() { if (!$('oa-css')) { const s = document.createElement('style'); s.id = 'oa-css'; s.textContent = CSS; document.head.appendChild(s); } }

  async function start(provider, intent, next, btn) {
    try {
      if (btn) btn.disabled = true;
      const lang = (I() && I().lang) || 'en';
      const q = new URLSearchParams({ intent, lang, ...(next ? { next } : {}) });
      const r = await CPS().api(`/api/oauth/${encodeURIComponent(provider)}/start?` + q.toString(), { auth: intent !== 'login' });
      window.WK?.track?.('auth_start', { provider, intent });
      location.href = r.url;
    } catch (err) {
      if (btn) btn.disabled = false;
      showMsg(esc(err.message || T('oauth.errGeneric', { provider: appOf(provider).label })), 'err');
    }
  }

  function showMsg(html, kind, anchor) {
    const host = anchor || document.querySelector('.auth-card .card') || document.querySelector('main .results-wrap') || document.body;
    let el = $('oaMsg');
    if (!el) { el = document.createElement('div'); el.id = 'oaMsg'; el.setAttribute('role', 'status'); host.prepend(el); }
    el.className = 'oa-msg ' + (kind || ''); el.innerHTML = html;
  }

  /* result of the round trip (?auth=…&via=…; v20261112b links used ?tiktok=…) */
  function roundTripMessage() {
    const q = new URLSearchParams(location.search);
    const code = q.get('auth') || q.get('tiktok');
    if (!code) return;
    const provider = appOf(q.get('via') || 'tiktok').label;
    const map = { cancel: ['oauth.msgCancel', ''], expired: ['oauth.msgExpired', 'err'], error: ['oauth.errGeneric', 'err'], session: ['oauth.msgSession', 'err'],
      disabled: ['oauth.msgDisabled', 'err'], linked: ['oauth.msgLinked', 'ok'], merged: ['oauth.msgMerged', 'ok'], taken: ['oauth.msgTaken', 'err'],
      other: ['oauth.msgOther', 'err'], mismatch: ['oauth.msgMismatch', 'err'], email_exists: ['oauth.msgEmailExists', 'err'], scope: ['oauth.msgScope', 'err'] };
    const m = map[code];
    if (m) { showMsg(esc(T(m[0], { provider })), m[1]); window.WK?.track?.('auth_result', { code, provider: q.get('via') || 'tiktok' }); }
    try { history.replaceState(null, '', location.pathname + location.hash); } catch { /* ignore */ }
  }

  const enabled = async () => { const c = await cfg(); const list = (c.auth && c.auth.providers) || []; return ORDER.filter((id) => list.some((p) => p.id === id)); };

  /* /login and /signup (onboarding) */
  async function authPages() {
    const card = document.querySelector('.auth-card .card');
    if (!card) return;
    const ids = await enabled();
    if (!ids.length) return;
    const isSignup = /^\/(fr\/|es\/)?signup/.test(location.pathname);
    const next = (() => { const n = new URLSearchParams(location.search).get('next') || ''; return /^\/(?!\/)[\w\-/.?=&%]*$/.test(n) && !/^\/login/.test(n) ? n : ''; })();
    const box = document.createElement('div');
    box.innerHTML = `<div class="oa-btns">${ids.map((id) => `<button type="button" class="oa-btn ${appOf(id).cls}" data-oa="${id}">${appOf(id).icon}<span>${esc(T('oauth.continue', { provider: appOf(id).label }))}</span></button>`).join('')}</div>
      ${isSignup ? `<p class="oa-note">${esc(T('oauth.signupNote'))}</p>` : ''}<div class="oa-or">${esc(T('oauth.or'))}</div>`;
    const alertEl = card.querySelector('.alert');
    card.insertBefore(box, alertEl ? alertEl.nextSibling : card.firstChild);
    box.querySelectorAll('[data-oa]').forEach((b) => b.addEventListener('click', (e) => {
      window.WK?.track?.('auth_method_click', { method: b.dataset.oa, page: isSignup ? 'signup' : 'login' });
      start(b.dataset.oa, 'login', next, e.currentTarget);
    }));
  }

  /* /account */
  async function accountPage() {
    if (!$('acDeleteOpen')) return;
    const ids = await enabled();
    let prof;
    try { prof = await CPS().api('/api/user/profile'); } catch { return; }
    const m = prof.methods || {};
    const linked = m.providers || (m.tiktok ? [{ id: 'tiktok', ...m.tiktok }] : []);
    const rows = ORDER.filter((id) => ids.includes(id) || linked.some((l) => l.id === id));
    // 1) Sign-in methods card — v20261112d: the FIRST card of the Account page (was just before the delete card);
    //    v20261114: ALWAYS shown — the Email row (address + Verified / Not verified + Verify) moved here from "Your details";
    //    app rows only when an app is on, or one is already connected
    {
      const sec = document.createElement('section');
      sec.className = 'ik-card'; sec.id = 'oaMethods';
      const appRow = (id) => {
        const a = appOf(id), l = linked.find((x) => x.id === id);
        const badge = `<span class="oa-ico ${a.cls}"${l && l.avatar ? ' hidden' : ''}>${a.icon}</span>`; // app icon (also when the avatar can't load)
        const ico = l && l.avatar ? `<img src="${esc(l.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.nextElementSibling.hidden=false;this.remove()">${badge}` : badge;
        return `<div class="ac-row"><div class="oa-method">${ico}<div><strong>${esc(a.label)}</strong><small>${esc(l ? T('oauth.connectedAs', { name: l.name || a.label }) : T('oauth.connectHelp'))}</small></div></div>
          ${l ? `<button class="ac-btn" type="button" data-oa-off="${id}">${esc(T('oauth.disconnect'))}</button>`
              : `<button class="ac-btn" type="button" data-oa-on="${id}">${esc(T('oauth.connect'))}</button>`}</div>`;
      };
      sec.innerHTML = `<h2>${esc(T('oauth.methodsTitle'))}</h2><p class="ik-sub" style="margin-bottom:6px">${esc(T('oauth.methodsHelp'))}</p>
        <div class="ac-row"><div class="oa-method"><span class="oa-ico oa-mail">✉️</span><div><strong>${esc(T('oauth.methodEmail'))}</strong><small>${esc(m.email ? (prof.user.email || '') : T('oauth.noEmailYet'))}</small></div></div>
          ${!m.email ? `<button class="ac-btn" type="button" id="oaAddEmail">${esc(T('oauth.addEmail'))}</button>`
            : prof.user.verified ? `<span class="ac-badge">${esc(T('account.verified'))}</span>`
            : `<span class="oa-verify"><span class="ac-badge no">${esc(T('account.notVerified'))}</span><button class="ac-btn primary" type="button" id="oaVerify">${esc(T('account.verifyNow'))}</button></span>`}</div>
        ${rows.map(appRow).join('')}<div class="ac-msg" id="oaMethodsMsg" role="status"></div>`;
      const first = document.querySelector('main section.ik-card') || document.querySelector('.ac-danger');
      first.parentNode.insertBefore(sec, first);
      sec.querySelectorAll('[data-oa-on]').forEach((b) => b.addEventListener('click', (e) => start(b.dataset.oaOn, 'link', '/account', e.currentTarget)));
      $('oaAddEmail')?.addEventListener('click', () => { $('acEmOpen')?.click(); $('acEmNew')?.scrollIntoView({ block: 'center' }); });
      // v20261114: verify the email from here — a new code is sent, then the usual /verify page
      $('oaVerify')?.addEventListener('click', async (e) => {
        const b = e.currentTarget, msg = $('oaMethodsMsg'), email = prof.user.email || '';
        b.disabled = true; msg.className = 'ac-msg'; msg.textContent = '';
        try {
          const r = await CPS().api('/api/auth/resend', { method: 'POST', auth: false, body: { email } });
          sessionStorage.setItem('cps_pending_email', email);
          if (r && r.dev_pin) sessionStorage.setItem('cps_dev_pin', r.dev_pin);
          location.href = '/verify';
        } catch (err) { msg.className = 'ac-msg err'; msg.textContent = err.message; b.disabled = false; }
      });
      sec.querySelectorAll('[data-oa-off]').forEach((b) => b.addEventListener('click', async () => {
        const id = b.dataset.oaOff, label = appOf(id).label, msg = $('oaMethodsMsg');
        msg.className = 'ac-msg'; msg.textContent = '';
        if (!m.email && linked.length < 2) { msg.className = 'ac-msg err'; msg.textContent = T('oauth.needEmail'); return; }
        if (window.CPS.confirm && !(await window.CPS.confirm({ icon: '🔌', title: T('oauth.disconnectTitle', { provider: label }), text: T('oauth.disconnectText'), ok: T('oauth.disconnect'), cancel: T('account.deleteCancel') }))) return;
        b.disabled = true;
        try { await CPS().api(`/api/oauth/${id}/disconnect`, { method: 'POST' }); window.WK?.track?.('auth_unlinked', { provider: id }); location.href = '/account'; }
        catch (err) { msg.className = 'ac-msg err'; msg.textContent = err.message; b.disabled = false; }
      }));
    }
    // 2) no email yet: "Add email" wording; no password field when the account has none
    if (!m.email) {
      const k = document.querySelector('[data-i18n="account.changeEmail"]'); if (k) { k.textContent = T('oauth.addEmail'); k.removeAttribute('data-i18n'); }
      const h = document.querySelector('[data-i18n="account.changeEmailHelp"]'); if (h) { h.textContent = T('oauth.addEmailHelp'); h.removeAttribute('data-i18n'); }
      const b = $('acEmOpen'); if (b) { b.textContent = T('oauth.addEmail') + '…'; b.removeAttribute('data-i18n'); }
    }
    if (!m.password) { const p = $('acEmPass'); if (p) { p.hidden = true; const l = document.querySelector('label[for="acEmPass"]'); if (l) l.hidden = true; } }
    // 3) neither email nor password: delete = confirm with the (first) connected app
    if (!m.email && !m.password && linked.length) {
      const via = linked[0].id, label = appOf(via).label, open = $('acDeleteOpen');
      const help = open.closest('.ac-row')?.querySelector('small');
      if (help) help.textContent = T('oauth.deleteHelp', { provider: label });
      open.textContent = T('oauth.deleteBtn', { provider: label });
      open.addEventListener('click', async (e) => {
        e.stopImmediatePropagation(); e.preventDefault();
        if (window.CPS.confirm && !(await window.CPS.confirm({ icon: '⚠️', title: T('account.deleteTitle'), text: T('oauth.deleteConfirm', { provider: label }), ok: T('oauth.deleteBtn', { provider: label }), cancel: T('account.deleteCancel') }))) return;
        start(via, 'delete', null, open);
      }, true);
      const np = document.querySelector('[data-i18n-html="legal.deleteNoPassword"]'); if (np) np.hidden = true;
    }
  }

  function boot() { css(); roundTripMessage(); authPages(); accountPage(); }
  const go = () => (I() && I().ready ? I().ready.then(boot) : boot());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  window.WikiAuth = { start, cfg, APPS };
  window.WikiTikTok = { start: (intent, next, btn) => start('tiktok', intent, next, btn), cfg }; // share page (v20261112b API)
})();
