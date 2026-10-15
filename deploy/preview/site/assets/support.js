/* Wikigai — free + optional donations + share (growth). Used on survey results,
   the Wikigai hub, the dashboard and /support. Donation link comes from
   DONATION_URL via GET /api/config. */
(function () {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let cfgP = null;
  const cfg = () => (cfgP = cfgP || (window.CPS?.api ? window.CPS.api('/api/config', { auth: false }).catch(() => ({})) : Promise.resolve({})));
  const shareUrl = () => `${location.origin}/?ref=share`;
  const shareText = 'I just mapped my Wikigai — what I love, what I’m good at, and the careers that fit. It’s free: ';

  function shareRow() {
    const u = encodeURIComponent(shareUrl()), t = encodeURIComponent(shareText);
    return `<div class="ws-share"><span class="ws-share-l">Know someone choosing their path? Share Wikigai:</span>
      <div class="ws-share-b">
        ${navigator.share ? '<button class="ws-btn" data-ws="native">📤 Share</button>' : ''}
        <a class="ws-btn" target="_blank" rel="noopener" href="https://wa.me/?text=${t}${u}">WhatsApp</a>
        <a class="ws-btn" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${u}">LinkedIn</a>
        <a class="ws-btn" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${t}&url=${u}">X</a>
        <button class="ws-btn" data-ws="copy">🔗 Copy link</button>
      </div></div>`;
  }

  async function render(el, opts) {
    if (!el) return;
    const o = opts || {};
    const c = await cfg();
    const url = c?.pricing?.donationUrl || '';
    el.innerHTML = `<div class="ws-box ${o.compact ? 'compact' : ''}">
      <div class="ws-main">
        <div class="ws-copy"><strong>💛 Wikigai is free — for everyone.</strong>
          Donations are optional. They go into improving our matching models and adding deeper career insights.
          <a href="/support" class="ws-more">How donations are used</a></div>
        ${url ? `<a class="ws-donate" href="${esc(url)}" target="_blank" rel="noopener">Donate</a>` : '<span class="ws-soon">Donations opening soon</span>'}
      </div>
      ${o.share === false ? '' : shareRow()}
    </div>`;
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest && e.target.closest('[data-ws]');
    if (!b) return;
    if (b.dataset.ws === 'native') { try { await navigator.share({ title: 'Wikigai', text: shareText, url: shareUrl() }); } catch {} }
    if (b.dataset.ws === 'copy') {
      try { await navigator.clipboard.writeText(shareUrl()); b.textContent = '✓ Link copied'; } catch { b.textContent = shareUrl(); }
      setTimeout(() => { b.textContent = '🔗 Copy link'; }, 2200);
    }
  });

  // remember who referred a new visitor (counted later when they sign up)
  try { const r = new URLSearchParams(window.__WK_Q__ || location.search).get('ref'); if (r) localStorage.setItem('wk_ref', r); } catch {}

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
  .ws-btn:hover{border-color:rgba(196,77,255,.6)}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  window.WikiSupport = { render, shareUrl };
})();
