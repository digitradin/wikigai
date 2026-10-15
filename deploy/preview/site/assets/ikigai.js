/* ============================================================
   Wikigai — "Your Wikigai" hub (ikigai.html)
   Menu pages:
     /ikigai          My Wikigai — match = Love × Good at, C/D as info
     /ikigai/love     ❤️ What I love      (key)  Stage 1 + Stage 2
     /ikigai/skills   🎯 What I'm good at (key)  last year's grades
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

  /* ── reference data ── */
  const COUNTRIES = [
    { code: 'US', name: 'United States', flag: '🇺🇸', market: 'US', grading: 'US_GPA' },
    { code: 'ES', name: 'Spain', flag: '🇪🇸', market: 'EU', grading: 'ES' },
    { code: 'UK', name: 'United Kingdom', flag: '🇬🇧', market: 'EU', grading: 'UK_GCSE' },
    { code: 'DE', name: 'Germany', flag: '🇩🇪', market: 'EU', grading: 'DE' },
    { code: 'FR', name: 'France', flag: '🇫🇷', market: 'EU', grading: 'FR' },
    { code: 'IT', name: 'Italy', flag: '🇮🇹', market: 'EU', grading: 'IT' },
    { code: 'PT', name: 'Portugal', flag: '🇵🇹', market: 'EU', grading: 'PT' },
    { code: 'NL', name: 'Netherlands', flag: '🇳🇱', market: 'EU', grading: 'NL' },
    { code: 'IE', name: 'Ireland', flag: '🇮🇪', market: 'EU', grading: 'PCT' },
    { code: 'EU', name: 'Other European country', flag: '🇪🇺', market: 'EU', grading: 'OTHER' },
  ];
  const GRADING = {
    ES: { label: 'Spain (0–10)', worst: 0, best: 10, hint: 'Pass is 5.' },
    FR: { label: 'France (0–20)', worst: 0, best: 20, hint: 'Pass is 10.' },
    DE: { label: 'Germany (1–6, 1 is best)', worst: 6, best: 1, hint: '1 = sehr gut, 4 = ausreichend (pass).' },
    IT: { label: 'Italy (1–10)', worst: 1, best: 10, hint: 'Pass is 6.' },
    PT: { label: 'Portugal (0–20)', worst: 0, best: 20, hint: 'Pass is 10.' },
    NL: { label: 'Netherlands (1–10)', worst: 1, best: 10, hint: 'Pass is 5.5.' },
    UK_GCSE: { label: 'UK GCSE (1–9)', worst: 1, best: 9, hint: '9 is the top grade, 4 a standard pass.' },
    UK_ALEVEL: { label: 'UK A-level (E=1 … A*=6)', worst: 1, best: 6, hint: 'Enter E=1, D=2, C=3, B=4, A=5, A*=6.' },
    US_GPA: { label: 'US GPA (0–4)', worst: 0, best: 4, hint: 'A=4, B=3, C=2, D=1, F=0.' },
    PCT: { label: 'Percentage (0–100)', worst: 0, best: 100, hint: 'Use your % mark per subject.' },
    IB: { label: 'IB (1–7)', worst: 1, best: 7, hint: '7 is the top grade.' },
    OTHER: { label: 'Other / custom', worst: 0, best: 100, hint: 'Set the lowest and highest grade your school uses.' },
  };
  const SUBJECTS = CFG.subjectClusters || {};
  const TREND = {
    UP: { label: '↑ Trending up', short: 'Up', cls: 'up', rule: 'US jobs grow 5% or more by 2035 (faster than the 3.5% average), or a severe EU shortage.' },
    STABLE: { label: '→ Stable', short: 'Stable', cls: 'stable', rule: 'US jobs grow 0–4% — steady demand, mostly openings from retirements.' },
    UNCERTAIN: { label: '? Uncertain', short: 'Uncertain', cls: 'unc', rule: 'Sources disagree, AI or funding changes could swing it, or there is no official series.' },
    DOWN: { label: '↓ Trending down', short: 'Down', cls: 'down', rule: 'US jobs shrink by 2035. Openings still appear as people retire.' },
  };
  const BAND = { HIGH: 'High', MID: 'Mid', LOW: 'Low', VAR: 'Variable' };
  const US_MEDIAN = CFG.usNationalMedian2025 || 50980;
  const LG = { love: 0.6, good: 0.4 }; // match = love^0.6 × goodAt^0.4

  /* ── state ── */
  let results = {};
  let st = { region: { mode: 'blend', countries: [] }, grades: { system: 'ES', worst: 0, best: 10, values: {} }, gradesSkipped: false, refresh: { optIn: false } };
  let ui = { domain: 'ALL', sort: 'match', exploreDomain: 'MINE', trendFilter: 'ALL' };
  const params = new URLSearchParams(window.__WK_Q__ || location.search);
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
  function loveList() { return Array.isArray(results.stage_2?.love) ? results.stage_2.love : []; }
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
        } catch { toast('Could not save right now — please retry.'); }
        resolve();
      }, 150);
    });
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
    }, '✓ Saved to your account');
  }
  function toast(m) {
    const t = $('ikToast');
    t.textContent = m; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ── shared bits ── */
  const s1Done = () => !!(results.stage_1 && (results.stage_1.completedAt || results.stage_1.ranked));
  const s2Done = () => loveList().length > 0;
  const hasGrades = () => !!profile();

  function pageHead(icon, kicker, title, lead, kind) {
    const tag = kind === 'key' ? '<span class="ik-kind key">Counts in your match</span>' : kind === 'info' ? '<span class="ik-kind info">For information — does not change your match</span>' : '';
    return `<header class="ik-head"><div class="ik-kicker">${icon} ${esc(kicker)}</div><h1>${title}</h1><p>${lead}</p>${tag}</header>`;
  }
  function empty(msg, href, cta) {
    return `<div class="ik-card ik-center ik-empty"><p>${msg}</p><a class="btn-primary" href="${href}">${cta}</a></div>`;
  }
  function trendChip(t, growth) {
    const x = TREND[t] || TREND.UNCERTAIN;
    const g = growth != null ? ` ${growth > 0 ? '+' : ''}${growth}%` : '';
    return `<span class="ik-trend ${x.cls}">${x.label}${esc(g)}</span>`;
  }
  function bandChip(b) { return `<span class="ik-band b-${(b || 'VAR').toLowerCase()}">${BAND[b] || '—'} pay</span>`; }
  function usPay(c) { return c.usMedianPay2025 ? `$${Math.round(c.usMedianPay2025 / 1000)}k` : '—'; }
  function bar(v, color) { return `<div class="ik-track"><i style="width:${v ?? 0}%;background:${color}"></i></div>`; }
  function regionLabel() {
    if (st.region.mode === 'blend' || !st.region.countries.length) return '🌍 US + Europe blend';
    return st.region.countries.map((c) => { const x = COUNTRIES.find((y) => y.code === c); return x ? `${x.flag} ${x.name}` : c; }).join(', ');
  }
  function regionPicker() {
    const custom = st.region.mode === 'custom';
    return `<div class="ik-card ik-region">
      <div class="ik-region-row"><strong>Market:</strong>
        <button class="ik-chip ${!custom ? 'sel' : ''}" data-act="region-blend">🌍 US + Europe blend</button>
        <button class="ik-chip ${custom ? 'sel' : ''}" data-act="region-custom">📍 Pick countries</button>
      </div>
      <div class="ik-countries" style="display:${custom ? 'flex' : 'none'}">
        ${COUNTRIES.map((c) => `<button class="ik-chip ${st.region.countries.includes(c.code) ? 'sel' : ''}" data-country="${c.code}">${c.flag} ${c.name}</button>`).join('')}
      </div>
    </div>`;
  }

  /* ── PAGE: overview ── */
  function pageOverview() {
    if (!s1Done()) return pageHead('✨', 'My Wikigai', 'Find where what you <span class="grad">love</span> meets what you’re <span class="grad">good at</span>', 'Wikigai maps the overlap of four circles. Start with what you love — it takes about 25 minutes.') + empty('You haven’t started yet. Stage 1 maps the areas of work that excite you.', '/survey?stage=1', '▶ Start Stage 1');
    if (!s2Done()) return pageHead('✨', 'My Wikigai', 'Your <span class="grad">Wikigai</span> is taking shape', 'Stage 2 turns your favourite domains into a shortlist of real professions.') + circles() + empty('Next: zoom into professions inside your top domains.', '/survey?stage=2', '→ Continue to Stage 2');
    const list = scored();
    const sorters = { match: (a, b) => b.match - a.match, needs: (a, b) => (rankT(b.trend) - rankT(a.trend)) || b.match - a.match, pay: (a, b) => b.pay - a.pay || b.match - a.match };
    const doms = [...new Set(list.map((r) => r.domain))];
    const shown = list.filter((r) => ui.domain === 'ALL' || r.domain === ui.domain).sort(sorters[ui.sort]).slice(0, 20);
    const nudge = !hasGrades()
      ? `<div class="ik-nudge">🎯 <span>Add last year’s grades to complete <strong>What I’m good at</strong> — your match then weighs love and skill together.</span><a class="btn-primary sm" href="/ikigai/skills">Add grades</a></div>` : '';
    return pageHead('✨', 'My Wikigai', 'Your <span class="grad">Wikigai</span> match', `Your match combines the two key circles: <strong>what you love</strong> and <strong>what you’re good at</strong>. World needs and pay are shown beside each profession to inform your choice. Market: ${esc(regionLabel())}.`)
      + circles() + nudge
      + `<div class="ik-toolbar">
          <div class="ik-filters"><button class="ik-chip ${ui.domain === 'ALL' ? 'sel' : ''}" data-dom="ALL">All</button>${doms.map((d) => `<button class="ik-chip ${ui.domain === d ? 'sel' : ''}" data-dom="${d}">${area(d).icon} ${esc(area(d).name)}</button>`).join('')}</div>
          <label class="ik-sort">Sort by <select data-act="sort"><option value="match" ${ui.sort === 'match' ? 'selected' : ''}>Best match</option><option value="needs" ${ui.sort === 'needs' ? 'selected' : ''}>World needs</option><option value="pay" ${ui.sort === 'pay' ? 'selected' : ''}>Pay</option></select></label>
        </div>
        <div class="ik-results">${shown.map((r, i) => matchCard(r, i)).join('')}</div>`
      + refreshCard() + `<div id="ikSupport"></div>`
      + `<p class="ik-foot">Match = Love<sup>0.6</sup> × Good at<sup>0.4</sup>. World needs: BLS Employment Projections 2025–35, Cedefop, EURES. Pay: BLS OEWS 2025, Eurostat SES 2022 (European bands are estimates).</p>`;
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
      { k: 'love', ico: '❤️', t: 'What I love', v: s2Done() ? esc(top[0]?.career || '') : (s1Done() ? 'Stage 2 to do' : 'Not started'), s: s2Done() ? `${list.length} professions on your shortlist` : 'Stages 1–2', href: '/ikigai/love', key: true, done: s2Done() },
      { k: 'skills', ico: '🎯', t: 'What I’m good at', v: prof ? esc(SUBJECTS[bestSubj[0]] || '') : 'Add grades', s: prof ? `strongest of ${prof.n} subjects` : 'optional, 2 minutes', href: '/ikigai/skills', key: true, done: !!prof },
      { k: 'needs', ico: '🌍', t: 'What the world needs', v: s2Done() ? `${up} of top ${top.length}` : '—', s: 'trending up to 2035', href: '/ikigai/needs', key: false, done: true },
      { k: 'pay', ico: '💰', t: 'What pays', v: s2Done() ? `${hi} of top ${top.length}` : '—', s: 'in the high pay band', href: '/ikigai/pay', key: false, done: true },
    ];
    return `<div class="ik-circles">
      <div class="ik-venn" aria-hidden="true"><i class="v1"></i><i class="v2"></i><i class="v3"></i><i class="v4"></i><b>Wikigai</b></div>
      <div class="ik-cgrid">${c.map((x) => `<a class="ik-ccard ${x.k} ${x.key ? 'key' : 'info'} ${x.done ? '' : 'todo'}" href="${x.href}" data-nav>
        <div class="ik-ct">${x.ico} ${x.t}<span>${x.key ? 'key' : 'info'}</span></div>
        <div class="ik-cv">${x.v}</div><div class="ik-cs">${x.s}</div></a>`).join('')}</div>
    </div>`;
  }

  function matchCard(r, i) {
    const m = area(r.domain);
    return `<div class="ik-res ${i < 3 ? 'top' : ''}">
      <div class="ik-res-head">
        <div class="rank-badge">${i + 1}</div>
        <div class="area-icon-wrap" style="background:${m.color}22;color:${m.color}">${m.icon}</div>
        <div class="ik-res-name"><strong>${esc(r.career)}</strong><small>${esc(SUBS[r.subfield]?.name || '')} · ${esc(m.name)}</small></div>
        ${r.strong ? '<span class="ik-sweet">✨ Strong match</span>' : ''}
        <div class="ik-score"><b>${r.match}</b><small>match</small></div>
      </div>
      <div class="ik-bars">
        <div class="ik-bar"><span>❤️ Love</span>${bar(r.L, '#ff6b9d')}<b>${r.L}</b></div>
        <div class="ik-bar"><span>🎯 Good at</span>${r.G != null ? bar(r.G, '#c44dff') + `<b>${r.G}</b>` : '<a class="ik-addg" href="/ikigai/skills" data-nav>add grades</a><b>—</b>'}</div>
      </div>
      <div class="ik-meta">${trendChip(r.trend, r.c.usGrowth2535)}${bandChip(r.band)}<span class="ik-dim">${market().us ? (r.c.usMedianPay2025 ? 'US median ' + usPay(r.c) : 'no official pay series') : 'Europe estimate'}</span></div>
      <details class="ik-why"><summary>A day in this job</summary><p>${esc(r.c.task || '')}</p>
        <p class="ik-dim">Love = ${r.D}% domain · ${r.S}% subfield · ${r.C}% duels. Outlook source: ${esc(r.c.blsProxy || '—')}${r.c.note ? ' — ' + esc(r.c.note) : ''}.</p></details>
    </div>`;
  }

  function refreshCard() {
    const d = new Date(); d.setMonth(d.getMonth() + 6);
    const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    return `<div class="stage2-cta ik-refresh"><h3>Keep your map fresh</h3>
      <p>Interests, grades, job outlooks and pay all change. We can remind you to refresh your Wikigai every 6 months.</p>
      <label class="ik-check"><input type="checkbox" data-act="refresh" ${st.refresh?.optIn ? 'checked' : ''}> Remind me next spring (around ${label}) and every 6 months after.</label></div>`;
  }

  /* ── PAGE: love ── */
  function pageLove() {
    let h = pageHead('❤️', 'Circle 1 · What I love', 'What you <span class="grad">love</span>', 'Built from your instinctive answers: Stage 1 found the areas of work that excite you, Stage 2 narrowed them to subfields and real professions through head-to-head duels.', 'key');
    const s1 = results.stage_1;
    h += `<div class="ik-steps2">
      ${stepCard(1, 'World Discovery', '70 pairs · 8 domains', s1Done(), '/survey?stage=1', s1Done() ? '/survey?stage=1&review=1' : null)}
      ${stepCard(2, 'Profession Focus', 'subfield pairs + profession duels', s2Done(), s1Done() ? '/survey?stage=2' : null, s2Done() ? '/survey?stage=2&review=1' : null)}
    </div>`;
    if (!s1Done()) return h + empty('Start with Stage 1 — about 12 minutes, no right or wrong answers.', '/survey?stage=1', '▶ Start Stage 1');
    const ranked = (s1.ranked || []).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const max = Math.max(1, ...ranked.map((r) => r.score ?? 0));
    const prefs = s1.domainPrefs || {};
    h += `<div class="ik-card"><h2>Your domains</h2><p class="ik-sub">Up to 4 domains go into Stage 2. Change them on your <a href="/dashboard">dashboard</a>.</p>
      ${ranked.map((r) => { const m = area(r.area); const pct = Math.round(((r.score ?? 0) / max) * 100); const on = prefs[r.area] !== false;
        return `<div class="ik-row ${on ? '' : 'off'}"><span class="ik-rlabel">${m.icon} ${esc(m.name)}</span>${bar(pct, m.color)}<b>${pct}%</b><span class="ik-dim">${on ? 'kept' : '—'}</span></div>`; }).join('')}
    </div>`;
    if (!s2Done()) return h + empty('Next: Stage 2 zooms into your kept domains — about 15 minutes.', '/survey?stage=2', '→ Continue to Stage 2');
    const s2 = results.stage_2;
    const subPct = s2.subPct || {};
    const kept = Object.keys(s2.subPrefs || {}).filter((k) => s2.subPrefs[k]);
    h += `<div class="ik-card"><h2>Your favourite subfields</h2><p class="ik-sub">From 12 quick pairs per domain. These went into the profession duels.</p>
      ${kept.sort((a, b) => (subPct[b] || 0) - (subPct[a] || 0)).map((s) => { const m = area(SUBS[s]?.domain); return `<div class="ik-row"><span class="ik-rlabel">${m.icon} ${esc(SUBS[s]?.name || s)}</span>${bar(subPct[s], m.color)}<b>${subPct[s] ?? '—'}%</b><span></span></div>`; }).join('')}
    </div>`;
    const love = loveList().slice(0, 20);
    h += `<div class="ik-card"><h2>Your profession shortlist</h2><p class="ik-sub">Love score = 40% domain fit + 35% subfield fit + 25% duel wins.</p>
      <div class="ik-table"><div class="ik-tr ik-th"><span>#</span><span>Profession</span><span>Love</span><span>Domain</span><span>Subfield</span><span>Duels</span></div>
      ${love.map((l, i) => `<div class="ik-tr"><span>${i + 1}</span><span><strong>${esc(l.career)}</strong><small>${esc(SUBS[l.subfield]?.name || '')}</small></span><span class="ik-num love">${l.L}</span><span>${l.D}%</span><span>${l.S}%</span><span>${l.C}%</span></div>`).join('')}
      </div></div>`;
    return h + nextLink('/ikigai/skills', '🎯 Next: What I’m good at');
  }
  function stepCard(n, t, d, done, href, review) {
    return `<div class="ik-stepcard ${done ? 'done' : ''}"><div class="ik-stepn">${done ? '✓' : n}</div><div><strong>Stage ${n} · ${t}</strong><small>${d}</small></div>
      <div class="ik-stepact">${review ? `<a class="btn-ghost sm" href="${review}">Review</a>` : ''}${href ? `<a class="${done ? 'btn-ghost' : 'btn-primary'} sm" href="${href}">${done ? 'Retake' : 'Start'}</a>` : '<span class="ik-dim">after Stage 1</span>'}</div></div>`;
  }
  function nextLink(href, label) { return `<div class="ik-next"><a class="btn-primary" href="${href}" data-nav>${label} →</a></div>`; }

  /* ── PAGE: skills ── */
  function pageSkills() {
    const g = st.grades;
    const sys = GRADING[g.system] || GRADING.OTHER;
    const prof = profile();
    let h = pageHead('🎯', 'Circle 2 · What I’m good at', 'What you’re <span class="grad">good at</span>', 'Your grades from last year show where your strengths are. We compare each subject with <em>your own</em> average too, so a strict school or a tough year doesn’t hide a real talent. Optional — but it makes your match much sharper.', 'key');
    h += `<div class="ik-card">
      <h2>Your grades <span class="ik-opt">optional · 2 minutes</span></h2>
      <div class="ik-grid2">
        <label class="ik-field">Where did you study?
          <select data-act="country">${['', ...COUNTRIES.map((c) => c.code)].map((c) => { const x = COUNTRIES.find((y) => y.code === c); return `<option value="${c}" ${c === (st.grades.country || '') ? 'selected' : ''}>${x ? x.flag + ' ' + x.name : 'Choose a country…'}</option>`; }).join('')}</select>
        </label>
        <label class="ik-field">Grading system
          <select data-act="system">${Object.keys(GRADING).map((k) => `<option value="${k}" ${k === g.system ? 'selected' : ''}>${GRADING[k].label}</option>`).join('')}</select>
        </label>
      </div>
      <div class="ik-range-row">
        <label class="ik-field">Lowest grade<input data-act="worst" type="number" step="any" value="${g.worst}"></label>
        <span class="ik-arrow">→</span>
        <label class="ik-field">Highest grade<input data-act="best" type="number" step="any" value="${g.best}"></label>
        <p class="ik-note">${esc(sys.hint)} Edit the range if your school uses a different one.</p>
      </div>
      <div class="ik-subjects">
        ${Object.keys(SUBJECTS).map((k) => `<label class="ik-subject"><span>${esc(SUBJECTS[k])}</span><input type="number" step="any" inputmode="decimal" data-subj="${k}" value="${g.values[k] ?? ''}" placeholder="—"></label>`).join('')}
      </div>
      <p class="ik-note ik-err" id="ikGradeErr"></p>
      <div class="cta-row"><button class="btn-ghost" data-act="skip">Skip for now</button><button class="btn-primary" data-act="save-grades">${flow ? 'Save and see my Wikigai →' : 'Save grades'}</button></div>
    </div>`;
    if (prof) {
      const subj = Object.entries(prof.pct).sort((a, b) => b[1] - a[1]);
      h += `<div class="ik-card"><h2>Your strengths</h2><p class="ik-sub">Bar = your grade on a 0–100 scale. ▲ = above your own average (${Math.round(prof.mean)}).</p>
        ${subj.map(([k, v]) => `<div class="ik-row"><span class="ik-rlabel">${esc(SUBJECTS[k])}</span>${bar(Math.round(v), v >= prof.mean ? '#c44dff' : '#6b5bff')}<b>${Math.round(v)}</b><span class="ik-dim">${v >= prof.mean + 5 ? '▲ strength' : v <= prof.mean - 5 ? '▼' : ''}</span></div>`).join('')}
      </div>`;
      const fits = Object.keys(CFG.subjectWeights || {}).map((s) => ({ s, G: goodAt(s, prof) })).sort((a, b) => b.G - a.G);
      const mine = new Set(loveList().map((l) => l.subfield));
      h += `<div class="ik-card"><h2>Subfields that fit your strengths</h2><p class="ik-sub">All 32 subfields, scored on the subjects they rely on most. ❤️ = also on your love shortlist.</p>
        ${fits.slice(0, 12).map((f) => { const m = area(SUBS[f.s]?.domain); return `<div class="ik-row"><span class="ik-rlabel">${m.icon} ${esc(SUBS[f.s]?.name || f.s)} ${mine.has(f.s) ? '❤️' : ''}</span>${bar(f.G, m.color)}<b>${f.G}</b><span class="ik-dim">${esc(Object.keys(CFG.subjectWeights[f.s]).map((k) => (SUBJECTS[k] || k).split(/[ ,/&]/)[0]).join(' · '))}</span></div>`; }).join('')}
      </div>` + nextLink('/ikigai', '✨ See my Wikigai match');
    }
    return h;
  }

  /* ── PAGE: needs ── */
  function pageNeeds() {
    let h = pageHead('🌍', 'Circle 3 · What the world needs', 'What the <span class="grad">world needs</span>', 'How demand for each profession is expected to change to 2035. Use it to inform your choice: a stable or uncertain field can still be right for you, and every field has openings when people retire.', 'info');
    h += `<div class="ik-legend">${Object.keys(TREND).map((k) => `<div class="ik-leg"><span class="ik-trend ${TREND[k].cls}">${TREND[k].label}</span><small>${TREND[k].rule}</small></div>`).join('')}</div>`;
    h += exploreTable('needs');
    h += `<div class="ik-card ik-sources"><h2>Where this comes from</h2><ul>
      <li><a href="https://www.bls.gov/news.release/ecopro.nr0.htm" target="_blank" rel="noopener">US BLS Employment Projections 2025–35</a> (27 Aug 2026) — main source; all jobs grow 3.5%.</li>
      <li><a href="https://www.cedefop.europa.eu/en/tools/skills-forecast" target="_blank" rel="noopener">Cedefop Skills Forecast 2035</a> and the <a href="https://www.ela.europa.eu/en/news/ela-launches-2025-eures-report-highlighting-structural-labour-shortages-across-europe" target="_blank" rel="noopener">EURES labour shortages report 2025</a> — European checks (e.g. doctors and nurses in shortage).</li>
      <li><a href="https://www.weforum.org/stories/2025/01/future-of-jobs-report-2025-the-fastest-growing-and-declining-jobs/" target="_blank" rel="noopener">WEF Future of Jobs 2025</a> and the <a href="https://www.ilo.org/sites/default/files/2025-05/Research%20brief_GenAI%202025%20Update.pdf" target="_blank" rel="noopener">ILO GenAI exposure index 2025</a> — AI disruption signals.</li>
      </ul><p class="ik-dim">Some professions use a close official occupation as a proxy; it is named under each one.</p></div>`;
    return h;
  }

  /* ── PAGE: pay ── */
  function pagePay() {
    const m = market();
    let h = pageHead('💰', 'Circle 4 · What pays', 'What <span class="grad">pays</span>', 'Typical pay for each profession from official statistics. Pay varies a lot by country, experience and city, so treat it as a guide — starting pay is lower than these medians.', 'info');
    h += regionPicker();
    h += `<div class="ik-legend">
      <div class="ik-leg">${bandChip('HIGH')}<small>US ≥ $100k a year (about 2× the US median of $${Math.round(US_MEDIAN / 1000)}k). Europe: ≥ 1.5× the country’s median.</small></div>
      <div class="ik-leg">${bandChip('MID')}<small>US $60k–$99k. Europe: 1.0–1.5× the country’s median.</small></div>
      <div class="ik-leg">${bandChip('LOW')}<small>US under $60k. Europe: below the country’s median.</small></div>
      <div class="ik-leg">${bandChip('VAR')}<small>No official series (founders, diplomats…) — income varies widely.</small></div>
    </div>`;
    h += exploreTable('pay');
    h += `<div class="ik-card ik-sources"><h2>Where this comes from</h2><ul>
      ${m.us ? '<li><a href="https://www.bls.gov/ooh/" target="_blank" rel="noopener">US Occupational Outlook Handbook</a> — 2025 median pay per occupation; <a href="https://www.bls.gov/news.release/ocwage.t01.htm" target="_blank" rel="noopener">BLS OEWS May 2025</a> for the national median.</li>' : ''}
      ${m.eu ? '<li><a href="https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Earnings_statistics" target="_blank" rel="noopener">Eurostat Structure of Earnings Survey 2022</a> — pay by occupation group (managers 1.9×, professionals 1.3×, technicians 1.1× the average). European bands per profession are estimates.</li>' : ''}
      </ul></div>`;
    return h;
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
    const opts = `${mineMap.size ? `<option value="MINE" ${ui.exploreDomain === 'MINE' ? 'selected' : ''}>❤️ My shortlist (${mineMap.size})</option>` : ''}<option value="ALL" ${ui.exploreDomain === 'ALL' ? 'selected' : ''}>All ${CAREERS.length} professions</option>${doms.map((d) => `<option value="${d}" ${ui.exploreDomain === d ? 'selected' : ''}>${area(d).icon} ${esc(area(d).name)}</option>`).join('')}`;
    const tf = kind === 'needs' ? `<select data-act="trendf"><option value="ALL">All outlooks</option>${Object.keys(TREND).map((k) => `<option value="${k}" ${ui.trendFilter === k ? 'selected' : ''}>${TREND[k].label}</option>`).join('')}</select>` : '';
    const summary = kind === 'needs' ? `<p class="ik-sub">${Object.keys(TREND).map((k) => `${TREND[k].short}: <strong>${counts[k] || 0}</strong>`).join(' · ')}</p>` : '';
    const m = market();
    return `<div class="ik-card"><div class="ik-toolbar"><h2>${kind === 'needs' ? 'Outlook by profession' : 'Pay by profession'}</h2><div class="ik-selects"><select data-act="explore">${opts}</select>${tf}</div></div>${summary}
      <div class="ik-table ${kind}">
        <div class="ik-tr ik-th"><span>Profession</span>${kind === 'needs' ? '<span>Outlook to 2035</span><span>US change</span><span>Source / note</span>' : `<span>${m.us && m.eu ? 'Blended band' : m.us ? 'US band' : 'Europe band'}</span>${m.us ? '<span>US median</span>' : ''}`}</div>
        ${rows.map((c) => { const mine = mineMap.has(c.career); const ar = area(c.domain);
          return `<div class="ik-tr ${mine ? 'mine' : ''}"><span><strong>${mine ? '❤️ ' : ''}${esc(c.career)}</strong><small>${ar.icon} ${esc(c.subfieldName || '')}</small></span>${kind === 'needs'
            ? `<span>${trendChip(c.trend)}</span><span class="ik-num">${c.usGrowth2535 != null ? (c.usGrowth2535 > 0 ? '+' : '') + c.usGrowth2535 + '%' : '—'}</span><span class="ik-dim">${esc(c.blsProxy || '')}${c.note ? ' — ' + esc(c.note) : ''}</span>`
            : `<span>${bandChip(payBand(c))}</span>${m.us ? `<span class="ik-num">${usPay(c)}</span>` : ''}`}</div>`; }).join('') || '<p class="ik-dim" style="padding:12px">No professions match this filter.</p>'}
      </div></div>`;
  }

  /* ── router ── */
  const PAGES = { overview: pageOverview, love: pageLove, skills: pageSkills, needs: pageNeeds, pay: pagePay };
  function current() {
    const seg = window.__WK_PAGE__ ? window.__WK_PAGE__() : (location.pathname.replace(/\/+$/, '').split('/')[2] || 'overview');
    return PAGES[seg] ? seg : 'overview';
  }
  function render(scrollTop) {
    const page = current();
    document.querySelectorAll('.ik-tab').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
    const at = document.querySelector('.ik-tab.active'); if (at && at.scrollIntoView) at.scrollIntoView({ block: 'nearest', inline: 'center' });
    let html = PAGES[page]();
    if (page === 'overview' && !html.includes('id="ikSupport"')) html += '<div id="ikSupport"></div>';
    $('ikApp').innerHTML = `<div class="ik-page">${html}</div>`;
    document.title = { overview: 'My Wikigai', love: 'What I love', skills: 'What I’m good at', needs: 'What the world needs', pay: 'What pays' }[page] + (page === 'overview' ? '' : ' — Wikigai');
    if (scrollTop) window.scrollTo(0, 0);
    const sup = $('ikSupport'); if (sup) renderSupport(sup);
  }
  function go(href) { history.pushState({}, '', window.__WK_URL__ ? window.__WK_URL__(href) : href); render(true); }

  function renderSupport(el) { if (window.WikiSupport) window.WikiSupport.render(el); }


  /* ── events (delegated, CSP-safe) ── */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a && a.getAttribute('href') && a.getAttribute('href').startsWith('/ikigai') && !a.target && !e.metaKey && !e.ctrlKey) {
      e.preventDefault(); go(a.getAttribute('href')); return;
    }
    const b = e.target.closest('[data-act],[data-dom],[data-country]');
    if (!b) return;
    if (b.dataset.dom) { ui.domain = b.dataset.dom; render(); return; }
    if (b.dataset.country) {
      const c = b.dataset.country, list = st.region.countries, i = list.indexOf(c);
      if (i >= 0) list.splice(i, 1); else list.push(c);
      if (!list.length) st.region.mode = 'blend';
      render(); save({ region: st.region }, '✓ Market updated'); return;
    }
    const act = b.dataset.act;
    if (act === 'region-blend') { st.region = { mode: 'blend', countries: [] }; render(); save({ region: st.region }, '✓ Market updated'); }
    if (act === 'region-custom') { st.region.mode = 'custom'; render(); }
    if (act === 'skip') { st.gradesSkipped = true; completeStage3().then(() => go('/ikigai')); }
    if (act === 'save-grades') saveGrades();
  });
  document.addEventListener('change', (e) => {
    const t = e.target, act = t.dataset.act;
    if (act === 'sort') { ui.sort = t.value; render(); }
    if (act === 'explore') { ui.exploreDomain = t.value; render(); }
    if (act === 'trendf') { ui.trendFilter = t.value; render(); }
    if (act === 'refresh') {
      const d = new Date(); d.setMonth(d.getMonth() + 6);
      st.refresh = t.checked ? { optIn: true, cadenceMonths: 6, nextDue: d.toISOString().slice(0, 10) } : { optIn: false };
      save({ refresh: st.refresh }, t.checked ? '🔔 We’ll remind you in 6 months' : 'Reminder off');
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
    if (!isFinite(g.worst) || !isFinite(g.best) || g.worst === g.best) { err.textContent = 'Lowest and highest grade must be two different numbers.'; return; }
    const lo = Math.min(g.worst, g.best), hi = Math.max(g.worst, g.best);
    const bad = Object.entries(g.values).filter(([, v]) => v !== '' && v != null && (v < lo || v > hi));
    if (bad.length) { err.textContent = `${bad.map(([k]) => SUBJECTS[k]).join(', ')}: outside ${lo}–${hi}. Fix the grade or edit the range.`; return; }
    const filled = Object.values(g.values).filter((v) => v !== '' && v != null).length;
    if (!filled) { err.textContent = 'Enter at least one grade, or choose “Skip for now”.'; return; }
    st.gradesSkipped = false;
    completeStage3().then(() => { if (flow) go('/ikigai'); else render(); });
  }

  /* ── boot ── */
  async function boot() {
    if (!window.CPS?.Store?.token) { location.href = window.__WK_URL__('/login'); return; }
    try { results = (await api('/api/user/results')).results || {}; }
    catch (err) { if (err.status === 401) { window.CPS.Store.clear(); location.href = window.__WK_URL__('/login'); return; } results = {}; }
    const s3 = results.stage_3;
    if (s3 && typeof s3 === 'object') {
      if (s3.region) st.region = { mode: s3.region.mode || 'blend', countries: s3.region.countries || [] };
      if (s3.grades) st.grades = { ...st.grades, ...s3.grades, values: { ...(s3.grades.values || {}) } };
      st.gradesSkipped = !!s3.gradesSkipped;
      if (s3.refresh) st.refresh = s3.refresh;
    }
    render(false);
  }
  boot();

  window.Ikigai = { scored, goodAt, payScore, profile, _st: () => st };
})();
