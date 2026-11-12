/* Wikigai — free + optional donations + share (growth). Used on survey results,
   the Wikigai hub, the dashboard and /support. Donation link comes from
   DONATION_URL via GET /api/config. */
(function () {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let cfgP = null;
  const cfg = () => (cfgP = cfgP || (window.CPS?.api ? window.CPS.api('/api/config', { auth: false }).catch(() => ({})) : Promise.resolve({})));
  const PUBLIC_SITE = 'https://wikigai.com'; // production (v20261028b)
  // Share the public site, never the address of a preview or test copy.
  // channel → UTM tags, so the admin dashboard shows which share channel brings visitors
  const shareUrl = (channel) => {
    const h = location.hostname;
    const base = /(^|\.)wikigai\.com$/.test(h) ? location.origin : PUBLIC_SITE; // always share the production site
    const ch = channel || 'link';
    return `${base}/?ref=share&utm_source=${encodeURIComponent(ch)}&utm_medium=share&utm_campaign=user_share`;
  };
  const T = (k, v) => (window.WK && WK.i18n ? WK.i18n.t(k, v) : k);

  function shareRow(c) {
    // v20261112b: one-tap "Share to TikTok" (signed-in users, when the server turns it on)
    const tt = c && c.tiktok && c.tiktok.share && window.CPS?.Store?.token
      ? `<a class="ws-btn ws-tt" data-ws-ch="tiktok" href="/share/tiktok">TikTok</a>` : '';
    const url = shareUrl('link');
    const u = (ch) => encodeURIComponent(shareUrl(ch)), t = encodeURIComponent(T('support.shareText'));
    const subject = encodeURIComponent(T('support.mailSubject'));
    const body = encodeURIComponent(T('support.mailBody', { url: shareUrl('email') }));
    return `<div class="ws-share"><span class="ws-share-l">${T('support.shareLead')}</span>
      <div class="ws-share-b">
        ${tt}
        <a class="ws-btn" data-ws-ch="whatsapp" target="_blank" rel="noopener" href="https://api.whatsapp.com/send?text=${t}${u('whatsapp')}">WhatsApp</a>
        <a class="ws-btn" data-ws-ch="linkedin" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${u('linkedin')}">LinkedIn</a>
        <a class="ws-btn" data-ws-ch="x" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${t}&url=${u('x')}">X</a>
        <a class="ws-btn" data-ws-ch="email" href="mailto:?subject=${subject}&body=${body}">${T('support.email')}</a>
        <button type="button" class="ws-btn" data-ws="copy" data-ws-ch="copy">${T('support.copy')}</button>
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
        ${url ? `<a class="ws-donate" data-ws-donate="1" href="${esc(url)}" target="_blank" rel="noopener">${T('support.donate')}</a>` : `<span class="ws-soon">${T('support.soon')}</span>`}
      </div>
      ${o.share === false ? '' : shareRow(c)}
    </div>`;
    emailCard(el);
  }

  /* v20261112b — accounts created with a sign-in app (TikTok…) have no email: after the results, ask once (skippable, max twice) */
  const provName = (p) => { const id = ((p && p.methods && p.methods.providers) || [])[0]?.id || 'tiktok'; return (window.WikiAuth?.APPS?.[id] || {}).label || ({ tiktok: 'TikTok', google: 'Google', facebook: 'Facebook', instagram: 'Instagram' })[id] || id; };
  let profP = null;
  const profile = () => (profP = profP || (window.CPS?.Store?.token ? window.CPS.api('/api/user/profile').catch(() => null) : Promise.resolve(null)));
  async function emailCard(el) {
    const p = await profile();
    if (!p || !p.emailPrompt) return;
    try { if (sessionStorage.getItem('wk_email_card_skip')) return; } catch { /* ignore */ }
    if (document.querySelector('.ws-mail')) return;
    const box = document.createElement('div');
    box.className = 'ws-mail';
    box.innerHTML = `<div class="ws-mail-h"><strong>${T('oauth.cardTitle')}</strong><span>${T('oauth.cardText')}</span></div>
      <form class="ws-mail-f" novalidate>
        <div class="ws-mail-s1"><input type="email" class="ws-in" autocomplete="email" placeholder="${esc(T('oauth.cardEmailPh'))}" aria-label="${esc(T('oauth.cardEmailPh'))}" required>
          <button class="ws-donate" type="submit">${T('oauth.cardSend')}</button></div>
        <div class="ws-mail-s2" hidden><span class="ws-mail-sent"></span><input class="ws-in ws-pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" aria-label="${esc(T('account.emailCode'))}">
          <button class="ws-donate" type="submit">${T('oauth.cardConfirm')}</button></div>
        <div class="ws-mail-msg" role="status"></div>
        <button type="button" class="ws-skip">${T('oauth.cardSkip')}</button>
      </form>`;
    el.prepend(box);
    window.WK?.track?.('email_prompt_show');
    const f = box.querySelector('form'), msg = box.querySelector('.ws-mail-msg');
    let step = 1, email = '';
    box.querySelector('.ws-skip').addEventListener('click', () => {
      try { sessionStorage.setItem('wk_email_card_skip', '1'); } catch { /* ignore */ }
      window.CPS.api('/api/user/email-prompt/dismiss', { method: 'POST' }).catch(() => {});
      window.WK?.track?.('email_prompt_skip'); box.remove();
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); msg.className = 'ws-mail-msg'; msg.textContent = '';
      const btn = f.querySelector(step === 1 ? '.ws-mail-s1 button' : '.ws-mail-s2 button'); btn.disabled = true;
      try {
        if (step === 1) {
          email = f.querySelector('input[type=email]').value.trim();
          const r = await window.CPS.api('/api/auth/email-change/start', { method: 'POST', body: { newEmail: email } });
          step = 2; f.querySelector('.ws-mail-s1').hidden = true; f.querySelector('.ws-mail-s2').hidden = false;
          f.querySelector('.ws-mail-sent').textContent = T('account.emailCodeSent', { email });
          if (r.dev_pin) f.querySelector('.ws-pin').value = r.dev_pin; // local tests only
          f.querySelector('.ws-pin').focus();
        } else {
          const r = await window.CPS.api('/api/auth/email-change/confirm', { method: 'POST', body: { newEmail: email, pin: f.querySelector('.ws-pin').value.trim() } });
          const u = window.CPS.Store.user || {}; u.email = r.email; u.verified = true; window.CPS.Store.user = u;
          window.WK?.track?.('email_added', { after: location.pathname.split('/')[1] || 'home' });
          box.innerHTML = `<div class="ws-mail-done">✅ ${T('oauth.cardDone', { email: esc(r.email) })}</div>`;
        }
      } catch (err) {
        msg.className = 'ws-mail-msg err';
        msg.innerHTML = err.code === 'EMAIL_TAKEN' && err.data && err.data.linkHint ? T('oauth.cardTaken', { provider: provName(p) }) : esc(err.message);
      } finally { btn.disabled = false; }
    });
  }

  document.addEventListener('click', async (e) => {
    const tr = e.target.closest && e.target.closest('[data-ws-ch],[data-ws-donate]');
    if (tr) {
      if (tr.dataset.wsDonate) window.WK?.track?.('donate_click');
      else window.WK?.track?.('share_click', { channel: tr.dataset.wsCh });
    }
    const b = e.target.closest && e.target.closest('[data-ws]');
    if (!b) return;
    if (b.dataset.ws === 'copy') {
      const box = b.closest('.ws-share');
      const field = box && box.querySelector('.ws-link');
      let ok = false;
      try { await navigator.clipboard.writeText(shareUrl('copy')); ok = true; } catch { ok = false; }
      if (!ok && field) {
        // clipboard blocked: show the link selected so it can be copied by hand
        field.value = shareUrl('copy'); field.hidden = false; field.focus(); field.select();
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
  .ws-tt{background:#000;border-color:rgba(254,44,85,.6);font-weight:700}
  .ws-mail{border:1px solid rgba(196,77,255,.4);background:linear-gradient(135deg,rgba(196,77,255,.12),rgba(77,201,246,.06));border-radius:14px;padding:14px 16px;margin-bottom:12px;font-size:.88rem;line-height:1.5}
  .ws-mail-h{display:flex;flex-direction:column;gap:2px;margin-bottom:10px}
  .ws-mail-s1,.ws-mail-s2{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .ws-in{flex:1;min-width:180px;font:500 .95rem var(--font,Inter,sans-serif);color:inherit;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:9px 12px}
  .ws-pin{max-width:150px;letter-spacing:.35em;text-align:center;font-family:var(--mono,monospace)}
  .ws-mail-sent{width:100%;font-size:.82rem;opacity:.85}
  .ws-mail-msg{font-size:.82rem;margin-top:6px;min-height:1em}.ws-mail-msg.err{color:#fca5a5}
  .ws-skip{font:inherit;font-size:.78rem;background:none;border:0;color:inherit;opacity:.65;text-decoration:underline;cursor:pointer;padding:4px 0;margin-top:4px}
  .ws-mail-done{font-weight:600}
  .ws-mail [hidden]{display:none!important}
  .ws-link{width:100%;margin-top:8px;font:500 .82rem var(--mono,monospace);color:inherit;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:8px 10px}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  window.WikiSupport = { render, shareUrl };
})();
