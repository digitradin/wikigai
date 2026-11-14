/* Wikigai top menu (v20261113): three links shown on every page with a top bar.
     Wikigai  → /about          (mission, what Wikigai does, the ikigai logic, its history and credits)
     My path  → /ikigai         when signed in · /how-it-works (simple explanation, no formulas) for visitors
     Schools  → /learning/schools when signed in · /schools (public directory) for visitors
   Visitor links keep the page language (/fr/about, /es/schools…). Used by site.js (#wkNav) and the landing page
   (any element with [data-wk-topmenu]). Text: common.brand, side.myPath, side.schools (i18n). */
(function () {
  'use strict';
  const T = (k) => (window.WK && window.WK.i18n ? window.WK.i18n.t(k) : k);
  const signedIn = () => { try { return !!localStorage.getItem('cps_token'); } catch { return false; } };
  const lang = () => {
    const m = location.pathname.match(/^\/(fr|es)(\/|$)/);
    if (m) return m[1];
    return (window.WK && window.WK.i18n && window.WK.i18n.lang) || 'en';
  };
  const loc = (route) => (lang() === 'en' ? route : `/${lang()}${route}`);
  const bare = () => (location.pathname.replace(/^\/(fr|es)(?=\/|$)/, '').replace(/\/+$/, '') || '/');

  function items() {
    const inn = signedIn();
    return [
      { id: 'wikigai', href: loc('/about'), label: T('common.brand'), on: (p) => p === '/about' },
      { id: 'path', href: inn ? '/ikigai' : loc('/how-it-works'), label: T('side.myPath'), on: (p) => p === '/how-it-works' || p === '/ikigai' || p.startsWith('/ikigai/') },
      { id: 'schools', href: inn ? '/learning/schools' : loc('/schools'), label: T('side.schools'), on: (p) => p === '/schools' || p === '/learning/schools' },
    ];
  }
  function html() {
    const p = bare();
    return items().map((i) => `<a href="${i.href}" data-wktop="${i.id}"${i.on(p) ? ' class="active" aria-current="page"' : ''}>${i.label}</a>`).join('');
  }
  function fill(root) {
    (root || document).querySelectorAll('[data-wk-topmenu]').forEach((el) => {
      el.innerHTML = html();
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', 'Wikigai');
    });
  }
  function refreshActive() {
    const p = bare(), list = items();
    document.querySelectorAll('[data-wk-topmenu] a[data-wktop]').forEach((a) => {
      const it = list.find((x) => x.id === a.dataset.wktop); const on = !!(it && it.on(p));
      a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  window.WKTopMenu = { html, fill, refreshActive };

  const boot = () => {
    fill();
    const I = window.WK && window.WK.i18n;
    if (I) { I.ready.then(() => fill()); I.onChange(() => fill()); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  // in-page navigation (My learning, the ikigai hub) — keep the active link right
  window.addEventListener('popstate', () => setTimeout(refreshActive, 0));
})();
