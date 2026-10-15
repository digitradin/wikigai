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

  window.CPS = { API_BASE, api, Store, Captcha, setupPinRow, showAlert, hideAlert, requireAuthOrRedirect, logout };
})();
