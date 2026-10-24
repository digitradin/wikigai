/* Wikigai owner dashboard (admin.html).
   Data: GET /api/admin/stats?days=N and GET /api/admin/seo — aggregates only.
   All labels come from the i18n dictionary (admin.*); re-renders on language change. */
(function () {
  'use strict';
  const { api, Store } = window.CPS;
  const I = window.WK.i18n;
  const T = (k, v) => I.t(k, v);
  const N = (n, o) => I.fmt.number(n, o);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PERIODS = [7, 21, 30, 90];
  let days = 21;
  try { const q = parseInt(new URLSearchParams(location.search).get('days'), 10); if (PERIODS.includes(q)) days = q; } catch { /* default */ }
  let data = null, seo = null, seoAll = false;

  if (!Store.token) { location.href = '/login'; return; }

  /* ── loading ── */
  async function load() {
    $('adMsg').hidden = false; $('adMsg').className = 'ad-msg'; $('adMsg').textContent = T('admin.loading');
    try {
      data = await api('/api/admin/stats?days=' + days);
      paint();
    } catch (err) {
      if (err.status === 401) { Store.clear(); location.href = '/login'; return; }
      $('adBody').hidden = true;
      $('adMsg').className = 'ad-msg err';
      $('adMsg').textContent = err.status === 403 ? T('admin.denied') : T('admin.error', { msg: err.message });
    }
  }

  /* ── helpers ── */
  function delta(cur, prev, invert) {
    if (!prev && !cur) return '<span class="ad-d flat">—</span>';
    if (!prev) return `<span class="ad-d up">${T('admin.isNew')}</span>`;
    const d = ((cur - prev) / prev) * 100;
    const good = invert ? d < 0 : d > 0;
    const cls = Math.abs(d) < 0.5 ? 'flat' : good ? 'up' : 'down';
    return `<span class="ad-d ${cls}">${d > 0 ? '▲' : d < 0 ? '▼' : '■'} ${N(Math.abs(d), { maximumFractionDigits: 0 })}%</span>`;
  }
  function table(rows, cols, empty) {
    if (!rows || !rows.length) return `<p class="ad-empty">${T(empty || 'admin.noData')}</p>`;
    const max = Math.max(1, ...rows.map((r) => Number(r[cols[1].key]) || 0));
    return `<table class="ad-t"><thead><tr>${cols.map((c) => `<th class="${c.num ? 'n' : ''}">${T(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c, i) => {
      const v = r[c.key];
      if (!c.num) return `<td>${c.fmt ? c.fmt(v, r) : esc(v || T('admin.unknown'))}</td>`;
      const bar = i === 1 ? `<i style="width:${Math.max(2, (Number(v) / max) * 100)}%"></i>` : '';
      return `<td class="n">${bar}<b>${N(Number(v) || 0)}</b></td>`;
    }).join('')}</tr>`).join('')}</tbody></table>`;
  }
  const dimCols = (label, fmt) => [{ key: 'key', label, fmt }, { key: 'visits', label: 'admin.colVisits', num: true }, { key: 'views', label: 'admin.colViews', num: true }];
  const langName = (code) => { try { return new Intl.DisplayNames([I.locale.intl || I.lang], { type: 'language' }).of(code) || code; } catch { return code; } };
  const countryName = (code) => { try { return new Intl.DisplayNames([I.locale.intl || I.lang], { type: 'region' }).of(code) || code; } catch { return code; } };

  /* ── chart (inline SVG: visits line + sign-up bars) ── */
  function chart(series) {
    const W = 760, H = 220, P = { l: 36, r: 36, t: 14, b: 26 };
    const n = series.length;
    if (!n) return `<p class="ad-empty">${T('admin.noData')}</p>`;
    const maxV = Math.max(4, ...series.map((d) => d.visits));
    const maxS = Math.max(2, ...series.map((d) => d.signups));
    const x = (i) => P.l + (n === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (n - 1));
    const yV = (v) => H - P.b - (v / maxV) * (H - P.t - P.b);
    const yS = (v) => H - P.b - (v / maxS) * (H - P.t - P.b) * 0.6;
    const bw = Math.max(3, Math.min(18, ((W - P.l - P.r) / n) * 0.5));
    const line = series.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${yV(d.visits).toFixed(1)}`).join(' ');
    const area = `${line} L${x(n - 1).toFixed(1)},${H - P.b} L${x(0).toFixed(1)},${H - P.b} Z`;
    const step = Math.ceil(n / 8);
    const fmtDay = (s) => I.fmt.date(s + 'T12:00:00Z', { day: 'numeric', month: 'short' });
    const grid = [0, 0.5, 1].map((f) => { const v = Math.round(maxV * f); const y = yV(v); return `<line x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}" class="g"/><text x="${P.l - 6}" y="${y + 4}" class="ax" text-anchor="end">${N(v)}</text>`; }).join('');
    return `<div class="ad-legend"><span class="lv">${T('admin.legendVisits')}</span><span class="ls">${T('admin.legendSignups')}</span></div>
    <svg viewBox="0 0 ${W} ${H}" class="ad-svg" role="img" aria-label="${esc(T('admin.chartTitle'))}">
      <defs><linearGradient id="adFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#c44dff" stop-opacity=".35"/><stop offset="1" stop-color="#c44dff" stop-opacity="0"/></linearGradient></defs>
      ${grid}
      ${series.map((d, i) => d.signups ? `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${yS(d.signups).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - P.b - yS(d.signups)).toFixed(1)}" rx="2" class="bs"><title>${fmtDay(d.day)} · ${T('admin.legendSignups')}: ${d.signups}</title></rect>` : '').join('')}
      <path d="${area}" fill="url(#adFill)"/>
      <path d="${line}" class="lv"/>
      ${series.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${yV(d.visits).toFixed(1)}" r="${n > 45 ? 0 : 3}" class="dv"><title>${fmtDay(d.day)} · ${T('admin.legendVisits')}: ${d.visits}</title></circle>`).join('')}
      ${series.map((d, i) => (i % step === 0 || i === n - 1) ? `<text x="${x(i).toFixed(1)}" y="${H - 6}" class="ax" text-anchor="middle">${fmtDay(d.day)}</text>` : '').join('')}
    </svg>`;
  }

  function funnel(f) {
    const steps = [['visited', 'fVisited'], ['signup_page', 'fSignupPage'], ['signup_submit', 'fSubmit'], ['verified', 'fVerified'], ['stage1', 'fStage1'], ['stage2', 'fStage2'], ['stage3', 'fStage3']];
    const top = Math.max(1, f.visited || 0);
    return `<div class="ad-funnel">${steps.map(([k, l], i) => {
      const v = f[k] || 0, prev = i ? f[steps[i - 1][0]] || 0 : v;
      const rate = i && prev ? `<small>${N((v / prev) * 100, { maximumFractionDigits: 0 })}%</small>` : '';
      return `<div class="ad-fs"><span>${T('admin.' + l)}</span><div class="ad-fb"><i style="width:${Math.max(1.5, (v / top) * 100)}%"></i></div><b>${N(v)}</b>${rate}</div>`;
    }).join('')}</div>`;
  }

  function stats(list) {
    return `<div class="ad-stats">${list.map(([l, v]) => `<div><span>${T(l)}</span><b>${v}</b></div>`).join('')}</div>`;
  }

  /* ── paint ── */
  function paint() {
    if (!data) return;
    $('adMsg').hidden = false;
    $('adMsg').className = 'ad-msg info';
    $('adMsg').textContent = data.trackingSince ? T('admin.trackingSince', { date: I.fmt.date(data.trackingSince + 'T12:00:00Z', { day: 'numeric', month: 'long', year: 'numeric' }) }) : T('admin.noTracking');
    $('adBody').hidden = false;
    document.querySelectorAll('#adPeriod button').forEach((b) => { const d = +b.dataset.days; b.textContent = T('admin.days', { n: d }); b.classList.toggle('on', d === days); b.setAttribute('aria-pressed', String(d === days)); });

    const k = data.kpis, p = data.previous;
    const tiles = [
      ['kVisits', N(k.visits), delta(k.visits, p.visits)],
      ['kPageviews', N(k.pageviews), delta(k.pageviews, p.pageviews)],
      ['kPpv', N(k.pagesPerVisit, { maximumFractionDigits: 2 }), delta(k.pagesPerVisit, p.pagesPerVisit)],
      ['kBounce', N(k.bounceRate) + '%', delta(k.bounceRate, p.bounceRate, true)],
      ['kSignups', N(k.signups), delta(k.signups, p.signups)],
      ['kVerified', N(k.verified), delta(k.verified, p.verified)],
      ['kConversion', N(k.conversion, { maximumFractionDigits: 1 }) + '%', delta(k.conversion, p.conversion)],
      ['kStage1', N(k.stage1), delta(k.stage1, p.stage1)],
      ['kStage2', N(k.stage2), delta(k.stage2, p.stage2)],
      ['kStage3', N(k.stage3), delta(k.stage3, p.stage3)],
      ['kShares', N(k.shares), delta(k.shares, p.shares)],
    ];
    $('adKpis').innerHTML = tiles.map(([l, v, d]) => `<div class="ad-kpi"><span>${T('admin.' + l)}</span><b>${v}</b>${d}<small>${T('admin.vsPrev', { n: data.range.days })}</small></div>`).join('');
    $('adChart').innerHTML = chart(data.series);
    $('adFunnel').innerHTML = funnel(data.funnel);
    $('adRefs').innerHTML = table(data.referrers, dimCols('admin.colSource', (v) => (v ? esc(v) : `<em>${T('admin.direct')}</em>`)));
    $('adPages').innerHTML = table(data.pages, dimCols('admin.colPage', (v) => `<code>${esc(v)}</code>`));
    $('adCamp').innerHTML = table(data.campaigns, [
      { key: 'source', label: 'admin.colSource', fmt: (v, r) => `${esc(v || '—')}<small class="ad-cm">${esc([r.medium, r.campaign].filter(Boolean).join(' · '))}</small>` },
      { key: 'visits', label: 'admin.colVisits', num: true }, { key: 'signups', label: 'admin.colSignups', num: true }]);
    $('adLang').innerHTML = table(data.languages, dimCols('admin.languages', (v) => esc(v ? langName(v) : T('admin.unknown'))));
    $('adCountry').innerHTML = table(data.countries, dimCols('admin.countries', (v) => esc(v ? countryName(v) : T('admin.unknown'))));
    $('adDev').innerHTML = table(data.devices, dimCols('admin.devices'));
    $('adBrowser').innerHTML = table(data.browsers, dimCols('admin.browsers', (v, r) => esc(v || T('admin.unknown'))));
    $('adEvents').innerHTML = table(data.events, [
      { key: 'name', label: 'admin.colName', fmt: (v, r) => `${esc(T('admin.ev_' + v))}${r.detail ? `<small class="ad-cm">${esc(r.detail)}</small>` : ''}` },
      { key: 'n', label: 'admin.colCount', num: true }]);
    const a = data.accounts, g = data.progress;
    $('adAccounts').innerHTML = stats([
      ['admin.aTotal', N(a.total)], ['admin.aVerified', N(a.verified)], ['admin.aActive', N(a.active)],
      ['admin.aFirst', a.firstSignup ? I.fmt.date(a.firstSignup + 'T12:00:00Z', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'],
    ]) + `<p class="ad-sub" style="margin-top:12px">${T('admin.aLocales')}: ${(a.locales || []).map((l) => `${esc(langName(l.key || 'en'))} ${N(l.n)}`).join(' · ') || '—'}</p>`;
    $('adProgress').innerHTML = stats([
      ['admin.pResults', N(g.with_results)], ['admin.pStage1', N(g.stage1)], ['admin.pStage2', N(g.stage2)], ['admin.pStage3', N(g.stage3)], ['admin.pRefresh', N(g.refresh_optin)],
    ]);
    utm();
    paintSeo();
  }

  /* ── CSV export (daily series + KPIs) ── */
  function csv() {
    if (!data) return;
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['day', 'visits', 'pageviews', 'signups', 'verified'].join(',')];
    data.series.forEach((d) => lines.push([d.day, d.visits, d.pageviews, d.signups, d.verified].join(',')));
    lines.push('', 'metric,current,previous');
    Object.keys(data.kpis).forEach((k) => lines.push([q(k), data.kpis[k], data.previous[k]].join(',')));
    lines.push('', 'section,key,visits,views');
    ['pages', 'referrers', 'languages', 'countries', 'devices', 'browsers', 'os'].forEach((s) => (data[s] || []).forEach((r) => lines.push([s, q(r.key), r.visits, r.views].join(','))));
    lines.push('', 'source,medium,campaign,visits,signups');
    (data.campaigns || []).forEach((r) => lines.push([q(r.source), q(r.medium), q(r.campaign), r.visits, r.signups].join(',')));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wikigai-stats-${data.range.start}_${data.range.end}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ── UTM link builder ── */
  const slug = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  function utm() {
    const base = location.origin.replace(/\/\/(preprod|staging)\./, '//');
    const q = new URLSearchParams();
    const s = slug($('utmSource').value), m = slug($('utmMedium').value), c = slug($('utmCampaign').value);
    if (s) q.set('utm_source', s); if (m) q.set('utm_medium', m); if (c) q.set('utm_campaign', c);
    $('utmOut').value = base + $('utmPage').value + (q.toString() ? '?' + q : '');
  }
  async function copyUtm() {
    const out = $('utmOut'); let ok = false;
    try { await navigator.clipboard.writeText(out.value); ok = true; } catch { out.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } }
    if (ok) { $('utmCopy').textContent = T('admin.utmCopied'); setTimeout(() => { $('utmCopy').textContent = T('admin.utmCopy'); }, 2000); }
  }

  /* ── SEO health ── */
  async function runSeo() {
    const b = $('seoRun'); b.disabled = true; b.textContent = T('admin.seoRunning');
    try { seo = await api('/api/admin/seo'); } catch (err) { seo = { failed: err.message }; }
    b.disabled = false; b.textContent = T('admin.seoRun');
    paintSeo();
  }
  function paintSeo() {
    const out = $('seoOut');
    if (!seo) { out.innerHTML = ''; return; }
    if (seo.failed) { out.innerHTML = `<p class="ad-msg err">${esc(seo.failed)}</p>`; return; }
    const bad = seo.checks.filter((c) => !c.ok);
    const list = seoAll ? seo.checks : bad;
    const col = seo.score >= 90 ? 'ok' : seo.score >= 70 ? 'mid' : 'low';
    out.innerHTML = `<div class="ad-seosum"><div class="ad-score ${col}"><b>${seo.score}</b><span>${T('admin.seoScore')}</span></div>
      <div class="ad-pills"><span class="pill err">${T('admin.seoErrors', { count: seo.errors })}</span><span class="pill warn">${T('admin.seoWarnings', { count: seo.warnings })}</span><span class="pill ok">${T('admin.seoPassed', { count: seo.passed })}</span></div>
      <label class="ad-chk"><input type="checkbox" id="seoAll" ${seoAll ? 'checked' : ''}> ${T('admin.seoAll')}</label></div>
      ${list.length ? `<table class="ad-t ad-seot"><tbody>${list.map((c) => `<tr class="${c.level}"><td><i class="dot"></i></td><td><code>${esc(c.page)}</code></td><td>${esc(c.check)}</td><td class="det">${esc(c.detail)}</td></tr>`).join('')}</tbody></table>` : ''}
      <p class="ad-sub" style="margin-top:12px">${T('admin.seoNext', { url: `<code>${esc(seo.base)}/sitemap.xml</code>` })}</p>`;
    const cb = $('seoAll'); if (cb) cb.addEventListener('change', () => { seoAll = cb.checked; paintSeo(); });
  }

  /* ── wiring ── */
  $('adPeriod').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-days]'); if (!b) return;
    days = +b.dataset.days;
    try { history.replaceState(null, '', '/admin?days=' + days); } catch { /* ignore */ }
    load();
  });
  $('adRefresh').addEventListener('click', load);
  $('adCsv').addEventListener('click', csv);
  ['utmPage', 'utmSource', 'utmMedium', 'utmCampaign'].forEach((id) => $(id).addEventListener('input', utm));
  $('utmPage').addEventListener('change', utm);
  $('utmCopy').addEventListener('click', copyUtm);
  $('seoRun').addEventListener('click', runSeo);

  I.ready.then(load);
  I.onChange(() => { I.apply(document.body); paint(); });
})();
