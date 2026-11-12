/* CPS shared frontend helpers: API client, session storage, captcha widget, PIN. */
(function () {
  'use strict';

  const API_BASE = window.__CPS_API__ || window.location.origin;
  const I = () => window.WK && window.WK.i18n;
  const T = (k, v) => (I() ? I().t(k, v) : k);
  /* Server errors carry a stable `code`; show the message in the user's language. */
  function localError(data, status) {
    const i = I();
    if (i && data && data.code && i.has('errors.' + data.code)) return i.t('errors.' + data.code);
    if (i && status === 429) return i.t('errors.tooMany');
    if (i && i.lang !== 'en') return i.t('errors.generic');
    return data.error || ('Request failed (' + status + ')');
  }

  const Store = {
    TOKEN_KEY: 'cps_token',
    get token() { return localStorage.getItem(this.TOKEN_KEY); },
    set token(v) { v ? localStorage.setItem(this.TOKEN_KEY, v) : localStorage.removeItem(this.TOKEN_KEY); },
    user() { try { return JSON.parse(localStorage.getItem('cps_user') || 'null'); } catch { return null; } },
    set user(u) { u ? localStorage.setItem('cps_user', JSON.stringify(u)) : localStorage.removeItem('cps_user'); },
    clear() { localStorage.removeItem(this.TOKEN_KEY); localStorage.removeItem('cps_user'); },
  };

  async function api(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && Store.token) headers.Authorization = 'Bearer ' + Store.token;
    if (I()) headers['X-WK-Lang'] = I().lang;
    let res;
    try {
      res = await fetch(API_BASE + path, {
        method, headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (netErr) {
      const err = new Error(I() ? T('errors.network') : 'Network error');
      err.status = 0; err.code = 'NETWORK';
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) {
      // session expired or account gone: back to sign-in (then straight back to this page)
      if (auth && Store.token && (data.code === 'NO_SESSION' || data.code === 'NO_USER') && path !== '/api/auth/session' && !/^\/(login|signup|verify|forgot|reset)\b/.test(location.pathname)) {
        Store.clear();
        window.location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search);
      }
      const err = new Error(localError(data, res.status));
      err.status = res.status;
      err.code = data.code;
      err.data = data;
      throw err;
    }
    return data;
  }

  /* ── Captcha widget ─────────────────────────────────────── */
  const Captcha = {
    id: null,
    selected: new Set(),
    required: 3,

    async mount(container) {
      const wrap = typeof container === 'string' ? document.getElementById(container) : container;
      if (!wrap) return;
      wrap.innerHTML = `
        <div class="captcha-box">
          <div class="captcha-head">
            <div>
              <div class="captcha-prompt" id="cpPrompt" data-i18n="captcha.prompt">${T('captcha.prompt')}</div>
              <div class="captcha-count" id="cpCount"></div>
            </div>
            <button type="button" class="captcha-refresh" id="cpRefresh" data-i18n="captcha.refresh">${T('captcha.refresh')}</button>
          </div>
          <div class="captcha-grid" id="cpGrid">
            <div class="skeleton" style="padding:20px"><span class="spinner"></span></div>
          </div>
        </div>`;
      wrap.querySelector('#cpRefresh').addEventListener('click', () => this.load());
      this.updateCount();
      if (I()) I().onChange(() => { I().apply(wrap); this.updateCount(); });
      await this.load();
    },

    async load() {
      const grid = document.getElementById('cpGrid');
      if (!grid) return;
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
      grid.innerHTML = '<div class="skeleton" style="grid-column:1/-1;padding:20px"><span class="spinner"></span></div>';
      try {
        const data = await api('/api/captcha/new', { auth: false });
        this.id = data.captcha_id;
        this.selected = new Set();
        // the prompt is always "pick the 3 drink brands": shown from the dictionary
        this.render(data.tiles);
        this.updateCount();
      } catch (e) {
        grid.innerHTML = `<div class="skeleton" style="grid-column:1/-1;color:var(--err)">${T('captcha.loadFail')} <a href="#" id="cpRetry">${T('common.retry')}</a></div>`;
        const r = document.getElementById('cpRetry');
        if (r) r.addEventListener('click', (ev) => { ev.preventDefault(); this.load(); });
      }
    },

    render(tiles) {
      const grid = document.getElementById('cpGrid');
      grid.innerHTML = '';
      tiles.forEach(t => {
        const el = document.createElement('div');
        el.className = 'tile';
        el.dataset.id = t.id;
        el.innerHTML = `<span class="emoji">${t.emoji}</span><span class="name">${t.name}</span>`;
        el.addEventListener('click', () => this.toggle(t.id, el));
        grid.appendChild(el);
      });
    },

    toggle(id, el) {
      if (this.selected.has(id)) { this.selected.delete(id); el.classList.remove('sel'); }
      else {
        if (this.selected.size >= this.required) return;
        this.selected.add(id); el.classList.add('sel');
      }
      this.updateCount();
    },

    updateCount() {
      const c = document.getElementById('cpCount');
      if (c) c.textContent = T('captcha.count', { n: this.selected.size, total: this.required });
    },

    answer() { return [...this.selected]; },
    isComplete() { return this.selected.size === this.required; },
    reset() { this.load(); },
  };

  /* ── PIN inputs ─────────────────────────────────────────── */
  function setupPinRow(container, onComplete) {
    const row = typeof container === 'string' ? document.getElementById(container) : container;
    if (!row) return { value: () => '' };
    row.innerHTML = '';
    const inputs = [];
    for (let i = 0; i < 6; i++) {
      const inp = document.createElement('input');
      inp.className = 'pin-input';
      inp.type = 'text';
      inp.inputMode = 'numeric';
      inp.maxLength = 1;
      inp.autocomplete = 'one-time-code';
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
        inp.classList.toggle('filled', !!inp.value);
        if (inp.value && i < 5) inputs[i + 1].focus();
        maybeDone();
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus();
        if (e.key === 'ArrowLeft' && i > 0) inputs[i - 1].focus();
        if (e.key === 'ArrowRight' && i < 5) inputs[i + 1].focus();
      });
      inp.addEventListener('paste', (e) => {
        e.preventDefault();
        const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
        digits.split('').forEach((d, k) => { if (inputs[k]) { inputs[k].value = d; inputs[k].classList.add('filled'); } });
        const next = Math.min(digits.length, 5);
        inputs[next].focus();
        maybeDone();
      });
      row.appendChild(inp);
      inputs.push(inp);
    }
    function value() { return inputs.map(i => i.value).join(''); }
    function maybeDone() { if (value().length === 6 && onComplete) onComplete(value()); }
    return { value, focus: () => inputs[0].focus(), clear: () => { inputs.forEach(i => { i.value = ''; i.classList.remove('filled'); }); inputs[0].focus(); } };
  }

  /* ── Small utils ────────────────────────────────────────── */
  function showAlert(el, msg, kind = 'err') {
    if (!el) return;
    el.textContent = msg;
    el.className = 'alert show alert-' + kind;
  }
  function hideAlert(el) { if (el) el.className = 'alert'; }

  function requireAuthOrRedirect() {
    if (!Store.token) { window.location.href = '/login'; return false; }
    return true;
  }

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    Store.clear();
    window.location.href = '/login';
  }

  /* ── Confirm pop-up (v20261101d) ─────────────────────────────
     CPS.confirm({ title, text, ok, cancel }) → Promise<boolean>. Used before removing favourites
     (plans, WikiVids) and before retaking survey stage 1 or 2. Links/buttons with
     data-wk-confirm="retake" (+ data-stage="1|2") ask first, then continue. Esc / backdrop = cancel. */
  function confirmBox(o) {
    return new Promise((resolve) => {
      if (!document.getElementById('wkConfirmCss')) {
        const st = document.createElement('style'); st.id = 'wkConfirmCss';
        st.textContent = `.wk-cf{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,3,15,.72);backdrop-filter:blur(3px)}
.wk-cf-box{width:100%;max-width:420px;background:#1a1530;color:#f1ecff;border:1px solid rgba(196,77,255,.35);border-radius:18px;padding:22px 22px 18px;box-shadow:0 20px 60px rgba(0,0,0,.5);font-family:Inter,system-ui,sans-serif}
.wk-cf-ico{font-size:1.8rem;line-height:1}
.wk-cf-box h2{font-size:1.12rem;margin:10px 0 6px;font-weight:800}
.wk-cf-box p{margin:0 0 18px;color:#c8c0dc;font-size:.92rem;line-height:1.5}
.wk-cf-acts{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.wk-cf-acts button{font:700 .88rem Inter,system-ui,sans-serif;border-radius:22px;padding:10px 18px;cursor:pointer;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#f1ecff}
.wk-cf-acts .wk-cf-ok{background:#ef4444;border-color:transparent;color:#fff}
.wk-cf-acts button:focus-visible{outline:2px solid #c44dff;outline-offset:2px}`;
        document.head.appendChild(st);
      }
      const prev = document.activeElement;
      const wrap = document.createElement('div');
      wrap.className = 'wk-cf'; wrap.setAttribute('role', 'alertdialog'); wrap.setAttribute('aria-modal', 'true');
      wrap.setAttribute('aria-labelledby', 'wkCfT'); wrap.setAttribute('aria-describedby', 'wkCfD');
      const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      wrap.innerHTML = `<div class="wk-cf-box"><div class="wk-cf-ico" aria-hidden="true">${o.icon || '⚠️'}</div><h2 id="wkCfT">${esc(o.title)}</h2><p id="wkCfD">${esc(o.text)}</p>
        <div class="wk-cf-acts"><button type="button" class="wk-cf-no">${esc(o.cancel || T('confirm.cancel'))}</button><button type="button" class="wk-cf-ok">${esc(o.ok || T('confirm.ok'))}</button></div></div>`;
      const done = (v) => { document.removeEventListener('keydown', onKey, true); wrap.remove(); if (prev && prev.focus) prev.focus(); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(false); } };
      wrap.addEventListener('click', (e) => { if (e.target === wrap) done(false); });
      wrap.querySelector('.wk-cf-no').addEventListener('click', () => done(false));
      wrap.querySelector('.wk-cf-ok').addEventListener('click', () => done(true));
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(wrap);
      wrap.querySelector('.wk-cf-no').focus(); // safe default: keep the content
    });
  }
  const confirmRetake = (n) => confirmBox({ icon: '↺', title: T('confirm.retakeTitle', { n }), text: T('confirm.retakeText', { n }), ok: T('confirm.retakeOk'), cancel: T('confirm.keep') });
  document.addEventListener('click', async (e) => {
    const el = e.target.closest && e.target.closest('a[data-wk-confirm="retake"]');
    if (!el || e.metaKey || e.ctrlKey) return;
    e.preventDefault(); e.stopPropagation();
    if (await confirmRetake(el.dataset.stage || '')) window.location.href = el.getAttribute('href');
  }, true);

  window.CPS = { confirm: confirmBox, confirmRetake, API_BASE, api, Store, Captcha, setupPinRow, showAlert, hideAlert, requireAuthOrRedirect, logout };
})();

/* ── v20261111b: legal footer on every page — Privacy · Terms · Delete my data · Support ──
   Self-contained (own CSS) because not every page loads wk.css. Links follow the page language
   (/fr/privacy…). A page can opt out with <body data-no-footer>. */
(function () {
  'use strict';
  const I = () => window.WK && window.WK.i18n;
  const T = (k, v) => (I() ? I().t(k, v) : k);
  const CSS = `.wk-legal-foot{position:relative;z-index:1;margin:48px auto 0;padding:22px 16px 72px;max-width:1100px;text-align:center;font:500 12.5px/1.6 Inter,system-ui,sans-serif;color:rgba(238,242,249,.55)}
  .wk-legal-foot nav{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 18px;margin-bottom:6px}
  .wk-legal-foot a{color:rgba(238,242,249,.72);text-decoration:none;padding:6px 2px}
  .wk-legal-foot a:hover,.wk-legal-foot a:focus-visible{color:#fff;text-decoration:underline;text-underline-offset:3px}
  .wk-legal-foot .wk-lf-copy{opacity:.8}
  .wk-legal-foot::before{content:"";display:block;height:1px;max-width:520px;margin:0 auto 18px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent)}`;
  function prefix() {
    const m = location.pathname.match(/^\/(fr|es)(\/|$)/);
    const lang = m ? m[1] : (I() && I().lang) || 'en';
    return lang === 'en' ? '' : '/' + lang;
  }
  function render() {
    if (!document.body || document.body.hasAttribute('data-no-footer')) return;
    if (!document.getElementById('wk-legal-foot-css')) {
      const st = document.createElement('style'); st.id = 'wk-legal-foot-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    let f = document.querySelector('.wk-legal-foot');
    if (!f) { f = document.createElement('footer'); f.className = 'wk-legal-foot'; document.body.appendChild(f); }
    const p = prefix();
    f.setAttribute('aria-label', T('legal.footLabel'));
    f.innerHTML = `<nav><a href="${p}/privacy">${T('legal.footPrivacy')}</a><a href="${p}/terms">${T('legal.footTerms')}</a><a href="${p}/delete-my-data">${T('legal.footDelete')}</a><a href="${p}/support">${T('legal.footSupport')}</a></nav>`
      + `<div class="wk-lf-copy">${T('legal.footCopy', { year: String(new Date().getFullYear()) })}</div>`;
  }
  function start() {
    // wk:langchange (not onChange): registering a listener would stop pages that rely on a reload after a language switch from reloading
    document.addEventListener('wk:langchange', render);
    if (I() && I().ready) I().ready.then(render); else render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
