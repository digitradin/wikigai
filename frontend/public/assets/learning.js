/* Wikigai — My learning (learning.html). Client-side routed:
   /learning (overview) · /learning/plans · /learning/videos · /learning/tools · /learning/schools
   Every page starts with "Your path at a glance" (top areas + key professions from My path).
   Plans (v20261026) = choose ONE profession from your path → Step 1: outlook in simple words, key
   questions to think about and the 10 key skills (each with "▶ Learn to …" → WikiVids) → Step 2: pick
   1-10 skills + 3 quick questions → 30 days (1-2 skills) / 3 months (3-5) / 1 year (6+), changeable
   before creating. Plans are saved; each can be downloaded as HTML or printed / saved as PDF.
   API: /api/plans (server: routes/plans.js + lib/llm.js — free AI providers, rotated with fail-over).
   Videos = "WikiVids": filtered YouTube search (filters hidden, server side: /api/videos/search),
   play in a privacy-enhanced player, save favourites ("My WikiVids").
   Tools / Schools are "coming soon". Plans (AI) is shown as "coming soon" while AI_SOON = true
   (v20261028b; the Plans code stays in place — set AI_SOON = false to switch it back on).
   WikiVids (v20261028b): after a search, all option rows fold to max 2 rows + "More options". Text: learn.* (i18n). */
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
  const AI_SOON = true; // AI learning plans: show as "coming soon" for now
  const SECTIONS = [
    { id: 'plans', icon: '🗺️', feats: ['🧩', '✅', '🌱'] },
    { id: 'videos', icon: '🎬', feats: ['🕘', '🎤', '🔎'] },
    { id: 'tools', icon: '🔧', feats: ['📄', '🧪', '💬'] },
    { id: 'schools', icon: '🎓', feats: ['🏛️', '🛠️', '💻'] },
  ];

  let path = null;              // summary of the user's results (null = loading)
  let configured = true;        // is the AI service set up on the server?
  /* WikiVids state */
  const wv = { q: null, domain: null, items: null, busy: false, err: '', off: false, tab: 'search', saved: null, auto: false, optsOpen: false, vlang: null };

  const current = () => { const m = location.pathname.match(/^\/learning\/(\w+)/); return SECTIONS.find((s) => s.id === (m && m[1])) || null; };

  /* ── "Your path at a glance" (shared header) ── */
  function buildPath(r) {
    const s1 = r.stage_1 || {}, s3 = r.stage_3 || {};
    // v20261028b: areas / subfields / professions deselected on Passions drop out here too
    const s2raw = r.stage_2 || {}, dp = s1.domainPrefs || {}, sp = s2raw.subPrefs || {}, ex = new Set(s2raw.excluded || []);
    const SUBS0 = S2.subfields || {};
    const activeLove = (x) => { const d = x.domain || (SUBS0[x.subfield] || {}).domain; return (!d || dp[d] !== false) && (!x.subfield || sp[x.subfield] !== false) && !ex.has(x.career); };
    const s2 = { ...s2raw, love: Array.isArray(s2raw.love) ? s2raw.love.filter(activeLove) : s2raw.love };
    if (Array.isArray(s3.top)) s3.top = s3.top.filter(activeLove);
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
    // hidden location filter for Plans: a country picked in My path, else the grading country
    const reg = s3.region || {};
    const country = (reg.mode === 'custom' && Array.isArray(reg.countries) && reg.countries[0]) || (g && g.country) || '';
    return { domains, pros, allPros, subs, proItems, kind, strengths, country: /^[A-Z]{2}$/.test(country) ? country : '', s1: !!ranked.length, s2: !!(s2.love && s2.love.length), s3: !!s3.completedAt };
  }
  function pathBox(fill) {
    const tag = (cls, text, dom, inner, style) => fill
      ? `<button type="button" class="${cls} wv-fill" data-wvfill="${esc(text)}" data-wvtdom="${esc(dom || '')}"${style || ''}>${inner}</button>`
      : `<span class="${cls}"${style || ''}>${inner}</span>`;
    if (path === null) return `<div class="lr-path loading">${T('common.loading')}</div>`;
    if (!path.s1) return `<div class="lr-path"><div class="lr-path-empty"><span>${T('learn.pathEmpty')}</span><a class="btn-primary sm" href="/dashboard">${T('learn.finishStage2')} →</a></div></div>`;
    const doms = path.domains.map((d) => { const a = area(d.key); return tag('lr-dom', C(a.name), d.key, `${a.icon} ${esc(C(a.name))} <b>${d.pct}%</b>`, ` style="--c:${a.color}"`); }).join('');
    const pros = path.pros.length
      ? path.pros.map((p, i) => tag('lr-pro' + (i === 0 ? ' top' : ''), C(p.name), null, `${i === 0 ? '🏆 ' : ''}${esc(C(p.name))} <b>${p.score}</b>`)).join('')
      : `<span class="ik-dim">${T('learn.noMatches')}</span> <a href="/dashboard">${T('learn.finishStage2')} →</a>`;
    return `<div class="lr-path">
      <div class="lr-path-h"><strong>${T('learn.pathTitle')}</strong><a href="/ikigai">${T('learn.seePath')} →</a></div>
      <div class="lr-path-row"><span class="lr-path-l">${T('learn.topAreas')}</span><div class="lr-chips">${doms}</div></div>
      <div class="lr-path-row"><span class="lr-path-l">${T(path.kind === 'match' ? 'learn.keyProsMatch' : 'learn.keyProsLove')}</span><div class="lr-chips">${pros}</div></div>
      ${path.strengths.length ? `<div class="lr-path-row"><span class="lr-path-l">${T('learn.strengths')}</span><div class="lr-chips">${path.strengths.map((k) => tag('lr-chip', C(SUBJECTS[k] || k), null, esc(C(SUBJECTS[k] || k)))).join('')}</div></div>` : ''}
    </div>`;
  }

  /* ── Plans (v20261026): choose ONE profession → Step 1 outlook (key questions + 10 skills)
        → Step 2 choose 1-10 skills + 3 quick questions + duration → detailed plan (saved).
        Hidden filters (never shown): age band (server, from the birthday), country, language. ── */
  const DUR = ['30d', '3m', '1y'];
  const recommendDur = (n) => (n <= 2 ? '30d' : n <= 5 ? '3m' : '1y');
  const ANS = { level: ['new', 'some', 'good'], goal: ['explore', 'study', 'job', 'switch', 'grow'], hours: ['1-2', '3-5', '6-10', '10+'] };
  const pl = {
    step: 'pick', profession: null, outlook: null, sel: [], duration: null, durTouched: false,
    answers: { level: 'new', goal: 'explore', hours: '3-5' }, busy: '', err: '', plan: null, saved: null, showAll: false,
  };
  const learnTo = (s) => (s.videoQuery || T('plan.learnTo', { skill: s.skill })).slice(0, 80);
  const vidHref = (s, abs) => (abs ? location.origin : '') + '/learning/videos?q=' + encodeURIComponent(learnTo(s));
  const durLabel = (d) => T('plan.dur_' + d);
  /* hidden location filter: the country the user chose in My path, else their grading country, else the browser's region */
  function userCountry() {
    const cc = path && path.country;
    if (cc) return cc;
    const m = String(navigator.language || '').match(/-([A-Za-z]{2})$/);
    return m ? m[1].toUpperCase() : '';
  }

  function steps() {
    const n = pl.step === 'pick' ? 1 : pl.step === 'outlook' ? 2 : 3;
    return `<ol class="pl-steps" aria-label="${esc(T('plan.stepsAria'))}">${[1, 2, 3].map((i) => `<li class="${i < n ? 'done' : i === n ? 'on' : ''}"${i === n ? ' aria-current="step"' : ''}><span>${i < n ? '✓' : i}</span>${T('plan.step' + i)}</li>`).join('')}</ol>`;
  }
  function busyBlock(kind) {
    return `<section class="ik-card lr-loading" aria-live="polite"><div class="lr-spinner" aria-hidden="true"></div>
      <div><strong>${T(kind === 'outlook' ? 'plan.loadingOutlook' : 'plan.loadingPlan', { p: esc(C(pl.profession || '')) })}</strong><small>${T('plan.loadingSub')}</small></div></section>`;
  }
  const errBlock = () => (pl.err ? `<p class="lr-err" role="alert">${esc(pl.err)}</p>` : '') + (!configured ? `<p class="lr-warn">${T('plan.notConfigured')}</p>` : '');

  /* Step 0: just the list of professions (from the user's path, best match first) */
  function pickView() {
    const pros = (path && path.proItems) || [];
    const FOLD = 12;
    const top = new Set((path && path.pros || []).map((p) => p.name));
    const list = pros.length
      ? `<div class="pl-pros">${pros.map((p, i) => `<button type="button" class="pl-pro${i >= FOLD && !pl.showAll ? ' lr-more-item' : ''}${i === 0 ? ' top' : ''}" data-plpro="${esc(p.name)}" ${pl.busy ? 'disabled' : ''}>
          <span class="pl-pro-ico" aria-hidden="true">${i === 0 ? '🏆' : top.has(p.name) ? '⭐' : '💼'}</span><span>${esc(C(p.name))}</span><span class="pl-go" aria-hidden="true">→</span></button>`).join('')}</div>
         ${pros.length > FOLD && !pl.showAll ? `<button type="button" class="lr-more" data-act="plmore">${T('learn.showAll', { count: pros.length - FOLD })}</button>` : ''}`
      : `<div class="lr-path-empty"><span>${T('plan.noPros')}</span><a class="btn-primary sm" href="/dashboard">${T('learn.finishStage2')} →</a></div>`;
    return `<section class="ik-card pl-pick"><h2>${T('plan.pickTitle')}</h2><p class="ik-sub">${T('plan.pickLead')}</p>${list}${errBlock()}</section>
      ${savedList()}`;
  }
  function savedList() {
    if (!pl.saved || !pl.saved.length) return '';
    return `<section class="ik-card pl-saved"><h2>📁 ${T('plan.savedTitle')}</h2>
      <ul class="pl-saved-ul">${pl.saved.map((s) => `<li><button type="button" class="pl-saved-open" data-plopen="${s.id}"><strong>${esc(C(s.profession))}</strong>
        <small>${esc(durLabel(s.duration))} · ${T('plan.nSkills', { n: (s.skills || []).length })} · ${esc(I.fmt.date(s.created_at, { day: 'numeric', month: 'short', year: 'numeric' }))}</small></button>
        <button type="button" class="pl-del" data-pldel="${s.id}" aria-label="${esc(T('plan.delete'))}" title="${esc(T('plan.delete'))}">🗑</button></li>`).join('')}</ul></section>`;
  }

  /* Step 1: outlook (simple language) + key questions + the 10 key skills; Step 2 controls below */
  function outlookView() {
    const o = pl.outlook;
    const sel = new Set(pl.sel);
    const rec = recommendDur(pl.sel.length || 1);
    const dur = pl.duration || rec;
    const chipGroup = (k) => `<div class="pl-q"><span class="pl-q-l">${T('plan.q_' + k)}</span><div class="pl-seg" role="radiogroup" aria-label="${esc(T('plan.q_' + k))}">${ANS[k].map((v) => `<button type="button" role="radio" aria-checked="${pl.answers[k] === v}" class="${pl.answers[k] === v ? 'on' : ''}" data-plans="${k}:${v}">${T('plan.a_' + k + '_' + v.replace('+', 'p').replace('-', '_'))}</button>`).join('')}</div></div>`;
    return `<div class="pl-head"><button type="button" class="ac-btn" data-act="plback">← ${T('plan.otherPro')}</button></div>
      <section class="ik-card lr-block"><div class="lr-bh"><span class="lr-bn">1</span><div><h3>${T('plan.outlookTitle', { p: esc(C(pl.profession)) })}</h3><small>${T('plan.outlookSub')}</small></div></div>
        ${o.summary ? `<p class="lr-summary">${esc(o.summary)}</p>` : ''}
        ${o.outlook ? `<p class="pl-trend">📈 ${esc(o.outlook)}</p>` : ''}
        <h4>${T('plan.questionsTitle')}</h4>
        <ol class="pl-qs">${o.questions.map((q) => `<li><strong>${esc(q.q)}</strong>${q.why ? `<small>${esc(q.why)}</small>` : ''}</li>`).join('')}</ol>
      </section>
      <section class="ik-card lr-block"><div class="lr-bh"><span class="lr-bn">2</span><div><h3>${T('plan.skillsTitle')}</h3><small>${T('plan.skillsSub')}</small></div></div>
        <div class="pl-quick"><span class="ik-dim">${T('plan.quick')}</span>
          <button type="button" class="lr-sug" data-plquick="2">${T('plan.top', { n: 2 })}</button><button type="button" class="lr-sug" data-plquick="5">${T('plan.top', { n: 5 })}</button><button type="button" class="lr-sug" data-plquick="10">${T('plan.all10')}</button><button type="button" class="lr-sug" data-plquick="0">${T('plan.none')}</button></div>
        <ol class="lr-skills pl-skills">${o.skills.map((s, i) => `<li class="${sel.has(s.skill) ? 'sel' : ''}">
          <label class="pl-check"><input type="checkbox" data-plskill="${esc(s.skill)}" ${sel.has(s.skill) ? 'checked' : ''}><span class="lr-rank">${i + 1}</span></label>
          <div class="lr-sk"><strong>${esc(s.skill)}</strong>${s.level ? ` <span class="pl-lvl ${s.level}">${T('plan.lvl_' + s.level)}</span>` : ''}${s.why ? `<small>${esc(s.why)}</small>` : ''}</div>
          <a class="lr-vid" href="${esc(vidHref(s))}" title="${esc(learnTo(s))}">▶ ${esc(T('plan.learnBtn'))}</a></li>`).join('')}</ol>
      </section>
      <section class="ik-card lr-block pl-build" id="plBuild"><div class="lr-bh"><span class="lr-bn">3</span><div><h3>${T('plan.buildTitle')}</h3><small>${T('plan.buildSub')}</small></div></div>
        <p class="pl-count">${pl.sel.length ? T('plan.selected', { n: pl.sel.length }) + ' — ' + T('plan.recommend', { d: durLabel(rec) }) : T('plan.selectFirst')}</p>
        <div class="pl-q"><span class="pl-q-l">${T('plan.durTitle')}</span><div class="pl-seg pl-dur" role="radiogroup" aria-label="${esc(T('plan.durTitle'))}">${DUR.map((d) => `<button type="button" role="radio" aria-checked="${dur === d}" class="${dur === d ? 'on' : ''}" data-pldur="${d}">${durLabel(d)}${d === rec ? ` <em>${T('plan.recShort')}</em>` : ''}</button>`).join('')}</div></div>
        <p class="ik-dim pl-3q">${T('plan.threeQ')}</p>
        ${chipGroup('level')}${chipGroup('goal')}${chipGroup('hours')}
        <div class="cta-row pl-cta"><button type="button" class="btn-primary" data-act="plcreate" ${pl.sel.length && !pl.busy ? '' : 'disabled'}>✨ ${T('plan.create', { d: durLabel(dur) })}</button></div>
        ${errBlock()}
      </section>`;
  }

  /* Step 3: the plan */
  function phaseHtml(p) {
    return `<li><span class="lr-tl-k">${esc(p.label || '')}</span><div><strong>${esc(p.title)}</strong>
      ${p.skills && p.skills.length ? `<div class="pl-tags">${p.skills.map((s) => `<span>${esc(s)}</span>`).join('')}</div>` : ''}
      ${p.goal ? `<p class="pl-goal">🎯 ${esc(p.goal)}</p>` : ''}
      ${p.actions.length ? `<ul class="lr-ul">${p.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      ${p.practice ? `<p class="pl-pr">🛠 <b>${T('plan.practice')}</b> ${esc(p.practice)}</p>` : ''}
      ${p.checkpoint ? `<p class="pl-pr">✅ <b>${T('plan.checkpoint')}</b> ${esc(p.checkpoint)}</p>` : ''}</div></li>`;
  }
  function planView() {
    const row = pl.plan, p = row.plan || {}, o = row.outlook || {};
    const chosen = new Set(row.skills || []);
    const skillsUsed = (o.skills || []).filter((s) => chosen.has(s.skill));
    return `<div class="pl-head"><button type="button" class="ac-btn" data-act="plback">← ${T('plan.otherPro')}</button>
        <div class="pl-actions"><button type="button" class="ac-btn primary" data-act="plhtml">⬇ ${T('plan.saveHtml')}</button>
        <button type="button" class="ac-btn" data-act="plprint">🖨 ${T('plan.printPdf')}</button>
        <button type="button" class="ac-btn" data-act="pledit">✎ ${T('plan.change')}</button></div></div>
      <div class="lr-result" id="lrResult">
      <div class="lr-result-h"><h2>${esc(p.title || C(row.profession))}</h2><span class="ik-dim">${esc(C(row.profession))} · ${esc(durLabel(row.duration))}${p.weeklyHours ? ' · ⏱ ' + esc(p.weeklyHours) : ''} · ${esc(I.fmt.date(row.created_at, { day: 'numeric', month: 'long', year: 'numeric' }))}</span></div>
      ${p.intro ? `<p class="lr-summary">${esc(p.intro)}</p>` : ''}
      <section class="ik-card lr-block"><div class="lr-bh"><span class="lr-bn">✓</span><div><h3>${T('plan.yourSkills')}</h3><small>${T('plan.yourSkillsSub')}</small></div></div>
        <ol class="lr-skills">${skillsUsed.map((s) => `<li><span class="lr-rank">${(o.skills || []).indexOf(s) + 1}</span><div class="lr-sk"><strong>${esc(s.skill)}</strong>${s.why ? `<small>${esc(s.why)}</small>` : ''}</div><a class="lr-vid" href="${esc(vidHref(s))}">▶ ${esc(T('plan.learnBtn'))}</a></li>`).join('')}</ol></section>
      <section class="ik-card lr-block"><div class="lr-bh"><span class="lr-bn">🗺️</span><div><h3>${T('plan.planTitle', { d: esc(durLabel(row.duration)) })}</h3><small>${T('plan.planSub')}</small></div></div>
        <ol class="lr-tl pl-tl">${(p.phases || []).map(phaseHtml).join('')}</ol></section>
      ${p.routine && p.routine.length ? `<section class="ik-card lr-block"><h3>🔁 ${T('plan.routine')}</h3><ul class="lr-ul">${p.routine.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
      ${p.finalProject ? `<section class="ik-card lr-block"><h3>🏁 ${T('plan.final')}</h3><p>${esc(p.finalProject)}</p></section>` : ''}
      ${p.nextSteps && p.nextSteps.length ? `<section class="ik-card lr-block"><h3>➡️ ${T('plan.next')}</h3><ul class="lr-ul">${p.nextSteps.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
      <details class="ik-card pl-more"><summary>${T('plan.outlookAgain')}</summary>
        ${o.summary ? `<p>${esc(o.summary)}</p>` : ''}${o.outlook ? `<p>📈 ${esc(o.outlook)}</p>` : ''}
        <ol class="pl-qs">${(o.questions || []).map((q) => `<li><strong>${esc(q.q)}</strong>${q.why ? `<small>${esc(q.why)}</small>` : ''}</li>`).join('')}</ol></details>
      <p class="ik-dim lr-disclaimer">${T('learn.disclaimer')}</p></div>`;
  }

  function pagePlans() {
    let body;
    if (pl.busy) body = busyBlock(pl.busy);
    else if (pl.step === 'outlook' && pl.outlook) body = outlookView();
    else if (pl.step === 'plan' && pl.plan) body = planView();
    else body = path === null ? `<p class="ik-dim">${T('common.loading')}</p>` : pickView();
    return `<header class="ik-head"><div class="ik-kicker">${T('learn.kicker')} · ${T('side.plans')}</div>
      <h1>${T('plan.title')}</h1><p>${T('plan.lead')}</p></header>${steps()}${body}`;
  }

  async function plOutlook(profession, force) {
    pl.profession = profession; pl.busy = 'outlook'; pl.err = ''; pl.step = 'outlook'; render(); window.scrollTo(0, 0);
    try {
      const r = await api('/api/plans/outlook', { method: 'POST', body: { profession, lang: I.lang, country: userCountry(), force: !!force } });
      pl.outlook = r.outlook; pl.sel = r.outlook.skills.slice(0, 2).map((s) => s.skill); pl.duration = null; pl.durTouched = false;
      window.WK?.track?.('plan_outlook', { cached: !!r.cached });
    } catch (err) {
      if (err.code === 'AI_UNAVAILABLE') configured = false;
      pl.err = err.code === 'AI_UNAVAILABLE' ? '' : err.message; pl.step = 'pick';
    }
    pl.busy = ''; render();
  }
  async function plCreate() {
    if (!pl.sel.length || pl.busy) return;
    const order = pl.outlook.skills.map((s) => s.skill).filter((s) => pl.sel.includes(s)); // keep priority order
    const duration = pl.duration || recommendDur(order.length);
    pl.busy = 'plan'; pl.err = ''; render(); window.scrollTo(0, 0);
    try {
      const r = await api('/api/plans', { method: 'POST', body: { profession: pl.profession, lang: I.lang, country: userCountry(), skills: order, duration, answers: pl.answers, outlook: pl.outlook } });
      pl.plan = r.plan; pl.step = 'plan';
      pl.saved = [{ id: r.plan.id, profession: r.plan.profession, duration: r.plan.duration, skills: r.plan.skills, created_at: r.plan.created_at }, ...(pl.saved || [])];
      window.WK?.track?.('plan_create', { duration, skills: order.length });
    } catch (err) {
      if (err.code === 'AI_UNAVAILABLE') configured = false;
      pl.err = err.code === 'AI_UNAVAILABLE' ? '' : err.message;
    }
    pl.busy = ''; render();
    if (pl.step === 'outlook' && $('plBuild')) $('plBuild').scrollIntoView({ block: 'start' });
  }
  async function plOpen(id) {
    try { pl.plan = (await api('/api/plans/' + id)).plan; pl.profession = pl.plan.profession; pl.outlook = pl.plan.outlook; pl.step = 'plan'; pl.err = ''; }
    catch (err) { pl.err = err.message; }
    render(); window.scrollTo(0, 0);
  }
  async function plDelete(id) {
    if (!window.confirm(T('plan.deleteConfirm'))) return;
    try { await api('/api/plans/' + id + '/delete', { method: 'POST' }); pl.saved = (pl.saved || []).filter((s) => s.id !== id); if (pl.plan && pl.plan.id === id) { pl.plan = null; pl.step = 'pick'; } }
    catch (err) { pl.err = err.message; }
    render();
  }

  /* ── stand-alone HTML of a plan (download / print / save as PDF) ── */
  function planDocument(row) {
    const p = row.plan || {}, o = row.outlook || {};
    const chosen = new Set(row.skills || []);
    const title = p.title || C(row.profession);
    const li = (a) => a.map((x) => `<li>${esc(x)}</li>`).join('');
    const skills = (o.skills || []).map((s, i) => `<li class="${chosen.has(s.skill) ? 'on' : ''}"><b>${i + 1}. ${esc(s.skill)}</b>${chosen.has(s.skill) ? ` <span class="tag">${esc(T('plan.inPlan'))}</span>` : ''}${s.why ? `<br><span class="muted">${esc(s.why)}</span>` : ''}<br><a href="${esc(vidHref(s, true))}">▶ ${esc(learnTo(s))}</a></li>`).join('');
    const phases = (p.phases || []).map((x) => `<div class="ph"><div class="ph-k">${esc(x.label || '')}</div><div><h3>${esc(x.title)}</h3>
      ${x.skills && x.skills.length ? `<p class="muted">${esc(x.skills.join(' · '))}</p>` : ''}${x.goal ? `<p>🎯 ${esc(x.goal)}</p>` : ''}
      ${x.actions.length ? `<ul>${li(x.actions)}</ul>` : ''}${x.practice ? `<p>🛠 <b>${esc(T('plan.practice'))}</b> ${esc(x.practice)}</p>` : ''}${x.checkpoint ? `<p>✅ <b>${esc(T('plan.checkpoint'))}</b> ${esc(x.checkpoint)}</p>` : ''}</div></div>`).join('');
    return `<!DOCTYPE html><html lang="${esc(I.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Wikigai</title><style>
:root{--ink:#1d1630;--muted:#5d5873;--line:#e4def0;--acc:#8a2be2;--acc2:#e8590c}
*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--ink);font:15px/1.55 Inter,-apple-system,Segoe UI,Roboto,sans-serif}
.w{max-width:820px;margin:0 auto;padding:32px 24px 48px}
.brand{font-weight:800;color:var(--acc);letter-spacing:.3px}h1{font-size:28px;line-height:1.2;margin:6px 0 4px}h2{font-size:19px;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--line)}h3{font-size:16px;margin:0 0 4px}
.meta,.muted{color:var(--muted);font-size:13px}p{margin:6px 0}ul,ol{margin:6px 0 6px 20px;padding:0}li{margin:3px 0}
.box{border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:10px 0;background:#faf8fe}
.sk{list-style:none;margin:0;padding:0}.sk li{padding:8px 0;border-bottom:1px solid var(--line)}.sk li.on b{color:var(--acc)}
.tag{display:inline-block;font-size:11px;font-weight:700;color:#fff;background:var(--acc);border-radius:10px;padding:1px 8px}
.ph{display:grid;grid-template-columns:110px 1fr;gap:14px;padding:12px 0;border-bottom:1px solid var(--line);break-inside:avoid}.ph-k{font-weight:800;color:var(--acc2);font-size:13px}
a{color:var(--acc)}.foot{margin-top:28px;font-size:12px;color:var(--muted)}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.bar button{font:600 13px inherit;border:1px solid var(--line);background:#fff;border-radius:18px;padding:7px 14px;cursor:pointer}
@media print{.bar{display:none}.w{padding:0}a{color:var(--ink);text-decoration:none}h2{break-after:avoid}}
@media (max-width:560px){.ph{grid-template-columns:1fr;gap:4px}}
</style></head><body><div class="w">
<div class="brand">Wikigai · ${esc(T('side.plans'))}</div>
<h1>${esc(title)}</h1>
<div class="meta">${esc(C(row.profession))} · ${esc(durLabel(row.duration))}${p.weeklyHours ? ' · ' + esc(p.weeklyHours) : ''} · ${esc(I.fmt.date(row.created_at, { day: 'numeric', month: 'long', year: 'numeric' }))}</div>
<div class="bar"><button onclick="window.print()">🖨 ${esc(T('plan.printPdf'))}</button></div>
${p.intro ? `<p>${esc(p.intro)}</p>` : ''}
<h2>1 · ${esc(T('plan.outlookTitle', { p: C(row.profession) }))}</h2>
${o.summary ? `<p>${esc(o.summary)}</p>` : ''}${o.outlook ? `<p>📈 ${esc(o.outlook)}</p>` : ''}
<div class="box"><b>${esc(T('plan.questionsTitle'))}</b><ol>${(o.questions || []).map((q) => `<li><b>${esc(q.q)}</b>${q.why ? `<br><span class="muted">${esc(q.why)}</span>` : ''}</li>`).join('')}</ol></div>
<h2>2 · ${esc(T('plan.skillsTitle'))}</h2><ol class="sk">${skills}</ol>
<h2>3 · ${esc(T('plan.planTitle', { d: durLabel(row.duration) }))}</h2>${phases}
${p.routine && p.routine.length ? `<h2>🔁 ${esc(T('plan.routine'))}</h2><ul>${li(p.routine)}</ul>` : ''}
${p.finalProject ? `<h2>🏁 ${esc(T('plan.final'))}</h2><p>${esc(p.finalProject)}</p>` : ''}
${p.nextSteps && p.nextSteps.length ? `<h2>➡️ ${esc(T('plan.next'))}</h2><ul>${li(p.nextSteps)}</ul>` : ''}
<p class="foot">${esc(T('plan.footer'))} · ${esc(location.origin)}</p>
</div></body></html>`;
  }
  const fileName = (row) => ('Wikigai-plan-' + C(row.profession) + '-' + row.duration).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '-').replace(/-+/g, '-') + '.html';
  function plDownload() {
    const row = pl.plan; if (!row) return;
    const blob = new Blob([planDocument(row)], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fileName(row);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    window.WK?.track?.('plan_download', {});
  }
  /* print the clean stand-alone page (the browser's print window also offers "Save as PDF") */
  function plPrint() {
    const row = pl.plan; if (!row) return;
    let f = $('plPrintFrame');
    if (f) f.remove();
    f = document.createElement('iframe');
    f.id = 'plPrintFrame'; f.title = 'print'; f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const d = f.contentWindow.document; d.open(); d.write(planDocument(row)); d.close();
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { window.print(); } }, 250);
    window.WK?.track?.('plan_print', {});
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
  /* a chip was tapped: put its words in the search field (and pick its area); the user can edit, then Search */
  function wvFill(text, dom) {
    if (curVLang() === 'en') text = wvTranslateQuery(text, 'en') || text; // English search → English words
    wv.hint = '';
    wv.q = String(text || '').slice(0, 80);
    if ($('wvQ')) $('wvQ').value = wv.q;
    if (dom && AREAS[dom]) wv.domain = dom;
    wv.err = '';
    if (wv.busy) return; // the field is locked during a search; the words are kept for the next one
    render();
    const i = $('wvQ');
    if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); i.classList.add('wv-flash'); setTimeout(() => i.classList.remove('wv-flash'), 700); }
  }
  /* v20261028b: two search buttons — English + the page language (one button when the page is in English) */
  const vLangs = () => (I.lang && I.lang !== 'en' ? ['en', I.lang] : ['en']);
  const curVLang = () => (wv.vlang && vLangs().includes(wv.vlang) ? wv.vlang : vLangs()[vLangs().length - 1]);
  const langName = (l) => { try { return new Intl.DisplayNames([I.lang || 'en'], { type: 'language' }).of(l); } catch { return l.toUpperCase(); } };
  /* the same topic in English / in the page language: every chip on this page (areas, subfields, professions)
     comes from an English name, so we can swap the words when the search language changes.
     Returns null when the words are not one of those topics (then switching to EN clears the field). */
  function wvTranslateQuery(text, to) {
    const t = String(text || '').trim().toLowerCase();
    if (!t) return null;
    const names = [...vDomains().map((k) => area(k).name), ...((path && path.subs) || []).map((x) => x.name),
      ...((path && path.proItems) || []).map((x) => x.name), ...((path && path.pros) || []).map((x) => x.name)].filter(Boolean);
    for (const en of names) {
      if (String(en).toLowerCase() === t || String(C(en)).toLowerCase() === t) return to === 'en' ? en : C(en);
    }
    return null;
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
    // once a search ran (or My WikiVids is open), fold every option row to max 2 rows so the videos are easy to see
    const compact = wv.busy || wv.items !== null || wv.tab === 'saved';
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
      ${pathBox(true)}
      <section class="ik-card wv-box">
        <form id="wvForm" class="lr-inputrow wv-form" autocomplete="off" role="search">
          <input id="wvQ" maxlength="80" value="${esc(wv.q || '')}" placeholder="${esc(T('learn.vPh'))}" aria-label="${esc(T('learn.vPh'))}" ${wv.busy ? 'disabled' : ''}>
          <div class="wv-langbtns">${vLangs().map((l) => `<button class="${l === curVLang() ? 'btn-primary' : 'btn-ghost'} wv-lbtn${l === 'en' ? ' wv-lbtn-en' : ''}" type="submit" data-vlang="${l}" title="${esc(T('learn.vSearchIn', { lang: langName(l) }))}" aria-label="${esc(T('learn.vSearchIn', { lang: langName(l) }))}" ${wv.busy ? 'disabled' : ''}>🔎 ${l.toUpperCase()}${l === 'en' ? ' 🔥' : ''}</button>`).join('')}</div>
        </form>
        <div id="wvOpts" class="wv-opts${compact ? ' wv-compact' : ''}${compact && wv.optsOpen ? ' open' : ''}">
        ${doms.length ? `<div class="lr-suggest wv-row"><span class="ik-dim">${T('learn.vDomain')}</span>${doms.map((k) => `<button type="button" class="lr-sug wv-dom${k === wv.domain ? ' on' : ''}" data-wvdom="${k}" data-wvfill="${esc(C(area(k).name))}" data-wvtdom="${k}" aria-pressed="${k === wv.domain}">${area(k).icon} ${esc(C(area(k).name))}</button>`).join('')}</div>` : ''}
        ${topicRow('subs', T('learn.vSubfields'), (path && path.subs) || [])}
        ${topicRow('pros', T('learn.vProfessions'), (path && path.proItems) || [])}
        </div>
        ${compact ? `<button type="button" class="lr-more wv-optmore" data-wvopts aria-controls="wvOpts" aria-expanded="${!!wv.optsOpen}" hidden>${wv.optsOpen ? T('learn.vLessOpts') : T('learn.vMoreOpts')}</button>` : ''}
        ${wv.off ? `<p class="lr-warn">${T('learn.vNotConfigured')}</p>` : ''}
        ${wv.err ? `<p class="lr-err" role="alert">${esc(wv.err)}</p>` : ''}
        ${wv.hint ? `<p class="lr-warn" role="status">${esc(wv.hint)}</p>` : ''}
      </section>
      <div class="lr-tabs wv-tabs" role="tablist">
        <button role="tab" class="lr-tab${wv.tab === 'search' ? ' on' : ''}" data-wvtab="search" aria-selected="${wv.tab === 'search'}">${T('learn.vTabResults')}</button>
        <button role="tab" class="lr-tab${wv.tab === 'saved' ? ' on' : ''}" data-wvtab="saved" aria-selected="${wv.tab === 'saved'}">★ ${T('learn.vTabSaved')}${nSaved ? ` (${nSaved})` : ''}</button>
      </div>
      <div id="wvBody">${body}</div>`;
  }
  /* topic suggestions: every subfield and profession from the user's path — one tap fills the words */
  const FOLDV = Infinity; // show every subfield and profession
  function topicRow(kind, label, list) {
    if (!list.length) return '';
    const cur = String(wv.q || '').trim().toLowerCase();
    const open = wv.open && wv.open[kind];
    const chips = list.map((t, i) => {
      const name = C(t.name);
      const on = name.toLowerCase() === cur;
      return `<button type="button" class="lr-sug wv-topic${on ? ' on' : ''}${i >= FOLDV && !open ? ' lr-more-item' : ''}" data-wvfill="${esc(name)}" data-wvtdom="${esc(t.domain || '')}" aria-pressed="${on}">${kind === 'subs' ? (area(t.domain).icon || '•') : '💼'} ${esc(name)}</button>`;
    }).join('');
    const more = list.length > FOLDV && !open ? `<button type="button" class="lr-more" data-wvmore="${kind}">${T('learn.showAll', { count: list.length - FOLDV })}</button>` : '';
    return `<div class="lr-suggest wv-row"><span class="ik-dim">${label}</span>${chips}${more}</div>`;
  }
  /* folded options: keep only the first 2 visual rows of chips; show "More options" only if something is hidden */
  function wvFitOpts() {
    const box = $('wvOpts'), btn = document.querySelector('[data-wvopts]');
    if (!box || !btn) return;
    box.style.maxHeight = '';
    if (!box.classList.contains('wv-compact')) { btn.hidden = true; return; }
    if (wv.optsOpen) { btn.hidden = false; return; }
    const top = box.getBoundingClientRect().top;
    const els = [...box.querySelectorAll('button')].filter((el) => el.offsetParent !== null);
    const rows = [];
    els.forEach((el) => {
      const r = el.getBoundingClientRect(), t = r.top - top, b = r.bottom - top;
      const row = rows.find((x) => t < x.b - 4 && b > x.t + 4);
      if (row) { row.t = Math.min(row.t, t); row.b = Math.max(row.b, b); } else rows.push({ t, b });
    });
    rows.sort((a, b) => a.t - b.t);
    if (rows.length <= 2) { btn.hidden = true; return; }
    box.style.maxHeight = Math.ceil(rows[1].b + 2) + 'px';
    btn.hidden = false;
  }
  window.addEventListener('resize', () => { if ($('wvOpts')) wvFitOpts(); });
  /* after a search the user started: bring the videos into view if they are below the screen */
  function wvShowResults() {
    const g = $('wvBody');
    if (!g) return;
    const r = g.getBoundingClientRect();
    if (r.top > window.innerHeight - 160) window.scrollBy({ top: r.top - 90, behavior: 'smooth' });
  }
  async function wvSearch(user) {
    const q = String(wv.q || '').trim();
    if (q.length < 2) { wv.err = T('errors.BAD_QUERY'); render(); return; }
    wv.busy = true; wv.err = ''; wv.hint = ''; wv.tab = 'search'; wv.optsOpen = false; render();
    try {
      const r = await api(`/api/videos/search?q=${encodeURIComponent(q)}&domain=${encodeURIComponent(wv.domain || '')}&lang=${curVLang()}`);
      wv.items = r.items || []; wv.off = false;
      window.WK?.track?.('video_search', { cached: !!r.cached });
    } catch (err) {
      if (err.code === 'VIDEOS_UNAVAILABLE') { wv.off = true; wv.err = ''; } else wv.err = err.message;
      wv.items = wv.items || null;
    }
    wv.busy = false; render();
    if (user && wv.items && wv.items.length) wvShowResults();
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
      <div class="wv-frame"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1&origin=${encodeURIComponent(location.origin)}" title="${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div></div>`;
    m.hidden = false; document.body.classList.add('wv-lock');
    m.querySelector('.wv-x').focus();
    window.WK?.track?.('video_play', {});
  }
  function wvClose() { const m = $('wvModal'); if (m) { m.hidden = true; m.innerHTML = ''; } document.body.classList.remove('wv-lock'); }

  /* ── overview + coming-soon sections ── */
  function sectionCards(except) {
    return `<div class="lr-grid">${SECTIONS.filter((s) => s.id !== except).map((s) => `<a class="ik-card lr-card" href="/learning/${s.id}">
      <span class="lr-ico">${s.icon}</span><strong>${T('side.' + s.id)}</strong><small>${T('learn.' + (s.id === 'plans' ? 'plansAi' : s.id === 'videos' ? 'vCard' : s.id) + 'Lead')}</small>${s.id === 'plans' ? (AI_SOON ? `<span class="lr-soon">✨ ${T('learn.aiBadge')} · ${T('learn.soon')}</span>` : `<span class="lr-new">✨ ${T('learn.aiBadge')}</span>`) : s.id === 'videos' ? `<span class="lr-new">▶ WikiVids</span>` : `<span class="lr-soon">${T('learn.soon')}</span>`}</a>`).join('')}</div>`;
  }
  function pageSoon(s) {
    return `<header class="ik-head"><div class="ik-kicker">${T('learn.kicker')} · ${T('side.' + s.id)}</div>
        <h1>${T('learn.' + s.id + 'Title')} <span class="lr-badge">${s.id === 'plans' ? '✨ ' + T('learn.aiBadge') + ' · ' : ''}${T('learn.soon')}</span></h1>
        <p>${T('learn.' + s.id + 'Lead')}</p>${s.id === 'plans' ? `<p class="lr-soon-note">${T('learn.plansSoonNote')}</p>` : ''}</header>
        ${pathBox()}
        <section class="ik-card"><h2>${T('learn.whatsComing')}</h2>
          <div class="lr-feats">${[1, 2, 3].map((n, i) => `<div class="lr-feat"><span>${s.feats[i]}</span><div><strong>${T(`learn.${s.id}F${n}t`)}</strong><small>${T(`learn.${s.id}F${n}d`)}</small></div></div>`).join('')}</div>
        </section>
        <section class="ik-card ik-center"><h2>${AI_SOON ? T('learn.meanwhileVids') : T('learn.meanwhileAi')}</h2>
          <div class="cta-row" style="margin-top:14px">${AI_SOON ? `<a class="btn-primary" href="/learning/videos">▶ ${T('learn.vidsBtn')} →</a>` : `<a class="btn-primary" href="/learning/plans">✨ ${T('learn.askBtn')} →</a>`}</div>
        </section>
        ${sectionCards(s.id)}`;
  }

  function render() {
    const s = current();
    const view = $('lrView');
    if (!s) {
      document.title = T('meta.learning');
      view.innerHTML = `<header class="ik-head"><div class="ik-kicker">${T('learn.kicker')}</div><h1>${T('side.myLearning')}</h1></header>${pathBox()}${sectionCards()}`;
    } else if (s.id === 'plans' && AI_SOON) {
      document.title = `${T('side.plans')} — ${T('side.myLearning')} — Wikigai`;
      view.innerHTML = pageSoon(s);
    } else if (s.id === 'plans') {
      document.title = `${T('side.plans')} — ${T('side.myLearning')} — Wikigai`;
      view.innerHTML = pagePlans();
      if (path && pl.saved === null) { pl.saved = undefined; api('/api/plans').then((r) => { pl.saved = r.items || []; configured = r.configured !== false; render(); }).catch(() => { pl.saved = []; }); }
    } else if (s.id === 'videos') {
      document.title = `${T('side.videos')} — ${T('side.myLearning')} — Wikigai`;
      const vFocused = document.activeElement && document.activeElement.id === 'wvQ';
      if ($('wvQ') && !wv.busy && wv.q !== null) wv.q = $('wvQ').value;
      view.innerHTML = pageVideos();
      wvFitOpts();
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
    const vl = e.target.closest && e.target.closest('[data-vlang]');
    if (vl && !wv.busy) { // which language button was clicked (Enter keeps the current one); the form submit follows
      const to = vl.dataset.vlang, from = curVLang();
      if (to !== from) {
        const cur = $('wvQ') ? $('wvQ').value : (wv.q || '');
        const swapped = wvTranslateQuery(cur, to);
        wv.vlang = to;
        if (swapped) { wv.q = swapped; if ($('wvQ')) $('wvQ').value = swapped; }
        else if (to === 'en' && cur.trim()) {
          // no English version of these words: empty the field so the user picks an English topic or types one
          e.preventDefault();
          wv.q = ''; if ($('wvQ')) $('wvQ').value = ''; wv.err = ''; wv.hint = T('learn.vPickEn'); render();
          const i = $('wvQ'); if (i) i.focus();
          return;
        }
      }
    }
    if (e.target.closest && e.target.closest('[data-wvclose]')) { wvClose(); return; }
    if (e.target.classList && e.target.classList.contains('wv-modal')) { wvClose(); return; }
    const play = e.target.closest && e.target.closest('[data-play]');
    if (play) { wvPlay(play.dataset.play); return; }
    const sv = e.target.closest && e.target.closest('[data-save]');
    if (sv) { wvToggleSave(sv.dataset.save); return; }
    const wf = e.target.closest && e.target.closest('[data-wvfill]');
    if (wf) { wvFill(wf.dataset.wvfill, wf.dataset.wvtdom); return; }
    const wm = e.target.closest && e.target.closest('[data-wvmore]');
    if (wm) { if ($('wvQ')) wv.q = $('wvQ').value; wv.open = Object.assign({}, wv.open, { [wm.dataset.wvmore]: true }); render(); return; }
    const wo = e.target.closest && e.target.closest('[data-wvopts]');
    if (wo) {
      if ($('wvQ')) wv.q = $('wvQ').value; wv.optsOpen = !wv.optsOpen; render();
      if (!wv.optsOpen) { const bx = document.querySelector('.wv-box'); if (bx && bx.getBoundingClientRect().top < 0) bx.scrollIntoView({ block: 'start' }); }
      return;
    }
    const wt = e.target.closest && e.target.closest('[data-wvtab]');
    if (wt) { if ($('wvQ')) wv.q = $('wvQ').value; wv.tab = wt.dataset.wvtab; render(); return; }
    /* Plans */
    const pro = e.target.closest && e.target.closest('[data-plpro]');
    if (pro && !pl.busy) { plOutlook(pro.dataset.plpro); return; }
    const po = e.target.closest && e.target.closest('[data-plopen]');
    if (po && !pl.busy) { plOpen(po.dataset.plopen); return; }
    const pd = e.target.closest && e.target.closest('[data-pldel]');
    if (pd && !pl.busy) { plDelete(pd.dataset.pldel); return; }
    const pq = e.target.closest && e.target.closest('[data-plquick]');
    if (pq && pl.outlook) { pl.sel = pl.outlook.skills.slice(0, +pq.dataset.plquick).map((x) => x.skill); if (!pl.durTouched) pl.duration = null; render(); return; }
    const pdur = e.target.closest && e.target.closest('[data-pldur]');
    if (pdur) { pl.duration = pdur.dataset.pldur; pl.durTouched = true; render(); return; }
    const pa = e.target.closest && e.target.closest('[data-plans]');
    if (pa) { const [k, v] = pa.dataset.plans.split(':'); pl.answers[k] = v; render(); return; }
    const tab = e.target.closest && e.target.closest('[data-tab]');
    if (tab) {
      document.querySelectorAll('.lr-tab').forEach((t) => { const on = t === tab; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); });
      document.querySelectorAll('.lr-pane').forEach((p) => { p.hidden = p.dataset.pane !== tab.dataset.tab; });
      return;
    }
    const act = e.target.closest && e.target.closest('[data-act]');
    if (act && act.dataset.act === 'plmore') { pl.showAll = true; render(); return; }
    if (act && act.dataset.act === 'plback') { pl.step = 'pick'; pl.err = ''; render(); window.scrollTo(0, 0); return; }
    if (act && act.dataset.act === 'plcreate') { plCreate(); return; }
    if (act && act.dataset.act === 'plhtml') { plDownload(); return; }
    if (act && act.dataset.act === 'plprint') { plPrint(); return; }
    if (act && act.dataset.act === 'pledit' && pl.plan) { pl.outlook = pl.plan.outlook; pl.profession = pl.plan.profession; pl.sel = (pl.plan.skills || []).slice(); pl.duration = pl.plan.duration; pl.durTouched = true; pl.answers = Object.assign({}, pl.answers, pl.plan.answers || {}); pl.step = 'outlook'; render(); window.scrollTo(0, 0); return; }
    const vid = e.target.closest && e.target.closest('.lr-vid');
    if (vid) window.WK?.track?.('video_search', {});
  });
  document.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'wvForm') { e.preventDefault(); if (!wv.busy) { wv.q = $('wvQ').value; wvSearch(true); } }
  });
  function history_push(href) {
    window.history.pushState({}, '', href);
    if (/^\/learning\/videos\?/.test(href)) { wv.q = null; wv.domain = null; wv.items = null; } // a new "▶ Videos" search from Plans
    render(); window.scrollTo(0, 0);
  }
  document.addEventListener('change', (e) => {
    const cb = e.target && e.target.dataset && e.target.dataset.plskill;
    if (cb == null || !pl.outlook) return;
    const set = new Set(pl.sel);
    if (e.target.checked) set.add(cb); else set.delete(cb);
    pl.sel = pl.outlook.skills.map((x) => x.skill).filter((x) => set.has(x));
    if (!pl.durTouched) pl.duration = null; // follow the recommendation until the user picks a duration
    render();
  });
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
    render();
  }

  I.ready.then(() => { render(); load(); });
  I.onChange(() => render());
})();
