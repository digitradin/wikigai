/* Wikigai — free + optional donations + share (growth). Used on survey results,
   the Wikigai hub, the dashboard and /support. Donation link comes from
   DONATION_URL via GET /api/config. */
(function () {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let cfgP = null;
  const cfg = () => (cfgP = cfgP || (window.CPS?.api ? window.CPS.api('/api/config', { auth: false }).catch(() => ({})) : Promise.resolve({})));
  const PUBLIC_SITE = 'https://wikigai.digitradin.cloud';
  // Share the public site, never the address of a preview or test copy.
  const shareUrl = () => {
    const h = location.hostname;
    const base = /(^|\.)digitradin\.cloud$|(^|\.)wikigai\.com$/.test(h) ? location.origin : PUBLIC_SITE;
    return `${base}/?ref=share`;
  };
  const T = (k, v) => (window.WK && WK.i18n ? WK.i18n.t(k, v) : k);

  function shareRow() {
    const url = shareUrl();
    const u = encodeURIComponent(url), t = encodeURIComponent(T('support.shareText'));
    const subject = encodeURIComponent(T('support.mailSubject'));
    const body = encodeURIComponent(T('support.mailBody', { url }));
    return `<div class="ws-share"><span class="ws-share-l">${T('support.shareLead')}</span>
      <div class="ws-share-b">
        <a class="ws-btn" target="_blank" rel="noopener" href="https://api.whatsapp.com/send?text=${t}${u}">WhatsApp</a>
        <a class="ws-btn" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${u}">LinkedIn</a>
        <a class="ws-btn" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${t}&url=${u}">X</a>
        <a class="ws-btn" href="mailto:?subject=${subject}&body=${body}">${T('support.email')}</a>
        <button type="button" class="ws-btn" data-ws="copy">${T('support.copy')}</button>
      </div>
      <input class="ws-link" type="text" readonly value="${esc(url)}" aria-label="${esc(T('support.linkLabel'))}" hidden>
    </div>`;
  }

  async function render(el, opts) {
    if (!el) return;
    const o = opts || {};
    const c = await cfg();
    if (window.WK && WK.i18n) await WK.i18n.ready;
    const url = c?.pricing?.donationUrl || '';
    el.innerHTML = `<div class="ws-box ${o.compact ? 'compact' : ''}">
      <div class="ws-main">
        <div class="ws-copy"><strong>${T('support.boxTitle')}</strong>
          ${T('support.boxText')}
          <a href="/support" class="ws-more">${T('support.boxMore')}</a></div>
        ${url ? `<a class="ws-donate" href="${esc(url)}" target="_blank" rel="noopener">${T('support.donate')}</a>` : `<span class="ws-soon">${T('support.soon')}</span>`}
      </div>
      ${o.share === false ? '' : shareRow()}
    </div>`;
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest && e.target.closest('[data-ws]');
    if (!b) return;
    if (b.dataset.ws === 'copy') {
      const box = b.closest('.ws-share');
      const field = box && box.querySelector('.ws-link');
      let ok = false;
      try { await navigator.clipboard.writeText(shareUrl()); ok = true; } catch { ok = false; }
      if (!ok && field) {
        // clipboard blocked: show the link selected so it can be copied by hand
        field.hidden = false; field.focus(); field.select();
        try { ok = document.execCommand('copy'); } catch { ok = false; }
      }
      b.textContent = T(ok ? 'support.copied' : 'support.copyManual');
      setTimeout(() => { b.textContent = T('support.copy'); }, 2500);
    }
  });

  // remember who referred a new visitor (counted later when they sign up)
  try { const r = new URLSearchParams(location.search).get('ref'); if (r) localStorage.setItem('wk_ref', r); } catch {}

  const css = `.ws-box{margin-top:18px;border:1px solid rgba(255,140,66,.35);background:rgba(255,140,66,.07);border-radius:14px;padding:14px 16px;text-align:left;color:inherit}
  .ws-main{display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap}
  .ws-copy{flex:1;min-width:220px;font-size:.88rem;line-height:1.5}
  .ws-more{color:#ffb36b;margin-left:4px;font-size:.82rem}
  .ws-donate{display:inline-flex;align-items:center;padding:9px 18px;border-radius:22px;background:linear-gradient(135deg,#ff8c42,#ff6b9d);color:#fff;font-weight:700;text-decoration:none;font-size:.88rem;white-space:nowrap}
  .ws-soon{font-size:.78rem;opacity:.7;white-space:nowrap}
  .ws-share{margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08);display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:.82rem}
  .ws-share-l{opacity:.8}
  .ws-share-b{display:flex;gap:6px;flex-wrap:wrap}
  .ws-btn{font:inherit;font-size:.78rem;padding:6px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.04);color:inherit;text-decoration:none;cursor:pointer}
  .ws-btn:hover{border-color:rgba(196,77,255,.6)}
  .ws-link{width:100%;margin-top:8px;font:500 .82rem var(--mono,monospace);color:inherit;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:8px 10px}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  window.WikiSupport = { render, shareUrl };
})();
