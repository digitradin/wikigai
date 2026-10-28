/* Shared Wikigai chrome: top bar (#wkNav) + left menu for signed-in users.
   Left menu: My path · My learning · My profile (see MENU below).
   Desktop (>960px): fixed sidebar. Smaller screens: slide-in drawer from the ☰ button.
   Text comes from the i18n dictionary (nav.*, side.*); re-renders on language change.
   Pages can opt out of the left menu with <body data-no-side>. */
(function () {
  'use strict';
  const el = document.getElementById('wkNav');
  if (!el) return;
  const I = window.WK && window.WK.i18n;
  const T = (k, v) => (I ? I.t(k, v) : k);
  const Store = window.CPS?.Store;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

  const MENU = [
    { id: 'path', icon: '🧭', label: 'side.myPath', href: '/ikigai', items: [
      { href: '/ikigai/love', icon: '❤️', label: 'side.passions' },
      { href: '/ikigai/skills', icon: '💪', label: 'side.strengths' },
      { href: '/ikigai/needs', icon: '🌍', label: 'side.demand' },
      { href: '/ikigai/pay', icon: '💰', label: 'side.payRanges' },
    ] },
    { id: 'learn', icon: '📚', label: 'side.myLearning', href: '/learning', items: [
      { href: '/learning/plans', icon: '🗺️', label: 'side.plans', badge: 'soon' }, // AI plans: coming soon (v20261028b)
      { href: '/learning/videos', icon: '🎬', label: 'side.videos' },
      { href: '/learning/tools', icon: '🔧', label: 'side.tools', badge: 'soon' },
      { href: '/learning/schools', icon: '🎓', label: 'side.schools', badge: 'soon' },
    ] },
    { id: 'profile', icon: '👤', label: 'side.myProfile', items: [
      { href: '/dashboard', icon: '🏠', label: 'side.dashboard' },
      { href: '/account', icon: '⚙️', label: 'side.account' },
    ] },
  ];

  const currentUser = () => Store?.user?.() || (() => { try { return JSON.parse(ls.get('cps_user') || 'null'); } catch { return null; } })();
  const path = () => location.pathname.replace(/\/+$/, '') || '/';
  const isActive = (href) => path() === href || (href === '/dashboard' && path().startsWith('/dashboard'));
  const groupActive = (g) => (g.href && (path() === g.href)) || g.items.some((i) => isActive(i.href));
  const collapsed = () => { try { return JSON.parse(ls.get('wk_side_collapsed') || '[]'); } catch { return []; } };

  let side = null, backdrop = null;
  const wantsSide = () => !!Store?.token && !document.body.hasAttribute('data-no-side');

  function renderSide(user) {
    if (!wantsSide()) { if (side) { side.remove(); backdrop.remove(); side = backdrop = null; } document.body.classList.remove('wk-has-side'); return; }
    if (!side) {
      side = document.createElement('aside'); side.className = 'wk-side'; side.id = 'wkSide';
      backdrop = document.createElement('div'); backdrop.className = 'wk-side-backdrop';
      backdrop.addEventListener('click', closeDrawer);
      document.body.appendChild(backdrop); document.body.appendChild(side);
      document.body.classList.add('wk-has-side');
    }
    const shut = collapsed();
    side.setAttribute('aria-label', T('side.label'));
    side.innerHTML = `<nav class="wk-side-nav">${MENU.map((g) => {
      const items = g.items;
      const open = groupActive(g) || !shut.includes(g.id);
      const head = g.href
        ? `<a class="wk-side-head${path() === g.href ? ' active' : ''}" href="${g.href}"><span class="ico">${g.icon}</span><span class="lbl">${T(g.label)}${g.soon ? `<span class="wk-soon">${T('side.soon')}</span>` : ''}</span></a>`
        : `<span class="wk-side-head"><span class="ico">${g.icon}</span><span class="lbl">${T(g.label)}</span></span>`;
      return `<div class="wk-side-group${open ? ' open' : ''}" data-group="${g.id}">
        <div class="wk-side-row">${head}<button type="button" class="wk-side-tog" data-tog="${g.id}" aria-expanded="${open}" aria-controls="wkSide-${g.id}" aria-label="${esc(T('side.toggle', { name: T(g.label) }))}"><span aria-hidden="true">▾</span></button></div>
        <ul class="wk-side-list" id="wkSide-${g.id}">${items.map((i) => `<li><a href="${i.href}" class="${isActive(i.href) ? 'active' : ''}"${isActive(i.href) ? ' aria-current="page"' : ''}><span class="ico">${i.icon}</span><span class="lbl">${T(i.label)}</span>${i.badge ? `<span class="wk-badge ${i.badge}">${T(i.badge === 'ai' ? 'learn.aiBadge' : 'side.soon')}</span>` : ''}</a></li>`).join('')}</ul>
      </div>`;
    }).join('')}</nav>`;
  }

  function markActive() {
    if (!side) return;
    side.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      const on = a.classList.contains('wk-side-head') ? path() === href : isActive(href);
      a.classList.toggle('active', on);
      if (on && !a.classList.contains('wk-side-head')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function openDrawer() { document.body.classList.add('wk-side-open'); const b = document.getElementById('wkBurger'); if (b) { b.setAttribute('aria-expanded', 'true'); b.setAttribute('aria-label', T('nav.closeMenu')); } }
  function closeDrawer() { document.body.classList.remove('wk-side-open'); const b = document.getElementById('wkBurger'); if (b) { b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', T('nav.openMenu')); } }

  function render() {
    const user = currentUser();
    const signedIn = !!Store?.token;
    const withSide = wantsSide();
    const name = (user?.name || user?.email || '').split(/[@ ]/)[0];
    const initials = (name || 'U').slice(0, 1).toUpperCase();
    el.innerHTML = `<nav class="wk-nav">
    <div class="wk-left">
      ${withSide ? `<button type="button" class="wk-burger" id="wkBurger" aria-controls="wkSide" aria-expanded="false" aria-label="${esc(T('nav.openMenu'))}"><span></span><span></span><span></span></button>` : ''}
      <a class="wk-brand" href="${signedIn ? '/dashboard' : '/'}"><img src="/assets/brand/wikigai-logo.png" alt="Wikigai"></a>
    </div>
    <div class="wk-right">
    <div data-wk-lang></div>
    ${signedIn ? `<div class="wk-user">
      <span class="wk-hi">${T('nav.hi', { name: esc(name || T('nav.there')) })}</span>
      <button class="wk-avatar" id="wkAvatar" aria-haspopup="true" aria-expanded="false" title="${esc(T('nav.account'))}">${esc(initials)}</button>
      <div class="wk-menu" id="wkMenu" role="menu">
        ${user?.email ? `<div class="wk-email">${esc(user.email)}</div>` : ''}
        <a href="/dashboard" role="menuitem">${T('side.dashboard')}</a>
        <a href="/account" role="menuitem">${T('side.account')}</a>
        <a href="/support" role="menuitem">${T('nav.supportShort')}</a>
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
    const burger = document.getElementById('wkBurger');
    if (burger) burger.addEventListener('click', (e) => { e.stopPropagation(); document.body.classList.contains('wk-side-open') ? closeDrawer() : openDrawer(); });
    renderSide(user);
    if (I) I.apply(el);
  }

  document.addEventListener('click', (e) => {
    const tog = e.target.closest && e.target.closest('[data-tog]');
    if (tog) {
      const id = tog.dataset.tog, g = side && side.querySelector(`[data-group="${id}"]`);
      if (g) {
        const open = !g.classList.contains('open');
        g.classList.toggle('open', open); tog.setAttribute('aria-expanded', String(open));
        const list = collapsed().filter((x) => x !== id); if (!open) list.push(id);
        ls.set('wk_side_collapsed', JSON.stringify(list));
      }
      return;
    }
    if (e.target.closest && e.target.closest('.wk-side a[href]')) closeDrawer();
    const menu = document.getElementById('wkMenu'), av = document.getElementById('wkAvatar');
    if (menu) menu.classList.remove('open');
    if (av) av.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  // in-page navigation (Wikigai hub, My learning use history.pushState)
  ['pushState', 'replaceState'].forEach((fn) => {
    const orig = history[fn];
    history[fn] = function () { const r = orig.apply(this, arguments); setTimeout(markActive, 0); return r; };
  });
  window.addEventListener('popstate', () => setTimeout(markActive, 0));

  render();
  if (I) { I.ready.then(render); I.onChange(render); }
  window.WikiNav = { render };
})();
