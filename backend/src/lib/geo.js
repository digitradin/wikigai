/* Visitor country (v20261028b) — used only to PRE-FILL "Country of residence" on sign-up;
   the user can keep or change it. Order: proxy country header (e.g. Cloudflare) → offline IP
   lookup (geoip-country, GeoLite2 data bundled in node_modules — the IP never leaves the server
   and is not stored) → browser language region (es-ES → ES) → none. */
const { isCountry } = require('./countries');
let geoip = null;
try { geoip = require('geoip-country'); } catch { geoip = null; } // optional: falls back to the language region

function fromLanguage(req) {
  const al = String((req.headers && req.headers['accept-language']) || '');
  for (const part of al.split(',')) {
    const m = part.trim().match(/^[a-z]{2,3}-([A-Za-z]{2})\b/);
    if (m && isCountry(m[1].toUpperCase())) return m[1].toUpperCase();
  }
  return null;
}

function countryFromRequest(req) {
  const h = req.headers || {};
  const hdr = String(h['cf-ipcountry'] || h['x-vercel-ip-country'] || h['x-country-code'] || '').toUpperCase();
  if (isCountry(hdr)) return { country: hdr, source: 'header' };
  if (geoip) {
    const ip = String(req.ip || '').replace(/^::ffff:/, '');
    try { const r = ip && geoip.lookup(ip); if (r && isCountry(r.country)) return { country: r.country, source: 'ip' }; } catch { /* ignore */ }
  }
  const lang = fromLanguage(req);
  if (lang) return { country: lang, source: 'language' };
  return { country: null, source: 'none' };
}

module.exports = { countryFromRequest };
