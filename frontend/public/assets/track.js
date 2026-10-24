/* Wikigai first-party analytics (cookieless).  window.WK.track(name, props)
   - one page view per page load and per in-app navigation (history.pushState)
   - no cookies, no localStorage, no third parties; data goes to /api/t on this site
   - honours Global Privacy Control / Do Not Track
   Event names must be in the server allow-list (backend/src/analytics/collect.js). */
(function () {
  'use strict';
  if (window.__WK_TRACK__) return;
  window.__WK_TRACK__ = true;
  const nav = navigator;
  const optOut = nav.globalPrivacyControl === true || nav.doNotTrack === '1' || window.doNotTrack === '1';
  const ENDPOINT = (window.__CPS_API__ || '') + '/api/t';

  function utm() {
    try {
      const q = new URLSearchParams(window.__WK_Q__ || location.search);
      const u = { source: q.get('utm_source') || (q.get('ref') ? 'ref:' + q.get('ref') : null), medium: q.get('utm_medium'), campaign: q.get('utm_campaign') };
      return u.source || u.medium || u.campaign ? u : undefined;
    } catch { return undefined; }
  }
  const lang = () => (window.WK && WK.i18n ? WK.i18n.lang : (document.documentElement.lang || '').slice(0, 2));
  const signedIn = () => { try { return !!localStorage.getItem('cps_token'); } catch { return false; } };

  function send(payload) {
    if (optOut) return;
    const body = JSON.stringify(payload);
    try {
      if (nav.sendBeacon && nav.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
    } catch { /* fall through */ }
    try { fetch(ENDPOINT, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, keepalive: true, credentials: 'omit' }).catch(() => {}); } catch { /* ignore */ }
  }

  let lastPath = null;
  function pageview(force) {
    const p = location.pathname;
    if (!force && p === lastPath) return;
    const first = lastPath === null;
    lastPath = p;
    send({ t: 'pageview', p, r: first ? document.referrer : '', l: lang(), s: signedIn(), u: first ? utm() : undefined });
  }
  function track(name, props) {
    send({ t: 'event', n: String(name), p: location.pathname, l: lang(), s: signedIn(), x: props || undefined });
  }

  // in-app navigation (Wikigai hub uses pushState)
  ['pushState', 'replaceState'].forEach((fn) => {
    const orig = history[fn];
    history[fn] = function () { const r = orig.apply(this, arguments); setTimeout(() => pageview(false), 0); return r; };
  });
  window.addEventListener('popstate', () => pageview(false));

  window.WK = window.WK || {};
  window.WK.track = track;

  // wait for the language to be known so the page view carries it
  const go = () => { if (!(window.WK.i18n && WK.i18n.leaving)) pageview(true); };
  if (window.WK.i18n && WK.i18n.ready) WK.i18n.ready.then(go, go); else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
