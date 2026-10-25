/* Wikigai — My learning (learning.html). Client-side routed:
   /learning (overview) · /learning/plans · /learning/videos · /learning/tools · /learning/schools
   Every page starts with "Your path at a glance" (top areas + key professions from My path).
   Plans = AI research: "I want to learn about X" → Outlook · Focus (skills + video searches) · Plan
   (30 days, 1 year, 3 years), via POST /api/learn/research (server calls the Digitradin AI router).
   Videos = "WikiVids": filtered YouTube search (filters hidden, server side: /api/videos/search),
   play in a privacy-enhanced player, save favourites ("My WikiVids").
   Tools / Schools are "coming soon". Text: learn.* (i18n). */
(function () {
  'use strict';
  const { api, Store } = window.CPS;
  if (!Store.token) { location.href = '/login'; return; }
  const I = WK.i18n, T = (k, v) => I.t(k, v), C = (s) => I.tc(s);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const AREAS = (window.STAGE_DATA && window.STAGE_DATA.areas) || {};
  const S2 = window.STAGE_DATA_2B || {};
  const SUBJECTS = (S2.config && S2.config.subjectClusters) || {};
  const area = (k) => AREAS[k] || { name: k, icon: '•', color: '#94a3b8' };
  const SECTIONS = [
    { id: 'plans', icon: '🗺️', feats: ['🧩', '✅', '🌱'] },
    { id: 'videos', icon: '🎬', feats: ['🕘', '🎤', '🔎'] },
    { id: 'tools', icon: '🔧', feats: ['📄', '🧪', '💬'] },
    { id: 'schools', icon: '🎓', feats: ['🏛️', '🛠️', '💻'] },
  ];

  let path = null;              // summary of the user's results (null = loading)
  let research = null;          // current research result { id, topic, lang, result, created_at }
  let history = [];             // recent research titles
  let configured = true;        // is the AI service set up on the server?
  let busy = false, errMsg = '', topicDraft = '', showAll = false;
  /* WikiVids state */
  const wv = { q: null, domain: null, items: null, busy: false, err: '', off: false, tab: 'search', saved: null, auto: false };

  const current = () => { const m = location.pathname.match(/^\/learning\/(\w+)/); return SECTIONS.find((s) => s.id === (m && m[1])) || null; };

  /* ── "Your path at a glance" (shared header) ── */
  function buildPath(r) {
    const s1 = r.stage_1 || {}, s2 = r.stage_2 || {}, s3 = r.stage_3 || {};
    const ranked = (Array.isArray(s1.ranked) ? s1.ranked : []).slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    const max = Math.max(1, ...ranked.map((x) => x.score || 0));
    const domains = ranked.slice(0, 3).map((x) => ({ key: x.area, pct: Math.round(((x.score || 0) / max) * 100) }));
    let pros = [], kind = 'love';
    if (Array.isArray(s3.top) && s3.top.length) { pros = s3.top.slice(0, 5).map((x) => ({ name: x.career, score: x.match })); kind = 'match'; }
    else if (Array.isArray(s2.love)) pros = s2.love.slice().sort((a, b) => (b.L || 0) - (a.L || 0)).slice(0, 5).map((x) => ({ name: x.career, score: x.L }));
    let strengths = [];
    const g = s3.grades;
    if (g && g.values && g.best !== g.worst) {
      strengths = Object.entries(g.values).filter(([, v]) => v !== '' && v != null && !isNaN(Number(v)))
        .map(([k, v]) => ({ k, p: (Number(v) - g.worst) / (g.best - g.worst) })).sort((a, b) => b.p - a.p).slice(0, 3).map((x) => x.k);
    }
    // every profession kept in Stage 2 (for the research suggestions), best first, no duplicates
    const seen = new Set();
    const allPros = (Array.isArray(s2.love) ? s2.love.slice() : []).sort((a, b) => (b.L || 0) - (a.L || 0))
      .map((x) => x.career).filter((c) => c && !seen.has(c) && seen.add(c));
    // WikiVids topics: every subfield kept in Stage 2 and every profession (Stage 3 match order first, then love)
    const SUBS = S2.subfields || {};
    const keptSubs = Object.keys(s2.subPrefs || {}).filter((k) => s2.subPrefs[k] && SUBS[k]);
    const loveSubs = [...new Set((Array.isArray(s2.love) ? s2.love : []).map((x) => x.subfield).filter((k) => SUBS[k]))];
    const subs = [...new Set(keptSubs.length ? keptSubs : loveSubs)]
      .sort((a, b) => ((s2.subPct || {})[b] || 0) - ((s2.subPct || {})[a] || 0))
      .map((k) => ({ key: k, name: SUBS[k].name, domain: SUBS[k].domain }));
    const domOf = {};
    (Array.isArray(s2.love) ? s2.love : []).forEach((x) => { if (x.career) domOf[x.career] = x.domain || (SUBS[x.subfield] || {}).domain; });
    const seenP = new Set();
    const proItems = [...(Array.isArray(s3.top) ? s3.top.map((x) => x.career) : []), ...allPros]
      .filter((c) => c && !seenP.has(c) && seenP.add(c)).map((c) => ({ name: c, domain: domOf[c] || null }));
    return { domains, pros, allPros, subs, proItems, kind, strengths, s1: !!ranked.length, s2: !!(s2.love && s2.love.length), s3: !!s3.completedAt };
  }
  function pathBox() {
    if (path === null) return `<div class="lr-path loading">${T('common.loading')}</div>`;
    if (!path.s1) return `<div class="lr-path"><div class="lr-path-empty"><span>${T('learn.pathEmpty')}</span><a class="btn-primary sm" href="/dashboard">${T('learn.finishStage2')} →</a></div></div>`;
    const doms = path.domains.map((d) => { const a = area(d.key); return `<span class="lr-dom" style="--c:${a.color}">${a.icon} ${esc(C(a.name))} <b>${d.pct}%</b></span>`; }).join('');
    const pros = path.pros.length
      ? path.pros.map((p, i) => `<span class="lr-pro${i === 0 ? ' top' : ''}">${i === 0 ? '🏆 ' : ''}${esc(C(p.name))} <b>${p.score}</b></span>`).join('')
      : `<span class="ik-dim">${T('learn.noMatches')}</span> <a href="/dashboard">${T('learn.finishStage2')} →</a>`;
    return `<div class="lr-path">
      <div class="lr-path-h"><strong>${T('learn.pathTitle')}</strong><a href="/ikigai">${T('learn.seePath')} →</a></div>
      <div class="lr-path-row"><span class="lr-path-l">${T('learn.topAreas')}</span><div class="lr-chips">${doms}</div></div>
      <div class="lr-path-row"><span class="lr-path-l">${T(path.kind === 'match' ? 'learn.keyProsMatch' : 'learn.keyProsLove')}</span><div class="lr-chips">${pros}</div></div>
      ${path.strengths.length ? `<div class="lr-path-row"><span class="lr-path-l">${T('learn.strengths')}</span><div class="lr-chips">${path.strengths.map((k) => `<span class="lr-chip">${esc(C(SUBJECTS[k] || k))}</span>`).join('')}</div></div>` : ''}
    </div>`;
  }

  /* ── Plans: AI research ── */
  function researchForm() {
    const doms = path && path.s1 ? path.domains.map((d) => ({ t: C(area(d.key).name), ico: area(d.key).icon })) : [];
    const pros = path && path.allPros ? path.allPros.map((n) => ({ t: C(n), ico: '💼' })) : [];
    const chips = doms.concat(pros);
    const FOLD = 12;
    return `<section class="ik-card lr-ask">
      <h2>${T('learn.askTitle')}</h2>
      <p class="ik-sub">${T('learn.askLead')}</p>
      <form id="lrForm" class="lr-form" autocomplete="off">
        <label for="lrTopic" class="lr-iwant">${T('learn.iWant')}</label>
        <div class="lr-inputrow">
          <input id="lrTopic" maxlength="120" value="${esc(topicDraft)}" placeholder="${esc(T('learn.topicPh'))}" ${busy ? 'disabled' : ''}>
          <button class="btn-primary" type="submit" ${busy ? 'disabled' : ''}>${busy ? T('learn.thinking') : '✨ ' + T('learn.askBtn')}</button>
        </div>
      </form>
      ${chips.length ? `<div class="lr-suggest"><span class="ik-dim">${T('learn.fromPath')}</span>${chips.map((c, i) => `<button type="button" class="lr-sug${i >= FOLD && !showAll ? ' lr-more-item' : ''}" data-topic="${esc(c.t)}" ${busy ? 'disabled' : ''}>${c.ico} ${esc(c.t)}</button>`).join('')}${chips.length > FOLD && !showAll ? `<button type="button" class="lr-more" data-act="more">${T('learn.showAll', { count: chips.length - FOLD })}</button>` : ''}</div>` : ''}
      ${!configured ? `<p class="lr-warn">${T('learn.notConfigured')}</p>` : ''}
      ${errMsg ? `<p class="lr-err" role="alert">${esc(errMsg)}</p>` : ''}
      ${history.length ? `<div class="lr-history"><span class="ik-dim">${T('learn.recent')}</span>${history.map((h) => `<button type="button" class="lr-hist${research && research.id === h.id ? ' on' : ''}" data-rid="${h.id}">${esc(h.topic)}<small>${esc(I.fmt.date(h.created_at, { day: 'numeric', month: 'short' }))}</small></button>`).join('')}</div>` : ''}
    </section>`;
  }
  function loadingBlock() {
    return `<section class="ik-card lr-loading" aria-live="polite"><div class="lr-spinner" aria-hidden="true"></div>
      <div><strong>${T('learn.loadingTitle', { topic: esc(topicDraft) })}</strong><small>${T('learn.loadingSub')}</small></div></section>`;
  }
  function list(items) { return `<ul class="lr-ul">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`; }
  function titled(items) { return `<div class="lr-tiles">${items.map((x) => `<div class="lr-tile"><strong>${esc(x.title)}</strong>${x.detail ? `<small>${esc(x.detail)}</small>` : ''}</div>`).join('')}</div>`; }
  function timeline(steps, key) {
    return `<ol class="lr-tl">${steps.map((s) => `<li><span class="lr-tl-k">${esc(s[key] || '')}</span><div><strong>${esc(s.title)}</strong>${s.actions.length ? list(s.actions) : ''}</div></li>`).join('')}</ol>`;
  }
  function resultBlocks() {
    if (!research) return '';
    const r = research.result || {}, o = r.outlook || {};
    const topic = r.topic || research.topic;
    return `<div class="lr-result" id="lrResult">
      <div class="lr-result-h"><h2>${T('learn.resultTitle', { topic: esc(topic) })}</h2>
        <div class="lr-result-a"><span class="ik-dim">${esc(I.fmt.date(research.created_at, { day: 'numeric', month: 'long', year: 'numeric' }))}</span>
        <button type="button" class="ac-btn" data-act="redo">↻ ${T('learn.redo')}</button><button type="button" class="ac-btn" data-act="print">🖨 ${T('learn.print')}</button></div></div>
      <section class="ik-card lr-block"><div class="lr-bh"><span class="lr-bn">1</span><div><h3>${T('learn.b1')}</h3><small>${T('learn.b1d')}</small></div></div>
        ${o.summary ? `<p class="lr-summary">${esc(o.summary)}</p>` : ''}
        ${o.keyAreas && o.keyAreas.length ? `<h4>${T('learn.keyAreas')}</h4>${titled(o.keyAreas)}` : ''}
        ${o.decisions && o.decisions.length ? `<h4>${T('learn.decisions')}</h4>${titled(o.decisions)}` : ''}
        ${o.considerations && o.considerations.length ? `<h4>${T('learn.considerations')}</h4>${list(o.considerations)}` : ''}
      </section>
      <section class="ik-card lr-block"><div class="lr-bh"><span class="lr-bn">2</span><div><h3>${T('learn.b2')}</h3><small>${T('learn.b2d')}</small></div></div>
        <ol class="lr-skills">${(r.focus || []).map((f, i) => `<li><span class="lr-rank">${i + 1}</span><div class="lr-sk"><strong>${esc(f.skill)}</strong>${f.why ? `<small>${esc(f.why)}</small>` : ''}</div>
          <a class="lr-vid" href="/learning/videos?q=${encodeURIComponent((f.skill + ' ' + topic).slice(0, 80))}" data-skill="${esc(f.skill)}">▶ ${T('learn.videos')}</a></li>`).join('')}</ol>
      </section>
      <section class="ik-card lr-block"><div class="lr-bh"><span class="lr-bn">3</span><div><h3>${T('learn.b3')}</h3><small>${T('learn.b3d')}</small></div></div>
        <div class="lr-tabs" role="tablist">
          <button role="tab" class="lr-tab on" data-tab="p30" aria-selected="true">${T('learn.p30')}</button>
          <button role="tab" class="lr-tab" data-tab="p1y" aria-selected="false">${T('learn.p1y')}</button>
          <button role="tab" class="lr-tab" data-tab="p3y" aria-selected="false">${T('learn.p3y')}</button>
        </div>
        <div class="lr-pane" data-pane="p30">${timeline(r.plan30 || [], 'days')}</div>
        <div class="lr-pane" data-pane="p1y" hidden>${timeline(r.plan1y || [], 'period')}</div>
        <div class="lr-pane" data-pane="p3y" hidden>${timeline(r.plan3y || [], 'period')}</div>
      </section>
      <p class="ik-dim lr-disclaimer">${T('learn.disclaimer')}</p>
    </div>`;
  }
  function pagePlans() {
    return `<header class="ik-head"><div class="ik-kicker">${T('learn.kicker')} · ${T('side.plans')}</div>
      <h1>${T('learn.plansTitle')}</h1><p>${T('learn.plansAiLead')}</p></header>
      ${pathBox()}${researchForm()}${busy ? loadingBlock() : resultBlocks()}`;
  }

  async function ask(topic, force) {
    topic = String(topic || '').trim();
    if (topic.length < 2) { errMsg = T('errors.BAD_TOPIC'); render(); return; }
    topicDraft = topic; busy = true; errMsg = ''; render();
    window.WK?.track?.('research_start', { cached: false });
    try {
      const ctx = path ? {
        domains: path.domains.map((d) => area(d.key).name),
        professions: path.pros.map((p) => p.name),
        strengths: path.strengths.map((k) => SUBJECTS[k] || k),
      } : {};
      const r = await api('/api/learn/research', { method: 'POST', body: { topic, lang: I.lang, context: ctx, force: !!force } });
      research = r.research;
      history = [{ id: research.id, topic: research.topic, created_at: research.created_at }, ...history.filter((h) => h.id !== research.id)].slice(0, 12);
      window.WK?.track?.('research_done', { cached: !!r.cached });
    } catch (err) {
      if (err.code === 'AI_UNAVAILABLE') { configured = false; errMsg = ''; } else errMsg = err.message;
    }
    busy = false; render(true);
  }

  /* ── Videos: WikiVids ── */
  const fmtDur = (s) => { s = +s || 0; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const fmtViews = (n) => I.fmt.number(+n || 0, { notation: 'compact', maximumFractionDigits: 1 });
  const vDomains = () => {
    const base = path && path.domains && path.domains.length ? path.domains.map((d) => d.key) : Object.keys(AREAS);
    const extra = path ? [...(path.subs || []), ...(path.proItems || [])].map((t) => t.domain).filter((k) => k && AREAS[k]) : [];
    return [...new Set([...base, ...extra, ...(wv.domain && AREAS[wv.domain] ? [wv.domain] : [])])];
  };
  function wvDefaults() {
    if (wv.q === null && path) { // wait for the user's path so we can prefill their top profession
      const p = new URLSearchParams(location.search);
      const fromUrl = (p.get('q') || '').trim();
      wv.q = fromUrl || (path && path.pros && path.pros[0] ? C(path.pros[0].name) : '');
      wv.auto = !!wv.q;
      const d = p.get('d');
      wv.domain = d && AREAS[d] ? d : null;
    }
    if (!wv.domain && path) wv.domain = vDomains()[0] || null;
  }
  function savedIds() { return new Set((wv.saved || []).map((v) => v.id)); }
  function videoCard(v, isSaved) {
    return `<div class="wv-card">
      <button type="button" class="wv-thumb" data-play="${esc(v.id)}" aria-label="${esc(T('learn.vWatch') + ': ' + v.title)}"><img src="${esc(v.thumb)}" alt="" loading="lazy">${v.durationS ? `<span class="wv-dur">${fmtDur(v.durationS)}</span>` : ''}<span class="wv-play" aria-hidden="true">▶</span></button>
      <div class="wv-meta"><strong title="${esc(v.title)}">${esc(v.title)}</strong>
        <small>${esc(v.channel || '')}${v.views != null ? ' · ' + T('learn.vViews', { n: fmtViews(v.views) }) : ''}${v.published ? ' · ' + esc(v.published.slice(0, 4)) : ''}</small>
        <div class="wv-acts"><button type="button" class="wv-save${isSaved ? ' on' : ''}" data-save="${esc(v.id)}" aria-pressed="${isSaved}">${isSaved ? '★ ' + T('learn.vSaved') : '☆ ' + T('learn.vSave')}</button>
        <a class="wv-yt" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">YouTube ↗</a></div></div>
    </div>`;
  }
  function pageVideos() {
    wvDefaults();
    const ids = savedIds();
    const doms = path ? vDomains() : [];
    const nSaved = wv.saved ? wv.saved.length : 0;
    let body;
    if (wv.tab === 'saved') {
      body = !wv.saved ? `<p class="ik-dim">${T('common.loading')}</p>`
        : wv.saved.length ? `<div class="wv-grid">${wv.saved.map((v) => videoCard(v, true)).join('')}</div>` : `<p class="wv-empty">${T('learn.vSavedEmpty')}</p>`;
    } else if (wv.busy) {
      body = `<div class="lr-loading wv-loading"><div class="lr-spinner" aria-hidden="true"></div><div><strong>${T('learn.vSearching')}</strong></div></div>`;
    } else if (wv.items) {
      body = wv.items.length ? `<div class="wv-grid">${wv.items.map((v) => videoCard(v, ids.has(v.id))).join('')}</div>` : `<p class="wv-empty">${T('learn.vNone')}</p>`;
    } else body = '';
    return `<header class="ik-head"><div class="ik-kicker">${T('learn.kicker')} · ${T('side.videos')}</div>
        <h1>${T('learn.videosTitle')}</h1><p>${T('learn.vLead')}</p></header>
      ${pathBox()}
      <section class="ik-card wv-box">
        <form id="wvForm" class="lr-inputrow wv-form" autocomplete="off" role="search">
          <input id="wvQ" maxlength="80" value="${esc(wv.q || '')}" placeholder="${esc(T('learn.vPh'))}" aria-label="${esc(T('learn.vPh'))}" ${wv.busy ? 'disabled' : ''}>
          <button class="btn-primary" type="submit" ${wv.busy ? 'disabled' : ''}>🔎 ${T('learn.vSearch')}</button>
        </form>
        ${doms.length ? `<div class="lr-suggest wv-row"><span class="ik-dim">${T('learn.vDomain')}</span>${doms.map((k) => `<button type="button" class="lr-sug wv-dom${k === wv.domain ? ' on' : ''}" data-wvdom="${k}" aria-pressed="${k === wv.domain}">${area(k).icon} ${esc(C(area(k).name))}</button>`).join('')}</div>` : ''}
        ${topicRow('subs', T('learn.vSubfields'), (path && path.subs) || [])}
        ${topicRow('pros', T('learn.vProfessions'), (path && path.proItems) || [])}
        ${wv.off ? `<p class="lr-warn">${T('learn.vNotConfigured')}</p>` : ''}
        ${wv.err ? `<p class="lr-err" role="alert">${esc(wv.err)}</p>` : ''}
      </section>
      <div class="lr-tabs wv-tabs" role="tablist">
        <button role="tab" class="lr-tab${wv.tab === 'search' ? ' on' : ''}" data-wvtab="search" aria-selected="${wv.tab === 'search'}">${T('learn.vTabResults')}</button>
        <button role="tab" class="lr-tab${wv.tab === 'saved' ? ' on' : ''}" data-wvtab="saved" aria-selected="${wv.tab === 'saved'}">★ ${T('learn.vTabSaved')}${nSaved ? ` (${nSaved})` : ''}</button>
      </div>
      <div id="wvBody">${body}</div>`;
  }
  /* topic suggestions: every subfield and profession from the user's path — one tap fills the words */
  const FOLDV = 8;
  function topicRow(kind, label, list) {
    if (!list.length) return '';
    const cur = String(wv.q || '').trim().toLowerCase();
    const open = wv.open && wv.open[kind];
    const chips = list.map((t, i) => {
      const name = C(t.name);
      const on = name.toLowerCase() === cur;
      return `<button type="button" class="lr-sug wv-topic${on ? ' on' : ''}${i >= FOLDV && !open ? ' lr-more-item' : ''}" data-wvtopic="${esc(name)}" data-wvtdom="${esc(t.domain || '')}" aria-pressed="${on}">${kind === 'subs' ? (area(t.domain).icon || '•') : '💼'} ${esc(name)}</button>`;
    }).join('');
    const more = list.length > FOLDV && !open ? `<button type="button" class="lr-more" data-wvmore="${kind}">${T('learn.showAll', { count: list.length - FOLDV })}</button>` : '';
    return `<div class="lr-suggest wv-row"><span class="ik-dim">${label}</span>${chips}${more}</div>`;
  }
  async function wvSearch() {
    const q = String(wv.q || '').trim();
    if (q.length < 2) { wv.err = T('errors.BAD_QUERY'); render(); return; }
    wv.busy = true; wv.err = ''; wv.tab = 'search'; render();
    try {
      const r = await api(`/api/videos/search?q=${encodeURIComponent(q)}&domain=${encodeURIComponent(wv.domain || '')}&lang=${I.lang}`);
      wv.items = r.items || []; wv.off = false;
      window.WK?.track?.('video_search', { cached: !!r.cached });
    } catch (err) {
      if (err.code === 'VIDEOS_UNAVAILABLE') { wv.off = true; wv.err = ''; } else wv.err = err.message;
      wv.items = wv.items || null;
    }
    wv.busy = false; render();
  }
  async function wvLoadSaved() {
    try { wv.saved = (await api('/api/videos/saved')).items || []; } catch { wv.saved = wv.saved || []; }
  }
  async function wvToggleSave(id) {
    const ids = savedIds();
    const v = (wv.items || []).concat(wv.saved || []).find((x) => x.id === id);
    if (!v) return;
    try {
      if (ids.has(id)) { await api('/api/videos/saved/remove', { method: 'POST', body: { id } }); wv.saved = wv.saved.filter((x) => x.id !== id); }
      else { await api('/api/videos/saved', { method: 'POST', body: { video: v, domain: wv.domain, query: wv.q } }); wv.saved = [{ ...v, savedAt: new Date().toISOString() }, ...(wv.saved || [])]; window.WK?.track?.('video_save', {}); }
      wv.err = '';
    } catch (err) { wv.err = err.message; }
    render();
  }
  function wvPlay(id) {
    const v = (wv.items || []).concat(wv.saved || []).find((x) => x.id === id) || { id, title: '' };
    let m = $('wvModal');
    if (!m) { m = document.createElement('div'); m.id = 'wvModal'; m.className = 'wv-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); document.body.appendChild(m); }
    m.innerHTML = `<div class="wv-modal-in"><div class="wv-modal-h"><strong>${esc(v.title)}</strong><button type="button" class="wv-x" data-wvclose aria-label="${esc(T('learn.vClose'))}">✕</button></div>
      <div class="wv-frame"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1" title="${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div></div>`;
    m.hidden = false; document.body.classList.add('wv-lock');
    m.querySelector('.wv-x').focus();
    window.WK?.track?.('video_play', {});
  }
  function wvClose() { const m = $('wvModal'); if (m) { m.hidden = true; m.innerHTML = ''; } document.body.classList.remove('wv-lock'); }

  /* ── overview + coming-soon sections ── */
  function sectionCards(except) {
    return `<div class="lr-grid">${SECTIONS.filter((s) => s.id !== except).map((s) => `<a class="ik-card lr-card" href="/learning/${s.id}">
      <span class="lr-ico">${s.icon}</span><strong>${T('side.' + s.id)}</strong><small>${T('learn.' + (s.id === 'plans' ? 'plansAi' : s.id === 'videos' ? 'vCard' : s.id) + 'Lead')}</small>${s.id === 'plans' ? `<span class="lr-new">✨ ${T('learn.aiBadge')}</span>` : s.id === 'videos' ? `<span class="lr-new">▶ WikiVids</span>` : `<span class="lr-soon">${T('learn.soon')}</span>`}</a>`).join('')}</div>`;
  }
  function pageSoon(s) {
    return `<header class="ik-head"><div class="ik-kicker">${T('learn.kicker')} · ${T('side.' + s.id)}</div>
        <h1>${T('learn.' + s.id + 'Title')} <span class="lr-badge">${T('learn.soon')}</span></h1>
        <p>${T('learn.' + s.id + 'Lead')}</p></header>
        ${pathBox()}
        <section class="ik-card"><h2>${T('learn.whatsComing')}</h2>
          <div class="lr-feats">${[1, 2, 3].map((n, i) => `<div class="lr-feat"><span>${s.feats[i]}</span><div><strong>${T(`learn.${s.id}F${n}t`)}</strong><small>${T(`learn.${s.id}F${n}d`)}</small></div></div>`).join('')}</div>
        </section>
        <section class="ik-card ik-center"><h2>${T('learn.meanwhileAi')}</h2>
          <div class="cta-row" style="margin-top:14px"><a class="btn-primary" href="/learning/plans">✨ ${T('learn.askBtn')} →</a></div>
        </section>
        ${sectionCards(s.id)}`;
  }

  function render(scrollToResult) {
    const s = current();
    const view = $('lrView');
    const focused = document.activeElement && document.activeElement.id === 'lrTopic';
    const draft = $('lrTopic') ? $('lrTopic').value : topicDraft;
    if (!busy) topicDraft = draft;
    if (!s) {
      document.title = T('meta.learning');
      view.innerHTML = `<header class="ik-head"><div class="ik-kicker">${T('learn.kicker')}</div><h1>${T('side.myLearning')}</h1></header>${pathBox()}${sectionCards()}`;
    } else if (s.id === 'plans') {
      document.title = `${T('side.plans')} — ${T('side.myLearning')} — Wikigai`;
      view.innerHTML = pagePlans();
      if (focused && $('lrTopic')) { const i = $('lrTopic'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
      if (scrollToResult && $('lrResult')) $('lrResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (s.id === 'videos') {
      document.title = `${T('side.videos')} — ${T('side.myLearning')} — Wikigai`;
      const vFocused = document.activeElement && document.activeElement.id === 'wvQ';
      if ($('wvQ') && !wv.busy && wv.q !== null) wv.q = $('wvQ').value;
      view.innerHTML = pageVideos();
      if (vFocused && $('wvQ')) { const i = $('wvQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
      if (path && wv.saved === null) { wv.saved = undefined; wvLoadSaved().then(() => render()); }
      if (path && wv.auto && !wv.busy) { wv.auto = false; wvSearch(); }
    } else {
      document.title = `${T('side.' + s.id)} — ${T('side.myLearning')} — Wikigai`;
      view.innerHTML = pageSoon(s);
    }
  }

  /* ── events ── */
  document.addEventListener('click', async (e) => {
    const a = e.target.closest && e.target.closest('a[href^="/learning"]');
    if (a && !e.metaKey && !e.ctrlKey && !a.target) {
      e.preventDefault();
      history_push(a.getAttribute('href'));
      return;
    }
    if (e.target.closest && e.target.closest('[data-wvclose]')) { wvClose(); return; }
    if (e.target.classList && e.target.classList.contains('wv-modal')) { wvClose(); return; }
    const play = e.target.closest && e.target.closest('[data-play]');
    if (play) { wvPlay(play.dataset.play); return; }
    const sv = e.target.closest && e.target.closest('[data-save]');
    if (sv) { wvToggleSave(sv.dataset.save); return; }
    const wtp = e.target.closest && e.target.closest('[data-wvtopic]');
    if (wtp && !wv.busy) { wv.q = wtp.dataset.wvtopic; if (wtp.dataset.wvtdom && AREAS[wtp.dataset.wvtdom]) wv.domain = wtp.dataset.wvtdom; wvSearch(); return; }
    const wm = e.target.closest && e.target.closest('[data-wvmore]');
    if (wm) { if ($('wvQ')) wv.q = $('wvQ').value; wv.open = Object.assign({}, wv.open, { [wm.dataset.wvmore]: true }); render(); return; }
    const wd = e.target.closest && e.target.closest('[data-wvdom]');
    if (wd && !wv.busy) { if ($('wvQ')) wv.q = $('wvQ').value; wv.domain = wd.dataset.wvdom; wvSearch(); return; }
    const wt = e.target.closest && e.target.closest('[data-wvtab]');
    if (wt) { if ($('wvQ')) wv.q = $('wvQ').value; wv.tab = wt.dataset.wvtab; render(); return; }
    const sug = e.target.closest && e.target.closest('[data-topic]');
    if (sug && !busy) { ask(sug.dataset.topic); return; }
    const h = e.target.closest && e.target.closest('[data-rid]');
    if (h && !busy) {
      try { research = (await api('/api/learn/research/' + h.dataset.rid)).research; topicDraft = research.topic; errMsg = ''; render(true); } catch (err) { errMsg = err.message; render(); }
      return;
    }
    const tab = e.target.closest && e.target.closest('[data-tab]');
    if (tab) {
      document.querySelectorAll('.lr-tab').forEach((t) => { const on = t === tab; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); });
      document.querySelectorAll('.lr-pane').forEach((p) => { p.hidden = p.dataset.pane !== tab.dataset.tab; });
      return;
    }
    const act = e.target.closest && e.target.closest('[data-act]');
    if (act && act.dataset.act === 'more') { showAll = true; render(); return; }
    if (act && act.dataset.act === 'redo' && research && !busy) { ask(research.topic, true); return; }
    if (act && act.dataset.act === 'print') { document.querySelectorAll('.lr-pane').forEach((p) => { p.hidden = false; }); window.print(); return; }
    const vid = e.target.closest && e.target.closest('.lr-vid');
    if (vid) window.WK?.track?.('video_search', {});
  });
  document.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'lrForm') { e.preventDefault(); if (!busy) ask($('lrTopic').value); }
    if (e.target && e.target.id === 'wvForm') { e.preventDefault(); if (!wv.busy) { wv.q = $('wvQ').value; wvSearch(); } }
  });
  function history_push(href) {
    window.history.pushState({}, '', href);
    if (/^\/learning\/videos\?/.test(href)) { wv.q = null; wv.domain = null; wv.items = null; } // a new "▶ Videos" search from Plans
    render(); window.scrollTo(0, 0);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') wvClose(); });
  window.addEventListener('popstate', () => render());

  async function load() {
    try {
      const r = (await api('/api/user/results')).results || {};
      path = buildPath(r);
    } catch (err) {
      if (err.status === 401) { Store.clear(); location.href = '/login'; return; }
      path = { domains: [], pros: [], strengths: [], s1: false };
    }
    try { const h = await api('/api/learn/research'); history = h.items || []; configured = h.configured !== false; } catch { /* optional */ }
    render();
  }

  I.ready.then(() => { render(); load(); });
  I.onChange(() => render());
})();
