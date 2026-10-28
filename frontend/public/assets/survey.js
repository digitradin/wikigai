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
    3: { questions: [] },
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
  /* i18n: questions keep their English source text (the msgid) and are
     translated when shown, so switching language mid-survey is instant. */
  const I = window.WK.i18n;
  const T = (k, v) => I.t(k, v);
  const C = (s) => I.tc(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const areaMeta = (k) => (window.STAGE_DATA?.areas || {})[k] || { name: k, icon: '•', color: '#94a3b8', desc: '' };
  const areaName = (k) => C(areaMeta(k).name);
  const subName = (k) => C((S2?.subfields?.[k]?.name) || k);

  const areaTagOf = (q) => {
    if (!q) return '';
    if (q.subA && q.subB) return areaName(q.domain);
    if (q.careerA) return subName(q.sub);
    const a = q.areaA ? C(AREAS[q.areaA]?.name || q.areaA) : '';
    const b = q.areaB ? C(AREAS[q.areaB]?.name || q.areaB) : '';
    if (a && b) return `${a}  ·  ${b}`;
    return a || b || '';
  };

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $(id).classList.add('active');
  }


  /* ── Stage 1 question bank: fresh, balanced, no repeats ── */
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function buildStage1(bank) {
    const areas = Object.keys(bank.statements || {});
    const N = bank.questionsPerRun || 70;
    if (areas.length < 2) return [];
    // 1) area pairs: every pair once, then fill so each area gets an equal share
    const all = [];
    for (let i = 0; i < areas.length; i++) for (let j = i + 1; j < areas.length; j++) all.push([areas[i], areas[j]]);
    const slots = [];
    const count = {};
    const add = (pr) => { slots.push(pr); count[pr[0]] = (count[pr[0]] || 0) + 1; count[pr[1]] = (count[pr[1]] || 0) + 1; };
    const base = Math.floor(N / all.length);              // every pair this many times
    for (let r = 0; r < base; r++) shuffle(all.slice()).forEach(add);
    while (slots.length < N) {                             // top up the least-asked areas
      const pick = shuffle(all.slice()).sort((x, y) => ((count[x[0]] || 0) + (count[x[1]] || 0)) - ((count[y[0]] || 0) + (count[y[1]] || 0)))[0];
      add(pick);
    }
    // 2) order: avoid the same area in back-to-back questions where possible
    const pool = shuffle(slots.slice()), ordered = [];
    while (pool.length) {
      const last = ordered[ordered.length - 1] || [];
      let k = pool.findIndex((p) => !p.includes(last[0]) && !p.includes(last[1]));
      if (k < 0) k = 0;
      ordered.push(pool.splice(k, 1)[0]);
    }
    // 3) fill each slot from curated pairs or two bank statements, never repeating
    const used = new Set();
    const curated = shuffle((bank.pairs || []).slice());
    let curatedLeft = Math.round(N * (bank.curatedShare ?? 0.3));
    const stmt = {}; areas.forEach((a) => { stmt[a] = shuffle((bank.statements[a] || []).slice()); });
    const stems = bank.stems && bank.stems.length ? bank.stems : [T('survey.defaultStem1')];
    let lastStem = -1;
    const takeStmt = (a) => { while (stmt[a].length) { const t = stmt[a].pop(); if (!used.has(t)) { used.add(t); return t; } } return null; };
    return ordered.map(([x, y], i) => {
      let q = null;
      if (curatedLeft > 0) {
        const k = curated.findIndex((c) => ((c.areaA === x && c.areaB === y) || (c.areaA === y && c.areaB === x)) && !used.has(c.a) && !used.has(c.b));
        if (k >= 0) { const c = curated.splice(k, 1)[0]; used.add(c.a); used.add(c.b); curatedLeft--; q = { text: c.text, a: c.a, b: c.b, areaA: c.areaA, areaB: c.areaB, weight: c.weight || 2 }; }
      }
      if (!q) {
        const a = takeStmt(x), b = takeStmt(y);
        if (!a || !b) return null;
        let si; do { si = Math.floor(Math.random() * stems.length); } while (stems.length > 1 && si === lastStem);
        lastStem = si;
        q = { text: stems[si], a, b, areaA: x, areaB: y, weight: 2 };
      }
      if (Math.random() < 0.5) q = { ...q, a: q.b, b: q.a, areaA: q.areaB, areaB: q.areaA };
      q.id = 'Q' + String(i + 1).padStart(3, '0');
      return q;
    }).filter(Boolean);
  }


  /* ── Stage 2 bank: fresh pairs, no phrase or task line shown twice ── */
  function pickStem(stems, last) {
    if (!stems || !stems.length) return { i: -1, t: T('survey.defaultStem2') };
    let i; do { i = Math.floor(Math.random() * stems.length); } while (stems.length > 1 && i === last);
    return { i, t: stems[i] };
  }
  function buildPartA(B2) {
    const cfg = B2.partA || {}, rounds = cfg.roundsPerPair || 2, out = [];
    let lastStem = -1, n = 0;
    keptDomains.forEach((d) => {
      const subs = subfieldsOf(d);
      const pool = {}; subs.forEach((k) => { pool[k] = shuffle(((cfg.phrases || {})[k] || []).slice()); });
      const pairs = [];
      for (let i = 0; i < subs.length; i++) for (let j = i + 1; j < subs.length; j++) pairs.push([subs[i], subs[j]]);
      let prev = null;
      for (let r = 0; r < rounds; r++) {
        const round = shuffle(pairs.slice());
        if (prev && round.length > 1 && round[0] === prev) round.push(round.shift());
        round.forEach((pr) => {
          let [x, y] = Math.random() < 0.5 ? pr : [pr[1], pr[0]];
          const a = pool[x].pop(), b = pool[y].pop();
          if (!a || !b) return;          // bank ran out for this subfield: skip, never repeat
          const st = pickStem(cfg.stems, lastStem); lastStem = st.i;
          out.push({ id: 'P2A-' + (++n), domain: d, text: st.t, a, b, subA: x, subB: y, weight: 2 });
          prev = pr;
        });
      }
    });
    return out;
  }
  function buildPartB(B2) {
    const cfg = B2.partB || {}, t2 = cfg.tasks2 || {}, out = [];
    const seen = {}; let lastStem = -1, n = 0;
    const line = (c) => { seen[c.career] = (seen[c.career] || 0) + 1; return seen[c.career] === 1 ? c.task : (t2[c.career] || c.task); };
    const kept = Object.keys(subPrefs || {}).filter((k) => subPrefs[k])
      .sort((a, b) => keptDomains.indexOf(S2.subfields[a].domain) - keptDomains.indexOf(S2.subfields[b].domain));
    kept.forEach((sub) => {
      const list = shuffle(S2.careers.filter((c) => c.subfield === sub));
      const k = list.length;
      if (k < 2) return;
      // ring: every profession meets two different rivals (once if only 2)
      const ring = k === 2 ? [[0, 1]] : list.map((_, i) => [i, (i + 1) % k]);
      shuffle(ring).slice(0, 6).forEach(([i, j]) => {
        const A = list[i], Bc = list[j];
        const st = pickStem(cfg.stems, lastStem); lastStem = st.i;
        out.push({ id: 'P2B-' + (++n), sub, text: st.t, a: line(A), b: line(Bc), careerA: A.career, careerB: Bc.career, weight: 2 });
      });
    });
    return out;
  }

  /* ── stage bootstrapping ── */
  function setDataset(stageNum) {
    D = ALL[stageNum];
    if (!D) return false;
    AREAS = window.STAGE_DATA?.areas || {};
    CAREERS = window.STAGE_DATA?.careers || {};
    if (stageNum === 2) QUESTIONS = (D.partA || []).slice();
    else if (stageNum === 1 && window.STAGE1_BANK) QUESTIONS = buildStage1(window.STAGE1_BANK);
    else QUESTIONS = D.questions || [];
    areaOrder = Object.keys(AREAS);
    return true;
  }

  function applyStageChrome() {
    const s = stage === 2 ? 'stage2' : stage === 3 ? 'stage3' : 'stage1';
    $('navStage').textContent = T('survey.' + s + 'Nav');
    if (stage < 3) {
      $('badgeText').textContent = T('survey.' + s + 'Badge');
      $('introTitle').textContent = T('survey.' + s + 'Title');
      $('introSub').textContent = T('survey.' + s + 'Sub');
    }
    $('beginLabel').textContent = T('survey.begin', { n: stage });
    if ($('kbdHint')) $('kbdHint').style.display = stage < 3 ? '' : 'none'; // keys 1-5 answer the questions in Stages 1 and 2
    $('resultsBadge').textContent = T('survey.resultsBadge', { n: stage });
    $('resultsTitleA').textContent = T('survey.results' + stage + 'A');
    $('resultsTitleB').textContent = T('survey.results' + stage + 'B');
    $('ctaTitle').textContent = stage === 1 ? T('survey.ctaTitleHatch') : T('survey.ctaTitle', { n: stage });
    $('ctaText').textContent = stage === 1 ? T('survey.ctaTextHatch') : T('survey.ctaText');
    $('nextBtn').style.display = stage < 3 ? 'inline-flex' : 'none';
    if (stage < 3) $('nextBtn').textContent = T('survey.continueTo', { n: stage + 1 });
    $('retakeBtn').textContent = T('survey.retakeStage', { n: stage });
    $('domainTuner').style.display = stage === 1 ? 'block' : 'none';
    if (stage === 2) {
      $('how3t').setAttribute('data-i18n', 'survey.how3tS2'); $('how3t').textContent = T('survey.how3tS2');
      $('how3d').setAttribute('data-i18n', 'survey.how3dS2'); $('how3d').textContent = T('survey.how3dS2');
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
      const B2 = window.STAGE2_BANK;
      if (s2phase === 'A') {
        if (B2) { active = buildPartA(B2); return; }
        const rank = (d) => keptDomains.indexOf(d);
        active = QUESTIONS.filter((q) => keptDomains.includes(q.domain))
          .sort((a, b) => rank(a.domain) - rank(b.domain));
      } else {
        if (B2) { active = buildPartB(B2); return; }
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
      const names = keptDomains.map((k) => `${areaMeta(k).icon} ${areaName(k)}`).join(', ');
      el.style.display = 'block';
      el.innerHTML = T(keptDomains.length === 1 ? 'survey.filterNotice1' : 'survey.filterNotice', { count: keptDomains.length, names: esc(names), pairs: keptDomains.length * 12 });
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
    if (stage === 1 && window.STAGE1_BANK) QUESTIONS = buildStage1(window.STAGE1_BANK);
    if (stage === 2) {
      s2phase = 'A';
      subScores = {}; subApps = {}; careerScores = {}; careerApps = {}; subPrefs = null;
      QUESTIONS = (S2.partA || []).slice();
    }
    applyDomainFilter();
    showFilterNotice();
    window.WK?.track?.(stage === 2 ? 'stage2_start' : 'stage1_start');
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
    paintQ(q);

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

  /* question text only — used on render and on language change (timer keeps running) */
  function paintQ(q) {
    if (!q) return;
    $('qBadge').textContent = stage === 2 ? T('survey.partBadge', { part: s2phase === 'A' ? 'A' : 'B', n: currentQ + 1 }) : (q.id || `Q${String(currentQ + 1).padStart(3, '0')}`);
    $('qAreaTag').textContent = areaTagOf(q);
    $('qText').textContent = C(q.text);
    $('optA').textContent = q.a ? C(q.a) : '—';
    $('optB').textContent = q.b ? C(q.b) : '—';
  }

  let committing = false;
  window.__buildStage1 = buildStage1;
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
    if (stage === 1) { domainPrefs = prefsFromRanking(ranked, max); window.WK?.track?.('stage1_done'); }
    view = () => renderResults(ranked, max, { readonly: false });
    view();
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
      $('resultsSub').textContent = T('survey.resultsSubTune', { max: MAX_DOMAINS });
    } else {
      $('domainTuner').style.display = 'none';
      $('resultsSub').textContent = T('survey.resultsSubRead');
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
            <div class="area-name">${esc(C(meta.name))}
              ${excluded ? `<span class="area-badge-undesired">${T('survey.notForYou')}</span>` : ''}</div>
            <div class="area-desc">${esc(C(meta.desc || ''))}</div>
          </div>
          ${tunable ? `<span class="area-toggle ${on ? 'on' : 'off'}" data-toggle="${row.key}">${T(on ? 'common.included' : 'common.excluded')}</span>` : ''}
          <div class="area-score-wrap">
            <div class="area-score-num">${pct}%</div>
            <div class="area-score-bar"><div class="area-score-fill" style="width:${pct}%;background:${meta.color}"></div></div>
          </div>
          <i class="fa-solid fa-chevron-down area-chevron"></i>
        </div>
        <div class="area-body"><div class="area-body-inner">
          <div class="careers-label">${T('survey.exampleCareers')}</div>
          <div class="career-chips">${careers.map((c) => `<span class="chip">${esc(C(c))}</span>`).join('')}</div>
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
          flashNote(T('survey.maxDomains', { max: MAX_DOMAINS }));
          return;
        }
        domainPrefs[key] = turningOn;
        const on = domainPrefs[key];
        btn.className = `area-toggle ${on ? 'on' : 'off'}`;
        btn.textContent = T(on ? 'common.included' : 'common.excluded');
        const card = wrap.querySelector(`.area-card[data-area="${key}"]`);
        if (card) {
          card.classList.toggle('excluded', !on);
          const nameEl = card.querySelector('.area-name');
          nameEl.innerHTML = esc(areaName(key)) + (on ? '' : ` <span class="area-badge-undesired">${T('survey.notForYou')}</span>`);
        }
        flashNote(T('survey.keptOf', { n: countOn(domainPrefs), max: MAX_DOMAINS }));
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
      window.WK?.track?.('stage2_parta_done');
      view = () => renderSubfieldTuner(false);
      view();
      showScreen('results');
      persist2({ partial: true, phase: 'A-done', keptDomains, domainPct, subScores, subPct: subPctMap, subPrefs });
      return;
    }
    s2phase = 'done';
    window.WK?.track?.('stage2_done');
    const love = computeLove();
    view = () => renderLoveShortlist(love, false);
    view();
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
    $('resultsBadge').textContent = T('survey.partADone');
    $('resultsTitleA').textContent = T('survey.subTitleA');
    $('resultsTitleB').textContent = T('survey.subTitleB');
    $('resultsSub').textContent = T('survey.subSub', { keep: KEEP_SUBS });
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
          <div class="area-info"><div class="area-name">${esc(areaName(d))}</div>
          <div class="area-desc">${T('survey.phase1Fit', { pct: domainPct[d] ?? '—' })}</div></div>
        </div>
        <div class="area-body"><div class="area-body-inner sub-list">
          ${subs.map((s) => {
            const on = !!subPrefs[s];
            const pct = subPctMap[s] || 0;
            const careers = S2.careers.filter((c) => c.subfield === s).map((c) => C(c.career));
            return `<div class="sub-row ${on ? '' : 'off'}" data-sub="${s}">
              <div class="sub-main"><div class="sub-name">${esc(subName(s))}</div>
                <div class="sub-careers">${careers.map(esc).join(' · ')}</div></div>
              <div class="sub-bar"><div class="area-score-fill" style="width:${pct}%;background:${meta.color}"></div></div>
              <div class="sub-pct">${pct}%</div>
              ${readonly ? '' : `<span class="area-toggle ${on ? 'on' : 'off'}" data-subtoggle="${s}">${T(on ? 'common.included' : 'common.excluded')}</span>`}
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
        btn.textContent = T(on ? 'common.included' : 'common.excluded');
        btn.closest('.sub-row').classList.toggle('off', !on);
        updateDuelCount();
      });
    });
    $('ctaTitle').textContent = T('survey.partACta');
    updateDuelCount();
    $('nextBtn').style.display = 'inline-flex';
    $('nextBtn').textContent = T('survey.toDuels');
    $('retakeBtn').textContent = T('survey.restart2');
  }

  function updateDuelCount() {
    const n = window.STAGE2_BANK
      ? Object.keys(subPrefs).filter((k) => subPrefs[k]).reduce((t, k) => { const c = S2.careers.filter((x) => x.subfield === k).length; return t + (c < 2 ? 0 : c === 2 ? 1 : Math.min(c, 6)); }, 0)
      : (S2.partB || []).filter((q) => subPrefs[q.sub]).length;
    const kept = Object.values(subPrefs).filter(Boolean).length;
    $('ctaText').textContent = T('survey.duelCount', { count: kept, duels: n });
    $('nextBtn').disabled = n === 0;
  }

  function renderLoveShortlist(love, readonly) {
    $('resultsBadge').textContent = T('survey.resultsBadge', { n: 2 });
    $('resultsTitleA').textContent = T('survey.results2A');
    $('resultsTitleB').textContent = T('survey.results2B');
    $('resultsSub').textContent = T('survey.loveSub');
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
          <div class="area-info"><div class="area-name">${esc(C(l.career))}</div>
            <div class="area-desc">${esc(subName(l.subfield))} · ${esc(areaName(l.domain))}</div></div>
          <div class="area-score-wrap"><div class="area-score-num">${l.L}</div>
            <div class="area-score-bar"><div class="area-score-fill" style="width:${l.L}%;background:${meta.color}"></div></div></div>
          <i class="fa-solid fa-chevron-down area-chevron"></i>
        </div>
        <div class="area-body"><div class="area-body-inner">
          <div class="careers-label">${T('survey.dayLike')}</div>
          <p class="area-desc" style="margin-bottom:8px">${esc(C(task))}</p>
          <div class="career-chips"><span class="chip">${T('survey.chipDomain', { pct: l.D })}</span><span class="chip">${T('survey.chipSub', { pct: l.S })}</span><span class="chip">${T('survey.chipDuels', { pct: l.C })}</span></div>
        </div></div>`;
      card.querySelector('.area-header').addEventListener('click', () => card.classList.toggle('open'));
      wrap.appendChild(card);
    });
    if (love.length > 15) {
      const more = document.createElement('p');
      more.className = 'save-note';
      more.textContent = T('survey.more', { n: love.length - 15 });
      wrap.appendChild(more);
    }
    $('ctaTitle').textContent = T('survey.s2CtaTitle');
    $('ctaText').textContent = T('survey.s2CtaText');
    $('nextBtn').disabled = false;
    $('nextBtn').style.display = readonly ? 'none' : 'inline-flex';
    $('nextBtn').textContent = T('survey.toSkills');
    $('retakeBtn').textContent = T('survey.retakeStage', { n: 2 });
  }

  let noteKey = null;
  function setNote(key) { noteKey = key; const n = $('saveNote'); if (n) n.textContent = key ? T(key) : ''; }

  function persist2(body) {
    setNote('common.savingResults');
    const token = window.CPS?.Store?.token;
    if (!token || !window.CPS?.api) { setNote('common.signInToSave'); return; }
    window.CPS.api('/api/user/results', { method: 'POST', body: { stage: 2, results: body } })
      .then(() => setNote('common.saved'))
      .catch(() => setNote('common.saveFailedLater'));
  }

  function persistStage(ranked, max) {
    setNote('common.savingResults');
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
      setNote('common.signInToSave');
      return;
    }
    window.CPS.api('/api/user/results', { method: 'POST', body: { stage, results: summary } })
      .then(() => setNote('common.saved'))
      .catch(() => setNote('common.saveFailedLater'));
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
        view = () => { renderLoveShortlist(savedStage.love, true); $('nextBtn').style.display = 'none'; };
        view();
      }
    } else {
      const ranked = (savedStage?.ranked || []).map((r) => ({ key: r.area, score: r.score ?? r.raw ?? 0 }));
      ranked.sort((a, b) => b.score - a.score);
      const max = Math.max(1, ...ranked.map((r) => r.score));
      if (stage === 1) domainPrefs = savedStage?.domainPrefs || prefsFromRanking(ranked, max);
      view = () => { renderResults(ranked, max, { readonly: true }); $('nextBtn').style.display = 'none'; };
      view();
    }
    setNote('common.reviewMode');
    $('nextBtn').style.display = 'none';
    showScreen('results');
  };

  /* ── free-for-now banner (payment on hold) ── */
  function renderSupport(el) { if (window.WikiSupport) window.WikiSupport.render(el); }

  window.CPSRenderSupport = renderSupport;

  /* ── wiring ── */
  function bindUI() {
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    on('beginBtn', 'click', () => window.startSurvey());
    on('backBtn', 'click', () => { window.location.href = '/dashboard'; });
    on('goDashBtn', 'click', () => { window.location.href = '/dashboard'; });
    on('retakeBtn', 'click', () => { window.WK?.track?.('retake', { stage }); if (reviewMode) window.location.href = `/survey?stage=${stage}`; else window.startSurvey(); });
    on('nextBtn', 'click', () => {
      if (stage === 2 && s2phase === 'A' && stageComplete) {
        persist2({ partial: true, phase: 'A-done', subPrefs });
        return startPartB();
      }
      const next = stage + 1;
      if (next === 3) window.location.href = '/ikigai/skills?flow=1';
      else if (next <= 3) window.location.href = `/survey?stage=${next}`;
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

  /* ── language change: repaint whatever is on screen, keep answers and timer ── */
  let view = null; // repaints the current results screen
  function onLang() {
    const scr = document.querySelector('.screen.active');
    const id = scr ? scr.id : 'intro';
    applyStageChrome();
    if (stage === 2) showFilterNotice();
    if (id === 'survey') paintQ(active[currentQ]);
    if (id === 'results' && view) view();
    if (noteKey) setNote(noteKey);
  }

  /* ── boot ── */
  async function boot() {
    const params = new URLSearchParams(location.search);
    const stageParam = parseInt(params.get('stage') || '1', 10);
    stage = [1, 2, 3].includes(stageParam) ? stageParam : 1;
    if (stage === 2 && !S2) stage = 1;

    await I.ready;
    if (!setDataset(stage)) { stage = 1; setDataset(1); }
    I.onChange(onLang);

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
      location.replace(params.get('review') === '1' ? '/ikigai' : '/ikigai/skills?flow=1');
      return;
    }

    if (params.get('review') === '1') {
      const saved = allResults[`stage_${stage}`];
      if (saved && (saved.ranked || saved.love)) {
        window.openReview(stage, saved);
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
