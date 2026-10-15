/* ============================================================
   CPS Survey runtime — multi-stage
   1: World Discovery   — 70 paired questions over 8 domains
   2: Profession Focus  — Part A subfield pairs per kept domain,
                          Part B profession duels per kept subfield
   3: Wikigai Match      — handled by ikigai.js (region, grades, weights)
   - 1–5 paired scale, 25s timer, same point rule in every stage
   - Stage 1: max 4 domains kept (<25% of top => excluded, overridable)
   - Autosaves each stage to /api/user/results
   ============================================================ */
(function () {
  const S2 = window.STAGE_DATA_2B || null;
  const ALL = {
    1: window.STAGE_DATA,   // survey-data.js
    2: S2,                  // survey-data-2b.js (old survey-data-2.js kept as survey-data-2.legacy.js)
    3: { ui: { navStage: 'Stage 3 of 3 — Wikigai Match' }, questions: [] },
  };

  const UNDESIRED_THRESHOLD = 0.25; // <25% of the top score => undesired
  const MAX_DOMAINS = (S2 && S2.config && S2.config.maxDomains) || 4;
  const KEEP_SUBS = (S2 && S2.config && S2.config.keepSubfieldsDefault) || 2;
  const LOVE_W = (S2 && S2.config && S2.config.love) || { domain: 0.4, subfield: 0.35, career: 0.25, careerNotDuelled: 50 };
  const TIMER_MAX = 25;
  const CIRC = 100.53;

  let stage = 1;
  let D = null;            // active dataset
  let AREAS = {}, CAREERS = {};
  let QUESTIONS = [];      // full question pool for the current part
  let active = [];         // filtered questions actually asked
  let currentQ = 0;
  let scores = {};
  let answers = [];
  let timerInterval = null;
  let timeLeft = TIMER_MAX;
  let areaOrder = [];
  let stageComplete = false;
  let saveTimer = null;
  let reviewMode = false;

  // domain preference map: { AREA_KEY: true|false }  (true = included)
  let domainPrefs = null;
  let s1Ranked = null;     // saved stage-1 ranking [{area, score}]

  // stage-2 state
  let s2phase = 'A';       // 'A' subfields | 'B' professions | 'done'
  let keptDomains = [];    // ordered by stage-1 rank
  let domainPct = {};      // stage-1 % of top domain
  let subScores = {}, subApps = {};
  let careerScores = {}, careerApps = {};
  let subPrefs = null;     // { 'HEALTH.MED': true, ... }
  let subPctMap = {};

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const areaMeta = (k) => (window.STAGE_DATA?.areas || {})[k] || { name: k, icon: '•', color: '#94a3b8', desc: '' };
  const subName = (k) => (S2?.subfields?.[k]?.name) || k;

  const areaTagOf = (q) => {
    if (!q) return '';
    if (q.subA && q.subB) return areaMeta(q.domain).name;
    if (q.careerA) return subName(q.sub);
    const a = q.areaA ? (AREAS[q.areaA]?.name || q.areaA) : '';
    const b = q.areaB ? (AREAS[q.areaB]?.name || q.areaB) : '';
    if (a && b) return `${a}  ·  ${b}`;
    return a || b || '';
  };

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $(id).classList.add('active');
  }

  /* ── stage bootstrapping ── */
  function setDataset(stageNum) {
    D = ALL[stageNum];
    if (!D) return false;
    AREAS = window.STAGE_DATA?.areas || {};
    CAREERS = window.STAGE_DATA?.careers || {};
    if (stageNum === 2) QUESTIONS = (D.partA || []).slice();
    else QUESTIONS = D.questions || [];
    areaOrder = Object.keys(AREAS);
    return true;
  }

  function applyStageChrome() {
    const ui = D.ui || {};
    if (ui.navStage) $('navStage').textContent = ui.navStage;
    if (ui.badgeText) $('badgeText').textContent = ui.badgeText;
    if (ui.introTitle) $('introTitle').textContent = ui.introTitle;
    if (ui.introSub) $('introSub').textContent = ui.introSub;
    $('beginLabel').textContent = `Begin Stage ${stage}`;
    $('resultsBadge').textContent = `Stage ${stage} Complete`;
    const titles = {
      1: ['Your Career', 'World Map'],
      2: ['Your Profession', 'Shortlist'],
      3: ['Your Wikigai', 'Match'],
    }[stage] || ['Your', 'Results'];
    $('resultsTitleA').textContent = titles[0];
    $('resultsTitleB').textContent = titles[1];
    $('ctaTitle').textContent = `Stage ${stage} complete — well done!`;
    $('ctaText').textContent = 'Your results have been saved to your account.';
    $('nextBtn').style.display = stage < 3 ? 'inline-flex' : 'none';
    if (stage < 3) $('nextBtn').textContent = `→ Continue to Stage ${stage + 1}`;
    $('retakeBtn').textContent = `↺ Retake Stage ${stage}`;
    $('domainTuner').style.display = stage === 1 ? 'block' : 'none';
    if (stage === 2) {
      document.querySelectorAll('.how-card h4')[2] && (document.querySelectorAll('.how-card h4')[2].textContent = 'Two short parts');
      const p = document.querySelectorAll('.how-card p');
      if (p[2]) p[2].textContent = 'First pick the subfields you like in each domain, then duel real professions head to head.';
    }
  }

  /* ── stage-1 domain cap ── */
  function countOn(prefs) { return Object.values(prefs || {}).filter((v) => v !== false).length; }

  function prefsFromRanking(ranked, max) {
    const prefs = {};
    let kept = 0;
    ranked.forEach((r) => {
      const ok = r.score / max >= UNDESIRED_THRESHOLD && kept < MAX_DOMAINS;
      prefs[r.key] = ok;
      if (ok) kept++;
    });
    return prefs;
  }

  /* ── stage-2 helpers ── */
  function computeKeptDomains() {
    const ranked = (s1Ranked || []).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const max = Math.max(1, ...ranked.map((r) => r.score ?? 0));
    domainPct = {};
    ranked.forEach((r) => { domainPct[r.area] = Math.round(((r.score ?? 0) / max) * 100); });
    let order = ranked.map((r) => r.area);
    if (!order.length) order = Object.keys(AREAS);
    let kept = order.filter((k) => !domainPrefs || domainPrefs[k] !== false);
    if (!kept.length) kept = order.slice(0, MAX_DOMAINS);
    keptDomains = kept.slice(0, MAX_DOMAINS);
    keptDomains.forEach((k) => { if (domainPct[k] == null) domainPct[k] = 100; });
  }

  function addPoints(bucket, apps, keyA, keyB, value, w) {
    apps[keyA] = (apps[keyA] || 0) + 1;
    apps[keyB] = (apps[keyB] || 0) + 1;
    if (value == null) return;
    if (value <= 2) bucket[keyA] = (bucket[keyA] || 0) + w * (3 - value);
    else if (value >= 4) bucket[keyB] = (bucket[keyB] || 0) + w * (value - 3);
    else {
      bucket[keyA] = (bucket[keyA] || 0) + w * 0.5;
      bucket[keyB] = (bucket[keyB] || 0) + w * 0.5;
    }
  }

  function subfieldsOf(domain) {
    return Object.keys(S2.subfields).filter((k) => S2.subfields[k].domain === domain);
  }

  function computeSubPct() {
    subPctMap = {};
    keptDomains.forEach((d) => {
      const subs = subfieldsOf(d);
      const max = Math.max(0.0001, ...subs.map((s) => subScores[s] || 0));
      subs.forEach((s) => { subPctMap[s] = Math.round(((subScores[s] || 0) / max) * 100); });
    });
  }

  function defaultSubPrefs() {
    const prefs = {};
    keptDomains.forEach((d) => {
      const subs = subfieldsOf(d).sort((a, b) => (subPctMap[b] || 0) - (subPctMap[a] || 0));
      subs.forEach((s, i) => { prefs[s] = i < KEEP_SUBS && (subPctMap[s] || 0) >= UNDESIRED_THRESHOLD * 100; });
      if (!subs.some((s) => prefs[s])) prefs[subs[0]] = true;
    });
    return prefs;
  }

  function computeLove() {
    // career duel % relative to the top career in the same subfield
    const bySub = {};
    S2.careers.forEach((c) => { (bySub[c.subfield] = bySub[c.subfield] || []).push(c); });
    const out = [];
    Object.keys(bySub).forEach((sub) => {
      if (!subPrefs || !subPrefs[sub]) return;
      const dom = S2.subfields[sub].domain;
      if (!keptDomains.includes(dom)) return;
      const list = bySub[sub];
      const duelled = list.filter((c) => careerApps[c.career]);
      const max = Math.max(0.0001, ...duelled.map((c) => careerScores[c.career] || 0));
      list.forEach((c) => {
        const Dp = domainPct[dom] ?? 100;
        const Sp = subPctMap[sub] ?? 50;
        const Cp = careerApps[c.career] ? Math.round(((careerScores[c.career] || 0) / max) * 100) : LOVE_W.careerNotDuelled;
        const L = Math.round(LOVE_W.domain * Dp + LOVE_W.subfield * Sp + LOVE_W.career * Cp);
        out.push({ career: c.career, domain: dom, subfield: sub, D: Dp, S: Sp, C: Cp, L });
      });
    });
    out.sort((a, b) => b.L - a.L);
    return out;
  }

  /* ── filtering ── */
  function applyDomainFilter() {
    if (stage === 2) {
      if (s2phase === 'A') {
        const rank = (d) => keptDomains.indexOf(d);
        active = QUESTIONS.filter((q) => keptDomains.includes(q.domain))
          .sort((a, b) => rank(a.domain) - rank(b.domain));
      } else {
        const order = Object.keys(subPrefs || {}).filter((k) => subPrefs[k]);
        active = (S2.partB || []).filter((q) => subPrefs && subPrefs[q.sub])
          .sort((a, b) => keptDomains.indexOf(S2.subfields[a.sub].domain) - keptDomains.indexOf(S2.subfields[b.sub].domain) || order.indexOf(a.sub) - order.indexOf(b.sub));
      }
      return;
    }
    if (stage === 1 || !domainPrefs) { active = QUESTIONS.slice(); return; }
    active = QUESTIONS.filter((q) => {
      const aOn = q.areaA ? domainPrefs[q.areaA] !== false : true;
      const bOn = q.areaB ? domainPrefs[q.areaB] !== false : true;
      return aOn && bOn;
    });
    if (active.length < 4) active = QUESTIONS.slice();
  }

  function showFilterNotice() {
    const el = $('filterNotice');
    if (stage === 2) {
      const names = keptDomains.map((k) => `${areaMeta(k).icon} ${areaMeta(k).name}`).join(', ');
      el.style.display = 'block';
      el.innerHTML = `🔎 Focused on your ${keptDomains.length} domain${keptDomains.length === 1 ? '' : 's'}: <strong>${esc(names)}</strong>. ` +
        `Part A has ${keptDomains.length * 12} quick pairs; Part B duels follow for the subfields you keep. ` +
        `<a href="/dashboard" style="color:inherit">Change domains</a>`;
      return;
    }
    if (stage === 1 || !domainPrefs) { el.style.display = 'none'; return; }
    el.style.display = 'none';
  }

  /* ── run ── */
  function resetScores() {
    scores = {};
    areaOrder.forEach((a) => (scores[a] = 0));
  }

  window.startSurvey = function () {
    resetScores();
    answers = [];
    currentQ = 0;
    stageComplete = false;
    reviewMode = false;
    clearTimeout(saveTimer);
    if (stage === 2) {
      s2phase = 'A';
      subScores = {}; subApps = {}; careerScores = {}; careerApps = {}; subPrefs = null;
      QUESTIONS = (S2.partA || []).slice();
    }
    applyDomainFilter();
    showFilterNotice();
    showScreen('survey');
    $('navCounter').style.display = 'block';
    renderQ();
  };

  function startPartB() {
    s2phase = 'B';
    answers = [];
    currentQ = 0;
    stageComplete = false;
    applyDomainFilter();
    if (!active.length) return finishStage();
    showScreen('survey');
    $('navCounter').style.display = 'block';
    renderQ();
  }

  /* ── timer ── */
  function startTimer() {
    stopTimer();
    timeLeft = TIMER_MAX;
    updateTimerRing();
    timerInterval = setInterval(() => {
      timeLeft--;
      updateTimerRing();
      if (timeLeft <= 0) {
        stopTimer();
        commitAnswer(3, true);
      }
    }, 1000);
  }
  function stopTimer() { if (timerInterval) clearInterval(timerInterval); timerInterval = null; }
  function updateTimerRing() {
    const arc = $('timerArc');
    if (!arc) return;
    const frac = Math.max(0, timeLeft) / TIMER_MAX;
    arc.style.strokeDashoffset = String(CIRC * (1 - frac));
    arc.style.stroke = timeLeft <= 5 ? '#ef4444' : timeLeft <= 10 ? '#ff8c42' : '#c44dff';
    $('timerNum').textContent = String(Math.max(0, timeLeft));
  }

  /* ── render a question ── */
  function renderQ() {
    if (currentQ >= active.length) return finishStage();
    const q = active[currentQ];
    $('qBadge').textContent = stage === 2 ? (s2phase === 'A' ? `Part A · ${currentQ + 1}` : `Part B · ${currentQ + 1}`) : (q.id || `Q${String(currentQ + 1).padStart(3, '0')}`);
    $('qAreaTag').textContent = areaTagOf(q);
    $('qText').textContent = q.text;
    $('optA').textContent = q.a || '—';
    $('optB').textContent = q.b || '—';

    const total = active.length;
    $('progLabel').textContent = `${currentQ + 1} / ${total}`;
    $('navCounter').textContent = `${currentQ + 1}/${total}`;
    $('progressBar').style.width = `${Math.round((currentQ / total) * 100)}%`;

    for (let i = 1; i <= 5; i++) $('pip' + i).className = 'pip';
    $('optA').className = 'scale-option opt-a';
    $('optB').className = 'scale-option opt-b';
    $('nextHint').style.display = 'none';
    $('qOuter').style.animation = 'none';
    void $('qOuter').offsetWidth;
    $('qOuter').style.animation = 'popIn .35s';
    startTimer();
  }

  let committing = false;
  window.selectPip = function (n) {
    if (committing) return;
    committing = true;
    for (let i = 1; i <= 5; i++) $('pip' + i).className = 'pip' + (i === n ? ` active-${n}` : '');
    $('optA').className = 'scale-option opt-a' + (n <= 2 ? ' lit-a' : '');
    $('optB').className = 'scale-option opt-b' + (n >= 4 ? ' lit-b' : '');
    $('nextHint').style.display = 'none';
    setTimeout(() => { committing = false; commitAnswer(n, false); }, 260);
  };
  window.skipQuestion = function () { if (!committing) commitAnswer(null, true); };

  /* ── commit + score ── */
  function commitAnswer(value, auto) {
    stopTimer();
    const q = active[currentQ];
    if (!q) return;
    const w = q.weight || 1;
    if (q.subA && q.subB) addPoints(subScores, subApps, q.subA, q.subB, value, w);
    else if (q.careerA && q.careerB) addPoints(careerScores, careerApps, q.careerA, q.careerB, value, w);
    else if (value != null && q.areaA && q.areaB) {
      if (value <= 2) scores[q.areaA] = (scores[q.areaA] || 0) + w * (3 - value);
      else if (value >= 4) scores[q.areaB] = (scores[q.areaB] || 0) + w * (value - 3);
      else {
        scores[q.areaA] = (scores[q.areaA] || 0) + w * 0.5;
        scores[q.areaB] = (scores[q.areaB] || 0) + w * 0.5;
      }
    }
    answers.push({ id: q.id, value, auto: !!auto });
    saveProgress();
    currentQ++;
    renderQ();
  }

  function saveProgress() {
    if (stageComplete || reviewMode) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (stageComplete) return;
      const token = window.CPS?.Store?.token;
      if (!token || !window.CPS?.api) return;
      const body = stage === 2
        ? { partial: true, phase: s2phase, answered: answers.length, subScores, careerScores }
        : { partial: true, answered: answers.length, scores };
      window.CPS.api('/api/user/results', { method: 'POST', body: { stage, results: body } }).catch(() => {});
    }, 1500);
  }

  /* ── finished ── */
  function finishStage() {
    stopTimer();
    stageComplete = true;
    clearTimeout(saveTimer);
    $('navCounter').style.display = 'none';
    if (stage === 2) return finishStage2();
    const ranked = rankScores();
    const max = Math.max(1, ...ranked.map((r) => r.score));
    if (stage === 1) domainPrefs = prefsFromRanking(ranked, max);
    renderResults(ranked, max, { readonly: false });
    showScreen('results');
    persistStage(ranked, max);
  }

  function rankScores() {
    return Object.entries(scores)
      .map(([key, raw]) => ({ key, raw, score: raw }))
      .sort((a, b) => b.score - a.score);
  }

  /* ── stage-1 results (also used for review) ── */
  function renderResults(ranked, max, opts) {
    const readonly = !!opts.readonly;
    const wrap = $('areaCards');
    wrap.innerHTML = '';
    if (stage === 1 && !readonly) {
      $('domainTuner').style.display = 'block';
      $('resultsSub').textContent = `Here are your 8 ranked areas. We keep your top ${MAX_DOMAINS} (above 25%) for the next stage — click any area to change that.`;
    } else {
      $('domainTuner').style.display = 'none';
      $('resultsSub').textContent = 'Here are your 8 ranked areas, in order of how strongly they resonated.';
    }

    ranked.forEach((row, i) => {
      const meta = AREAS[row.key] || { name: row.key, icon: '•', color: '#94a3b8', desc: '' };
      const pct = Math.round((row.score / max) * 100);
      const rank = i + 1;
      const careers = (CAREERS[row.key] || []).slice(0, 10);
      const on = domainPrefs ? domainPrefs[row.key] !== false : true;
      const excluded = stage === 1 && !on;
      const card = document.createElement('div');
      card.className = `area-card rank-${rank}${excluded ? ' excluded' : ''}`;
      card.style.animationDelay = `${i * 0.05}s`;
      card.dataset.area = row.key;
      const tunable = stage === 1 && !readonly;
      card.innerHTML = `
        <div class="area-header">
          <div class="rank-badge">${rank}</div>
          <div class="area-icon-wrap" style="background:${meta.color}22;color:${meta.color}">${meta.icon}</div>
          <div class="area-info">
            <div class="area-name">${meta.name}
              ${excluded ? '<span class="area-badge-undesired"> · not for you</span>' : ''}</div>
            <div class="area-desc">${meta.desc || ''}</div>
          </div>
          ${tunable ? `<span class="area-toggle ${on ? 'on' : 'off'}" data-toggle="${row.key}">${on ? '✓ Included' : '✕ Excluded'}</span>` : ''}
          <div class="area-score-wrap">
            <div class="area-score-num">${pct}%</div>
            <div class="area-score-bar"><div class="area-score-fill" style="width:${pct}%;background:${meta.color}"></div></div>
          </div>
          <i class="fa-solid fa-chevron-down area-chevron"></i>
        </div>
        <div class="area-body"><div class="area-body-inner">
          <div class="careers-label">Example careers</div>
          <div class="career-chips">${careers.map((c) => `<span class="chip">${c}</span>`).join('')}</div>
        </div></div>`;
      card.querySelector('.area-header').addEventListener('click', (e) => {
        if (e.target.closest('[data-toggle]')) return;
        card.classList.toggle('open');
      });
      wrap.appendChild(card);
    });

    wrap.querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.dataset.toggle;
        const turningOn = domainPrefs[key] === false;
        if (turningOn && countOn(domainPrefs) >= MAX_DOMAINS) {
          flashNote(`You can keep up to ${MAX_DOMAINS} domains. Exclude one first, then add this one.`);
          return;
        }
        domainPrefs[key] = turningOn;
        const on = domainPrefs[key];
        btn.className = `area-toggle ${on ? 'on' : 'off'}`;
        btn.textContent = on ? '✓ Included' : '✕ Excluded';
        const card = wrap.querySelector(`.area-card[data-area="${key}"]`);
        if (card) {
          card.classList.toggle('excluded', !on);
          const nameEl = card.querySelector('.area-name');
          nameEl.innerHTML = `${AREAS[key]?.name || key}` + (on ? '' : ' <span class="area-badge-undesired"> · not for you</span>');
        }
        flashNote(`${countOn(domainPrefs)} of ${MAX_DOMAINS} domains kept.`);
        persistDomainPrefs();
      });
    });
  }

  function flashNote(msg) {
    const n = $('tunerMsg');
    if (!n) return;
    n.textContent = msg;
    n.style.display = 'block';
  }

  /* ── stage-2 results ── */
  function finishStage2() {
    if (s2phase === 'A') {
      computeSubPct();
      subPrefs = defaultSubPrefs();
      renderSubfieldTuner(false);
      showScreen('results');
      persist2({ partial: true, phase: 'A-done', keptDomains, domainPct, subScores, subPct: subPctMap, subPrefs });
      return;
    }
    s2phase = 'done';
    const love = computeLove();
    renderLoveShortlist(love, false);
    showScreen('results');
    persist2({
      completedAt: new Date().toISOString(),
      partial: false,
      phase: 'done',
      dataVersion: S2.version,
      keptDomains, domainPct, subScores, subPct: subPctMap, subPrefs, careerScores,
      love,
      ranked: love.slice(0, 10).map((l) => ({ area: l.domain, name: l.career, score: l.L, pct: l.L })),
    });
  }

  function renderSubfieldTuner(readonly) {
    $('resultsBadge').textContent = 'Part A Complete';
    $('resultsTitleA').textContent = 'Your favourite';
    $('resultsTitleB').textContent = 'Subfields';
    $('resultsSub').textContent = `We keep your top ${KEEP_SUBS} subfields per domain for the profession duels. Click any subfield to include or exclude it.`;
    $('domainTuner').style.display = 'none';
    const wrap = $('areaCards');
    wrap.innerHTML = '';
    keptDomains.forEach((d, di) => {
      const meta = areaMeta(d);
      const subs = subfieldsOf(d).sort((a, b) => (subPctMap[b] || 0) - (subPctMap[a] || 0));
      const card = document.createElement('div');
      card.className = `area-card open rank-${di + 1}`;
      card.innerHTML = `
        <div class="area-header">
          <div class="area-icon-wrap" style="background:${meta.color}22;color:${meta.color}">${meta.icon}</div>
          <div class="area-info"><div class="area-name">${esc(meta.name)}</div>
          <div class="area-desc">Phase 1 fit: ${domainPct[d] ?? '—'}%</div></div>
        </div>
        <div class="area-body"><div class="area-body-inner sub-list">
          ${subs.map((s) => {
            const on = !!subPrefs[s];
            const pct = subPctMap[s] || 0;
            const careers = S2.careers.filter((c) => c.subfield === s).map((c) => c.career);
            return `<div class="sub-row ${on ? '' : 'off'}" data-sub="${s}">
              <div class="sub-main"><div class="sub-name">${esc(subName(s))}</div>
                <div class="sub-careers">${careers.map(esc).join(' · ')}</div></div>
              <div class="sub-bar"><div class="area-score-fill" style="width:${pct}%;background:${meta.color}"></div></div>
              <div class="sub-pct">${pct}%</div>
              ${readonly ? '' : `<span class="area-toggle ${on ? 'on' : 'off'}" data-subtoggle="${s}">${on ? '✓ Included' : '✕ Excluded'}</span>`}
            </div>`;
          }).join('')}
        </div></div>`;
      wrap.appendChild(card);
    });
    wrap.querySelectorAll('[data-subtoggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const s = btn.dataset.subtoggle;
        subPrefs[s] = !subPrefs[s];
        const on = subPrefs[s];
        btn.className = `area-toggle ${on ? 'on' : 'off'}`;
        btn.textContent = on ? '✓ Included' : '✕ Excluded';
        btn.closest('.sub-row').classList.toggle('off', !on);
        updateDuelCount();
      });
    });
    $('ctaTitle').textContent = 'Part A done — now meet the professions';
    updateDuelCount();
    $('nextBtn').style.display = 'inline-flex';
    $('nextBtn').textContent = '→ Continue to profession duels';
    $('retakeBtn').textContent = '↺ Restart Stage 2';
  }

  function updateDuelCount() {
    const n = (S2.partB || []).filter((q) => subPrefs[q.sub]).length;
    const kept = Object.values(subPrefs).filter(Boolean).length;
    $('ctaText').textContent = `${kept} subfield${kept === 1 ? '' : 's'} kept → ${n} quick duels between real professions.`;
    $('nextBtn').disabled = n === 0;
  }

  function renderLoveShortlist(love, readonly) {
    $('resultsBadge').textContent = 'Stage 2 Complete';
    $('resultsTitleA').textContent = 'Your Profession';
    $('resultsTitleB').textContent = 'Shortlist';
    $('resultsSub').textContent = 'Ranked by how much you would love the work (Love score = domain fit + subfield fit + duel wins). Stage 3 adds your grades, job outlook and pay.';
    $('domainTuner').style.display = 'none';
    const wrap = $('areaCards');
    wrap.innerHTML = '';
    love.slice(0, 15).forEach((l, i) => {
      const meta = areaMeta(l.domain);
      const card = document.createElement('div');
      card.className = `area-card rank-${i + 1}`;
      card.style.animationDelay = `${i * 0.04}s`;
      const task = (S2.careers.find((c) => c.career === l.career) || {}).task || '';
      card.innerHTML = `
        <div class="area-header">
          <div class="rank-badge">${i + 1}</div>
          <div class="area-icon-wrap" style="background:${meta.color}22;color:${meta.color}">${meta.icon}</div>
          <div class="area-info"><div class="area-name">${esc(l.career)}</div>
            <div class="area-desc">${esc(subName(l.subfield))} · ${esc(meta.name)}</div></div>
          <div class="area-score-wrap"><div class="area-score-num">${l.L}</div>
            <div class="area-score-bar"><div class="area-score-fill" style="width:${l.L}%;background:${meta.color}"></div></div></div>
          <i class="fa-solid fa-chevron-down area-chevron"></i>
        </div>
        <div class="area-body"><div class="area-body-inner">
          <div class="careers-label">A day could look like</div>
          <p class="area-desc" style="margin-bottom:8px">${esc(task)}</p>
          <div class="career-chips"><span class="chip">Domain ${l.D}%</span><span class="chip">Subfield ${l.S}%</span><span class="chip">Duels ${l.C}%</span></div>
        </div></div>`;
      card.querySelector('.area-header').addEventListener('click', () => card.classList.toggle('open'));
      wrap.appendChild(card);
    });
    if (love.length > 15) {
      const more = document.createElement('p');
      more.className = 'save-note';
      more.textContent = `+ ${love.length - 15} more professions carried into Stage 3.`;
      wrap.appendChild(more);
    }
    $('ctaTitle').textContent = 'Stage 2 complete — your shortlist is ready';
    $('ctaText').textContent = 'Next: add last year’s grades (optional, 2 minutes) so we can match what you love with what you’re good at. Job outlook and pay are shown alongside.';
    $('nextBtn').disabled = false;
    $('nextBtn').style.display = readonly ? 'none' : 'inline-flex';
    $('nextBtn').textContent = '→ Next: What I’m good at';
    $('retakeBtn').textContent = '↺ Retake Stage 2';
  }

  function persist2(body) {
    const note = $('saveNote');
    const token = window.CPS?.Store?.token;
    if (!token || !window.CPS?.api) { if (note) note.textContent = 'Sign in to save your results to your account.'; return; }
    window.CPS.api('/api/user/results', { method: 'POST', body: { stage: 2, results: body } })
      .then(() => { if (note) note.textContent = '✓ Saved to your account.'; })
      .catch(() => { if (note) note.textContent = "Could not save right now — we'll retry next time you sign in."; });
  }

  function persistStage(ranked, max) {
    const note = $('saveNote');
    const token = window.CPS?.Store?.token;
    const summary = {
      stage,
      partial: false,
      completedAt: new Date().toISOString(),
      totalQuestions: active.length,
      datasetTotal: QUESTIONS.length,
      answered: answers.length,
      ranked: ranked.map((r) => ({ area: r.key, name: AREAS[r.key]?.name, score: r.score, pct: Math.round((r.score / max) * 100) })),
      scores,
    };
    if (stage === 1) summary.domainPrefs = domainPrefs;
    if (!token || !window.CPS?.api) {
      if (note) note.textContent = 'Sign in to save your results to your account.';
      return;
    }
    window.CPS.api('/api/user/results', { method: 'POST', body: { stage, results: summary } })
      .then(() => { if (note) note.textContent = '✓ Saved to your account.'; })
      .catch(() => { if (note) note.textContent = "Could not save right now — we'll retry next time you sign in."; });
  }

  function persistDomainPrefs() {
    if (stage !== 1 || !domainPrefs) return;
    const token = window.CPS?.Store?.token;
    if (!token || !window.CPS?.api) return;
    window.CPS.api('/api/user/results', { method: 'POST', body: { stage: 1, results: { domainPrefs } } }).catch(() => {});
  }

  /* ── review mode (from dashboard eye/Done) ── */
  window.openReview = function (stageNum, savedStage) {
    if (!setDataset(stageNum)) return;
    stage = stageNum;
    reviewMode = true;
    stageComplete = true;
    applyStageChrome();
    if (stage === 2) {
      if (Array.isArray(savedStage?.love)) {
        renderLoveShortlist(savedStage.love, true);
      }
    } else {
      const ranked = (savedStage?.ranked || []).map((r) => ({ key: r.area, score: r.score ?? r.raw ?? 0 }));
      ranked.sort((a, b) => b.score - a.score);
      const max = Math.max(1, ...ranked.map((r) => r.score));
      if (stage === 1) domainPrefs = savedStage?.domainPrefs || prefsFromRanking(ranked, max);
      renderResults(ranked, max, { readonly: true });
    }
    $('saveNote').textContent = 'Saved results — review mode.';
    $('nextBtn').style.display = 'none';
    showScreen('results');
  };

  /* ── free-for-now banner (payment on hold) ── */
  function renderSupport(el) { if (window.WikiSupport) window.WikiSupport.render(el); }

  window.CPSRenderSupport = renderSupport;

  /* ── wiring ── */
  function bindUI() {
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    document.querySelectorAll('.lang-btn').forEach((b) => b.addEventListener('click', () => window.setLang(b.dataset.lang)));
    on('beginBtn', 'click', () => window.startSurvey());
    on('backBtn', 'click', () => { window.location.href = window.__WK_URL__('/dashboard'); });
    on('goDashBtn', 'click', () => { window.location.href = window.__WK_URL__('/dashboard'); });
    on('retakeBtn', 'click', () => { if (reviewMode) window.location.href = window.__WK_URL__(`/survey?stage=${stage}`); else window.startSurvey(); });
    on('nextBtn', 'click', () => {
      if (stage === 2 && s2phase === 'A' && stageComplete) {
        persist2({ partial: true, phase: 'A-done', subPrefs });
        return startPartB();
      }
      const next = stage + 1;
      if (next === 3) window.location.href = window.__WK_URL__('/ikigai/skills?flow=1');
      else if (next <= 3) window.location.href = window.__WK_URL__(`/survey?stage=${next}`);
    });
    document.addEventListener('click', (e) => {
      const pip = e.target.closest && e.target.closest('.pip');
      if (pip && pip.id && /^pip[1-5]$/.test(pip.id)) { window.selectPip(Number(pip.id.slice(3))); return; }
      if (e.target.closest && e.target.closest('#skipHint')) window.skipQuestion();
    });
    const optA = $('optA'); const optB = $('optB');
    if (optA) optA.addEventListener('click', () => window.selectPip(2));
    if (optB) optB.addEventListener('click', () => window.selectPip(4));
  }

  /* ── i18n ── */
  const COPY = {
    EN: { stage: 'Stage 1 of 3 — World Discovery', badge: 'Stage 1 · Domain Discovery', title: 'Discover Your World of Interest', sub: "70 instinctive paired questions — no right or wrong answers. Follow your gut. We'll rank the 8 major areas of the working world that fit you best." },
    ES: { stage: 'Etapa 1 de 3 — Descubrimiento', badge: 'Etapa 1 · Descubrimiento de Dominios', title: 'Descubre Tu Mundo de Intereses', sub: '70 preguntas emparejadas instintivas — sin respuestas correctas o incorrectas. Confía en tu instinto.' },
    FR: { stage: 'Étape 1 sur 3 — Découverte', badge: 'Étape 1 · Découverte de Domaines', title: "Découvrez Votre Monde d'Intérêts", sub: '70 questions appariées instinctives — pas de bonnes ou mauvaises réponses. Faites confiance à votre instinct.' },
  };
  window.setLang = function (lang) {
    const t = COPY[lang] || COPY.EN;
    localStorage.setItem('ikigai_lang', lang);
    document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
    if (stage === 1 && !reviewMode) {
      $('navStage').textContent = (ALL[1]?.ui?.navStage) || t.stage;
      $('badgeText').textContent = (ALL[1]?.ui?.badgeText) || t.badge;
      $('introTitle').textContent = t.title;
      $('introSub').textContent = t.sub;
    }
  };

  /* ── boot ── */
  async function boot() {
    const params = new URLSearchParams(window.__WK_Q__ || location.search);
    const stageParam = parseInt(params.get('stage') || '1', 10);
    stage = [1, 2, 3].includes(stageParam) ? stageParam : 1;
    if (stage === 2 && !S2) stage = 1;

    if (!setDataset(stage)) { stage = 1; setDataset(1); }

    const savedLang = params.get('lang') || localStorage.getItem('ikigai_lang') || 'EN';
    if (['EN', 'ES', 'FR'].includes(savedLang)) window.setLang(savedLang);

    let allResults = {};
    if (stage > 1 || params.get('review') === '1') {
      try {
        const token = window.CPS?.Store?.token;
        if (token && window.CPS?.api) {
          const r = await window.CPS.api('/api/user/results');
          allResults = r.results || {};
        }
      } catch { /* ignore */ }
      const s1 = allResults.stage_1;
      if (s1?.domainPrefs) domainPrefs = s1.domainPrefs;
      if (Array.isArray(s1?.ranked)) s1Ranked = s1.ranked;
    }

    applyStageChrome();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindUI);
    else bindUI();
    renderSupport($('supportSlot'));

    if (stage === 2) {
      computeKeptDomains();
      showFilterNotice();
    }

    if (stage === 3) {
      // Stage 3 now lives in the Wikigai hub: grades first, then the match.
      location.replace(window.__WK_URL__(params.get('review') === '1' ? '/ikigai' : '/ikigai/skills?flow=1'));
      return;
    }

    if (params.get('review') === '1') {
      const saved = allResults[`stage_${stage}`];
      if (saved && (saved.ranked || saved.love)) {
        window.openReview(stage, saved);
        const langParam = params.get('lang');
        if (['EN', 'ES', 'FR'].includes(langParam)) window.setLang(langParam);
      }
    }
  }
  boot();

  document.addEventListener('keydown', (e) => {
    if (!$('survey').classList.contains('active')) return;
    if (e.key >= '1' && e.key <= '5') window.selectPip(Number(e.key));
    else if (e.key === 'Escape') window.skipQuestion();
  });
})();
