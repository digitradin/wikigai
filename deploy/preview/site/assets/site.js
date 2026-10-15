/* Shared Wikigai navbar (dashboard, Wikigai hub, support). Renders into #wkNav. */
(function () {
  'use strict';
  const el = document.getElementById('wkNav');
  if (!el) return;
  const Store = window.CPS?.Store;
  const user = Store?.user?.() || (() => { try { return JSON.parse(localStorage.getItem('cps_user') || 'null'); } catch { return null; } })();
  const signedIn = !!Store?.token;
  const path = location.pathname;
  const is = (p) => (p === '/ikigai' ? path.startsWith('/ikigai') : path.startsWith(p));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const name = (user?.name || user?.email || '').split(/[@ ]/)[0];
  const initials = (name || 'U').slice(0, 1).toUpperCase();

  el.innerHTML = `<nav class="wk-nav">
    <a class="wk-brand" href="${signedIn ? '/dashboard' : '/'}"><img src="assets/brand/wikigai-logo.png" alt="Wikigai"></a>
    <div class="wk-links">
      ${signedIn ? `<a href="/dashboard" class="${is('/dashboard') ? 'active' : ''}">Dashboard</a>
      <a href="/ikigai" class="${is('/ikigai') ? 'active' : ''}">My Wikigai</a>` : ''}
      <a href="/support" class="wk-opt ${is('/support') ? 'active' : ''}">Free &amp; support</a>
    </div>
    ${signedIn ? `<div class="wk-user">
      <span class="wk-hi">Hi, ${esc(name || 'there')}</span>
      <button class="wk-avatar" id="wkAvatar" aria-haspopup="true" aria-expanded="false" title="Account">${esc(initials)}</button>
      <div class="wk-menu" id="wkMenu" role="menu">
        ${user?.email ? `<div class="wk-email">${esc(user.email)}</div>` : ''}
        <a href="/dashboard" role="menuitem">Dashboard</a>
        <a href="/ikigai" role="menuitem">My Wikigai</a>
        <a href="/support" role="menuitem">Free &amp; support</a>
        <button id="wkLogout" role="menuitem">Sign out</button>
      </div>
    </div>` : '<a class="wk-signin" href="/login">Sign in</a>'}
  </nav>`;

  const av = document.getElementById('wkAvatar'), menu = document.getElementById('wkMenu');
  if (av) {
    av.addEventListener('click', (e) => { e.stopPropagation(); const o = menu.classList.toggle('open'); av.setAttribute('aria-expanded', String(o)); });
    document.addEventListener('click', () => { menu.classList.remove('open'); av.setAttribute('aria-expanded', 'false'); });
    document.getElementById('wkLogout').addEventListener('click', () => { if (window.CPS?.logout) window.CPS.logout(); else { Store?.clear?.(); location.href = window.__WK_URL__('/login'); } });
  }
})();
