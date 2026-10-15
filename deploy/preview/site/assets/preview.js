/* Wikigai preprod preview — runs the real front end with a browser-only
   stand-in for the server. Data stays in this browser (localStorage). */
(function () {
  'use strict';
  window.__WK_PREVIEW__ = true;
  const KEY = 'wk_preview_db';
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const db = () => { try { return JSON.parse(ls.get(KEY) || '{}'); } catch { return {}; } };
  const save = (d) => ls.set(KEY, JSON.stringify(d));
  const page = (location.pathname.split('/').pop() || '').replace('.html', '') || 'index';

  /* hash → query: "survey.html#stage=2&review=1" behaves like "?stage=2&review=1" */
  const h = location.hash.replace(/^#/, '');
  window.__WK_Q__ = location.search || (h.includes('=') ? '?' + h : '');
  window.__WK_PAGE__ = () => {
    const p = new URLSearchParams(location.hash.replace(/^#/, '')).get('p');
    return p || 'overview';
  };

  /* site paths → preview files */
  window.__WK_URL__ = function (href) {
    if (typeof href !== 'string' || !href.startsWith('/')) return href;
    const [path, q] = href.split('?');
    const seg = path.split('/').filter(Boolean);
    const qs = q ? q : '';
    if (!seg.length) return './';
    switch (seg[0]) {
      case 'dashboard': return 'dashboard.html';
      case 'survey': return 'survey.html' + (qs ? '#' + qs : '');
      case 'ikigai': return 'ikigai.html#p=' + (seg[1] || 'overview') + (qs ? '&' + qs : '');
      case 'support': return 'support.html';
      case 'login': case 'signup': case 'verify': case 'forgot': case 'reset':
        return localStorage && ls.get('cps_token') ? 'dashboard.html' : './';
      default: return href.replace(/^\//, '');
    }
  };

  function signInDemo() {
    if (!ls.get('cps_token')) {
      ls.set('cps_token', 'preview-token');
      const d = db(); d.user = d.user || { name: 'Guest', email: 'guest@preview.wikigai' }; save(d);
      ls.set('cps_user', JSON.stringify(d.user));
    }
  }

  /* links: rewrite absolute site links at click time */
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="/"]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (page === 'ikigai' && href.startsWith('/ikigai')) return; // handled in-page
    if (/^\/(signup|login)/.test(href)) { signInDemo(); e.preventDefault(); location.href = 'dashboard.html'; return; }
    a.setAttribute('href', window.__WK_URL__(href));
  }, true);

  /* the survey page reads its stage from the hash, so a hash change means a new page */
  if (page === 'survey') window.addEventListener('hashchange', () => location.reload());

  /* stand-in API */
  const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const m = url.match(/\/api\/[^?#]*/);
    if (!m) return realFetch(input, init);
    const path = m[0], method = (init && init.method) || 'GET';
    const body = init && init.body ? JSON.parse(init.body) : {};
    const d = db();
    const user = d.user || { name: 'Guest', email: 'guest@preview.wikigai' };
    const results = d.results || {};
    if (path === '/api/config') return json({ ok: true, pricing: { mode: 'free', donationUrl: '', paywall: false }, data: { refreshCadenceMonths: 6 } });
    if (path === '/api/auth/logout') return json({ ok: true });
    if (path.startsWith('/api/auth/')) { signInDemo(); return json({ ok: true, token: 'preview-token', user }); }
    if (!ls.get('cps_token')) return json({ error: 'Not signed in' }, 401);
    if (path === '/api/user/profile') return json({ ok: true, user, progress: { stages: Object.keys(results) } });
    if (path === '/api/user/results' && method === 'GET') return json({ ok: true, user, results });
    if (path === '/api/user/results' && method === 'POST') {
      const k = 'stage_' + body.stage, prev = results[k];
      if (body.results && body.results.partial === true && prev && prev.partial !== true) return json({ ok: true, skipped: 'partial-overwrite' });
      results[k] = Object.assign({}, prev || {}, body.results || {});
      d.results = results; d.user = user; save(d);
      return json({ ok: true, stage: body.stage });
    }
    return json({ ok: true });
  };

  /* preview ribbon */
  function ribbon() {
    const r = document.createElement('div');
    r.setAttribute('style', 'position:fixed;left:12px;bottom:12px;z-index:99999;display:flex;gap:8px;align-items:center;padding:7px 10px 7px 14px;border-radius:22px;background:rgba(18,18,42,.94);border:1px solid rgba(196,77,255,.45);color:#f1f5f9;font:500 12px Inter,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4)');
    r.innerHTML = '<span>🧪 Preprod preview · your answers stay in this browser</span><button type="button" style="font:inherit;color:#f1f5f9;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:4px 10px;cursor:pointer">Reset</button>';
    r.querySelector('button').addEventListener('click', () => { ls.del(KEY); ls.del('cps_token'); ls.del('cps_user'); location.href = './'; });
    document.body.appendChild(r);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ribbon); else ribbon();

  /* pages that need a signed-in user get the demo account */
  if (['dashboard', 'survey', 'ikigai'].includes(page)) signInDemo();
})();
