/* Wikigai backend i18n — server-generated text (emails).
   Same locale codes as the front end (frontend/public/assets/i18n/i18n.js).
   Add a language: create locales/<code>.json with the same keys as en.json
   and add the code to SUPPORTED. Run `node tools/i18n/check.js`.          */
'use strict';
const SUPPORTED = ['en', 'fr', 'es'];
const DEFAULT = 'en';
const DICT = {};
SUPPORTED.forEach((c) => { DICT[c] = require(`./locales/${c}.json`); });

function normalize(code) {
  const c = String(code || '').toLowerCase().slice(0, 2);
  return SUPPORTED.includes(c) ? c : null;
}
/* body.locale > X-WK-Lang header > Accept-Language > default */
function fromRequest(req) {
  const b = req && req.body && normalize(req.body.locale);
  if (b) return b;
  const h = req && req.headers && normalize(req.headers['x-wk-lang']);
  if (h) return h;
  const al = (req && req.headers && req.headers['accept-language']) || '';
  for (const part of al.split(',')) { const c = normalize(part.trim()); if (c) return c; }
  return DEFAULT;
}
function t(lang, key, vars) {
  const get = (d) => key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), d);
  let v = get(DICT[normalize(lang) || DEFAULT]);
  if (v == null) v = get(DICT[DEFAULT]);
  if (v == null) return key;
  return String(v).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
}
module.exports = { SUPPORTED, DEFAULT, normalize, fromRequest, t };
