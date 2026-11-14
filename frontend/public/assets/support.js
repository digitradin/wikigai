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

  /* v20261112c — the three social apps get their official-style buttons (brand colour + logo), like the sign-in buttons:
     TikTok "Post to TikTok" (posts the results carousel through TikTok's own post screen; signed-in users, when the server turns it on),
     Instagram (phones only: the same 4 slides go to the phone's share sheet → Instagram; caption copied to paste),
     Facebook (Facebook's share dialog with the link — works without any app or key). */
  const ICON = {
    tiktok: '<svg viewBox="0 0 48 48" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M34.1 6c.6 4.6 3.2 7.6 7.9 7.9v5.3c-2.7.3-5.1-.6-7.9-2.3v10.4c0 13.2-14.4 17.3-20.2 7.9-3.7-6.1-1.4-16.8 10.6-17.2v5.6c-.9.1-1.9.4-2.7.7-2.5.8-3.9 2.4-3.5 5.2.8 5.4 10.7 7 9.9-3.6V6.1h5.9z"/></svg>',
    instagram: '<svg viewBox="0 0 48 48" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M24 4.3c6.4 0 7.2 0 9.7.1 6.5.3 9.6 3.4 9.9 9.9.1 2.5.1 3.3.1 9.7s0 7.2-.1 9.7c-.3 6.5-3.4 9.6-9.9 9.9-2.5.1-3.3.1-9.7.1s-7.2 0-9.7-.1c-6.6-.3-9.6-3.4-9.9-9.9-.1-2.5-.1-3.3-.1-9.7s0-7.2.1-9.7c.3-6.6 3.4-9.6 9.9-9.9 2.5-.1 3.3-.1 9.7-.1zM24 0c-6.5 0-7.3 0-9.9.1C5.4.5.5 5.3.1 14.1 0 16.7 0 17.5 0 24s0 7.3.1 9.9c.4 8.7 5.2 13.6 14 14 2.6.1 3.4.1 9.9.1s7.3 0 9.9-.1c8.7-.4 13.6-5.2 14-14 .1-2.6.1-3.4.1-9.9s0-7.3-.1-9.9C47.5 5.4 42.7.5 33.9.1 31.3 0 30.5 0 24 0zm0 11.7a12.3 12.3 0 100 24.6 12.3 12.3 0 000-24.6zM24 32a8 8 0 110-16 8 8 0 010 16zm12.8-23.7a2.9 2.9 0 100 5.8 2.9 2.9 0 000-5.8z"/></svg>',
    facebook: '<svg viewBox="0 0 48 48" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M48 24C48 10.7 37.3 0 24 0S0 10.7 0 24c0 12 8.8 21.9 20.2 23.7V30.9h-6.1V24h6.1v-5.3c0-6 3.6-9.3 9.1-9.3 2.6 0 5.4.5 5.4.5v5.9h-3c-3 0-3.9 1.8-3.9 3.7V24h6.6l-1.1 6.9h-5.5v16.8C39.2 45.9 48 36 48 24z"/></svg>',
  };
  // phone/tablet that can hand image files to another app? → the Instagram button (a Mac/PC has no Instagram app to share to)
  const canShareFiles = (() => { try { return !!(matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [new File([new Blob(['x'], { type: 'image/jpeg' })], 'x.jpg', { type: 'image/jpeg' })] })); } catch { return false; } })();

  function shareRow(c) {
    const signedIn = !!window.CPS?.Store?.token;
    const tt = c && c.tiktok && c.tiktok.share && signedIn
      ? `<a class="ws-btn ws-brand ws-tt" data-ws-ch="tiktok" href="/share/tiktok">${ICON.tiktok}<span>${T('support.postTikTok')}</span></a>` : '';
    const ig = signedIn && canShareFiles
      ? `<button type="button" class="ws-btn ws-brand ws-ig" data-ws="instagram" data-ws-ch="instagram">${ICON.instagram}<span>${T('support.postInstagram')}</span></button>` : '';
    const fb = `<a class="ws-btn ws-brand ws-fb" data-ws-ch="facebook" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl('facebook'))}">${ICON.facebook}<span>${T('support.shareFacebook')}</span></a>`;
    const url = shareUrl('link');
    const u = (ch) => encodeURIComponent(shareUrl(ch)), t = encodeURIComponent(T('support.shareText'));
    const subject = encodeURIComponent(T('support.mailSubject'));
    const body = encodeURIComponent(T('support.mailBody', { url: shareUrl('email') }));
    return `<div class="ws-share"><span class="ws-share-l">${T('support.shareLead')}</span>
      <div class="ws-share-b">
        ${tt}${ig}${fb}
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
        <div class="ws-mail-s3" hidden><span class="ws-mail-sent ws-mail-good"></span>
          <input type="password" class="ws-in ws-pw" autocomplete="current-password" aria-label="${esc(T('oauth.cardPassPh'))}" placeholder="${esc(T('oauth.cardPassPh'))}">
          <button class="ws-donate" type="submit">${T('oauth.cardSave')}</button>
          <span class="ws-mail-alt"><a href="/forgot" class="ws-forgot">${T('oauth.cardForgot')}</a> · <button type="button" class="ws-skip ws-other">${T('oauth.cardOther')}</button></span></div>
        <div class="ws-mail-msg" role="status"></div>
        <button type="button" class="ws-skip">${T('oauth.cardSkip')}</button>
      </form>`;
    el.prepend(box);
    window.WK?.track?.('email_prompt_show');
    const f = box.querySelector('form'), msg = box.querySelector('.ws-mail-msg');
    let step = 1, email = '';
    const toStep2 = (r) => {
      step = 2; f.querySelector('.ws-mail-s1').hidden = true; f.querySelector('.ws-mail-s2').hidden = false;
      f.querySelector('.ws-mail-sent').innerHTML = r && r.dummy
        ? `${esc(T('oauth.cardDummy'))} <b class="ws-dummy-pin">${esc(r.dummy_pin)}</b>`
        : esc(T(r && r.alreadySent ? 'oauth.cardAlready' : 'account.emailCodeSent', { email }));
      const pin = (r && (r.dummy_pin || r.dev_pin)) || ''; if (pin) f.querySelector('.ws-pin').value = pin;
      f.querySelector('.ws-pin').focus();
    };
    // v20261114: a code was already sent from this card in the last 10 minutes → straight to "enter the code"
    try {
      const prev = JSON.parse(sessionStorage.getItem('wk_email_card_sent') || 'null');
      if (prev && prev.email && Date.now() - prev.t < 10 * 60 * 1000) { email = prev.email; toStep2(prev.pin ? { dummy: true, dummy_pin: prev.pin } : { alreadySent: true }); }
    } catch { /* ignore */ }
    box.querySelector('.ws-other').addEventListener('click', () => {
      step = 1; msg.className = 'ws-mail-msg'; msg.textContent = ''; f.querySelector('.ws-pw').value = '';
      f.querySelector('.ws-mail-s3').hidden = true; f.querySelector('.ws-mail-s1').hidden = false; f.querySelector('input[type=email]').select();
    });
    box.querySelector('.ws-skip:not(.ws-other)').addEventListener('click', () => {
      try { sessionStorage.setItem('wk_email_card_skip', '1'); } catch { /* ignore */ }
      window.CPS.api('/api/user/email-prompt/dismiss', { method: 'POST' }).catch(() => {});
      window.WK?.track?.('email_prompt_skip'); box.remove();
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); msg.className = 'ws-mail-msg'; msg.textContent = '';
      const btn = f.querySelector(`.ws-mail-s${step} button[type=submit]`); btn.disabled = true;
      try {
        if (step === 1) {
          email = f.querySelector('input[type=email]').value.trim();
          const r = await window.CPS.api('/api/auth/email-change/start', { method: 'POST', body: { newEmail: email, once: true } });
          // v20261114: the code is sent ONCE — no second "Send code" from this card (remembered for 10 min, also after a reload)
          try { sessionStorage.setItem('wk_email_card_sent', JSON.stringify({ email, t: Date.now(), ...(r.dummy ? { pin: r.dummy_pin } : {}) })); } catch { /* ignore */ } // preprod: keep the test code to show it again
          toStep2(r);
        } else if (step === 3) {
          // v20261114: the email already has an account — its password moves these (newest) results into it
          const r = await window.CPS.api('/api/auth/claim-email', { method: 'POST', body: { email, password: f.querySelector('.ws-pw').value } });
          window.CPS.Store.token = r.token; window.CPS.Store.user = r.user;
          try { sessionStorage.setItem('wk_email_card_skip', '1'); } catch { /* ignore */ }
          window.WK?.track?.('email_claimed', { after: location.pathname.split('/')[1] || 'home' });
          box.innerHTML = `<div class="ws-mail-done">✅ ${T('oauth.cardClaimed', { email: esc(r.user.email) })}</div>`;
          if (window.WikiNav) try { window.WikiNav.render(); } catch { /* ignore */ }
        } else {
          const r = await window.CPS.api('/api/auth/email-change/confirm', { method: 'POST', body: { newEmail: email, pin: f.querySelector('.ws-pin').value.trim() } });
          const u = window.CPS.Store.user || {}; u.email = r.email; u.verified = true; window.CPS.Store.user = u;
          window.WK?.track?.('email_added', { after: location.pathname.split('/')[1] || 'home' });
          try { sessionStorage.removeItem('wk_email_card_sent'); } catch { /* ignore */ }
          box.innerHTML = `<div class="ws-mail-done">✅ ${T('oauth.cardDone', { email: esc(r.email) })}</div>`;
        }
      } catch (err) {
        msg.className = 'ws-mail-msg err';
        if (err.code === 'EMAIL_TAKEN' && err.data && err.data.linkHint) {
          // v20261114: was "sign in to it, then connect TikTok" — now: confirm with that account's password, right here
          step = 3; msg.className = 'ws-mail-msg';
          try { sessionStorage.removeItem('wk_email_card_sent'); } catch { /* ignore */ }
          f.querySelector('.ws-mail-s1').hidden = true; f.querySelector('.ws-mail-s3').hidden = false;
          f.querySelector('.ws-mail-good').innerHTML = `<strong>${T('oauth.cardTakenT')}</strong> ${T('oauth.cardTakenAsk', { email: esc(email) })}`;
          try { sessionStorage.setItem('wk_forgot_email', email); } catch { /* ignore */ }
          f.querySelector('.ws-pw').focus();
          window.WK?.track?.('email_claim_show');
        } else if (err.code === 'NO_PASSWORD') msg.innerHTML = T('oauth.cardTaken', { provider: provName(p) });
        else if (err.code === 'BAD_PASSWORD') { msg.textContent = T('oauth.cardBadPass'); f.querySelector('.ws-pw').select(); }
        else msg.innerHTML = esc(err.message);
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
    if (b.dataset.ws === 'instagram') return shareInstagram(b);
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

  // Instagram: build the same 4 slides as TikTok in the browser and hand them to the phone's share sheet (pick Instagram there)
  const loadScript = (src) => new Promise((ok, ko) => { const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = ko; document.head.appendChild(el); });
  async function shareInstagram(b) {
    const label = b.querySelector('span'), orig = label.textContent;
    const msg = (k) => { label.textContent = T(k); setTimeout(() => { label.textContent = orig; b.disabled = false; }, 3500); };
    b.disabled = true; label.textContent = T('support.igPreparing');
    try {
      if (!window.STAGE_DATA) await loadScript('/assets/survey-data.js');
      if (!window.WikiCarousel) await loadScript('/assets/tiktok-share.js');
      const pack = await window.WikiCarousel.build('wikigai');
      if (!pack) return msg('support.igNoResults');
      try { await navigator.clipboard.writeText(pack.caption); } catch { /* the user can still write their own */ }
      await navigator.share({ files: pack.files, text: pack.caption });
      window.WK?.track?.('share_done', { channel: 'instagram' });
      msg('support.igDone');
    } catch (err) {
      if (err && err.name === 'AbortError') { label.textContent = orig; b.disabled = false; return; }
      msg('support.igError');
    }
  }

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
  .ws-brand{display:inline-flex;align-items:center;gap:7px;font-weight:700;color:#fff;border-color:transparent}
  .ws-brand:hover{filter:brightness(1.08);border-color:transparent}.ws-brand:disabled{opacity:.7;cursor:wait}
  .ws-tt{background:#000;border-color:rgba(255,255,255,.22)}.ws-tt svg{filter:drop-shadow(-1px -.7px 0 #25f4ee) drop-shadow(1px .7px 0 #fe2c55)}
  .ws-tt:hover{border-color:rgba(255,255,255,.4)}
  .ws-ig{background:linear-gradient(45deg,#f09433,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888)}
  .ws-fb{background:#1877F2}
  .ws-mail{border:1px solid rgba(196,77,255,.4);background:linear-gradient(135deg,rgba(196,77,255,.12),rgba(77,201,246,.06));border-radius:14px;padding:14px 16px;margin-bottom:12px;font-size:.88rem;line-height:1.5}
  .ws-mail-h{display:flex;flex-direction:column;gap:2px;margin-bottom:10px}
  .ws-mail-s1,.ws-mail-s2,.ws-mail-s3{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .ws-dummy-pin{font-family:var(--mono,monospace);letter-spacing:.2em;background:rgba(255,255,255,.08);border-radius:6px;padding:1px 6px}
  .ws-mail-good{font-size:.88rem;opacity:1}.ws-mail-good strong{color:#86efac}
  .ws-mail-alt{width:100%;font-size:.78rem;opacity:.8}.ws-mail-alt a{color:inherit}.ws-mail-alt .ws-skip{margin:0;padding:0;opacity:1}
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
