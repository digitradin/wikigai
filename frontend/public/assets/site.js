/* Shared Wikigai navbar (dashboard, Wikigai hub, support). Renders into #wkNav.
   Text comes from the i18n dictionary (nav.*); re-renders on language change. */
(function () {
  'use strict';
  const el = document.getElementById('wkNav');
  if (!el) return;
  const I = window.WK && window.WK.i18n;
  const T = (k, v) => (I ? I.t(k, v) : k);
  const Store = window.CPS?.Store;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const path = location.pathname;
  const is = (p) => (p === '/ikigai' ? path.startsWith('/ikigai') : path.startsWith(p));

  function render() {
    const user = Store?.user?.() || (() => { try { return JSON.parse(localStorage.getItem('cps_user') || 'null'); } catch { return null; } })();
    const signedIn = !!Store?.token;
    const name = (user?.name || user?.email || '').split(/[@ ]/)[0];
    const initials = (name || 'U').slice(0, 1).toUpperCase();
    el.innerHTML = `<nav class="wk-nav">
    <a class="wk-brand" href="${signedIn ? '/dashboard' : '/'}"><img src="/assets/brand/wikigai-logo.png" alt="Wikigai"></a>
    <div class="wk-links">
      ${signedIn ? `<a href="/dashboard" class="${is('/dashboard') ? 'active' : ''}">${T('nav.dashboard')}</a>
      <a href="/ikigai" class="${is('/ikigai') ? 'active' : ''}">${T('nav.myWikigai')}</a>` : ''}
      <a href="/support" class="wk-opt ${is('/support') ? 'active' : ''}">${T('nav.support')}</a>
    </div>
    <div class="wk-right">
    <div data-wk-lang></div>
    ${signedIn ? `<div class="wk-user">
      <span class="wk-hi">${T('nav.hi', { name: esc(name || T('nav.there')) })}</span>
      <button class="wk-avatar" id="wkAvatar" aria-haspopup="true" aria-expanded="false" title="${esc(T('nav.account'))}">${esc(initials)}</button>
      <div class="wk-menu" id="wkMenu" role="menu">
        ${user?.email ? `<div class="wk-email">${esc(user.email)}</div>` : ''}
        <a href="/dashboard" role="menuitem">${T('nav.dashboard')}</a>
        <a href="/ikigai" role="menuitem">${T('nav.myWikigai')}</a>
        <a href="/support" role="menuitem">${T('nav.support')}</a>
        <button id="wkLogout" role="menuitem">${T('nav.signOut')}</button>
      </div>
    </div>` : `<a class="wk-signin" href="/login">${T('nav.signIn')}</a>`}
    </div>
  </nav>`;
    const av = document.getElementById('wkAvatar'), menu = document.getElementById('wkMenu');
    if (av) {
      av.addEventListener('click', (e) => { e.stopPropagation(); const o = menu.classList.toggle('open'); av.setAttribute('aria-expanded', String(o)); });
      document.getElementById('wkLogout').addEventListener('click', () => { if (window.CPS?.logout) window.CPS.logout(); else { Store?.clear?.(); location.href = '/login'; } });
    }
    if (I) I.apply(el);
  }

  document.addEventListener('click', () => {
    const menu = document.getElementById('wkMenu'), av = document.getElementById('wkAvatar');
    if (menu) menu.classList.remove('open');
    if (av) av.setAttribute('aria-expanded', 'false');
  });

  render();
  if (I) { I.ready.then(render); I.onChange(render); }
})();
