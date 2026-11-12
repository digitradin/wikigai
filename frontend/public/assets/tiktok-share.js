/* Wikigai — "Share to TikTok" screen (/share/tiktok) — v20261112b; v20261112c: ikigai-circles art + emojis per domain / top profession.
   1. not connected → "Connect TikTok" (Login Kit, posting scopes asked only here)
   2. builds the result carousel in the browser (canvas, 1080×1920 JPEG, NO logo / brand name / URL on the images — TikTok rule),
      with emojis for the user's top domains and top profession, and a caption that uses the same emojis
   3. post screen per TikTok's Content Sharing Guidelines: creator nickname + avatar from creator_info (fetched every time),
      preview, editable title + caption, "Who can view" from privacy_level_options with NO default, comments + music unticked,
      commercial-content disclosure, Music Usage Confirmation (+ Branded Content Policy) right above Post,
      nothing sent to TikTok before the user presses Post
   4. Post (DIRECT_POST) or "Open in TikTok to add a sound" (MEDIA_UPLOAD → TikTok inbox) → status polling */
(function () {
  'use strict';
  const I = window.WK.i18n, T = (k, v) => I.t(k, v), C = (s) => I.tc(s);
  const { api, Store } = window.CPS;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = $('ttApp');
  const W = 1080, H = 1920;
  const MUSIC_URL = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en';
  const BC_URL = 'https://www.tiktok.com/legal/page/global/bc-policy/en';
  let slides = [], creator = null;

  if (!Store.token) { location.href = '/login?next=/share/tiktok'; return; }

  /* ── emojis: one per domain (STAGE_DATA icons) and one per profession (keyword map, falls back to its domain icon) ── */
  const JOB_EMOJI = [
    [/transport|rail/i, '🚆'], [/curriculum|learning (&|and) dev/i, '📚'], [/fundrais/i, '💛'], [/venture/i, '🚀'], [/speech/i, '🗣️'],
    [/geopolit|climate/i, '🌍'], [/water/i, '💧'], [/wildlife/i, '🦊'], [/game/i, '🎮'],
    [/bioinformatic/i, '🧬'], [/penetration|pentest/i, '🛡️'], [/materials|research scientist/i, '🔬'], [/supply chain|logistic/i, '📦'],
    [/epidemiolog|public health|virolog/i, '🦠'], [/probation|prison|correction/i, '🔐'], [/behaviou?r/i, '🧠'], [/edtech/i, '📚'],
    [/negotiat|mediat/i, '🤝'], [/\bun\b|united nations/i, '🌍'], [/think tank|special adviser|adviser|advisor/i, '💡'],
    [/compliance|risk/i, '📋'], [/ranger|park/i, '🌲'], [/esg|carbon/i, '🌱'], [/soil|agronom/i, '🌾'], [/food/i, '🍎'],
    [/aquacult|fisher/i, '🐟'], [/campaign/i, '📣'], [/support worker|family support|carer|care worker/i, '💛'],
    [/machine learning|\bai\b|artificial intelligence|robot/i, '🤖'], [/cyber|security analyst|ethical hack/i, '🛡️'],
    [/data|statistic|quant(?!ity)|actuar/i, '📊'], [/software|developer|programmer|web|devops|cloud|full.?stack|app /i, '💻'],
    [/game/i, '🎮'], [/\bux\b|ui |product designer|interaction/i, '📱'], [/animat/i, '🎞️'], [/film|cinema|video|director of photography/i, '🎬'],
    [/photo/i, '📸'], [/music|composer|sound|\bdj\b|singer/i, '🎵'], [/actor|actress|theat|perform/i, '🎭'],
    [/author|writer|journalist|editor|copywriter|poet/i, '✍️'], [/fashion|stylist|textile/i, '👗'], [/illustrat|artist|painter|art /i, '🖌️'],
    [/graphic|designer|design/i, '🎨'], [/chef|cook|culinar|baker/i, '🍳'],
    [/astronaut|aerospace|space|astronom/i, '🚀'], [/pilot|aviation/i, '✈️'], [/physic(?!al)|physicist/i, '⚛️'], [/chemi/i, '🧪'],
    [/marine|ocean/i, '🐠'], [/biolog|genetic|biotech|microbio/i, '🧬'], [/veterin|\bvet\b/i, '🐾'],
    [/surgeon/i, '🏥'], [/dentist|dental|orthodont/i, '🦷'], [/pharmac/i, '💊'], [/nurse|midwi/i, '💉'], [/paramedic|emergency/i, '🚑'],
    [/physio|\bsport|fitness|coach|trainer/i, '💪'], [/diet|nutrition/i, '🥗'], [/psycholog|psychiatr|therap|counsell?or|mental health/i, '🧠'],
    [/doctor|\bgp\b|physician|medic|clinic|radiograph|optometr/i, '🩺'],
    [/teacher|tutor|lecturer|professor|educat|school|sen /i, '📚'], [/social work|ngo|charity|youth|community/i, '💛'],
    [/solicitor|barrister|lawyer|attorney|legal|judge|paralegal/i, '⚖️'], [/police|detective|crimin|forensic/i, '🕵️'],
    [/diplomat|international|foreign/i, '🌍'], [/policy|politic|civil servant|public affairs|government/i, '🏛️'],
    [/architect/i, '🏛️'], [/urban|planner|city/i, '🏙️'], [/surveyor/i, '📐'], [/electric/i, '⚡'], [/mechanic/i, '⚙️'],
    [/civil eng|structural|construction|site manager|builder/i, '🏗️'],
    [/solar|energy|renewable|wind/i, '☀️'], [/climate|sustainab|environment|ecolog|conservation/i, '🌱'], [/agricult|farm|forest|horticult/i, '🌾'],
    [/invest|bank|trader|trading|wealth|fund/i, '📈'], [/financ|account|audit|tax/i, '💰'], [/founder|entrepreneur|startup/i, '🚀'],
    [/market|brand|social media|advertis|pr /i, '📣'], [/sales|business develop/i, '🤝'], [/consult|strateg/i, '🧩'],
    [/\bhr\b|recruit|talent|people/i, '🧑‍💼'], [/manager|lead|chief|ceo|director|executive/i, '👔'], [/engineer/i, '🔧'],
  ];
  const TAGS = { SCIENCE_TECH: '#tech', CREATIVE: '#creative', BUSINESS: '#business', HEALTH: '#healthcare', SOCIAL: '#education',
    LAW_GOV: '#law', BUILT_ENV: '#engineering', NATURE: '#sustainability' };
  const SPARKS = ['✨', '🌀', '💫', '⭐'];
  const areaOf = (k) => ((window.STAGE_DATA && window.STAGE_DATA.areas) || {})[k] || {};
  function jobEmoji(name, area) {
    const n = ' ' + String(name || '') + ' ';
    for (const [re, e] of JOB_EMOJI) if (re.test(n)) return e;
    return areaOf(area).icon || '✨';
  }

  /* ── data from the user's results ── */
  function pickResults(r) {
    const s1 = r.stage_1 || {}, s3 = r.stage_3 || {}, s2 = r.stage_2 || {};
    const loves = (s1.ranked || []).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 3)
      .map((x) => ({ area: x.area, name: C(areaOf(x.area).name || x.area), icon: areaOf(x.area).icon || '✨' }));
    const src = (s3.ranked && s3.ranked.length ? s3.ranked : s2.ranked) || [];
    const careers = src.slice(0, 3).map((x) => ({ area: x.area, name: C(x.name), pct: Math.round(x.pct ?? x.score ?? 0), emoji: jobEmoji(x.name, x.area) }));
    const hero = (careers[0] && careers[0].emoji) || (loves[0] && loves[0].icon) || '🌀';
    // the emojis floating around the circles (never on them): top profession, top domains, then the next professions
    const deco = [...new Set([hero, ...loves.map((l) => l.icon), ...careers.slice(1).map((c) => c.emoji), ...SPARKS])].slice(0, 4);
    return { loves, careers, deco, hero };
  }

  /* ── carousel (canvas). Art = the four ikigai circles image (/assets/brand/ikigai-circles.jpg), blended with "screen"
     so its black background disappears into the slide colour. Decoration only: NO logo, brand name or URL (TikTok rule). ── */
  const ART_SRC = '/assets/brand/ikigai-circles.jpg';
  let art = null;
  const loadArt = () => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = ART_SRC; });
  const AS = 800, AX = (1080 - AS) / 2, AY = 90, ACX = AX + AS / 2, ACY = AY + AS / 2; // art box on the slide (centre = where the 4 circles meet)
  const EMOJI_FONT = (px) => `${px}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  function drawArt(ctx) {
    if (art) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.drawImage(art, AX, AY, AS, AS); ctx.restore(); return; }
    // image not loaded: draw the circles
    const R = 230, d = 150;
    [['#ff4fa3', ACX - d * 0.7, ACY - d * 0.7], ['#a855f7', ACX + d * 0.7, ACY - d * 0.7], ['#3b82f6', ACX - d * 0.7, ACY + d * 0.7], ['#22d3ee', ACX + d * 0.7, ACY + d * 0.7]]
      .forEach(([c, x, y]) => { ctx.globalAlpha = 0.35; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
  }
  function bg(ctx, hue) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#05050f'); g.addColorStop(1, hue || '#1d1145');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    drawArt(ctx);
  }
  /* The circles are the logo: emojis must NEVER cover them. A mask of the painted circles (glow included) is read from the art
     itself, and an emoji is only drawn at a spot whose whole box, plus a safety margin, is clear of it. No clear spot → no emoji. */
  const MS = 4; // mask resolution: 1 cell = 4×4 px
  let spotsCache = null;
  function clearSpots() {
    if (spotsCache) return spotsCache;
    const c = document.createElement('canvas'); c.width = W / MS; c.height = H / MS;
    const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    x.scale(1 / MS, 1 / MS); drawArt(x);
    const px = x.getImageData(0, 0, c.width, c.height).data, on = (i, j) => { const k = (j * c.width + i) * 4; return Math.max(px[k], px[k + 1], px[k + 2]) > 22; };
    const free = (cx, cy, half) => { // square box around the emoji
      for (let j = Math.floor((cy - half) / MS); j <= Math.ceil((cy + half) / MS); j++)
        for (let i = Math.floor((cx - half) / MS); i <= Math.ceil((cx + half) / MS); i++) {
          if (i < 0 || j < 0 || i >= c.width || j >= c.height) return false;
          if (on(i, j)) return false;
        }
      return true;
    };
    const HALF = EMOJI_PX / 2 + 8 + 14; // half the emoji box (+ shadow) + safety margin
    // the circles fill their whole square, so the emojis go in a row in the free band under them (above the text)
    const n = 4, gap = 170, x0 = W / 2 - ((n - 1) * gap) / 2, rots = [-0.14, 0.1, -0.08, 0.14];
    let out = [];
    for (let y = AY + AS + 30; y <= 1000; y += 6) {
      const row = Array.from({ length: n }, (_, i) => [x0 + i * gap, y, rots[i]]);
      if (row.every(([cx, cy]) => free(cx, cy, HALF))) { out = row; break; }
    }
    spotsCache = out;
    return out;
  }
  const EMOJI_PX = 84;
  function emoji(ctx, e, x, y, px, rot) {
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ctx.font = EMOJI_FONT(px); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24; ctx.fillText(e, 0, 0); ctx.restore();
  }
  // emojis sit in a row under the circles — never on top of them
  function decorate(ctx, deco) {
    const spots = clearSpots();
    deco.forEach((e, i) => spots[i] && emoji(ctx, e, spots[i][0], spots[i][1], EMOJI_PX, spots[i][2]));
  }
  function wrap(ctx, text, x, y, maxW, lh, maxLines) {
    const words = String(text).split(/\s+/); let line = '', lines = [];
    words.forEach((w) => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line);
    if (maxLines && lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…'); }
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
    return y + lines.length * lh;
  }
  const font = (w, px) => `${w} ${px}px Inter, "Segoe UI", system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  function slide(draw, hue, deco) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); bg(ctx, hue); decorate(ctx, deco || []);
    ctx.fillStyle = '#f1f5f9'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    draw(ctx); return c;
  }
  function kicker(ctx, t, y) { ctx.font = font(700, 40); ctx.fillStyle = '#e9d5ff'; ctx.fillText(t.toUpperCase(), 100, y); ctx.fillStyle = '#f1f5f9'; }
  async function buildSlides(d) {
    try { await Promise.all([document.fonts.load(font(800, 96)), document.fonts.load(font(600, 56)), document.fonts.load(font(700, 40))]); } catch { /* system font */ }
    if (!art) { art = await loadArt(); spotsCache = null; }
    const out = [];
    out.push(slide((ctx) => {
      kicker(ctx, T('tiktok.s1Kicker') + ' ' + d.hero, 1090);
      ctx.font = font(800, 88); const y = wrap(ctx, T('tiktok.s1Title'), 100, 1200, 880, 104, 5);
      ctx.font = font(500, 46); ctx.fillStyle = '#cbd5e1'; wrap(ctx, T('tiktok.s1Sub'), 100, y + 30, 880, 64, 3);
    }, '#1d1145', d.deco));
    if (d.loves.length) out.push(slide((ctx) => {
      kicker(ctx, T('tiktok.s2Kicker'), 1090); ctx.font = font(800, 84); const t2 = wrap(ctx, T('tiktok.s2Title') + ' 💖', 100, 1200, 880, 96, 2);
      d.loves.forEach((l, i) => { const y = t2 + 90 + i * 150; emoji(ctx, l.icon, 140, y - 22, 76, 0); ctx.font = font(700, 54); ctx.fillStyle = '#f1f5f9'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; wrap(ctx, l.name, 210, y, 770, 60, 2); });
    }, '#2a0f3d', d.loves.map((l) => l.icon).concat(d.careers.map((c) => c.emoji), SPARKS).filter((e, i, a) => a.indexOf(e) === i).slice(0, 4)));
    if (d.careers.length) out.push(slide((ctx) => {
      kicker(ctx, T('tiktok.s3Kicker'), 1090); ctx.font = font(800, 84); const t3 = wrap(ctx, T('tiktok.s3Title') + ' 🎯', 100, 1200, 880, 96, 2);
      d.careers.forEach((c, i) => {
        const y = t3 + 90 + i * 150; emoji(ctx, c.emoji, 140, y - 22, 76, 0);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#f1f5f9'; ctx.font = font(700, 54); wrap(ctx, c.name, 210, y, 600, 60, 2);
        if (c.pct) { ctx.font = font(700, 48); ctx.fillStyle = '#86efac'; ctx.textAlign = 'right'; ctx.fillText(c.pct + '%', 980, y); ctx.textAlign = 'left'; ctx.fillStyle = '#f1f5f9'; }
      });
    }, '#0f1f3d', d.careers.map((c) => c.emoji).concat(d.loves.map((l) => l.icon), SPARKS).filter((e, i, a) => a.indexOf(e) === i).slice(0, 4)));
    out.push(slide((ctx) => {
      ctx.font = font(800, 104); const y = wrap(ctx, T('tiktok.s4Title'), 100, 1210, 880, 120, 4);
      ctx.font = font(500, 56); ctx.fillStyle = '#cbd5e1'; wrap(ctx, T('tiktok.s4Sub'), 100, y + 30, 880, 72, 3);
    }, '#3d0f2a', ['👀', '🤔', '💭', '👇']));
    return out;
  }
  /* caption + title with the user's own emojis (editable before posting) */
  function captionFor(d) {
    const top = d.careers[0];
    const loves = d.loves.map((l) => `${l.icon} ${l.name}`).join(' · ');
    const tags = [...new Set([...(top ? [TAGS[top.area]] : []), ...d.loves.map((l) => TAGS[l.area])].filter(Boolean))].slice(0, 2).join(' ');
    const text = top
      ? T('tiktok.captionDyn', { emoji: top.emoji, career: top.name, loves: loves || '🌀', tags })
      : T('tiktok.captionDynNoCareer', { loves, tags });
    const title = top ? T('tiktok.captionTitleDyn', { emoji: top.emoji, career: top.name }) : T('tiktok.captionTitle');
    return { text: text.replace(/\s+$/g, ''), title: title.slice(0, 90) };
  }

  /* ── screens ── */
  function connectScreen() {
    app.innerHTML = `<h2>${esc(T('tiktok.connectTitle'))}</h2><p class="dl-help">${esc(T('tiktok.connectText'))}</p>
      <div class="dl-actions"><button class="oa-btn oa-tiktok ts-connect" id="tsConnect" type="button">${esc(T('tiktok.connectBtn'))}</button></div>`;
    $('tsConnect').addEventListener('click', (e) => window.WikiAuth.start('tiktok', 'share', '/share/tiktok', e.currentTarget));
  }
  function noResults() {
    app.innerHTML = `<p class="dl-help">${esc(T('tiktok.noResults'))}</p><a class="dl-btn primary" style="display:inline-block;text-decoration:none" href="/survey">${esc(T('tiktok.noResultsBtn'))}</a>`;
  }
  const privacyLabel = (p) => (I.has('tiktok.privacy_' + p) ? T('tiktok.privacy_' + p) : p);

  function postScreen(d) {
    const cap = captionFor(d);
    app.innerHTML = `
      <div class="ts-who">${creator.avatar ? `<img src="${esc(creator.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<div><small>${esc(T('tiktok.postingTo'))}</small><strong>${esc(creator.nickname || creator.username || 'TikTok')}</strong></div></div>
      ${creator.canPost ? '' : `<p class="oa-msg err">${esc(T('tiktok.cantPost'))}</p>`}
      <h3 class="ts-h">${esc(T('tiktok.preview'))}</h3>
      <div class="ts-preview" id="tsPreview"></div>
      <form id="tsForm" class="dl-form" novalidate>
        <label for="tsTitle">${esc(T('tiktok.titleLabel'))}</label>
        <input class="dl-input" id="tsTitle" maxlength="90" value="${esc(cap.title)}">
        <label for="tsDesc" style="margin-top:12px">${esc(T('tiktok.captionLabel'))}</label>
        <textarea class="dl-input" id="tsDesc" rows="4" maxlength="4000">${esc(cap.text)}</textarea>
        <label for="tsPrivacy" style="margin-top:12px">${esc(T('tiktok.privacyLabel'))}</label>
        <select class="dl-input" id="tsPrivacy" required><option value="" selected disabled>${esc(T('tiktok.privacyChoose'))}</option>
          ${creator.privacyOptions.map((p) => `<option value="${esc(p)}">${esc(privacyLabel(p))}</option>`).join('')}</select>
        <label class="dl-ack"><input type="checkbox" id="tsComments" ${creator.commentDisabled ? 'disabled' : ''}> <span>${esc(T('tiktok.allowComments'))}${creator.commentDisabled ? ` — <em>${esc(T('tiktok.commentsOff'))}</em>` : ''}</span></label>
        <label class="dl-ack"><input type="checkbox" id="tsMusic"> <span>${esc(T('tiktok.addMusic'))}</span></label>
        <div class="ts-commercial">
          <label class="dl-ack"><input type="checkbox" id="tsCommercial"> <span><strong>${esc(T('tiktok.commercial'))}</strong><br><small>${esc(T('tiktok.commercialHelp'))}</small></span></label>
          <div id="tsCommBox" hidden>
            <label class="dl-ack"><input type="checkbox" id="tsYourBrand"> <span>${esc(T('tiktok.yourBrand'))}<br><small>${esc(T('tiktok.yourBrandHelp'))}</small></span></label>
            <label class="dl-ack"><input type="checkbox" id="tsBranded"> <span>${esc(T('tiktok.branded'))}<br><small>${esc(T('tiktok.brandedHelp'))}</small></span></label>
            <p class="ts-label" id="tsLabelNote" hidden></p>
          </div>
        </div>
        <p class="ts-decl" id="tsDecl"></p>
        <div class="dl-msg" id="tsMsg" role="alert"></div>
        <div class="dl-actions">
          <button class="dl-btn primary" type="submit" id="tsPost" disabled>${esc(T('tiktok.post'))}</button>
          <button class="dl-link" type="button" id="tsUpload">${esc(T('tiktok.upload'))}</button>
        </div>
        <p class="dl-note">${esc(T('tiktok.uploadHelp'))}</p>
      </form>`;
    const pv = $('tsPreview');
    slides.forEach((c, i) => { const img = new Image(); img.src = c.toDataURL('image/jpeg', 0.7); img.alt = T('tiktok.slideAlt', { n: i + 1 }); pv.appendChild(img); });
    const commercial = $('tsCommercial'), yb = $('tsYourBrand'), br = $('tsBranded'), priv = $('tsPrivacy');
    function refresh() {
      $('tsCommBox').hidden = !commercial.checked;
      const brandedOn = commercial.checked && br.checked, yourOn = commercial.checked && yb.checked;
      // branded content can't be private: "Only me" disabled while it is ticked
      const selfOpt = priv.querySelector('option[value="SELF_ONLY"]');
      if (selfOpt) { selfOpt.disabled = brandedOn; selfOpt.title = brandedOn ? T('tiktok.brandedPrivate') : ''; if (brandedOn && priv.value === 'SELF_ONLY') priv.value = ''; }
      const note = $('tsLabelNote');
      note.hidden = !(brandedOn || yourOn); note.textContent = brandedOn ? T('tiktok.labelPaid') : yourOn ? T('tiktok.labelPromo') : '';
      $('tsDecl').innerHTML = brandedOn ? T('tiktok.declBranded', { bc: BC_URL, music: MUSIC_URL }) : T('tiktok.declMusic', { music: MUSIC_URL });
      const commOk = !commercial.checked || yb.checked || br.checked;
      const postBtn = $('tsPost');
      postBtn.disabled = !creator.canPost || !priv.value || !commOk;
      postBtn.title = !commOk ? T('tiktok.needOneCommercial') : !priv.value ? T('tiktok.privacyChoose') : '';
      $('tsUpload').disabled = !creator.canPost;
    }
    [commercial, yb, br, priv].forEach((x) => x.addEventListener('change', refresh));
    refresh();
    $('tsForm').addEventListener('submit', (e) => { e.preventDefault(); send('DIRECT_POST'); });
    $('tsUpload').addEventListener('click', () => send('MEDIA_UPLOAD'));
  }

  async function send(mode) {
    const msg = $('tsMsg'); msg.className = 'dl-msg'; msg.textContent = '';
    const btns = [$('tsPost'), $('tsUpload')]; btns.forEach((b) => { b.disabled = true; });
    $('tsPost').textContent = T('tiktok.posting');
    window.WK?.track?.('tiktok_post_init', { mode });
    try {
      const images = slides.map((c) => c.toDataURL('image/jpeg', 0.86));
      const m = await api('/api/tiktok/media', { method: 'POST', body: { images } });
      const body = { mediaToken: m.token, mode, title: $('tsTitle').value, description: $('tsDesc').value };
      if (mode === 'DIRECT_POST') Object.assign(body, {
        privacyLevel: $('tsPrivacy').value, disableComment: !$('tsComments').checked, autoAddMusic: $('tsMusic').checked,
        brandOrganic: $('tsCommercial').checked && $('tsYourBrand').checked, brandContent: $('tsCommercial').checked && $('tsBranded').checked,
      });
      const r = await api('/api/tiktok/post', { method: 'POST', body });
      processing(r.publishId, mode, body.privacyLevel);
    } catch (err) {
      if (err.code === 'TIKTOK_REAUTH') return connectScreen();
      msg.className = 'dl-msg err'; msg.textContent = errText(err);
      window.WK?.track?.('tiktok_post_fail', { code: String(err.code || err.status || 'error').slice(0, 40) });
      $('tsPost').textContent = T('tiktok.post'); btns.forEach((b) => { b.disabled = false; });
    }
  }
  function errText(err) {
    const c = String(err.code || '');
    if (/SPAM_RISK_TOO_MANY_PENDING_SHARE/.test(c)) return T('tiktok.errPending');
    if (/SPAM_RISK|RATE_LIMIT|REACHED_ACTIVE_USER_CAP/.test(c) || err.status === 429) return T('tiktok.errLimit');
    if (/APP_VERSION_CHECK_FAILED/.test(c)) return T('tiktok.errAppVersion');
    if (/UNAUDITED_CLIENT_CAN_ONLY_POST_TO_PRIVATE_ACCOUNTS/.test(c)) return T('tiktok.errPrivateOnly');
    if (/URL_OWNERSHIP_UNVERIFIED/.test(c)) return T('tiktok.errGeneric');
    return err.message || T('tiktok.errGeneric');
  }
  function processing(publishId, mode, privacy) {
    app.innerHTML = `<div class="dl-done"><div class="ico" aria-hidden="true">⏳</div><h2>${esc(T('tiktok.processing'))}</h2><p class="dl-help" id="tsStatus"></p></div>`;
    let tries = 0;
    const tick = async () => {
      tries++;
      let s = null;
      try { s = await api('/api/tiktok/post-status', { method: 'POST', body: { publishId } }); } catch { /* keep polling */ }
      const st = s && s.status;
      if (st === 'PUBLISH_COMPLETE' || (mode === 'MEDIA_UPLOAD' && st === 'SEND_TO_USER_INBOX')) return finished(true, mode, privacy);
      if (st === 'FAILED') { window.WK?.track?.('tiktok_post_fail', { code: String(s.failReason || 'failed').slice(0, 40) }); return finished(false); }
      if (tries >= 24) return finished(null, mode, privacy); // 2 minutes: TikTok keeps working in the background
      setTimeout(tick, 5000);
    };
    setTimeout(tick, 3000);
  }
  function finished(ok, mode, privacy) {
    if (ok !== false) window.WK?.track?.('tiktok_post_complete', { mode, privacy: privacy || '' });
    const title = ok === false ? T('tiktok.failed') : mode === 'MEDIA_UPLOAD' ? T('tiktok.doneInbox') : T('tiktok.done');
    app.innerHTML = `<div class="dl-done"><div class="ico" aria-hidden="true">${ok === false ? '⚠️' : '✅'}</div><h2>${esc(title)}</h2>
      ${ok === null ? `<p class="dl-help">${esc(T('tiktok.stillProcessing'))}</p>` : ''}
      <div class="dl-actions" style="justify-content:center">${ok === false ? `<a class="dl-btn primary" style="text-decoration:none" href="/share/tiktok">${esc(T('tiktok.tryAgain'))}</a>` : `<a class="dl-btn primary" style="text-decoration:none" href="https://www.tiktok.com/" target="_blank" rel="noopener">${esc(T('tiktok.openTikTok'))}</a>`}
      <a class="dl-link" href="/dashboard">${esc(T('tiktok.back'))}</a></div></div>`;
  }

  async function boot() {
    await I.ready;
    let st;
    try { st = await api('/api/tiktok/status'); } catch { app.innerHTML = `<p class="oa-msg err">${esc(T('tiktok.errGeneric'))}</p>`; return; }
    if (!st.enabled) { app.innerHTML = `<p class="dl-help">${esc(T('tiktok.notAvailable'))}</p>`; return; }
    let res;
    try { res = await api('/api/user/results'); } catch { res = {}; }
    const d = pickResults((res && res.results) || {});
    if (!d.loves.length && !d.careers.length) return noResults();
    if (!st.connected) return connectScreen();
    try { creator = (await api('/api/tiktok/creator-info', { method: 'POST' })).creator; }
    catch (err) { if (err.code === 'TIKTOK_REAUTH') return connectScreen(); app.innerHTML = `<p class="oa-msg err">${esc(errText(err))}</p>`; return; }
    slides = await buildSlides(d);
    postScreen(d);
    window.WK?.track?.('share_click', { channel: 'tiktok' });
  }
  boot();
})();
