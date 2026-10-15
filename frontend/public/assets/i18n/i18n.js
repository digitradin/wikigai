/* =====================================================================
   Wikigai i18n runtime                                   window.WK.i18n
   ---------------------------------------------------------------------
   Two kinds of text, two lookups:

   1. UI text  → keyed dictionaries      t('survey.begin', { n: 1 })
      locales/<code>/ui.js   — every label, button, message, page title.
      English (locales/en/ui.js) is the source of truth and the fallback.

   2. Content  → gettext-style catalogs  tc('Software Engineer')
      locales/<code>/content/<domain>.js — survey questions, domains,
      subfields, professions, task lines, data sources. The msgid is the
      English source string, so saved results (which store English names)
      display in any language. English needs no content files.

   HTML hooks (applied on load and on every language change):
      data-i18n="key"                    → textContent
      data-i18n-html="key"               → innerHTML (trusted dictionary text)
      data-i18n-attr="placeholder:key; aria-label:key"
      data-i18n-vars='{"n":3}'           → interpolation values
      data-wk-lang                       → language switcher mount point

   Adding a language: see assets/i18n/README.md (registry below + files).
   ===================================================================== */
(function () {
  'use strict';

  /* ── Locale registry — add a line here to ship a new language ── */
  const LOCALES = [
    { code: 'en', label: 'EN', name: 'English',  htmlLang: 'en', dir: 'ltr', intl: 'en-GB' },
    { code: 'fr', label: 'FR', name: 'Français', htmlLang: 'fr', dir: 'ltr', intl: 'fr-FR' },
    { code: 'es', label: 'ES', name: 'Español',  htmlLang: 'es', dir: 'ltr', intl: 'es-ES' },
  ];
  const DEFAULT = 'en';
  const STORAGE_KEY = 'wk_lang';
  const CONTENT_DOMAINS = ['taxonomy', 'careers', 'tasks', 'sources', 'stage1', 'stage2'];

  /* ── where the locale files live (works on the site and in previews) ── */
  const me = document.currentScript;
  const BASE = (me && me.src ? me.src.replace(/[^/]*$/, '') : '/assets/i18n/');
  const wantContent = ((me && me.dataset.content) || '').split(',').map((s) => s.trim()).filter(Boolean)
    .flatMap((s) => (s === 'all' ? CONTENT_DOMAINS : [s]));

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  const known = (c) => LOCALES.some((l) => l.code === c);
  const norm = (c) => String(c || '').toLowerCase().slice(0, 2);

  function detect() {
    let q = null;
    try { q = new URLSearchParams(window.__WK_Q__ || location.search).get('lang'); } catch { /* ignore */ }
    const legacy = ls.get('ikigai_lang'); // older pages stored EN/FR/ES here
    let profile = null;
    try { profile = (JSON.parse(ls.get('cps_user') || 'null') || {}).locale; } catch { /* ignore */ }
    const nav = (navigator.languages || [navigator.language || '']).map(norm);
    for (const c of [norm(q), norm(ls.get(STORAGE_KEY)), norm(legacy), norm(profile), ...nav]) if (known(c)) return c;
    return DEFAULT;
  }

  /* ── stores ── */
  const UI = {};       // UI[code] = nested dictionary
  const CONTENT = {};  // CONTENT[code] = { msgid: translation }
  const loaded = new Set();
  const listeners = [];
  let lang = detect();

  function register(code, ns, data) {
    if (ns === 'ui') UI[code] = deepMerge(UI[code] || {}, data);
    else CONTENT[code] = Object.assign(CONTENT[code] || {}, data);
  }
  function deepMerge(a, b) {
    Object.keys(b || {}).forEach((k) => {
      const v = b[k];
      a[k] = v && typeof v === 'object' && !Array.isArray(v) && !isPlural(v) ? deepMerge(a[k] && typeof a[k] === 'object' ? a[k] : {}, v) : v;
    });
    return a;
  }
  const PLURAL_KEYS = ['zero', 'one', 'two', 'few', 'many', 'other'];
  function isPlural(v) { return v && typeof v === 'object' && 'other' in v && Object.keys(v).every((k) => PLURAL_KEYS.includes(k)); }

  function loadScript(src) {
    if (loaded.has(src)) return Promise.resolve();
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src; s.async = false; s.charset = 'utf-8';
      s.onload = () => { loaded.add(src); resolve(); };
      s.onerror = () => { console.warn('[i18n] missing locale file', src); loaded.add(src); resolve(); };
      (document.head || document.documentElement).appendChild(s);
    });
  }
  function loadLang(code) {
    const files = [BASE + 'locales/en/ui.js'];
    if (code !== 'en') {
      files.push(BASE + 'locales/' + code + '/ui.js');
      wantContent.forEach((d) => files.push(BASE + 'locales/' + code + '/content/' + d + '.js'));
    }
    return Promise.all(files.map(loadScript));
  }

  /* ── lookups ── */
  function dig(obj, key) {
    return String(key).split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
  }
  function interpolate(str, vars) {
    if (!vars) return str;
    return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? (typeof vars[k] === 'number' ? fmtNumber(vars[k]) : vars[k]) : m));
  }
  function t(key, vars) {
    let v = dig(UI[lang], key);
    if (v == null && lang !== DEFAULT) v = dig(UI[DEFAULT], key);
    if (v == null) { if (window.__WK_I18N_DEBUG__) console.warn('[i18n] missing key', key); return key; }
    if (isPlural(v)) {
      const n = vars && typeof vars.count === 'number' ? vars.count : 0;
      let form = 'other';
      try { form = new Intl.PluralRules(info().intl).select(n); } catch { /* ignore */ }
      v = v[form] != null ? v[form] : v.other;
    }
    return interpolate(v, vars);
  }
  function has(key) { return dig(UI[lang], key) != null || dig(UI[DEFAULT], key) != null; }
  /* gettext-style: msgid is the English source text; optional context */
  function tc(text, ctx) {
    if (text == null || lang === DEFAULT) return text;
    const cat = CONTENT[lang];
    if (!cat) return text;
    if (ctx && cat[ctx + '\u0004' + text] != null) return cat[ctx + '\u0004' + text];
    return cat[text] != null ? cat[text] : text;
  }

  /* ── formatting ── */
  function info(code) { return LOCALES.find((l) => l.code === (code || lang)) || LOCALES[0]; }
  function fmtNumber(n, opts) { try { return new Intl.NumberFormat(info().intl, opts).format(n); } catch { return String(n); } }
  function fmtDate(d, opts) { try { return new Date(d).toLocaleDateString(info().intl, opts); } catch { return String(d); } }
  function fmtMoney(n, currency, opts) { return fmtNumber(n, Object.assign({ style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }, opts)); }

  /* ── DOM ── */
  function readVars(el) {
    const raw = el.getAttribute('data-i18n-vars');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  function apply(root) {
    const r = root || document;
    r.querySelectorAll('[data-i18n]').forEach((el) => {
      const k = el.getAttribute('data-i18n');
      if (has(k)) el.textContent = t(k, readVars(el));
    });
    r.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const k = el.getAttribute('data-i18n-html');
      if (has(k)) el.innerHTML = t(k, readVars(el));
    });
    r.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      el.getAttribute('data-i18n-attr').split(';').forEach((pair) => {
        const [attr, k] = pair.split(':').map((s) => s && s.trim());
        if (attr && k && has(k)) el.setAttribute(attr, t(k, readVars(el)));
      });
    });
    if (!root) {
      const L = info();
      document.documentElement.lang = L.htmlLang;
      document.documentElement.dir = L.dir;
    }
    renderSwitchers();
  }

  /* ── language switcher (same pill look as the original EN/FR/ES bar) ── */
  const CSS = `.wk-lang{display:inline-flex;align-items:center;gap:4px;padding:3px;border-radius:20px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);font:600 11px Inter,system-ui,sans-serif;line-height:1}
  .wk-lang .wk-lang-ico{opacity:.55;font-size:12px;padding:0 3px 0 5px}
  .wk-lang button{font:inherit;color:rgba(255,255,255,.6);background:transparent;border:0;border-radius:16px;padding:5px 9px;cursor:pointer;letter-spacing:.04em}
  .wk-lang button:hover{color:#fff;background:rgba(255,255,255,.08)}
  .wk-lang button[aria-pressed="true"]{color:#fff;background:linear-gradient(135deg,#7c5cbf,#a855f7)}
  .wk-lang select{font:inherit;color:#fff;background:transparent;border:0;padding:4px 6px;cursor:pointer}
  .wk-lang select option{color:#111}
  .lang-bar .wk-lang{background:transparent;border:0;padding:0}
  .wk-lang-float{position:fixed;right:14px;bottom:14px;z-index:9000;background:rgba(18,18,42,.92);box-shadow:0 8px 24px rgba(0,0,0,.35)}
  html.wk-i18n-pending body{opacity:0}
  body{transition:opacity .12s}`;
  function injectCss() {
    if (document.getElementById('wk-i18n-css')) return;
    const st = document.createElement('style'); st.id = 'wk-i18n-css'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  function switcherHtml() {
    const lbl = t('lang.choose');
    if (LOCALES.length > 4) {
      return `<span class="wk-lang-ico" aria-hidden="true">🌐</span><select aria-label="${lbl}">${LOCALES.map((l) => `<option value="${l.code}" ${l.code === lang ? 'selected' : ''}>${l.name}</option>`).join('')}</select>`;
    }
    return `<span class="wk-lang-ico" aria-hidden="true">🌐</span>` + LOCALES.map((l) =>
      `<button type="button" data-wk-setlang="${l.code}" lang="${l.htmlLang}" title="${l.name}" aria-label="${l.name}" aria-pressed="${l.code === lang}">${l.label}</button>`).join('');
  }
  function renderSwitchers() {
    document.querySelectorAll('[data-wk-lang]').forEach((el) => {
      el.classList.add('wk-lang');
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', t('lang.choose'));
      el.innerHTML = switcherHtml();
    });
  }
  function ensureSwitcher() {
    if (document.querySelector('[data-wk-lang]')) return;
    const el = document.createElement('div');
    el.setAttribute('data-wk-lang', 'float');
    el.className = 'wk-lang wk-lang-float';
    document.body.appendChild(el);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-wk-setlang]');
    if (b) setLang(b.getAttribute('data-wk-setlang'));
  });
  document.addEventListener('change', (e) => {
    if (e.target.closest && e.target.closest('[data-wk-lang]') && e.target.tagName === 'SELECT') setLang(e.target.value);
  });

  /* ── switching ── */
  let switching = null;
  async function setLang(code) {
    code = norm(code);
    if (!known(code) || code === lang) return;
    ls.set(STORAGE_KEY, code);
    switching = loadLang(code);
    await switching;
    lang = code;
    apply();
    syncProfile(code);
    if (!listeners.length) { location.reload(); return; }
    listeners.forEach((fn) => { try { fn(code); } catch (err) { console.error(err); } });
    document.dispatchEvent(new CustomEvent('wk:langchange', { detail: { lang: code } }));
  }
  /* remember the choice on the account so emails and other devices follow it */
  function syncProfile(code) {
    const api = window.CPS && window.CPS.api;
    if (!api || !(window.CPS.Store && window.CPS.Store.token)) return;
    api('/api/user/locale', { method: 'PUT', body: { locale: code } }).then(() => {
      try { const u = JSON.parse(ls.get('cps_user') || 'null'); if (u) { u.locale = code; ls.set('cps_user', JSON.stringify(u)); } } catch { /* ignore */ }
    }).catch(() => { /* older server: the browser keeps the choice */ });
  }
  /* a page that can re-render itself registers here; others reload */
  function onChange(fn) { listeners.push(fn); }

  /* ── boot ── */
  injectCss();
  document.documentElement.classList.add('wk-i18n-pending');
  const reveal = () => document.documentElement.classList.remove('wk-i18n-pending');
  const failsafe = setTimeout(reveal, 2500);
  ls.set(STORAGE_KEY, lang);
  const ready = loadLang(lang).then(() => new Promise((res) => {
    const go = () => { ensureSwitcher(); apply(); clearTimeout(failsafe); reveal(); res(lang); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }));

  const api = {
    get lang() { return lang; },
    get locale() { return info(); },
    locales: LOCALES.slice(),
    contentDomains: CONTENT_DOMAINS.slice(),
    ready,
    t, tc, has, apply, setLang, onChange, register,
    fmt: { number: fmtNumber, date: fmtDate, money: fmtMoney },
    _stores: { UI, CONTENT },
  };
  window.WK = window.WK || {};
  window.WK.i18n = api;
  window.t = window.t || t;
})();
