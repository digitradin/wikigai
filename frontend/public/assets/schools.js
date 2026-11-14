/* Wikigai Schools — shared directory UI (v20261112d). One module, two versions:
   • PUBLIC  (/schools, /fr/schools, /es/schools): visitors. Empty search field, no preselected area or profession.
     Interactive filters (country, level; "More filters" folded). Every insight (match, ROI, salaries, employment,
     admission chance, cost, scholarships) is BLURRED with a lock: the API removes those numbers for visitors,
     so what is blurred is a placeholder, never the real value. Members-only filters/sorts show a 🔒 and open
     the sign-up prompt. v20261112d: one-tap "Continue with TikTok / Google / Instagram / Facebook" (only the apps switched
     on) in the hero, the sign-up prompt and every lock — back to My learning › Schools after sign-in.
   • MEMBER  (My learning › Schools, /learning/schools): full data. v20261113 — simplified to ONE filter: the top areas of
     My path (one area at a time, the 1st is preselected); the person's professions in that area are listed below it and
     rank first (match). No search box, country, level or "More filters" here any more (the public page keeps them).
     v20261113 (change set 2): "Where?" country row (multi-select). Default = ONE country: Account › "Where would you like to
     study or work?" (the first country we list) → else Account › country of residence → else the United States, and the page
     asks where (with "Save as my study countries", written to the account).
    v20261114: default countries, members AND visitors = Account › study countries (every one we list) → Account › country of
    residence → the site language (EN = United Kingdom + United States, FR = France, ES = Spain + Mexico). Visitors have no
    account, so /schools opens on the language countries (a shared ?country= link wins); switching language swaps them while
    the person has not changed the countries. Signed in: a language switch never changes the countries; the language countries
    are remembered per account on the device, and as long as no study country is saved the page asks to choose and save one.
     Match score, shortlist (★, saved to the account), details.
   API: GET /api/schools (+ /saved). Text: sch.* (i18n). Data: catalogue built by tools/schools/import.js (official open data) + demo records for markets without real data (v20261114b). */
(function () {
  'use strict';
  const I = window.WK.i18n, T = (k, v) => I.t(k, v), C = (s) => I.tc(s);
  const { api, Store } = window.CPS;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const AREAS = (window.STAGE_DATA && window.STAGE_DATA.areas) || {};
  const S2 = window.STAGE_DATA_2B || {};
  const area = (k) => AREAS[k] || { name: k, icon: '•', color: '#94a3b8' };
  const track = (n, p) => { try { window.WK && window.WK.track && window.WK.track(n, p || {}); } catch { /* ignore */ } };

  const COUNTRIES = ['ES', 'FR', 'UK', 'IE', 'US', 'MX', 'DE'];   // v20261114b: + Germany (DAAD)
  const FLAG = { ES: '🇪🇸', FR: '🇫🇷', UK: '🇬🇧', IE: '🇮🇪', US: '🇺🇸', MX: '🇲🇽', DE: '🇩🇪' };
  // a country added in schools-db (config/markets.json) appears by itself: flag + name derived from its code
  const flagOf = (c) => FLAG[c] || String.fromCodePoint(...[...(c === 'UK' ? 'GB' : c)].map((ch) => 0x1F1E6 + ch.charCodeAt(0) - 65));
  const addMarkets = (ms) => (ms || []).forEach((c) => { if (/^[A-Z]{2}$/.test(c) && !COUNTRIES.includes(c)) COUNTRIES.push(c); });
  const CUR = { EUR: '€', GBP: '£', USD: '$', MXN: 'MX$' };
  const LEVELS = ['bachelor', 'master'];
  const MODES = ['campus', 'online', 'hybrid'];
  const LANGS = ['en', 'es', 'fr'];
  const phone = () => window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
  const PRO_VISIBLE_DESKTOP = 6, PRO_VISIBLE_PHONE = 3;   // professions shown before "+ N more"
  const AREA_VISIBLE_DESKTOP = 3, AREA_VISIBLE_PHONE = 2; // areas shown before "+ N more"
  const PAGE = 12;

  const st = {
    mode: 'public', path: null, el: null, inited: false,
    q: '', countries: new Set(), levels: new Set(), control: '', langs: new Set(), modes: new Set(), band: 0,
    maxCost: 0, minRoi: 0, minEmp: 0, admission: new Set(), scholar: false, sort: '',
    domains: new Set(), careers: new Set(), allAreas: false, allPros: false, moreOpen: false,
    items: null, total: 0, facets: null, insights: null, busy: false, err: '', offset: 0,
    tab: 'results', saved: null, open: new Set(), unlock: false, seq: 0,
    oa: [],   // v20261112d: sign-in apps switched on for this server (TikTok, Google, Instagram, Facebook)
  };
  const member = () => st.mode === 'member';

  /* ── v20261113 (change set 2): "Where?" for members ── */
  const toDir = (c) => { const x = String(c || '').trim().toUpperCase(); return x === 'GB' ? 'UK' : x; }; // account (ISO) → directory code
  const toIso = (c) => (c === 'UK' ? 'GB' : c);                                                         // directory code → account (ISO)
  const LANG_DEFAULT = { en: ['UK', 'US'], fr: ['FR'], es: ['ES', 'MX'] };                        // v20261114
  const langCountries = () => (LANG_DEFAULT[String(I.lang || 'en').slice(0, 2).toLowerCase()] || LANG_DEFAULT.en).slice();
  const sameSet = (set, arr) => !!arr && set.size === arr.length && arr.every((c) => set.has(c));
  const listCountries = (cs) => { const n = cs.map((c) => countryLabel(c)); try { return new Intl.ListFormat(I.lang || 'en', { type: 'conjunction' }).format(n); } catch { return n.join(' + '); } };
  /* v20261114: the site language changed — swap the language countries if the person has not changed them */
  function langSwap() {
    const next = langCountries();
    if (member()) return false;   // signed in: a language switch never changes the countries (they are asked to save study countries)
    if (!st.langDef || !sameSet(st.countries, st.langDef) || sameSet(st.countries, next)) return false;
    st.langDef = next; st.countries = new Set(next); return true;
  }
  const regionName = (c) => { try { return new Intl.DisplayNames([I.lang || 'en'], { type: 'region' }).of(toIso(c)); } catch { return c; } };
  async function memberWhere() {
    let u = null;
    try { const r = await api('/api/auth/me'); u = r && r.user; } catch { u = null; }
    st.acct = u || {};
    const tg = (st.acct.targetCountries || []).map(toDir).filter(Boolean);
    const res = toDir(st.acct.residenceCountry);
    const tgs = [...new Set(tg.filter((c) => COUNTRIES.includes(c)))];   // v20261114: every study country we list
    if (tgs.length) st.where = { src: 'target', cs: tgs };
    else if (res && COUNTRIES.includes(res)) st.where = { src: 'residence', cs: [res] };
    else {
      // language countries, remembered per account on this device so a later language switch does not change them
      const key = 'wk_sch_where_' + (st.acct.id || 'me');
      let cs = null; try { cs = JSON.parse(localStorage.getItem(key) || 'null'); } catch { cs = null; }
      if (!Array.isArray(cs) || !cs.length || !cs.every((c) => COUNTRIES.includes(c))) { cs = langCountries(); try { localStorage.setItem(key, JSON.stringify(cs)); } catch { /* ignore */ } }
      st.where = { src: (tg[0] || res) ? 'unsupported' : 'none', cs, lang: true, other: tg[0] || res || '' };
    }
    st.countries = new Set(st.where.cs);
  }
  async function saveWhere() {
    const picked = [...st.countries].map(toIso);
    const list = [...new Set([...picked, ...((st.acct && st.acct.targetCountries) || [])])].slice(0, 10); // picked first → next default
    st.whereMsg = '';
    try {
      const r = await api('/api/user/profile', { method: 'PUT', body: { targetCountries: list } });
      st.acct = Object.assign(st.acct || {}, { targetCountries: (r && r.targetCountries) || list });
      st.whereSaved = true;
    } catch (e) { st.whereMsg = (e && e.message) || T('sch.loadErr'); }
    paint();
  }
  function whereRow() {
    const w = st.where; if (!w) return '';
    const src = (w.src === 'target' || w.src === 'residence') && sameSet(st.countries, w.cs)
      ? `<p class="sc-where-src">${T(w.src === 'target' ? 'sch.whereFromTarget' : 'sch.whereFromRes')} · <a href="/account">${T('sch.whereEdit')}</a></p>` : '';
    const ask = w.src !== 'target';   // v20261114: no study country saved yet → ask (also when residence is used)
    let box = '';
    if (ask && st.whereSaved) box = `<div class="sc-ask ok" role="status">✓ ${T('sch.whereSaved')} · <a href="/account">${T('sch.whereEdit')}</a></div>`;
    else if (ask) box = `<div class="sc-ask" role="note"><strong>📍 ${T('sch.whereAskT')}</strong>
        <span>${w.src === 'residence' ? T('sch.whereAskRes') : w.src === 'unsupported' ? T('sch.whereUnsupported', { country: esc(regionName(w.other)), countries: esc(listCountries(w.cs)) }) : T('sch.whereAsk', { countries: esc(listCountries(w.cs)) })}</span>
        ${st.countries.size ? `<button type="button" class="btn-primary sm" data-scact="saveWhere">💾 ${T('sch.whereSave')}</button>` : ''}
        ${st.whereMsg ? `<em class="sc-ask-err" role="alert">${esc(st.whereMsg)}</em>` : ''}</div>`;
    return `<div class="sc-row sc-whererow"><span class="sc-label">📍 ${T('sch.fWhere')}</span><div>
      <div class="sc-chips" role="group" aria-label="${esc(T('sch.fWhere'))}">${COUNTRIES.map((c) => chip('sccty', c, st.countries.has(c), `${flagOf(c)} ${esc(countryLabel(c))}`)).join('')}</div>
      ${!st.countries.size ? `<p class="sc-where-src">${T('sch.whereAll')}</p>` : src}${box}</div></div>`;
  }

  /* ── helpers ── */
  const NA = '-';   // v20261114b: every value we don't have is shown as "-" (never estimated)
  const money = (v, cur) => {
    if (v == null) return NA;
    const sym = CUR[cur] || cur + ' ';
    if (v >= 100000 && cur !== 'MXN') return sym + Math.round(v / 1000) + 'k';
    if (v >= 10000) return sym + (v / 1000).toFixed(v >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return sym + Math.round(v).toLocaleString(I.lang);
  };
  const pct = (v) => (v == null ? NA : Math.round(v * 100) + '%');
  /* v20261114b: real data — a value seen with different numbers in two years / sources shows as a range */
  const rng = (v, k) => (v.ranges && v.ranges[k]) || null;
  const rpct = (v, k) => { const r = rng(v, k); return r ? `<span title="${esc(T('sch.rangeTip'))}">${Math.round(r[0] * 100)}–${Math.round(r[1] * 100)}%</span>` : pct(v[k]); };
  const rnum = (v, k) => { const r = rng(v, k); const f = (x) => Math.round(x).toLocaleString(I.lang); return r ? `${f(r[0])}–${f(r[1])}` : v[k] == null ? NA : f(v[k]); };
  const scopeNote = (v, k) => (v.scope && v.scope[k] === 'institution' ? `<em>${T('sch.scopeInst')}</em>` : '');
  const SRC = { 'fr.parcoursup': 'Parcoursup', 'fr.monmaster': 'MonMaster', 'us.scorecard': 'College Scorecard', demo: 'Demo',
    'dir.studyportals': 'Studyportals', 'dir.whatuni': 'Whatuni', 'dir.educations': 'educations.com', 'dir.daad': 'DAAD', 'dir.bigfuture': 'BigFuture', 'dir.collegedata': 'CollegeData' };
  /* v20261114b: trust of a course (badge) and of each figure (small tag when it is not official) */
  const trustTag = (v) => (v.trust ? `<span class="sc-tag tr-${esc(v.trust)}" title="${esc(T('sch.trustTip_' + v.trust))}">${v.trust === 'official' ? '✓ ' : ''}${T('sch.trust_' + v.trust)}</span>` : '');
  const trF = (v, k) => { const t = v.trustBy && v.trustBy[k]; return t && t !== 'official' ? ` <i class="sc-trf tr-${t}" title="${esc(T('sch.trustTip_' + t))}">${T('sch.trust_' + t)}</i>` : ''; };
  const sourceLine = (v) => { const s = (v.sources || []).filter((x) => x.id !== 'demo'); if (!s.length) return '';
    const items = s.map((x) => {
      const name = (SRC[x.id] || x.id) + (x.edition && /^\d{4}$/.test(x.edition) ? ' ' + x.edition : '');
      const url = (v.links && v.links[x.id]) || (x.kind === 'official' || !x.kind ? v.url : null);
      const kind = T(x.kind === 'public directory' ? 'sch.publicDir' : 'sch.officialData');
      return `${url ? `<a href="${esc(url)}" target="_blank" rel="noopener nofollow">${esc(name)} ↗</a>` : esc(name)} <i class="sc-srck">(${kind})</i>`;
    });
    return `<p class="sc-src">${T('sch.source')}: ${items.join(' · ')}</p>`; };
  const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  /* placeholder shown blurred to visitors — NOT the real value (the API never sent it) */
  const fake = (id, k) => {
    const h = hash(id + k);
    return { match: 60 + (h % 35) + '%', roi: 40 + (h % 55), sal: '€' + (22 + (h % 30)) + '.' + (h % 9) + 'k', emp: 70 + (h % 25) + '%', adm: T('sch.adm_' + ['target', 'safety', 'reach'][h % 3]), cost: '€' + (6 + (h % 20)) + '.' + (h % 9) + 'k' }[k];
  };
  const kindLabel = (k) => T('sch.kind_' + k);
  const levelLabel = (l) => T('sch.level_' + (l === 'mba' ? 'mba' : l));
  const countryLabel = (c) => {
    const v = T('sch.c_' + c); if (v && v !== 'sch.c_' + c) return v;
    try { return new Intl.DisplayNames([document.documentElement.lang || 'en'], { type: 'region' }).of(c === 'UK' ? 'GB' : c) || c; } catch { return c; }
  };
  const bandLabel = (b) => '€'.repeat(b);

  /* path (member): areas + professions from My path */
  function pathAreas() { const p = st.path; if (!p || !p.domains) return []; const top = p.domains.map((d) => d.key); return [...top, ...Object.keys(AREAS).filter((k) => !top.includes(k))]; }
  function pathPros() {
    const p = st.path; if (!p) return [];
    const list = (p.proItems && p.proItems.length) ? p.proItems : (p.pros || []).map((x) => ({ name: x.name, domain: null }));
    const seen = new Set(); return list.filter((x) => x && x.name && !seen.has(x.name) && seen.add(x.name));
  }
  function initDefaults() {
    if (st.inited) return;
    st.inited = true;
    if (member()) {
      const a = pathAreas(), pr = pathPros();
      if (st.path && st.path.domains && st.path.domains[0]) st.domains.add(st.path.domains[0].key); // v20261113: one area, the 1st
      void pr;                                                                                       // professions are listed, not filtered
      st.sort = st.domains.size ? 'match' : 'roi';
      if (!a.length) st.sort = 'roi';
    } else {
      // public: start empty; a shared link may carry ?q=&country=&level=
      const u = new URLSearchParams(location.search);
      st.q = (u.get('q') || '').slice(0, 80);
      (u.get('country') || '').split(',').filter((c) => COUNTRIES.includes(c)).forEach((c) => st.countries.add(c));
      (u.get('level') || '').split(',').filter((l) => LEVELS.includes(l)).forEach((l) => st.levels.add(l));
      (u.get('area') || '').split(',').filter((k) => AREAS[k]).forEach((k) => st.domains.add(k));   // v20261114
      // v20261114: no country in the link → the site language countries (visitors have no account settings)
      if (!u.has('country')) { st.langDef = langCountries(); st.langDef.forEach((c) => st.countries.add(c)); }
      st.sort = 'relevance';
    }
  }

  /* careers whose name in the CURRENT language matches the words (so "diseñador" finds "UX Designer") */
  function qCareers(q) {
    const w = norm(q); if (w.length < 3) return [];
    return Object.values(S2.careers || {}).map((c) => c.career).filter((c) => norm(C(c)).includes(w) || norm(c).includes(w)).slice(0, 40);
  }

  /* ── data ── */
  async function load(more) {
    const seq = ++st.seq;
    st.busy = true; st.err = '';
    if (!more) { st.offset = 0; }
    paint();
    const p = new URLSearchParams();
    if (st.q.trim()) { p.set('q', st.q.trim()); const qc = qCareers(st.q); if (qc.length) p.set('qc', qc.join(',')); }
    if (st.countries.size) p.set('country', [...st.countries].join(','));
    if (st.levels.size) p.set('level', [...st.levels].join(','));
    if (st.control) p.set('control', st.control);
    if (st.langs.size) p.set('lang', [...st.langs].join(','));
    if (st.modes.size) p.set('mode', [...st.modes].join(','));
    if (st.band) p.set('band', st.band);
    if (!member() && st.domains.size) p.set('domains', [...st.domains].join(','));   // v20261114: visitors can filter by area
    if (member()) {
      p.set('within', '1');   // v20261114: strictly the chosen area, AND the chosen professions when any
      if (st.domains.size) p.set('domains', [...st.domains].join(','));
      if (st.careers.size) p.set('careers', [...st.careers].join(','));
      const mine = pathPros().map((x) => x.name); if (mine.length) p.set('mine', mine.slice(0, 60).join(','));
      if (st.maxCost) p.set('maxCost', st.maxCost);
      if (st.minRoi) p.set('minRoi', st.minRoi);
      if (st.minEmp) p.set('minEmp', st.minEmp);
      if (st.admission.size) p.set('admission', [...st.admission].join(','));
      if (st.scholar) p.set('scholar', '1');
    }
    p.set('sort', st.sort); p.set('offset', more ? st.offset + PAGE : 0); p.set('limit', PAGE);
    try {
      const r = await api('/api/schools?' + p.toString(), member() ? {} : { auth: false });
      if (seq !== st.seq) return;
      st.items = more ? (st.items || []).concat(r.items) : r.items;
      st.offset = r.offset; st.total = r.total; st.facets = r.facets; st.insights = r.insights; st.demo = r.demo; st.markets = r.markets || st.markets; addMarkets(r.markets);
    } catch (e) { if (seq === st.seq) st.err = T('sch.loadErr'); }
    if (seq !== st.seq) return;
    st.busy = false;
    if (!member()) syncUrl();
    // v20261114: professions chosen → the other programmes of the same area, in their own list below
    if (!more) { st.rest = null; if (member() && st.careers.size && st.domains.size && !st.err) { st.restParams = p; loadRest(false); } }
    paint();
  }
  async function loadRest(more) {
    const seq = st.seq, base = st.restParams; if (!base) return;
    const p = new URLSearchParams(base);
    p.delete('careers'); p.set('notCareers', [...st.careers].join(','));
    p.set('offset', more && st.rest ? st.rest.offset + PAGE : 0); p.set('limit', PAGE);
    if (st.rest) { st.rest.busy = true; paint(); }
    try {
      const r = await api('/api/schools?' + p.toString());
      if (seq !== st.seq) return;
      st.rest = { items: more && st.rest ? st.rest.items.concat(r.items) : r.items, total: r.total, offset: r.offset, busy: false };
    } catch { if (seq === st.seq) st.rest = null; }
    paint();
  }
  function syncUrl() {
    const u = new URLSearchParams();
    if (st.q.trim()) u.set('q', st.q.trim());
    if (st.countries.size) u.set('country', [...st.countries].join(','));
    if (st.levels.size) u.set('level', [...st.levels].join(','));
    if (st.domains.size) u.set('area', [...st.domains].join(','));   // v20261114
    const s = u.toString();
    try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '')); } catch { /* ignore */ }
  }
  async function loadSaved() {
    if (!member()) return;
    try { const r = await api('/api/schools/saved'); st.saved = { ids: new Set(r.ids), items: r.items }; } catch { st.saved = { ids: new Set(), items: [] }; }
    paint();
  }
  async function toggleSave(id) {
    if (!st.saved) return;
    const on = st.saved.ids.has(id);
    try {
      await api(on ? '/api/schools/saved/remove' : '/api/schools/saved', { method: 'POST', body: { id } });
      if (on) { st.saved.ids.delete(id); st.saved.items = st.saved.items.filter((x) => x.id !== id); }
      else { st.saved.ids.add(id); const it = (st.items || []).find((x) => x.id === id); if (it) st.saved.items.unshift(it); track('schools_save'); }
    } catch { /* keep state */ }
    paint();
  }

  /* ── render pieces ── */
  const chip = (attr, val, on, label, extra) => `<button type="button" class="sc-chip${on ? ' on' : ''}${extra && extra.cls ? ' ' + extra.cls : ''}" data-${attr}="${esc(val)}" aria-pressed="${!!on}"${extra && extra.style ? ` style="${extra.style}"` : ''}>${label}</button>`;
  const lockChip = (key, label) => `<button type="button" class="sc-chip sc-locked" data-unlock="${key}" title="${esc(T('sch.lockedTip'))}">🔒 ${label}</button>`;

  function rowAreas() {
    const all = pathAreas(); if (!all.length) return '';
    const AREA_VISIBLE = phone() ? AREA_VISIBLE_PHONE : AREA_VISIBLE_DESKTOP;
    const vis = st.allAreas ? all : all.slice(0, AREA_VISIBLE);
    // a selected area hidden under "+ more" stays visible
    st.domains.forEach((d) => { if (!vis.includes(d)) vis.push(d); });
    const hidden = all.length - vis.length;
    return `<div class="sc-row"><span class="sc-label">${T('sch.fAreas')}</span><div class="sc-chips">
      ${vis.map((k) => { const a = area(k); return chip('scdom', k, st.domains.has(k), `${a.icon} ${esc(C(a.name))}`, { cls: 'sc-dom', style: `--c:${a.color}` }); }).join('')}
      ${hidden > 0 ? `<button type="button" class="sc-more" data-scact="allAreas">${T('sch.moreN', { n: hidden })}</button>` : st.allAreas && all.length > AREA_VISIBLE ? `<button type="button" class="sc-more" data-scact="allAreas">${T('sch.less')}</button>` : ''}
    </div></div>`;
  }
  function rowPros() {
    const all = pathPros(); if (!all.length) return '';
    const PRO_VISIBLE = phone() ? PRO_VISIBLE_PHONE : PRO_VISIBLE_DESKTOP;
    let vis = st.allPros ? all : all.slice(0, PRO_VISIBLE);
    all.forEach((x) => { if (st.careers.has(x.name) && !vis.includes(x)) vis = vis.concat([x]); });
    const hidden = all.length - vis.length;
    return `<div class="sc-row"><span class="sc-label">${T('sch.fPros')}</span><div class="sc-chips">
      ${vis.map((x, i) => chip('scpro', x.name, st.careers.has(x.name), `${i === 0 ? '🏆' : '💼'} ${esc(C(x.name))}`)).join('')}
      ${hidden > 0 ? `<button type="button" class="sc-more" data-scact="allPros">${T('sch.moreN', { n: hidden })}</button>` : st.allPros && all.length > PRO_VISIBLE ? `<button type="button" class="sc-more" data-scact="allPros">${T('sch.less')}</button>` : ''}
    </div></div>`;
  }
  /* v20261113: member panel = the top areas of My path (one at a time) + the person's professions in that area */
  const CAREER_DOMAIN = {};
  Object.values(S2.careers || {}).forEach((c) => { if (c && c.career && !CAREER_DOMAIN[c.career]) CAREER_DOMAIN[c.career] = c.domain; });
  const topAreas = () => ((st.path && st.path.domains) || []).filter((d) => d && d.key);
  const prosOfArea = (k) => pathPros().filter((x) => (x.domain || CAREER_DOMAIN[x.name]) === k);
  function memberFilters() {
    const areas = topAreas();
    if (!areas.length) return st.where ? `<section class="ik-card sc-box sc-simple">${whereRow()}</section>` : '';
    const cur = [...st.domains][0];
    const pros = cur ? prosOfArea(cur) : [];
    const fcar = (st.facets && st.facets.career) || {};   // v20261114: programmes per profession in this area
    return `<section class="ik-card sc-box sc-simple">
      ${whereRow()}
      <div class="sc-row sc-arearow"><span class="sc-label">${T('sch.pickArea')}</span><div class="sc-chips" role="radiogroup" aria-label="${esc(T('sch.pickArea'))}">
        ${areas.map((d) => { const a = area(d.key), on = d.key === cur; return `<button type="button" role="radio" aria-checked="${on}" class="sc-chip sc-dom${on ? ' on' : ''}" data-scarea="${esc(d.key)}" style="--c:${a.color}">${a.icon} ${esc(C(a.name))}${d.pct != null ? ` <small>${d.pct}%</small>` : ''}</button>`; }).join('')}
      </div></div>
      <div class="sc-row sc-apros"><span class="sc-label">${T('sch.areaPros')}</span><div>
        <div class="sc-chips" role="group" aria-label="${esc(T('sch.areaPros'))}">
        ${pros.length ? pros.map((x, i) => { const on = st.careers.has(x.name), n = fcar[x.name] || 0;
          return `<button type="button" class="sc-ptag sc-pbtn${i === 0 ? ' top' : ''}${on ? ' on' : ''}" data-scapro="${esc(x.name)}" aria-pressed="${on}">${i === 0 ? '🏆' : '💼'} ${esc(C(x.name))}${fcar[x.name] != null || st.facets ? ` <small>${n}</small>` : ''}</button>`; }).join('') : `<span class="ik-dim sc-apros-none">${T('sch.areaProsNone')}</span>`}
        </div>${pros.length ? `<p class="sc-where-src">${st.careers.size ? T('sch.prosOn', { count: st.careers.size, n: st.careers.size }) : T('sch.prosTap')}</p>` : ''}</div></div>
    </section>`;
  }
  function filters() {
    if (member()) return memberFilters();
    const fc = (st.facets && st.facets.country) || {};
    const moreCount = (st.control ? 1 : 0) + st.langs.size + st.modes.size + (st.band ? 1 : 0) + (st.maxCost ? 1 : 0) + (st.minRoi ? 1 : 0) + (st.minEmp ? 1 : 0) + st.admission.size + (st.scholar ? 1 : 0);
    const sel = (name, val, opts) => `<select class="sc-select" data-scsel="${name}" aria-label="${esc(T('sch.f_' + name))}">${opts.map(([v, l]) => `<option value="${v}"${String(val) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const lockedOrMember = (key, label, html) => member() ? `<div class="sc-mf"><span>${label}</span>${html}</div>` : `<div class="sc-mf"><span>${label}</span>${lockChip(key, T('sch.membersOnly'))}</div>`;
    const datalist = !member() ? `<datalist id="scSug">${Object.values(S2.careers || {}).map((c) => `<option value="${esc(C(c.career))}">`).join('')}${Object.values(S2.subfields || {}).map((s) => `<option value="${esc(C(s.name))}">`).join('')}</datalist>` : '';
    return `<section class="ik-card sc-box">
      <form class="sc-search" id="scForm" role="search" autocomplete="off">
        <span class="sc-search-ico" aria-hidden="true">🔎</span>
        <input id="scQ" maxlength="80" value="${esc(st.q)}" placeholder="${esc(T(member() ? 'sch.phMember' : 'sch.phPublic'))}" aria-label="${esc(T('sch.phPublic'))}"${!member() ? ' list="scSug"' : ''}>
        ${st.q ? `<button type="button" class="sc-clear" data-scact="clearQ" aria-label="${esc(T('sch.clear'))}">✕</button>` : ''}
        <button class="btn-primary sc-go" type="submit">${T('sch.search')}</button>
      </form>${datalist}
      ${member() ? rowAreas() + rowPros() : ''}
      <div class="sc-row"><span class="sc-label">${T('sch.fCountry')}</span><div><div class="sc-chips">
        ${COUNTRIES.map((c) => chip('sccty', c, st.countries.has(c), `${flagOf(c)} ${esc(countryLabel(c))}${fc[c] != null && !st.countries.size ? ` <small>${fc[c]}</small>` : ''}`)).join('')}
      </div>${st.langDef && sameSet(st.countries, st.langDef) ? `<p class="sc-where-src">${T('sch.whereFromLang')}</p>` : ''}</div></div>
      ${publicAreas()}
      <div class="sc-row"><span class="sc-label">${T('sch.fLevel')}</span><div class="sc-chips">
        ${LEVELS.map((l) => chip('sclvl', l, st.levels.has(l), esc(T('sch.level_' + l + 's')))).join('')}
        <button type="button" class="sc-more sc-morefilters" data-scact="more" aria-expanded="${st.moreOpen}" aria-controls="scMore">⚙️ ${st.moreOpen ? T('sch.lessFilters') : T('sch.moreFilters')}${moreCount ? ` <b>${moreCount}</b>` : ''}</button>
      </div></div>
      <div class="sc-morebox" id="scMore"${st.moreOpen ? '' : ' hidden'}>
        ${publicPros()}
        <div class="sc-mf"><span>${T('sch.fControl')}</span><div class="sc-chips">${['', 'public', 'private'].map((v) => chip('scctl', v || 'any', st.control === v, esc(T('sch.ctl_' + (v || 'any'))))).join('')}</div></div>
        <div class="sc-mf"><span>${T('sch.fLang')}</span><div class="sc-chips">${LANGS.map((l) => chip('sclang', l, st.langs.has(l), esc(T('sch.lang_' + l)))).join('')}</div></div>
        <div class="sc-mf"><span>${T('sch.fMode')}</span><div class="sc-chips">${MODES.map((m) => chip('scmode', m, st.modes.has(m), esc(T('sch.mode_' + m)))).join('')}</div></div>
        <div class="sc-mf"><span>${T('sch.fBand')}</span><div class="sc-chips">${[0, 1, 2].map((b) => chip('scband', b, st.band === b, b ? `${T('sch.upTo')} ${bandLabel(b)}` : esc(T('sch.any')))).join('')}</div></div>
        ${lockedOrMember('maxCost', T('sch.f_maxCost'), sel('maxCost', st.maxCost, [[0, T('sch.any')], [10000, '≤ €10k'], [15000, '≤ €15k'], [20000, '≤ €20k'], [30000, '≤ €30k']]))}
        ${lockedOrMember('minRoi', T('sch.f_minRoi'), sel('minRoi', st.minRoi, [[0, T('sch.any')], [50, '≥ 50'], [70, '≥ 70'], [85, '≥ 85']]))}
        ${lockedOrMember('minEmp', T('sch.f_minEmp'), sel('minEmp', st.minEmp, [[0, T('sch.any')], [80, '≥ 80%'], [90, '≥ 90%']]))}
        ${lockedOrMember('admission', T('sch.f_admission'), `<div class="sc-chips">${['safety', 'target', 'reach'].map((a) => chip('scadm', a, st.admission.has(a), esc(T('sch.adm_' + a)))).join('')}</div>`)}
        ${lockedOrMember('scholar', T('sch.f_scholar'), chip('scact', 'scholar', st.scholar, esc(T('sch.scholarOn'))))}
      </div>
      ${anyFilter() ? `<button type="button" class="sc-reset" data-scact="reset">↺ ${T(member() ? 'sch.resetMember' : 'sch.reset')}</button>` : ''}
    </section>`;
  }
  /* v20261114 (public /schools): every area as a filter (several allowed, with counts), and the professions of the chosen
     areas shown LOCKED in "More filters" (tap = sign-up prompt) */
  function publicAreas() {
    const fd = (st.facets && st.facets.domain) || {};
    return `<div class="sc-row sc-arearow"><span class="sc-label">${T('sch.fArea')}</span><div class="sc-chips" role="group" aria-label="${esc(T('sch.fArea'))}">
      ${Object.keys(AREAS).map((k) => { const a = area(k); return chip('scdom', k, st.domains.has(k), `${a.icon} ${esc(C(a.name))}${fd[k] != null && !st.domains.size ? ` <small>${fd[k]}</small>` : ''}`, { cls: 'sc-dom', style: `--c:${a.color}` }); }).join('')}
    </div></div>`;
  }
  function publicPros() {
    const seen = new Set(), pros = [];
    Object.values(S2.careers || {}).forEach((c) => { if (c && c.career && st.domains.has(c.domain) && !seen.has(c.career)) { seen.add(c.career); pros.push(c.career); } });
    const MAX = phone() ? 6 : 12, more = pros.length - MAX;
    return `<div class="sc-mf sc-mf-wide"><span>${T('sch.fProsPublic')}</span><div><div class="sc-chips">
      ${pros.length ? pros.slice(0, MAX).map((n) => lockChip('pro', esc(C(n)))).join('') + (more > 0 ? `<button type="button" class="sc-chip sc-locked" data-unlock="pro" title="${esc(T('sch.lockedTip'))}">🔒 ${T('sch.moreN', { n: more })}</button>` : '') : lockChip('pro', T('sch.membersOnly'))}
      </div><p class="sc-where-src">${T(pros.length ? 'sch.prosLocked' : 'sch.prosPickArea')}</p></div></div>`;
  }
  const anyFilter = () => !member() && !!(st.q || st.countries.size || st.levels.size || st.domains.size || st.control || st.langs.size || st.modes.size || st.band || st.maxCost || st.minRoi || st.minEmp || st.admission.size || st.scholar
    || (member() && (st.domains.size !== 1 || st.careers.size !== 1)));

  function insightsPanel() {
    if (!st.items || !st.total) return '';
    const ins = st.insights;
    const tile = (label, val, sub) => `<div class="sc-ins"><small>${label}</small><strong>${val}</strong>${sub ? `<em>${sub}</em>` : ''}</div>`;
    if (member() && ins) {
      return `<section class="sc-insights" aria-label="${esc(T('sch.insTitle'))}">
        ${tile(T('sch.insCost'), money(ins.medianCostYearEur, 'EUR'), T('sch.perYear'))}
        ${tile(T('sch.insSalary'), money(ins.medianSalaryY1Eur, 'EUR'), T('sch.afterYear'))}
        ${tile(T('sch.insEmp'), ins.avgEmployment != null ? ins.avgEmployment + '%' : NA, T('sch.employed'))}
        ${tile(T('sch.insAccept'), pct(ins.medianAcceptance), T('sch.insAcceptSub'))}
        ${ins.bestRoi ? tile(T('sch.insBest'), esc(ins.bestRoi.title), esc(ins.bestRoi.institution) + ' · ROI ' + ins.bestRoi.roiScore) : tile(T('sch.insBest'), NA, '')}
        ${tile(T('sch.insScholar'), ins.withScholarships, T('sch.programmes'))}
      </section>`;
    }
    return `<section class="sc-insights sc-blur-wrap" aria-label="${esc(T('sch.insTitle'))}">
      <div class="sc-blur" aria-hidden="true">${tile(T('sch.insCost'), '€14.8k', T('sch.perYear'))}${tile(T('sch.insSalary'), '€31.2k', T('sch.afterYear'))}${tile(T('sch.insEmp'), '87%', T('sch.employed'))}${tile(T('sch.insBest'), 'Lorem ipsum dolor', 'Lorem · ROI 94')}${tile(T('sch.insScholar'), '23', T('sch.programmes'))}</div>
      ${lockOverlay('insights', T('sch.unlockInsights'))}
    </section>`;
  }
  /* v20261112d: one-tap sign-up / sign-in with the apps switched on (oauth.js); always comes back to My learning › Schools */
  const OA_ORDER = ['google', 'tiktok', 'instagram', 'facebook']; // v20261114c: Google first, same as oauth.js
  const oaApp = (id) => ((window.WikiAuth && window.WikiAuth.APPS) || {})[id] || { label: id, cls: '', icon: '' };
  function oaButtons(kind, from) {
    if (member() || !st.oa.length) return '';
    if (kind === 'icons') return `<span class="sc-oa-icons">${st.oa.map((id) => { const a = oaApp(id); return `<button type="button" class="oa-btn ${a.cls} sc-oa-ico" data-scoa="${id}" data-from="${from}" title="${esc(T('oauth.continue', { provider: a.label }))}" aria-label="${esc(T('oauth.continue', { provider: a.label }))}">${a.icon}</button>`; }).join('')}</span>`;
    return `<div class="sc-oa ${kind === 'stack' ? 'stack' : ''}">${st.oa.map((id) => { const a = oaApp(id); return `<button type="button" class="oa-btn ${a.cls}" data-scoa="${id}" data-from="${from}">${a.icon}<span>${esc(T('oauth.continue', { provider: a.label }))}</span></button>`; }).join('')}</div>`;
  }
  function paintHeroSocial() {
    const box = document.getElementById('scSocial');
    if (!box || member()) return;
    if (!st.oa.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = `<span class="sc-social-l">${T('sch.fastSignup')}</span>${oaButtons('row', 'hero')}`;
    box.hidden = false;
  }
  async function loadSocial() {
    if (member() || !window.WikiAuth) return;
    try { const c = await window.WikiAuth.cfg(); const list = (c.auth && c.auth.providers) || []; st.oa = OA_ORDER.filter((id) => list.some((p) => p.id === id)); }
    catch { st.oa = []; }
    paintHeroSocial(); paint();
  }

  function lockOverlay(key, text) {
    return `<div class="sc-lock"><span class="sc-lock-ico">🔒</span><span class="sc-lock-t">${text}</span>
      <span class="sc-lock-acts"><a class="btn-primary sm" href="/signup" data-unlocklink="${key}">${T('sch.signupFree')}</a><a class="sc-signin" href="/login?next=${encodeURIComponent('/learning/schools')}" data-unlocklink="${key}">${T('sch.signin')}</a>${oaButtons('icons', key)}</span></div>`;
  }

  function card(v) {
    const a = area(v.domain);
    const savedOn = st.saved && st.saved.ids.has(v.id);
    const open = st.open.has(v.id);
    const locked = !!v.locked;
    const val = (k, real) => (locked ? fake(v.id, k) : real == null ? NA : real);
    const tiles = [
      member() && v.match != null ? ['match', T('sch.tMatch'), v.match + '%'] : (!member() ? ['match', T('sch.tMatch'), null] : null),
      ['roi', T('sch.tRoi'), v.roiScore != null ? `${v.roiScore}<small>/100</small>` : null],
      ['sal', T('sch.tSalary'), v.salaryY1 != null ? money(v.salaryY1, v.currency) : null],
      ['emp', T('sch.tEmp'), v.employment != null ? pct(v.employment) : null],
      ['adm', T('sch.tAdm'), v.admission ? `<span class="sc-adm ${v.admission}">${T('sch.adm_' + v.admission)}</span>` : null],
      ['cost', T('sch.tCost'), v.costYearEur != null ? money(v.costYearEur, 'EUR') : null],
    ].filter(Boolean);
    const strip = `<div class="sc-strip${locked ? ' sc-blur-wrap' : ''}">
      <div class="sc-tiles${locked ? ' sc-blur' : ''}"${locked ? ' aria-hidden="true"' : ''}>${tiles.map(([k, l, real]) => `<div class="sc-tile sc-t-${k}"><small>${l}</small><strong>${val(k, real)}</strong></div>`).join('')}</div>
      ${locked ? lockOverlay('card', T('sch.unlockCard')) : ''}
    </div>`;
    const careers = v.careers || [];
    const why = v.why && v.why.careers && v.why.careers.length;
    const leads = careers.slice(0, 3).map((c) => `<span class="sc-lead${v.why && v.why.careers.includes(c) ? ' hit' : ''}">${v.why && v.why.careers.includes(c) ? '✓ ' : ''}${esc(C(c))}</span>`).join('') + (careers.length > 3 ? `<span class="sc-lead more">+${careers.length - 3}</span>` : '');
    const details = !open ? '' : locked
      ? `<div class="sc-details sc-blur-wrap"><div class="sc-dgrid sc-blur" aria-hidden="true">${['tuition', 'intl', 'living', 'sal5', 'payback', 'accept', 'scholar', 'intlpct', 'conf'].map((k) => `<div><small>${T('sch.d_' + k)}</small><strong>${fake(v.id + k, 'cost')}</strong></div>`).join('')}</div>${lockOverlay('details', T('sch.unlockDetails'))}</div>`
      : `<div class="sc-details"><div class="sc-dgrid">
          <div><small>${T('sch.d_tuition')}</small><strong>${money(v.tuition, v.currency)}${trF(v, 'tuition')}</strong><em>${T('sch.perYear')}</em></div>
          <div><small>${T('sch.d_intl')}</small><strong>${money(v.tuitionIntl, v.currency)}${trF(v, 'tuitionIntl')}</strong><em>${T('sch.perYear')}</em></div>
          <div><small>${T('sch.d_living')}</small><strong>${money(v.livingCost, v.currency)}${trF(v, 'livingCost')}</strong><em>${T('sch.perYear')}</em></div>
          <div><small>${T('sch.d_sal5')}</small><strong>${money(v.salaryY5, v.currency)}</strong></div>
          <div><small>${T('sch.d_payback')}</small><strong>${v.paybackYears ? T('sch.years', { count: v.paybackYears, n: v.paybackYears }) : v.roiScore == null ? NA : T('sch.over10')}</strong></div>
          <div><small>${T('sch.d_accept')}</small><strong>${rpct(v, 'acceptance')}${trF(v, 'acceptance')}</strong>${scopeNote(v, 'acceptance')}</div>
          <div><small>${T('sch.d_scholar')}</small><strong>${rpct(v, 'scholarshipShare')}</strong>${v.avgAward != null ? `<em>${T('sch.avgAward', { v: money(v.avgAward, v.currency) })}</em>` : scopeNote(v, 'scholarshipShare') || `<em>${T('sch.grantHolders')}</em>`}</div>
          <div><small>${T('sch.d_intlpct')}</small><strong>${pct(v.intlPct)}</strong></div>
          <div><small>${T('sch.d_places')}</small><strong>${rnum(v, 'capacity')}</strong>${v.applicants != null ? `<em>${T('sch.applicantsN', { n: rnum(v, 'applicants') })}</em>` : ''}</div>
          <div><small>${T('sch.d_conf')}</small><strong class="sc-conf c${esc(v.confidence || '')}">${esc(v.confidence || NA)}</strong>${v.confidence ? `<em>${T('sch.conf_' + v.confidence)}</em>` : ''}</div>
        </div>${sourceLine(v)}</div>`;
    return `<article class="sc-card" style="--c:${a.color}">
      <div class="sc-card-top">
        <span class="sc-where">${FLAG[v.country]} ${esc(countryLabel(v.country))} · ${esc(v.city)}</span>
        <span class="sc-tags"><span class="sc-tag lvl">${esc(levelLabel(v.level))}</span><span class="sc-tag dom">${a.icon} ${esc(C(a.name))}</span>${trustTag(v)}${(v.demo != null ? v.demo : st.demo) ? `<span class="sc-tag demo" title="${esc(T('sch.demoTip'))}">${T('sch.demoTag')}</span>` : ''}${v.lowData ? `<span class="sc-tag low" title="${esc(T('sch.lowDataTip'))}">${T('sch.lowData')}</span>` : ''}${v.listed === false ? `<span class="sc-tag gone" title="${esc(T('sch.notListedTip'))}">${T('sch.notListed')}</span>` : ''}</span>
      </div>
      <h3 class="sc-title">${esc(v.title)}</h3>
      <div class="sc-inst">${[esc(v.institution.name), v.institution.control ? esc(T('sch.ctl_' + v.institution.control)) : NA, v.institution.kind ? esc(kindLabel(v.institution.kind)) : NA].join(' · ')}</div>
      <div class="sc-facts"><span>⏱ ${v.durationYears != null ? T('sch.years', { count: Math.ceil(v.durationYears), n: v.durationYears }) : NA}</span><span>🗣 ${(v.langs || []).length ? v.langs.map((l) => l.toUpperCase()).join(' · ') : NA}</span><span>🏫 ${v.mode ? esc(T('sch.mode_' + v.mode)) + (v.workStudy ? ' · ' + esc(T('sch.workStudy')) : '') : NA}</span><span title="${esc(T('sch.bandTip'))}">💶 ${v.tuitionBand ? bandLabel(v.tuitionBand) : NA}</span></div>
      <div class="sc-leads"><span class="sc-leads-l">${T(why ? 'sch.leadsYou' : 'sch.leadsTo')}</span>${careers.length ? leads : NA}</div>
      ${strip}
      <div class="sc-acts">
        ${member() ? `<button type="button" class="sc-save${savedOn ? ' on' : ''}" data-scsave="${esc(v.id)}" aria-pressed="${!!savedOn}">${savedOn ? '★ ' + T('sch.saved') : '☆ ' + T('sch.save')}</button>` : `<button type="button" class="sc-save" data-unlock="save">☆ ${T('sch.save')}</button>`}
        <button type="button" class="sc-det" data-scdet="${esc(v.id)}" aria-expanded="${open}">${open ? T('sch.lessDetails') : T('sch.details')} ${open ? '▴' : '▾'}</button>
      </div>
      ${details}
    </article>`;
  }

  function results() {
    if (st.err) return `<p class="lr-err" role="alert">${esc(st.err)}</p>`;
    if (st.items === null) return `<div class="lr-loading"><div class="lr-spinner" aria-hidden="true"></div><div><strong>${T('common.loading')}</strong></div></div>`;
    // v20261114b: countries whose official data is not loaded yet (demo courses removed) → say so, don't look broken
    const noData = st.markets && st.countries.size && [...st.countries].every((c) => !st.markets.includes(c));
    if (!st.items.length && noData) return `<div class="sc-empty"><strong>${T('sch.noDataYet', { countries: esc(listCountries([...st.countries])) })}</strong><p>${T('sch.noDataYetTip', { countries: esc(listCountries(st.markets)) })}</p></div>`;
    if (!st.items.length) return `<div class="sc-empty"><strong>${T('sch.none')}</strong><p>${T(member() && st.careers.size ? 'sch.nonePros' : 'sch.noneTip')}</p>${anyFilter() ? `<button type="button" class="btn-ghost" data-scact="reset">↺ ${T(member() ? 'sch.resetMember' : 'sch.reset')}</button>` : ''}</div>${restSection()}`;
    const more = st.items.length < st.total;
    return `<div class="sc-grid">${st.items.map(card).join('')}</div>
      ${more ? `<div class="sc-pager"><button type="button" class="btn-ghost" data-scact="page"${st.busy ? ' disabled' : ''}>${st.busy ? T('common.loading') : T('sch.showMore', { n: Math.min(PAGE, st.total - st.items.length) })}</button></div>` : ''}${restSection()}`;
  }
  /* v20261114: below the matches for the chosen professions — the rest of the same area */
  function restSection() {
    const r = st.rest; if (!member() || !r || !r.items.length) return '';
    const more = r.items.length < r.total;
    return `<section class="sc-rest" aria-labelledby="scRestT"><div class="sc-rest-h"><h3 id="scRestT">${T('sch.restTitle')}</h3><span class="sc-count">${T('sch.count', { count: r.total, n: r.total })}</span></div>
      <div class="sc-grid">${r.items.map(card).join('')}</div>
      ${more ? `<div class="sc-pager"><button type="button" class="btn-ghost" data-scact="restPage"${r.busy ? ' disabled' : ''}>${r.busy ? T('common.loading') : T('sch.showMore', { n: Math.min(PAGE, r.total - r.items.length) })}</button></div>` : ''}</section>`;
  }
  function sortBar() {
    const opts = member()
      ? [['match', T('sch.s_match')], ['roi', T('sch.s_roi')], ['salary', T('sch.s_salary')], ['cost', T('sch.s_cost')], ['name', T('sch.s_name')]]
      : [['relevance', T('sch.s_relevance')], ['cost', T('sch.s_band')], ['name', T('sch.s_name')], ['🔒roi', '🔒 ' + T('sch.s_roi')], ['🔒salary', '🔒 ' + T('sch.s_salary')], ['🔒match', '🔒 ' + T('sch.s_match')]];
    const tabs = member() ? `<div class="lr-tabs sc-tabs" role="tablist">
        <button role="tab" class="lr-tab${st.tab === 'results' ? ' on' : ''}" data-sctab="results" aria-selected="${st.tab === 'results'}">${T('sch.tabResults')}</button>
        <button role="tab" class="lr-tab${st.tab === 'saved' ? ' on' : ''}" data-sctab="saved" aria-selected="${st.tab === 'saved'}">★ ${T('sch.tabSaved')}${st.saved && st.saved.ids.size ? ` (${st.saved.ids.size})` : ''}</button>
      </div>` : '';
    return `<div class="sc-bar">${tabs}
      <span class="sc-count" role="status">${st.items === null ? '' : st.tab === 'saved' && member() ? T('sch.savedCount', { count: st.saved ? st.saved.ids.size : 0, n: st.saved ? st.saved.ids.size : 0 }) : T('sch.count', { count: st.total, n: st.total })}</span>
      ${st.tab === 'results' || !member() ? `<label class="sc-sort"><span>${T('sch.sortBy')}</span><select data-scsel="sort">${opts.map(([v, l]) => `<option value="${v}"${v === st.sort ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}
    </div>`;
  }
  function unlockModal() {
    if (!st.unlock) return '';
    return `<div class="sc-modal" role="dialog" aria-modal="true" aria-labelledby="scModalT"><div class="sc-modal-box">
      <button type="button" class="sc-modal-x" data-scact="closeUnlock" aria-label="${esc(T('sch.close'))}">✕</button>
      <div class="sc-modal-ico">🔓</div><h2 id="scModalT">${T('sch.modalTitle')}</h2>
      <ul class="sc-modal-list">${[1, 2, 3, 4].map((n) => `<li>${T('sch.modalB' + n)}</li>`).join('')}</ul>
      ${st.oa.length ? `${oaButtons('stack', 'modal')}<div class="oa-or">${esc(T('oauth.or'))}</div>` : ''}
      <div class="sc-modal-acts"><a class="btn-primary" href="/signup" data-unlocklink="modal">${T('sch.signupFree')}</a><a class="btn-ghost" href="/login?next=${encodeURIComponent('/learning/schools')}" data-unlocklink="modal">${T('sch.signin')}</a></div>
      <p class="sc-modal-note">${T('sch.modalNote')}</p>
    </div></div>`;
  }

  function paint() {
    if (!st.el) return;
    if (st.savedOnly) {   // v20261114: My favourites › My courses
      const all = st.saved ? st.saved.items : null, list = all && st.savedLimit ? all.slice(0, st.savedLimit) : all;
      st.el.innerHTML = !all ? `<p class="ik-dim">${T('common.loading')}</p>`
        : !all.length ? `<p class="fv-empty">${T('sch.savedEmpty')} <a href="/learning/schools">${T('fav.findSchools')} →</a></p>`
        : `<div class="sc-grid">${list.map(card).join('')}</div>${list.length < all.length ? `<a class="fv-all" href="/favorites/courses">${T('fav.seeAll', { n: all.length })} →</a>` : ''}`;
      return;
    }
    const focused = document.activeElement && document.activeElement.id === 'scQ';
    if (focused) st.q = document.getElementById('scQ').value;
    const savedView = member() && st.tab === 'saved';
    const body = savedView
      ? (!st.saved ? `<p class="ik-dim">${T('common.loading')}</p>` : st.saved.items.length ? `<div class="sc-grid">${st.saved.items.map(card).join('')}</div>` : `<div class="sc-empty"><strong>${T('sch.savedEmpty')}</strong><p>${T('sch.savedEmptyTip')}</p></div>`)
      : results();
    st.el.innerHTML = `${filters()}${!savedView ? insightsPanel() : ''}${sortBar()}${st.demo ? `<p class="sc-demo-note">ⓘ ${T('sch.demoNote')}</p>` : ''}<div class="sc-body${st.busy && st.items ? ' busy' : ''}">${body}</div>${unlockModal()}`;
    if (focused) { const i = document.getElementById('scQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }

  /* ── events (delegated on the container) ── */
  function toggle(set, v) { if (set.has(v)) set.delete(v); else set.add(v); }
  function onClick(e) {
    const t = (sel) => e.target.closest && e.target.closest(sel);
    let b;
    if ((b = t('[data-scoa]'))) { track('schools_unlock_click', { from: 'app_' + b.dataset.scoa }); window.WikiAuth.start(b.dataset.scoa, 'login', '/learning/schools', b); return; }
    if ((b = t('[data-unlock]'))) { st.unlock = true; track('schools_unlock_click', { from: b.dataset.unlock }); paint(); return; }
    if ((b = t('[data-unlocklink]'))) { track('schools_unlock_click', { from: 'link_' + b.dataset.unlocklink }); return; }
    if ((b = t('.sc-modal')) && !t('.sc-modal-box')) { st.unlock = false; paint(); return; }
    if ((b = t('[data-scapro]'))) { toggle(st.careers, b.dataset.scapro); st.open.clear(); track('schools_search', { member: true, pros: st.careers.size }); return load(); } // v20261114
    if ((b = t('[data-scarea]'))) { if (st.domains.has(b.dataset.scarea)) return; st.domains = new Set([b.dataset.scarea]); st.careers.clear(); st.open.clear(); track('schools_search', { member: true, area: b.dataset.scarea }); return load(); } // v20261113: one area
    if ((b = t('[data-scdom]'))) { toggle(st.domains, b.dataset.scdom); return load(); }
    if ((b = t('[data-scpro]'))) { toggle(st.careers, b.dataset.scpro); return load(); }
    if ((b = t('[data-sccty]'))) { toggle(st.countries, b.dataset.sccty); st.whereSaved = false; return load(); }
    if ((b = t('[data-sclvl]'))) { toggle(st.levels, b.dataset.sclvl); return load(); }
    if ((b = t('[data-scctl]'))) { st.control = b.dataset.scctl === 'any' ? '' : b.dataset.scctl; return load(); }
    if ((b = t('[data-sclang]'))) { toggle(st.langs, b.dataset.sclang); return load(); }
    if ((b = t('[data-scmode]'))) { toggle(st.modes, b.dataset.scmode); return load(); }
    if ((b = t('[data-scband]'))) { st.band = +b.dataset.scband; return load(); }
    if ((b = t('[data-scadm]'))) { toggle(st.admission, b.dataset.scadm); return load(); }
    if ((b = t('[data-scsave]'))) { toggleSave(b.dataset.scsave); return; }
    if ((b = t('[data-scdet]'))) { const id = b.dataset.scdet; if (st.open.has(id)) st.open.delete(id); else { st.open.add(id); track('schools_details'); } paint(); return; }
    if ((b = t('[data-sctab]'))) { st.tab = b.dataset.sctab; if (st.tab === 'saved' && !st.saved) loadSaved(); paint(); return; }
    if ((b = t('[data-scact]'))) {
      const a = b.dataset.scact;
      if (a === 'more') { st.moreOpen = !st.moreOpen; paint(); return; }
      if (a === 'allAreas') { st.allAreas = !st.allAreas; paint(); return; }
      if (a === 'allPros') { st.allPros = !st.allPros; paint(); return; }
      if (a === 'scholar') { st.scholar = !st.scholar; return load(); }
      if (a === 'page') { return load(true); }
      if (a === 'restPage') { return loadRest(true); }
      if (a === 'clearQ') { st.q = ''; return load(); }
      if (a === 'closeUnlock') { st.unlock = false; paint(); return; }
      if (a === 'saveWhere') { saveWhere(); return; }
      if (a === 'reset') {
        st.q = ''; [st.countries, st.levels, st.langs, st.modes, st.admission, st.domains, st.careers].forEach((s) => s.clear());
        st.control = ''; st.band = 0; st.maxCost = 0; st.minRoi = 0; st.minEmp = 0; st.scholar = false;
        if (member()) { st.inited = false; initDefaults(); } else st.sort = 'relevance';
        return load();
      }
    }
  }
  function onChange(e) {
    const s = e.target && e.target.dataset && e.target.dataset.scsel;
    if (!s) return;
    const v = e.target.value;
    if (s === 'sort') {
      if (v.startsWith('🔒')) { e.target.value = st.sort; st.unlock = true; track('schools_unlock_click', { from: 'sort' }); paint(); return; }
      st.sort = v; return load();
    }
    st[s] = +v || 0; load();
  }
  function onSubmit(e) {
    if (e.target && e.target.id === 'scForm') { e.preventDefault(); st.q = document.getElementById('scQ').value.slice(0, 80); track('schools_search', { member: member() }); load(); }
  }
  function onKey(e) { if (e.key === 'Escape' && st.unlock) { st.unlock = false; paint(); } }

  /* ── public API ── */
  window.WKSchools = {
    /* mount (or re-mount after the host page re-rendered) into `el`. opts: { mode: 'public'|'member', path } */
    mount(el, opts) {
      const first = !st.el;
      st.el = el; st.mode = opts.mode || 'public';
      if (opts.path !== undefined) st.path = opts.path;
      if (first) {
        document.addEventListener('click', (e) => { if (st.el && st.el.contains(e.target)) onClick(e); });
        document.addEventListener('change', (e) => { if (st.el && st.el.contains(e.target)) onChange(e); });
        document.addEventListener('submit', (e) => { if (st.el && st.el.contains(e.target)) onSubmit(e); });
        document.addEventListener('keydown', onKey);
        // v20261114: wk:langchange, not I.onChange (a listener there would stop pages that reload on a language switch)
        document.addEventListener('wk:langchange', () => { if (st.el && langSwap()) load(); });
      }
      // v20261114: My favourites › My courses — only the saved programmes, every country, no filters, no account settings
      st.savedOnly = !!opts.savedOnly; st.savedLimit = opts.limit || 0;
      if (st.savedOnly) { paint(); if (!st.saved) loadSaved(); return; }   // the host page re-renders often: keep the list, no flicker
      initDefaults();
      // v20261113: members — find the default country (account) before the first search
      if (member() && !st.where && !st.whereBusy) { st.whereBusy = true; paint(); memberWhere().then(() => { st.whereBusy = false; load(); loadSaved(); }); return; }
      if (st.whereBusy) { paint(); return; }
      if (st.items === null && !st.busy) { load(); if (member()) loadSaved(); } else paint();
    },
    repaint: () => paint(),
  };

  /* public page: boot on its own; signed-in people get the full version in My learning */
  const host = document.getElementById('schPublic');
  if (host) {
    if (Store.token) { location.replace('/learning/schools'); return; }
    I.ready.then(() => { window.WKSchools.mount(host, { mode: 'public' }); loadSocial(); });
    I.onChange(() => { paint(); paintHeroSocial(); });
    const hero = document.getElementById('scSocial');
    if (hero) hero.addEventListener('click', (e) => { const b = e.target.closest('[data-scoa]'); if (b) onClick(e); });
  }
})();
