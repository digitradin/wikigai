/* Wikigai — My learning (learning.html). Client-side routed:
   /learning (overview) · /learning/plans · /learning/videos · /learning/tools · /learning/schools
   Sections are "coming soon"; each page explains what it will contain and, when the user has
   finished Stage 2, names the top careers it will be prepared for. Text: learn.* (i18n). */
(function () {
  'use strict';
  const { api, Store } = window.CPS;
  if (!Store.token) { location.href = '/login'; return; }
  const I = WK.i18n, T = (k, v) => I.t(k, v), C = (s) => I.tc(s);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SECTIONS = [
    { id: 'plans', icon: '🗺️', feats: ['🧩', '✅', '🌱'] },
    { id: 'videos', icon: '🎬', feats: ['🕘', '🎤', '🔎'] },
    { id: 'tools', icon: '🧰', feats: ['📄', '🧪', '💬'] },
    { id: 'schools', icon: '🎓', feats: ['🏛️', '🛠️', '💻'] },
  ];
  let top = null; // top careers from Stage 2 (null = not loaded, [] = none yet)

  const current = () => { const m = location.pathname.match(/^\/learning\/(\w+)/); return SECTIONS.find((s) => s.id === (m && m[1])) || null; };

  function matchesBox() {
    if (top === null) return '';
    if (!top.length) return `<div class="lr-match"><span>${T('learn.noMatches')}</span><a class="btn-primary sm" href="/dashboard">${T('learn.finishStage2')} →</a></div>`;
    return `<div class="lr-match"><span>${T('learn.yourMatches')}</span><div class="lr-chips">${top.map((c) => `<span class="lr-chip">${esc(C(c))}</span>`).join('')}</div></div>`;
  }

  function sectionCards(except) {
    return `<div class="lr-grid">${SECTIONS.filter((s) => s.id !== except).map((s) => `<a class="ik-card lr-card" href="/learning/${s.id}" data-lr>
      <span class="lr-ico">${s.icon}</span><strong>${T('side.' + s.id)}</strong><small>${T('learn.' + s.id + 'Lead')}</small><span class="lr-soon">${T('learn.soon')}</span></a>`).join('')}</div>`;
  }

  function render() {
    const s = current();
    const view = $('lrView');
    if (!s) {
      document.title = T('meta.learning');
      view.innerHTML = `<header class="ik-head"><div class="ik-kicker">${T('learn.kicker')}</div>
        <h1>${T('side.myLearning')}</h1>${matchesBox()}</header>${sectionCards()}`;
    } else {
      document.title = `${T('side.' + s.id)} — ${T('side.myLearning')} — Wikigai`;
      view.innerHTML = `<header class="ik-head"><div class="ik-kicker">${T('learn.kicker')} · ${T('side.' + s.id)}</div>
        <h1>${T('learn.' + s.id + 'Title')} <span class="lr-badge">${T('learn.soon')}</span></h1>
        <p>${T('learn.' + s.id + 'Lead')}</p>${matchesBox()}</header>
        <section class="ik-card"><h2>${T('learn.whatsComing')}</h2>
          <div class="lr-feats">${[1, 2, 3].map((n, i) => `<div class="lr-feat"><span>${s.feats[i]}</span><div><strong>${T(`learn.${s.id}F${n}t`)}</strong><small>${T(`learn.${s.id}F${n}d`)}</small></div></div>`).join('')}</div>
        </section>
        <section class="ik-card ik-center"><h2>${T('learn.meanwhile')}</h2>
          <div class="cta-row" style="margin-top:14px"><a class="btn-primary" href="/ikigai">${T('side.myPath')} →</a></div>
        </section>
        ${sectionCards(s.id)}`;
    }
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="/learning"]');
    if (!a || e.metaKey || e.ctrlKey || a.target) return;
    e.preventDefault();
    history.pushState({}, '', a.getAttribute('href'));
    render();
  });
  window.addEventListener('popstate', render);

  async function loadMatches() {
    try {
      const r = (await api('/api/user/results')).results || {};
      const love = Array.isArray(r.stage_2?.love) ? r.stage_2.love : [];
      top = love.slice().sort((a, b) => (b.L || 0) - (a.L || 0)).slice(0, 3).map((l) => l.career).filter(Boolean);
    } catch (err) {
      if (err.status === 401) { Store.clear(); location.href = '/login'; return; }
      top = [];
    }
    render();
  }

  I.ready.then(() => { render(); loadMatches(); });
  I.onChange(render);
})();
