/* ============================================================
   Wikigai — "Your Wikigai" hub (ikigai.html)
   Menu pages:
     /ikigai          My Wikigai — match = Love × Good at, C/D as info
     /ikigai/love     ❤️ What I love      (key)  Stage 1 + Stage 2
     /ikigai/skills   💪 What I'm good at (key)  last year's grades
     /ikigai/needs    🌍 What the world needs (info) 2025–35 outlook
     /ikigai/pay      💰 What pays (info)        official pay bands
   Saves to /api/user/results stage 3: grades, region, refresh, top.
   ============================================================ */
(function () {
  'use strict';
  const S2 = window.STAGE_DATA_2B || {};
  const CFG = S2.config || {};
  const CAREERS = S2.careers || [];
  const SUBS = S2.subfields || {};
  const AREAS = window.STAGE_DATA?.areas || {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const area = (k) => AREAS[k] || { name: k, icon: '•', color: '#94a3b8' };
  const careerOf = (name) => CAREERS.find((c) => c.career === name) || {};

  /* ── i18n ── */
  const I = window.WK.i18n;
  const T = (k, v) => I.t(k, v);
  const C = (s) => I.tc(s);                      // content (domains, subfields, professions…)
  const areaName = (k) => C(area(k).name);
  const subName = (k) => C(SUBS[k]?.name || k);
  const subjName = (k) => C(SUBJECTS[k] || k);

  /* ── reference data (labels come from the dictionary: hub.countries / hub.grading) ── */
  const COUNTRIES = [
    { code: 'US', flag: '🇺🇸', market: 'US', grading: 'US_GPA' },
    { code: 'ES', flag: '🇪🇸', market: 'EU', grading: 'ES' },
    { code: 'UK', flag: '🇬🇧', market: 'EU', grading: 'UK_GCSE' },
    { code: 'DE', flag: '🇩🇪', market: 'EU', grading: 'DE' },
    { code: 'FR', flag: '🇫🇷', market: 'EU', grading: 'FR' },
    { code: 'IT', flag: '🇮🇹', market: 'EU', grading: 'IT' },
    { code: 'PT', flag: '🇵🇹', market: 'EU', grading: 'PT' },
    { code: 'NL', flag: '🇳🇱', market: 'EU', grading: 'NL' },
    { code: 'IE', flag: '🇮🇪', market: 'EU', grading: 'PCT' },
    { code: 'EU', flag: '🇪🇺', market: 'EU', grading: 'OTHER' },
  ];
  const countryName = (code) => T('hub.countries.' + code);
  const GRADING = {
    ES: { worst: 0, best: 10 },
    FR: { worst: 0, best: 20 },
    DE: { worst: 6, best: 1 },
    IT: { worst: 1, best: 10 },
    PT: { worst: 0, best: 20 },
    NL: { worst: 1, best: 10 },
    UK_GCSE: { worst: 1, best: 9 },
    UK_ALEVEL: { worst: 1, best: 6 },
    US_GPA: { worst: 0, best: 4 },
    PCT: { worst: 0, best: 100 },
    IB: { worst: 1, best: 7 },
    OTHER: { worst: 0, best: 100 },
  };
  const gradingLabel = (k) => T('hub.grading.' + k);
  const gradingHint = (k) => T('hub.grading.' + k + 'h');
  const SUBJECTS = CFG.subjectClusters || {};
  const TREND = {
    UP: { cls: 'up', short: 'upShort' },
    STABLE: { cls: 'stable', short: 'stableShort' },
    UNCERTAIN: { cls: 'unc', short: 'uncertainShort' },
    DOWN: { cls: 'down', short: 'downShort' },
  };
  const trendLabel = (k) => T('trend.' + k);
  const US_MEDIAN = CFG.usNationalMedian2025 || 50980;
  const LG = { love: 0.6, good: 0.4 }; // match = love^0.6 × goodAt^0.4

  /* ── state ── */
  let results = {};
  let st = { region: { mode: 'blend', countries: [] }, grades: { system: 'ES', worst: 0, best: 10, values: {} }, gradesSkipped: false, refresh: { optIn: false } };
  let ui = { domain: 'ALL', sort: 'match', exploreDomain: 'MINE', trendFilter: 'ALL' };
  const params = new URLSearchParams(location.search);
  const flow = params.get('flow') === '1';

  /* ── scoring ── */
  function gradePct(v, g) {
    if (v === '' || v == null || isNaN(Number(v))) return null;
    const span = g.best - g.worst;
    if (!span) return null;
    return clamp(((Number(v) - g.worst) / span) * 100, 0, 100);
  }
  function profile() {
    if (st.gradesSkipped) return null;
    const pct = {};
    Object.keys(SUBJECTS).forEach((k) => { const p = gradePct(st.grades?.values?.[k], st.grades || {}); if (p != null) pct[k] = p; });
    const vals = Object.values(pct);
    if (!vals.length) return null;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    return { pct, mean, sd, n: vals.length };
  }
  function goodAt(subfield, prof) {
    if (!prof) return null;
    const w = (CFG.subjectWeights || {})[subfield] || {};
    let tot = 0, ws = 0;
    Object.keys(w).forEach((k) => { if (prof.pct[k] != null) { tot += w[k] * prof.pct[k]; ws += w[k]; } });
    const abs = ws ? tot / ws : prof.mean;
    const rel = clamp(50 + 25 * (abs - prof.mean) / Math.max(prof.sd, 5), 0, 100);
    return Math.round(0.5 * abs + 0.5 * rel);
  }
  function market() {
    if (st.region.mode === 'blend' || !st.region.countries.length) return { us: true, eu: true };
    const ms = st.region.countries.map((c) => (COUNTRIES.find((x) => x.code === c) || {}).market);
    return { us: ms.includes('US'), eu: ms.includes('EU') };
  }
  function payScore(c) {
    const sc = CFG.scores?.pay || { HIGH: 90, MID: 55, LOW: 20, VAR: 45 };
    const eu = sc[c.euPayBand] ?? 45;
    const us = c.usMedianPay2025 ? clamp(20 + 40 * Math.log2(c.usMedianPay2025 / US_MEDIAN), 5, 100) : eu;
    const m = market();
    return Math.round(m.us && m.eu ? (us + eu) / 2 : m.us ? us : eu);
  }
  function payBand(c) {
    const m = market();
    if (m.us && !m.eu) return c.usPayBand || c.euPayBand || 'VAR';
    if (!m.us) return c.euPayBand || 'VAR';
    const p = payScore(c);
    return p >= 70 ? 'HIGH' : p >= 40 ? 'MID' : 'LOW';
  }
  /* v20261028b: the user can select / deselect areas (Stage 1), subfields and professions (Stage 2) on Passions.
     Deselected ones drop out of every match; nothing is deleted, so they can be selected again. */
  function allLove() { return Array.isArray(results.stage_2?.love) ? results.stage_2.love : []; }
  const domOn = (d) => !d || ((results.stage_1 || {}).domainPrefs || {})[d] !== false;
  const subOn = (sf) => !sf || ((results.stage_2 || {}).subPrefs || {})[sf] !== false;
  const proOn = (c) => !((results.stage_2 || {}).excluded || []).includes(c);
  const loveDom = (l) => l.domain || SUBS[l.subfield]?.domain;
  function isActive(l) { return domOn(loveDom(l)) && subOn(l.subfield) && proOn(l.career); }
  function loveList() { return allLove().filter(isActive); }
  const MAX_DOMAINS = (S2.config && S2.config.maxDomains) || 4;
  function tglBtn(key, on, disabled) {
    return `<button type="button" class="ik-tgl ${on ? 'on' : ''}" data-tgl="${esc(key)}" aria-pressed="${on}" ${disabled ? 'disabled' : ''}>${on ? '✓ ' + T('hub.tglOn') : T('hub.tglOff')}</button>`;
  }
  async function savePrefs(stage, fields) {
    const k = 'stage_' + stage;
    results[k] = { ...(results[k] || {}), ...fields };
    render();
    try {
      await api('/api/user/results', { method: 'POST', body: { stage, results: fields } });
      if (results.stage_3 && results.stage_3.completedAt) await save(topFields()); // keep the saved top matches in step
      toast(T('hub.prefsSaved'));
    } catch { toast(T('common.saveFailed')); }
  }
  function toggle(key) {
    const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (kind === 'dom') {
      const s1 = results.stage_1 || {};
      const prefs = { ...(s1.domainPrefs || {}) };
      const turningOn = prefs[id] === false;
      if (turningOn) {
        const onCount = (s1.ranked || []).filter((r) => prefs[r.area] !== false).length;
        if (onCount >= MAX_DOMAINS) { toast(T('hub.maxDomains', { max: MAX_DOMAINS })); return; }
      }
      (s1.ranked || []).forEach((r) => { if (prefs[r.area] === undefined) prefs[r.area] = true; });
      prefs[id] = turningOn;
      savePrefs(1, { domainPrefs: prefs });
    } else if (kind === 'sub') {
      const subPrefs = { ...((results.stage_2 || {}).subPrefs || {}) };
      subPrefs[id] = subPrefs[id] === false;
      savePrefs(2, { subPrefs });
    } else if (kind === 'pro') {
      const ex = new Set((results.stage_2 || {}).excluded || []);
      if (ex.has(id)) ex.delete(id); else ex.add(id);
      savePrefs(2, { excluded: [...ex] });
    }
  }
  function scored() {
    const prof = profile();
    return loveList().map((l) => {
      const c = careerOf(l.career);
      const G = goodAt(l.subfield, prof);
      const L = l.L;
      const match = G != null ? Math.round(Math.exp(LG.love * Math.log(Math.max(L, 1)) + LG.good * Math.log(Math.max(G, 1)))) : L;
      return { ...l, c, L, G, match, trend: c.trend || 'UNCERTAIN', pay: payScore(c), band: payBand(c), strong: L >= 70 && (G == null || G >= 70) };
    });
  }

  /* ── API ── */
  const api = (p, o) => window.CPS.api(p, o);
  let saveTimer = null;
  function save(fields, msg) {
    clearTimeout(saveTimer);
    return new Promise((resolve) => {
      saveTimer = setTimeout(async () => {
        try {
          await api('/api/user/results', { method: 'POST', body: { stage: 3, results: fields } });
          results.stage_3 = { ...(results.stage_3 || {}), ...fields };
          if (msg) toast(msg);
        } catch { toast(T('common.saveFailed')); }
        resolve();
      }, 150);
    });
  }
  function topFields() {
    const top = scored().sort((a, b) => b.match - a.match).slice(0, 20);
    return {
      top: top.map((r) => ({ career: r.career, domain: r.domain, subfield: r.subfield, match: r.match, IK: r.match, L: r.L, G: r.G, trend: r.trend, pay: r.pay })),
      ranked: top.slice(0, 10).map((r) => ({ area: r.domain, name: r.career, score: r.match, pct: r.match })),
    };
  }
  function completeStage3() {
    const top = scored().sort((a, b) => b.match - a.match).slice(0, 20);
    return save({
      partial: false,
      completedAt: new Date().toISOString(),
      dataVersion: S2.version,
      grades: st.gradesSkipped ? null : st.grades,
      gradesSkipped: st.gradesSkipped,
      region: st.region,
      top: top.map((r) => ({ career: r.career, domain: r.domain, subfield: r.subfield, match: r.match, IK: r.match, L: r.L, G: r.G, trend: r.trend, pay: r.pay })),
      ranked: top.slice(0, 10).map((r) => ({ area: r.domain, name: r.career, score: r.match, pct: r.match })),
    }, T('common.savedShort'));
  }
  function toast(m) {
    const t = $('ikToast');
    t.textContent = m; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ── shared bits ── */
  const s1Done = () => !!(results.stage_1 && (results.stage_1.completedAt || results.stage_1.ranked));
  const s2Done = () => allLove().length > 0; // Stage 2 done even if the user deselected every profession
  const hasGrades = () => !!profile();

  function pageHead(icon, kicker, title, lead, kind) {
    const tag = kind === 'key' ? `<span class="ik-kind key">${T('hub.kindKey')}</span>` : kind === 'info' ? `<span class="ik-kind info">${T('hub.kindInfo')}</span>` : '';
    return `<header class="ik-head"><div class="ik-kicker">${icon} ${esc(kicker)}</div><h1>${title}</h1><p>${lead}</p>${tag}</header>`;
  }
  function empty(msg, href, cta) {
    return `<div class="ik-card ik-center ik-empty"><p>${msg}</p><a class="btn-primary" href="${href}">${cta}</a></div>`;
  }
  function pct(n) { return (n > 0 ? '+' : '') + I.fmt.number(n) + '%'; }
  function trendChip(t, growth) {
    const x = TREND[t] ? t : 'UNCERTAIN';
    const g = growth != null ? ' ' + pct(growth) : '';
    return `<span class="ik-trend ${TREND[x].cls}">${trendLabel(x)}${esc(g)}</span>`;
  }
  function bandChip(b) { const k = ['HIGH', 'MID', 'LOW', 'VAR'].includes(b) ? b : 'none'; return `<span class="ik-band b-${(b || 'VAR').toLowerCase()}">${T('hub.band.' + k)}</span>`; }
  function usd(n) { return I.fmt.money(n, 'USD', { notation: 'compact', maximumFractionDigits: 0 }); }
  /* European pay in euros (Eurostat SES 2022, assets/pay-eu.js) */
  const PAY = window.PAY_EU || null;
  function euPlace() {
    if (!PAY || st.region.mode !== 'custom') return 'EU';
    return st.region.countries.find((c) => PAY.countries[c]) || 'EU';
  }
  function placeLabel(cc) { return cc === 'EU' ? '🇪🇺 ' + T('hub.euAvg') : ((COUNTRIES.find((x) => x.code === cc) || {}).flag || '') + ' ' + countryName(cc); }
  function eur(n) { return I.fmt.money(n, 'EUR', { notation: 'compact', maximumFractionDigits: 0 }); }
  function euPay(c) { return PAY ? PAY.value(c.career, euPlace()) : null; }
  function usPay(c) { return c.usMedianPay2025 ? usd(c.usMedianPay2025) : '—'; }
  function bar(v, color) { return `<div class="ik-track"><i style="width:${v ?? 0}%;background:${color}"></i></div>`; }
  function regionLabel() {
    if (st.region.mode === 'blend' || !st.region.countries.length) return T('hub.blend');
    return st.region.countries.map((c) => { const x = COUNTRIES.find((y) => y.code === c); return x ? `${x.flag} ${countryName(x.code)}` : c; }).join(', ');
  }
  function regionPicker() {
    const custom = st.region.mode === 'custom';
    return `<div class="ik-card ik-region">
      <div class="ik-region-row"><strong>${T('hub.market')}</strong>
        <button class="ik-chip ${!custom ? 'sel' : ''}" data-act="region-blend">${T('hub.blend')}</button>
        <button class="ik-chip ${custom ? 'sel' : ''}" data-act="region-custom">${T('hub.pickCountries')}</button>
      </div>
      <div class="ik-countries" style="display:${custom ? 'flex' : 'none'}">
        ${COUNTRIES.map((c) => `<button class="ik-chip ${st.region.countries.includes(c.code) ? 'sel' : ''}" data-country="${c.code}">${c.flag} ${esc(countryName(c.code))}</button>`).join('')}
      </div>
    </div>`;
  }

  /* ── PAGE: overview ── */
  function pageOverview() {
    if (!s1Done()) return pageHead('✨', T('hub.ovKicker'), T('hub.ovStartTitle'), T('hub.ovStartLead')) + empty(T('hub.ovStartEmpty'), '/survey?stage=1', T('hub.startS1'));
    if (!s2Done()) return pageHead('✨', T('hub.ovKicker'), T('hub.ovShapeTitle'), T('hub.ovShapeLead')) + circles() + empty(T('hub.ovShapeEmpty'), '/survey?stage=2', T('hub.toS2'));
    const list = scored();
    const sorters = { match: (a, b) => b.match - a.match, needs: (a, b) => (rankT(b.trend) - rankT(a.trend)) || b.match - a.match, pay: (a, b) => b.pay - a.pay || b.match - a.match };
    const doms = [...new Set(list.map((r) => r.domain))];
    const shown = list.filter((r) => ui.domain === 'ALL' || r.domain === ui.domain).sort(sorters[ui.sort]).slice(0, 20);
    const nudge = !hasGrades()
      ? `<div class="ik-nudge">💪 <span>${T('hub.nudge')}</span><a class="btn-primary sm" href="/ikigai/skills">${T('hub.addGrades')}</a></div>` : '';
    return pageHead('✨', T('hub.ovKicker'), T('hub.ovTitle'), T('hub.ovLead', { market: esc(regionLabel()) }))
      + circles() + nudge + regionPicker()
      + `<div class="ik-toolbar">
          <div class="ik-filters"><button class="ik-chip ${ui.domain === 'ALL' ? 'sel' : ''}" data-dom="ALL">${T('hub.all')}</button>${doms.map((d) => `<button class="ik-chip ${ui.domain === d ? 'sel' : ''}" data-dom="${d}">${area(d).icon} ${esc(areaName(d))}</button>`).join('')}</div>
          <label class="ik-sort">${T('hub.sortBy')} <select data-act="sort"><option value="match" ${ui.sort === 'match' ? 'selected' : ''}>${T('hub.sortMatch')}</option><option value="needs" ${ui.sort === 'needs' ? 'selected' : ''}>${T('hub.sortNeeds')}</option><option value="pay" ${ui.sort === 'pay' ? 'selected' : ''}>${T('hub.sortPay')}</option></select></label>
        </div>
        <div class="ik-results">${shown.map((r, i) => matchCard(r, i)).join('')}</div>`
      + refreshCard() + `<div id="ikSupport"></div>`
      + `<p class="ik-foot">${T('hub.foot')}</p>`;
  }
  const rankT = (t) => ({ UP: 3, STABLE: 2, UNCERTAIN: 1, DOWN: 0 })[t] ?? 1;

  function circles() {
    const list = scored();
    const top = list.slice().sort((a, b) => b.match - a.match).slice(0, 10);
    const prof = profile();
    const bestSubj = prof ? Object.entries(prof.pct).sort((a, b) => b[1] - a[1])[0] : null;
    const up = top.filter((r) => r.trend === 'UP').length;
    const hi = top.filter((r) => r.band === 'HIGH').length;
    const c = [
      { k: 'love', ico: '❤️', t: T('hub.cLove'), v: s2Done() ? esc(C(top[0]?.career || '')) : (s1Done() ? T('hub.s2Todo') : T('hub.notStarted')), s: s2Done() ? T('hub.onShortlist', { count: list.length }) : T('hub.stages12'), href: '/ikigai/love', key: true, done: s2Done() },
      { k: 'skills', ico: '💪', t: T('hub.cSkills'), v: prof ? esc(subjName(bestSubj[0])) : T('hub.addGrades'), s: prof ? T('hub.strongestOf', { count: prof.n }) : T('hub.optional2'), href: '/ikigai/skills', key: true, done: !!prof },
      { k: 'needs', ico: '🌍', t: T('hub.cNeeds'), v: s2Done() ? T('hub.xOfTop', { x: up, n: top.length }) : '—', s: T('hub.trendingUp'), href: '/ikigai/needs', key: false, done: true },
      { k: 'pay', ico: '💰', t: T('hub.cPay'), v: s2Done() ? T('hub.xOfTop', { x: hi, n: top.length }) : '—', s: T('hub.highBand'), href: '/ikigai/pay', key: false, done: true },
    ];
    return `<div class="ik-circles">
      <div class="ik-venn" aria-hidden="true"><img src="/assets/brand/wikigai-mark-icon.png" alt=""></div>
      <div class="ik-cgrid">${c.map((x) => `<a class="ik-ccard ${x.k} ${x.key ? 'key' : 'info'} ${x.done ? '' : 'todo'}" href="${x.href}" data-nav>
        <div class="ik-ct">${x.ico} ${x.t}<span>${T(x.key ? 'common.key' : 'common.info')}</span></div>
        <div class="ik-cv">${x.v}</div><div class="ik-cs">${x.s}</div></a>`).join('')}</div>
    </div>`;
  }

  function sourceLine(c) { return esc(C(c.blsProxy || '') || '—') + (c.note ? ' — ' + esc(C(c.note)) : ''); }

  function matchCard(r, i) {
    const m = area(r.domain);
    const m0 = market(), ev = m0.eu ? euPay(r.c) : null;
    const payNote = [
      m0.us ? (r.c.usMedianPay2025 ? T('hub.usMedian', { pay: usPay(r.c) }) : T('hub.noPaySeries')) : '',
      ev ? T('hub.euGross', { pay: eur(ev.eur), place: placeLabel(ev.cc) }) : (m0.eu ? T('hub.euEstimate') : ''),
    ].filter(Boolean).join(' · ');
    return `<div class="ik-res ${i < 3 ? 'top' : ''}">
      <div class="ik-res-head">
        <div class="rank-badge">${i + 1}</div>
        <div class="area-icon-wrap" style="background:${m.color}22;color:${m.color}">${m.icon}</div>
        <div class="ik-res-name"><strong>${esc(C(r.career))}</strong><small>${esc(SUBS[r.subfield] ? subName(r.subfield) : '')} · ${esc(areaName(r.domain))}</small></div>
        ${r.strong ? `<span class="ik-sweet">${T('hub.strong')}</span>` : ''}
        <div class="ik-score"><b>${r.match}</b><small>${T('hub.match')}</small></div>
      </div>
      <div class="ik-bars">
        <div class="ik-bar"><span>${T('hub.love')}</span>${bar(r.L, '#ff6b9d')}<b>${r.L}</b></div>
        <div class="ik-bar"><span>${T('hub.goodAt')}</span>${r.G != null ? bar(r.G, '#c44dff') + `<b>${r.G}</b>` : `<a class="ik-addg" href="/ikigai/skills" data-nav>${T('hub.addGradesLink')}</a><b>—</b>`}</div>
      </div>
      <div class="ik-meta">${trendChip(r.trend, r.c.usGrowth2535)}${bandChip(r.band)}<span class="ik-dim">${payNote}</span></div>
      <details class="ik-why"><summary>${T('hub.dayInJob')}</summary><p>${esc(C(r.c.task || ''))}</p>
        <p class="ik-dim">${T('hub.loveBreakdown', { d: r.D, s: r.S, c: r.C, src: sourceLine(r.c) })}</p></details>
    </div>`;
  }

  function refreshCard() {
    const d = new Date(); d.setMonth(d.getMonth() + 6);
    const label = I.fmt.date(d, { month: 'long', year: 'numeric' });
    return `<div class="stage2-cta ik-refresh"><h3>${T('hub.refreshTitle')}</h3>
      <p>${T('hub.refreshText')}</p>
      <label class="ik-check"><input type="checkbox" data-act="refresh" ${st.refresh?.optIn ? 'checked' : ''}> ${T('hub.refreshCheck', { date: esc(label) })}</label></div>`;
  }

  /* ── PAGE: love ── */
  function pageLove() {
    let h = pageHead('❤️', T('hub.loveKicker'), T('hub.loveTitle'), T('hub.loveLead'), 'key');
    const s1 = results.stage_1;
    h += `<div class="ik-steps2">
      ${stepCard(1, T('hub.step1'), T('hub.step1d'), s1Done(), '/survey?stage=1', s1Done() ? '/survey?stage=1&review=1' : null)}
      ${stepCard(2, T('hub.step2'), T('hub.step2d'), s2Done(), s1Done() ? '/survey?stage=2' : null, s2Done() ? '/survey?stage=2&review=1' : null)}
    </div>`;
    if (!s1Done()) return h + empty(T('hub.loveEmpty1'), '/survey?stage=1', T('hub.startS1'));
    const ranked = (s1.ranked || []).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const max = Math.max(1, ...ranked.map((r) => r.score ?? 0));
    h += `<div class="ik-card"><h2>${T('hub.domainsTitle')}</h2><p class="ik-sub">${T('hub.domainsSubTgl', { max: MAX_DOMAINS })}</p>
      ${ranked.map((r) => { const m = area(r.area); const p = Math.round(((r.score ?? 0) / max) * 100); const on = domOn(r.area);
        return `<div class="ik-row tg ${on ? '' : 'off'}"><span class="ik-rlabel">${m.icon} ${esc(areaName(r.area))}</span>${bar(p, m.color)}<b>${p}%</b>${tglBtn('dom:' + r.area, on)}</div>`; }).join('')}
    </div>`;
    if (!s2Done()) return h + empty(T('hub.loveEmpty2'), '/survey?stage=2', T('hub.toS2'));
    const s2 = results.stage_2;
    const subPct = s2.subPct || {};
    const subsWithPros = new Set(allLove().map((l) => l.subfield).filter(Boolean));
    const kept = [...new Set([...Object.keys(s2.subPrefs || {}).filter((k) => s2.subPrefs[k] || subsWithPros.has(k)), ...subsWithPros])].filter((k) => SUBS[k]);
    h += `<div class="ik-card"><h2>${T('hub.subsTitle')}</h2><p class="ik-sub">${T('hub.subsSubTgl')}</p>
      ${kept.sort((a, b) => (subPct[b] || 0) - (subPct[a] || 0)).map((s) => { const d = SUBS[s]?.domain, m = area(d), on = subOn(s) && domOn(d);
        return `<div class="ik-row tg ${on ? '' : 'off'}"><span class="ik-rlabel">${m.icon} ${esc(subName(s))}</span>${bar(subPct[s], m.color)}<b>${subPct[s] ?? '—'}%</b>${domOn(d) ? tglBtn('sub:' + s, subOn(s)) : `<span class="ik-dim ik-tglnote">${T('hub.areaOff')}</span>`}</div>`; }).join('')}
    </div>`;
    const all = allLove();
    const nOn = all.filter(isActive).length;
    const love = ui.loveAll ? all : all.slice(0, 20);
    h += `<div class="ik-card"><h2>${T('hub.shortTitle')}</h2><p class="ik-sub">${T('hub.shortSub')} ${T('hub.shortTgl', { n: nOn, total: all.length })}</p>
      <div class="ik-table lovetab tg"><div class="ik-tr ik-th"><span>#</span><span>${T('hub.colProfession')}</span><span>${T('hub.colDomainSub')}</span><span>${T('hub.colLove')}</span><span></span></div>
      ${love.map((l, i) => { const m = area(loveDom(l)); const sf = SUBS[l.subfield]; const parentOn = domOn(loveDom(l)) && subOn(l.subfield); const on = parentOn && proOn(l.career);
        return `<div class="ik-tr ${on ? '' : 'off'}"><span>${i + 1}</span><span><strong>${esc(C(l.career))}</strong></span>
        <span class="ik-ds"><b>${m.icon} ${esc(areaName(loveDom(l)))}</b><small>${esc(C(m.desc || ''))}</small>${sf ? `<b class="ik-ds-sub">↳ ${esc(subName(l.subfield))}</b><small>${esc(C(sf.desc || ''))}</small>` : ''}</span>
        <span class="ik-num love">${l.L}</span><span>${parentOn ? tglBtn('pro:' + l.career, proOn(l.career)) : `<span class="ik-dim ik-tglnote">${T(domOn(loveDom(l)) ? 'hub.subOff' : 'hub.areaOff')}</span>`}</span></div>`; }).join('')}
      </div>${!ui.loveAll && all.length > 20 ? `<div class="ik-more"><button type="button" class="btn-ghost sm" data-act="love-all">${T('hub.showAllPros', { count: all.length - 20 })}</button></div>` : ''}</div>`;
    return h + nextLink('/ikigai/skills', T('hub.nextSkills'));
  }
  function stepCard(n, t, d, done, href, review) {
    return `<div class="ik-stepcard ${done ? 'done' : ''}"><div class="ik-stepn">${done ? '✓' : n}</div><div><strong>${T('hub.stepTitle', { n, title: t })}</strong><small>${d}</small></div>
      <div class="ik-stepact">${review ? `<a class="btn-ghost sm" href="${review}">${T('hub.review')}</a>` : ''}${href ? `<a class="${done ? 'btn-ghost' : 'btn-primary'} sm" href="${href}">${T(done ? 'hub.retake' : 'hub.start')}</a>` : `<span class="ik-dim">${T('hub.afterS1')}</span>`}</div></div>`;
  }
  function nextLink(href, label) { return `<div class="ik-next"><a class="btn-primary" href="${href}" data-nav>${label} →</a></div>`; }

  /* ── PAGE: skills (Stage 3 results first; grades editable below) ── */
  function gradesForm() {
    const g = st.grades;
    const sysKey = GRADING[g.system] ? g.system : 'OTHER';
    return `<h2>${T('hub.gradesTitle')} <span class="ik-opt">${T('hub.gradesOpt')}</span></h2>
      <div class="ik-grid2">
        <label class="ik-field">${T('hub.whereStudy')}
          <select data-act="country">${['', ...COUNTRIES.map((c) => c.code)].map((c) => { const x = COUNTRIES.find((y) => y.code === c); return `<option value="${c}" ${c === (st.grades.country || '') ? 'selected' : ''}>${x ? x.flag + ' ' + esc(countryName(x.code)) : T('hub.chooseCountry')}</option>`; }).join('')}</select>
        </label>
        <label class="ik-field">${T('hub.gradingSystem')}
          <select data-act="system">${Object.keys(GRADING).map((k) => `<option value="${k}" ${k === g.system ? 'selected' : ''}>${esc(gradingLabel(k))}</option>`).join('')}</select>
        </label>
      </div>
      <div class="ik-range-row">
        <label class="ik-field">${T('hub.lowest')}<input data-act="worst" type="number" step="any" value="${g.worst}"></label>
        <span class="ik-arrow">→</span>
        <label class="ik-field">${T('hub.highest')}<input data-act="best" type="number" step="any" value="${g.best}"></label>
        <p class="ik-note">${esc(T('hub.rangeNote', { hint: gradingHint(sysKey) }))}</p>
      </div>
      <div class="ik-subjects">
        ${Object.keys(SUBJECTS).map((k) => `<label class="ik-subject"><span>${esc(subjName(k))}</span><input type="number" step="any" inputmode="decimal" data-subj="${k}" value="${g.values[k] ?? ''}" placeholder="—"></label>`).join('')}
      </div>
      <p class="ik-note ik-err" id="ikGradeErr"></p>
      <div class="cta-row"><button class="btn-ghost" data-act="skip">${T('hub.skip')}</button><button class="btn-primary" data-act="save-grades">${T(flow ? 'hub.saveSee' : 'hub.saveGrades')}</button></div>`;
  }
  function pageSkills() {
    const prof = profile();
    let h = pageHead('💪', T('hub.skillsKicker'), T('hub.skillsTitle'), T('hub.skillsLead'), 'key');
    if (!prof) {
      h += `<div class="ik-card ik-s3empty"><p>${T(st.gradesSkipped ? 'hub.s3Skipped' : 'hub.s3Empty')}</p></div>`;
      return h + `<div class="ik-card">${gradesForm()}</div>`;
    }
    const subj = Object.entries(prof.pct).sort((a, b) => b[1] - a[1]);
    h += `<div class="ik-card ik-s3sum"><h2>${T('hub.s3Title')}</h2>
      <p class="ik-sub">${T('hub.s3Lead', { n: prof.n, avg: Math.round(prof.mean) })}</p>
      <div class="ik-s3top"><span class="ik-dim">${T('hub.s3Top')}</span>${subj.slice(0, 3).map(([k, v]) => `<span class="ik-s3chip">${esc(subjName(k))} <b>${Math.round(v)}</b></span>`).join('')}</div></div>`;
    h += `<div class="ik-card"><h2>${T('hub.strengthsTitle')}</h2><p class="ik-sub">${T('hub.strengthsSub', { avg: Math.round(prof.mean) })}</p>
      ${subj.map(([k, v]) => `<div class="ik-row"><span class="ik-rlabel">${esc(subjName(k))}</span>${bar(Math.round(v), v >= prof.mean ? '#c44dff' : '#6b5bff')}<b>${Math.round(v)}</b><span class="ik-dim">${v >= prof.mean + 5 ? T('hub.strength') : v <= prof.mean - 5 ? '▼' : ''}</span></div>`).join('')}
    </div>`;
    const list = scored().filter((r) => r.G != null).sort((a, b) => b.match - a.match).slice(0, 15);
    if (list.length) {
      h += `<div class="ik-card"><h2>${T('hub.goodByProf')}</h2><p class="ik-sub">${T('hub.goodByProfSub')}</p>
        <div class="ik-table s3"><div class="ik-tr ik-th"><span>#</span><span>${T('hub.colProfession')}</span><span>${T('hub.colGood')}</span><span>${T('hub.colLove')}</span><span>${T('hub.colMatch')}</span></div>
        ${list.map((r, i) => `<div class="ik-tr"><span>${i + 1}</span><span><strong>${esc(C(r.career))}</strong><small>${area(r.domain).icon} ${esc(SUBS[r.subfield] ? subName(r.subfield) : areaName(r.domain))}</small></span><span class="ik-num">${bar(r.G, '#c44dff')}<b>${r.G}</b></span><span class="ik-num love">${r.L}</span><span class="ik-num"><b class="ik-matchn">${r.match}</b></span></div>`).join('')}
        </div></div>`;
    }
    const fits = Object.keys(CFG.subjectWeights || {}).map((s) => ({ s, G: goodAt(s, prof) })).sort((a, b) => b.G - a.G);
    const mine = new Set(loveList().map((l) => l.subfield));
    h += `<div class="ik-card"><h2>${T('hub.fitsTitle')}</h2><p class="ik-sub">${T('hub.fitsSub')}</p>
      ${fits.slice(0, 12).map((f) => { const m = area(SUBS[f.s]?.domain); return `<div class="ik-row"><span class="ik-rlabel">${m.icon} ${esc(subName(f.s))} ${mine.has(f.s) ? '❤️' : ''}</span>${bar(f.G, m.color)}<b>${f.G}</b><span class="ik-dim">${esc(Object.keys(CFG.subjectWeights[f.s]).map((k) => subjName(k).split(/[ ,/&]/)[0]).join(' · '))}</span></div>`; }).join('')}
    </div>`;
    h += `<details class="ik-card ik-edit"${flow ? ' open' : ''}><summary>✏️ ${T('hub.editGrades')}</summary>${gradesForm()}</details>`;
    return h + nextLink('/ikigai', T('hub.seeMatch'));
  }

  /* ── PAGE: needs ── */
  function pageNeeds() {
    let h = pageHead('🌍', T('hub.needsKicker'), T('hub.needsTitle'), T('hub.needsLead'), 'info');
    h += `<div class="ik-legend">${Object.keys(TREND).map((k) => `<div class="ik-leg"><span class="ik-trend ${TREND[k].cls}">${trendLabel(k)}</span><small>${T('trend.rule' + k)}</small></div>`).join('')}</div>`;
    h += exploreTable('needs');
    h += `<div class="ik-card ik-sources"><h2>${T('hub.sourcesTitle')}</h2><ul>
      <li>${T('hub.needsSrc1')}</li>
      <li>${T('hub.needsSrc2')}</li>
      <li>${T('hub.needsSrc3')}</li>
      </ul><p class="ik-dim">${T('hub.needsProxy')}</p></div>`;
    return h;
  }

  /* ── PAGE: pay ranges (per geography × profession) ── */
  const geoCode = (cc) => (cc === 'EL' ? 'GR' : cc === 'UK' ? 'GB' : cc);
  function geoFlag(cc) { if (cc === 'EU') return '🇪🇺'; try { return String.fromCodePoint(...[...geoCode(cc)].map((ch) => 127397 + ch.charCodeAt(0))); } catch { return ''; } }
  function geoName(cc) { if (cc === 'EU') return T('hub.euAvg'); try { return new Intl.DisplayNames([I.locale.intl || I.lang], { type: 'region' }).of(geoCode(cc)) || cc; } catch { return cc; } }
  const payGeoOk = (g) => g === 'US' || !!(PAY && PAY.countries[g]);
  function payGeos() {
    if (!ui.payGeos) {
      let saved = null; try { saved = JSON.parse(localStorage.getItem('wk_pay_geos') || 'null'); } catch { /* ignore */ }
      const mine = (st.region.mode === 'custom' ? st.region.countries : []).filter(payGeoOk);
      ui.payGeos = (Array.isArray(saved) && saved.filter(payGeoOk).length ? saved.filter(payGeoOk) : (mine.length ? ['EU', ...mine.filter((g) => g !== 'EU')] : ['EU', 'ES', 'FR', 'DE', 'US'])).slice(0, 8);
    }
    return ui.payGeos;
  }
  function setPayGeos(list) { ui.payGeos = list.slice(0, 8); try { localStorage.setItem('wk_pay_geos', JSON.stringify(ui.payGeos)); } catch { /* ignore */ } render(); }
  function geoPicker() {
    const geos = payGeos();
    const all = ['US', 'EU', ...Object.keys(PAY ? PAY.countries : {}).filter((c) => c !== 'EU').sort((a, b) => geoName(a).localeCompare(geoName(b)))];
    const left = all.filter((g) => !geos.includes(g));
    return `<div class="ik-card pr-geo"><div class="pr-geo-row"><strong>${T('hub.prCompare')}</strong>
      ${geos.map((g) => `<button class="ik-chip sel" data-act="paygeo-del" data-geo="${g}" aria-label="${esc(T('hub.prRemove', { name: geoName(g) }))}">${geoFlag(g)} ${esc(geoName(g))} <span aria-hidden="true">✕</span></button>`).join('')}
      ${geos.length < 8 && left.length ? `<select data-act="paygeo-add" aria-label="${esc(T('hub.prAdd'))}"><option value="">${T('hub.prAdd')}</option>${left.map((g) => `<option value="${g}">${geoFlag(g)} ${esc(geoName(g))}</option>`).join('')}</select>` : ''}
      </div></div>`;
  }
  function payRow(c, mine, scaleMax) {
    const geos = payGeos();
    const r = PAY ? PAY.range(c.career) : null;
    const pos = (v) => Math.max(0, Math.min(100, (v / scaleMax) * 100)).toFixed(1);
    const vals = geos.map((g) => {
      if (g === 'US') return `<span class="pr-v us" title="${esc(T('hub.colUsMedian'))}">${geoFlag('US')} <span class="pr-vn">${esc(geoName('US'))}</span> <b>${usPay(c)}</b><small>${T('hub.prUsNote')}</small></span>`;
      const v = PAY.value(c.career, g); const est = v.cc !== g;
      return `<span class="pr-v">${geoFlag(g)} <span class="pr-vn">${esc(geoName(g))}</span> <b>${eur(v.eur)}${est ? '*' : ''}</b></span>`;
    }).join('');
    const dots = r ? geos.filter((g) => g !== 'US').map((g) => { const v = PAY.value(c.career, g); return `<span class="pr-dot" style="left:${pos(v.eur)}%" title="${esc(geoName(g))}: ${esc(eur(v.eur))}"></span>`; }).join('') : '';
    return `<div class="pr-row ${mine ? 'mine' : ''}">
      <div class="pr-name"><strong>${mine ? '❤️ ' : ''}${esc(C(c.career))}</strong><small>${area(c.domain).icon} ${esc(C(c.subfieldName || ''))}${r ? ' · ' + esc(T('hub.isco.' + r.group)) : ''}</small></div>
      ${r ? `<div class="pr-range"><div class="pr-track"><i class="pr-span" style="left:${pos(r.min.eur)}%;width:${(pos(r.max.eur) - pos(r.min.eur)).toFixed(1)}%"></i>${dots}</div>
        <div class="pr-ends"><span>${geoFlag(r.min.cc)} ${eur(r.min.eur)}</span><span class="pr-eu">${geoFlag('EU')} ${eur(r.eu)}</span><span>${geoFlag(r.max.cc)} ${eur(r.max.eur)}</span></div></div>` : '<div></div>'}
      <div class="pr-vals">${vals}</div>
    </div>`;
  }
  function pagePay() {
    let h = pageHead('💰', T('hub.payKicker'), T('hub.payTitle'), T('hub.payLead'), 'info');
    if (!PAY) return h + exploreTable('pay');
    h += geoPicker();
    const mineMap = new Map(loveList().map((l) => [l.career, l]));
    let rows = CAREERS.slice();
    if (ui.exploreDomain === 'MINE' && mineMap.size) rows = rows.filter((c) => mineMap.has(c.career));
    else if (ui.exploreDomain !== 'ALL' && ui.exploreDomain !== 'MINE') rows = rows.filter((c) => c.domain === ui.exploreDomain);
    rows.sort((a, b) => (PAY.value(b.career, 'EU').eur - PAY.value(a.career, 'EU').eur) || (b.usMedianPay2025 || 0) - (a.usMedianPay2025 || 0));
    const scaleMax = Math.max(1, ...rows.map((c) => PAY.range(c.career).max?.eur || 0));
    const doms = Object.keys(AREAS);
    const opts = `${mineMap.size ? `<option value="MINE" ${ui.exploreDomain === 'MINE' ? 'selected' : ''}>${T('hub.myShortlist', { n: mineMap.size })}</option>` : ''}<option value="ALL" ${ui.exploreDomain === 'ALL' || (ui.exploreDomain === 'MINE' && !mineMap.size) ? 'selected' : ''}>${T('hub.allProfessions', { n: CAREERS.length })}</option>${doms.map((d) => `<option value="${d}" ${ui.exploreDomain === d ? 'selected' : ''}>${area(d).icon} ${esc(areaName(d))}</option>`).join('')}`;
    h += `<div class="ik-card"><div class="ik-toolbar"><h2>${T('hub.prTitle')}</h2><div class="ik-selects"><select data-act="explore">${opts}</select></div></div>
      <p class="ik-sub">${T('hub.prLegend')}</p>
      <div class="pr-list">${rows.map((c) => payRow(c, mineMap.has(c.career), scaleMax)).join('') || `<p class="ik-dim" style="padding:12px">${T('hub.noRows')}</p>`}</div>
      <p class="ik-dim pr-foot">${T('hub.prFoot')}</p></div>`;
    h += `<div class="ik-card ik-sources"><h2>${T('hub.sourcesTitle')}</h2>
      <h3 class="ik-src-h">🇺🇸 ${esc(countryName('US'))}</h3><ul><li>${T('hub.paySrcUS')}</li></ul>
      ${euSources()}
      </div>`;
    return h;
  }

  /* European pay sources: EU-wide + each country's statistics office.
     Labels live in the dictionary (hub.paySrc*); links are data here. */
  const PAY_EU = [
    { key: 'paySrcSes', url: (window.PAY_EU || {}).source ? window.PAY_EU.source.url : 'https://ec.europa.eu/eurostat/cache/metadata/EN/earn_ses2022_esms.htm' },
    { key: 'paySrcMinWage', url: 'https://ec.europa.eu/eurostat/cache/metadata/en/earn_minw_esms.htm' },
    { key: 'paySrcOECD', url: 'https://www.oecd-ilibrary.org/en/data/indicators/average-annual-wages.html' },
  ];
  const PAY_NATIONAL = [
    { cc: 'ES', org: 'INE', url: 'https://ine.es/dyngs/Prensa/es/EAES2024.htm' },
    { cc: 'FR', org: 'INSEE', url: 'https://www.insee.fr/fr/statistiques/2407703' },
    { cc: 'DE', org: 'Destatis', url: 'https://www.destatis.de/DE/Themen/Arbeit/Verdienste/Verdienste-Branche-Berufe/_inhalt.html' },
    { cc: 'IT', org: 'ISTAT', url: 'https://www.istat.it/wp-content/uploads/2025/01/REPORT_STRUTTURA_RETRIBUZIONI_2022.pdf' },
    { cc: 'PT', org: 'dados.gov.pt', url: 'https://dados.gov.pt/es/datasets/ganho-mensal-eur-4/' },
    { cc: 'NL', org: 'CBS', url: 'https://www.cbs.nl/nl-nl/longread/rapportages/2021/lonen-en-loonkosten-een-overzicht-van-de-verschillende-cbs-cijfers/3-statistieken-over-lonen-en-loonkosten' },
    { cc: 'IE', org: 'CSO', url: 'https://www.cso.ie/en/releasesandpublications/ep/p-eaads/earningsanalysisusingadministrativedatasources2023/' },
    { cc: 'UK', org: 'ONS', url: 'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/bulletins/annualsurveyofhoursandearnings/latest' },
  ];
  function euSources() {
    const picked = st.region.mode === 'custom' ? st.region.countries : [];
    const nat = PAY_NATIONAL.slice().sort((a, b) => (picked.includes(b.cc) ? 1 : 0) - (picked.includes(a.cc) ? 1 : 0));
    const link = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
    return `<h3 class="ik-src-h">🇪🇺 ${T('hub.paySrcEuWide')}</h3><ul>
      ${PAY_EU.map((s) => `<li>${s.url ? link(s.url, T('hub.' + s.key + 'Name')) + ' — ' + T('hub.' + s.key) : T('hub.' + s.key)}</li>`).join('')}
      </ul>
      <h3 class="ik-src-h">🏛️ ${T('hub.paySrcNational')}</h3>
      <p class="ik-dim">${T('hub.paySrcNationalSub')}</p>
      <ul class="ik-natsrc">${nat.map((s) => { const c = COUNTRIES.find((x) => x.code === s.cc) || {}; const mine = picked.includes(s.cc);
        return `<li class="${mine ? 'mine' : ''}"><strong>${c.flag || ''} ${esc(countryName(s.cc))}</strong> · ${link(s.url, esc(s.org) + ': ' + T('hub.paySrcNat.' + s.cc))}${mine ? ` <span class="ik-src-tag">${T('hub.paySrcYours')}</span>` : ''}</li>`; }).join('')}
      </ul>`;
  }

  function exploreTable(kind) {
    const mineMap = new Map(loveList().map((l) => [l.career, l]));
    let rows = CAREERS.slice();
    if (ui.exploreDomain === 'MINE') rows = rows.filter((c) => mineMap.has(c.career));
    else if (ui.exploreDomain !== 'ALL') rows = rows.filter((c) => c.domain === ui.exploreDomain);
    if (kind === 'needs' && ui.trendFilter !== 'ALL') rows = rows.filter((c) => c.trend === ui.trendFilter);
    if (kind === 'needs') rows.sort((a, b) => rankT(b.trend) - rankT(a.trend) || (b.usGrowth2535 ?? -99) - (a.usGrowth2535 ?? -99));
    else rows.sort((a, b) => payScore(b) - payScore(a));
    const doms = Object.keys(AREAS);
    const counts = {}; rows.forEach((c) => { counts[c.trend] = (counts[c.trend] || 0) + 1; });
    const opts = `${mineMap.size ? `<option value="MINE" ${ui.exploreDomain === 'MINE' ? 'selected' : ''}>${T('hub.myShortlist', { n: mineMap.size })}</option>` : ''}<option value="ALL" ${ui.exploreDomain === 'ALL' ? 'selected' : ''}>${T('hub.allProfessions', { n: CAREERS.length })}</option>${doms.map((d) => `<option value="${d}" ${ui.exploreDomain === d ? 'selected' : ''}>${area(d).icon} ${esc(areaName(d))}</option>`).join('')}`;
    const tf = kind === 'needs' ? `<select data-act="trendf"><option value="ALL">${T('hub.allOutlooks')}</option>${Object.keys(TREND).map((k) => `<option value="${k}" ${ui.trendFilter === k ? 'selected' : ''}>${trendLabel(k)}</option>`).join('')}</select>` : '';
    const summary = kind === 'needs' ? `<p class="ik-sub">${Object.keys(TREND).map((k) => `${T('trend.' + TREND[k].short)}: <strong>${counts[k] || 0}</strong>`).join(' · ')}</p>` : '';
    const m = market();
    return `<div class="ik-card"><div class="ik-toolbar"><h2>${T(kind === 'needs' ? 'hub.outlookBy' : 'hub.payBy')}</h2><div class="ik-selects"><select data-act="explore">${opts}</select>${tf}</div></div>${summary}
      <div class="ik-table ${kind}">
        <div class="ik-tr ik-th"><span>${T('hub.colProfession')}</span>${kind === 'needs' ? `<span>${T('hub.colOutlook')}</span><span>${T('hub.colUsChange')}</span><span>${T('hub.colSource')}</span>` : `<span>${T(m.us && m.eu ? 'hub.colBlended' : m.us ? 'hub.colUsBand' : 'hub.colEuBand')}</span>${m.eu && PAY ? `<span>${T('hub.colEuGross')}</span>` : ''}${m.us ? `<span>${T('hub.colUsMedian')}</span>` : ''}`}</div>
        ${rows.map((c) => { const mine = mineMap.has(c.career); const ar = area(c.domain);
          return `<div class="ik-tr ${mine ? 'mine' : ''}"><span><strong>${mine ? '❤️ ' : ''}${esc(C(c.career))}</strong><small>${ar.icon} ${esc(C(c.subfieldName || ''))}</small></span>${kind === 'needs'
            ? `<span>${trendChip(c.trend)}</span><span class="ik-num">${c.usGrowth2535 != null ? pct(c.usGrowth2535) : '—'}</span><span class="ik-dim">${esc(C(c.blsProxy || ''))}${c.note ? ' — ' + esc(C(c.note)) : ''}</span>`
            : `<span>${bandChip(payBand(c))}</span>${m.eu && PAY ? (() => { const v = euPay(c); return `<span class="ik-num">${eur(v.eur)}<small>${esc(T('hub.isco.' + v.group))}</small></span>`; })() : ''}${m.us ? `<span class="ik-num">${usPay(c)}</span>` : ''}`}</div>`; }).join('') || `<p class="ik-dim" style="padding:12px">${T('hub.noRows')}</p>`}
      </div></div>`;
  }

  /* ── router ── */
  const PAGES = { overview: pageOverview, love: pageLove, skills: pageSkills, needs: pageNeeds, pay: pagePay };
  function current() {
    const seg = location.pathname.replace(/\/+$/, '').split('/')[2] || 'overview';
    return PAGES[seg] ? seg : 'overview';
  }
  function render(scrollTop) {
    const page = current();
    document.querySelectorAll('.ik-tab').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
    const at = document.querySelector('.ik-tab.active'); if (at && at.scrollIntoView) at.scrollIntoView({ block: 'nearest', inline: 'center' });
    let html = PAGES[page]();
    if (page === 'overview' && !html.includes('id="ikSupport"')) html += '<div id="ikSupport"></div>';
    $('ikApp').innerHTML = `<div class="ik-page">${html}</div>`;
    document.title = T({ overview: 'meta.hub', love: 'meta.hubLove', skills: 'meta.hubSkills', needs: 'meta.hubNeeds', pay: 'meta.hubPay' }[page]);
    if (scrollTop) window.scrollTo(0, 0);
    const sup = $('ikSupport'); if (sup) renderSupport(sup);
  }
  function go(href) { history.pushState({}, '', href); render(true); }

  function renderSupport(el) { if (window.WikiSupport) window.WikiSupport.render(el); }


  /* ── events (delegated, CSP-safe) ── */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a && a.getAttribute('href') && a.getAttribute('href').startsWith('/ikigai') && !a.target && !e.metaKey && !e.ctrlKey) {
      e.preventDefault(); go(a.getAttribute('href')); return;
    }
    const tg = e.target.closest('[data-tgl]');
    if (tg && !tg.disabled) { toggle(tg.dataset.tgl); return; }
    const b = e.target.closest('[data-act],[data-dom],[data-country]');
    if (!b) return;
    if (b.dataset.act === 'love-all') { ui.loveAll = true; render(); return; }
    if (b.dataset.dom) { ui.domain = b.dataset.dom; render(); return; }
    if (b.dataset.country) {
      const c = b.dataset.country, list = st.region.countries, i = list.indexOf(c);
      if (i >= 0) list.splice(i, 1); else list.push(c);
      if (!list.length) st.region.mode = 'blend';
      render(); save({ region: st.region }, T('hub.marketUpdated')); return;
    }
    const act = b.dataset.act;
    if (act === 'paygeo-del') { setPayGeos(payGeos().filter((g) => g !== b.dataset.geo)); return; }
    if (act === 'region-blend') { st.region = { mode: 'blend', countries: [] }; render(); save({ region: st.region }, T('hub.marketUpdated')); }
    if (act === 'region-custom') { st.region.mode = 'custom'; render(); }
    if (act === 'skip') { window.WK?.track?.('grades_skipped'); st.gradesSkipped = true; completeStage3().then(() => go('/ikigai')); }
    if (act === 'save-grades') saveGrades();
  });
  document.addEventListener('change', (e) => {
    const t = e.target, act = t.dataset.act;
    if (act === 'sort') { ui.sort = t.value; render(); }
    if (act === 'explore') { ui.exploreDomain = t.value; render(); }
    if (act === 'paygeo-add' && t.value) { setPayGeos([...payGeos(), t.value]); }
    if (act === 'trendf') { ui.trendFilter = t.value; render(); }
    if (act === 'refresh') {
      const d = new Date(); d.setMonth(d.getMonth() + 6);
      if (t.checked) window.WK?.track?.('refresh_optin');
      st.refresh = t.checked ? { optIn: true, cadenceMonths: 6, nextDue: d.toISOString().slice(0, 10) } : { optIn: false };
      save({ refresh: st.refresh }, T(t.checked ? 'hub.refreshOn' : 'hub.refreshOff'));
    }
    if (act === 'country') {
      st.grades.country = t.value;
      const x = COUNTRIES.find((c) => c.code === t.value);
      if (x) setSystem(x.grading);
      readGradeInputs(); render();
    }
    if (act === 'system') { readGradeInputs(); setSystem(t.value); render(); }
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.subj) st.grades.values[t.dataset.subj] = t.value === '' ? '' : Number(t.value);
    if (t.dataset.act === 'worst') st.grades.worst = Number(t.value);
    if (t.dataset.act === 'best') st.grades.best = Number(t.value);
  });
  window.addEventListener('popstate', () => render(true));

  function setSystem(code) { const g = GRADING[code] || GRADING.OTHER; st.grades.system = code; st.grades.worst = g.worst; st.grades.best = g.best; }
  function readGradeInputs() { document.querySelectorAll('[data-subj]').forEach((i) => { st.grades.values[i.dataset.subj] = i.value === '' ? '' : Number(i.value); }); }

  function saveGrades() {
    readGradeInputs();
    const g = st.grades, err = $('ikGradeErr');
    if (!isFinite(g.worst) || !isFinite(g.best) || g.worst === g.best) { err.textContent = T('hub.errRange'); return; }
    const lo = Math.min(g.worst, g.best), hi = Math.max(g.worst, g.best);
    const bad = Object.entries(g.values).filter(([, v]) => v !== '' && v != null && (v < lo || v > hi));
    if (bad.length) { err.textContent = T('hub.errOutside', { subjects: bad.map(([k]) => subjName(k)).join(', '), lo, hi }); return; }
    const filled = Object.values(g.values).filter((v) => v !== '' && v != null).length;
    if (!filled) { err.textContent = T('hub.errNone'); return; }
    st.gradesSkipped = false;
    window.WK?.track?.('grades_saved', { subjects: filled });
    completeStage3().then(() => { if (flow) go('/ikigai'); else render(); });
  }

  /* ── boot ── */
  async function boot() {
    if (!window.CPS?.Store?.token) { location.href = '/login'; return; }
    await I.ready;
    try { results = (await api('/api/user/results')).results || {}; }
    catch (err) { if (err.status === 401) { window.CPS.Store.clear(); location.href = '/login'; return; } results = {}; }
    const s3 = results.stage_3;
    if (s3 && typeof s3 === 'object') {
      if (s3.region) st.region = { mode: s3.region.mode || 'blend', countries: s3.region.countries || [] };
      if (s3.grades) st.grades = { ...st.grades, ...s3.grades, values: { ...(s3.grades.values || {}) } };
      st.gradesSkipped = !!s3.gradesSkipped;
      if (s3.refresh) st.refresh = s3.refresh;
    }
    render(false);
    I.onChange(() => { readGradeInputs(); render(false); });
  }
  boot();

  window.Ikigai = { scored, goodAt, payScore, profile, _st: () => st };
})();
