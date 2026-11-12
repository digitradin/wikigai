#!/usr/bin/env node
/* Wikigai Schools — DEMO dataset builder (v20261112d).
   Builds backend/src/data/schools-demo.json: 6 markets (ES, FR, UK, IE, US, MX) × 32 Wikigai subfields
   = 192 programmes at 24 FICTIONAL institutions (every name contains "Demo").
   Every figure is ILLUSTRATIVE (deterministic pseudo-random within realistic ranges) — it exists so the
   public directory and My learning › Schools can be designed, tested and reviewed before the real
   Data Factory (Business_Model/Schools_Listings strategy §10) loads official data.
   Run:  node tools/schools/build-demo.js          (re-run is deterministic: same output every time)  */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
global.window = {};
require(path.join(ROOT, 'frontend/public/assets/survey-data.js'));
require(path.join(ROOT, 'frontend/public/assets/survey-data-2b.js'));
const S2 = window.STAGE_DATA_2B;

/* ── deterministic random ── */
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let x = hash(seed) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
const between = (r, a, b) => a + (b - a) * r();
const round = (v, step) => Math.round(v / step) * step;

/* ── field names per subfield (en / es / fr) ── */
const FIELD = {
  'SCIENCE_TECH.SW': ['Computer Science', 'Ingeniería Informática', 'Informatique'],
  'SCIENCE_TECH.DATA': ['Data Science & AI', 'Ciencia de Datos e IA', 'Science des données et IA'],
  'SCIENCE_TECH.HW': ['Robotics & Electronic Engineering', 'Ingeniería Robótica y Electrónica', 'Robotique et électronique'],
  'SCIENCE_TECH.SCI': ['Natural Sciences', 'Ciencias Experimentales', 'Sciences fondamentales'],
  'CREATIVE.VIS': ['Graphic & Fashion Design', 'Diseño Gráfico y de Moda', 'Design graphique et mode'],
  'CREATIVE.DIG': ['UX & Interaction Design', 'Diseño UX e Interacción', 'Design UX et interactif'],
  'CREATIVE.FILM': ['Film, Animation & VFX', 'Cine, Animación y VFX', 'Cinéma, animation et VFX'],
  'CREATIVE.WORD': ['Journalism & Media', 'Periodismo y Comunicación', 'Journalisme et médias'],
  'BUSINESS.FIN': ['Finance & Accounting', 'Finanzas y Contabilidad', 'Finance et comptabilité'],
  'BUSINESS.STRAT': ['Management & Entrepreneurship', 'Dirección de Empresas y Emprendimiento', 'Management et entrepreneuriat'],
  'BUSINESS.MKT': ['Marketing & People', 'Marketing y Recursos Humanos', 'Marketing et RH'],
  'BUSINESS.OPS': ['Operations & Supply Chain', 'Logística y Cadena de Suministro', 'Logistique et supply chain'],
  'HEALTH.MED': ['Medicine & Pharmacy', 'Medicina y Farmacia', 'Médecine et pharmacie'],
  'HEALTH.NURSE': ['Nursing & Paramedic Science', 'Enfermería', 'Soins infirmiers'],
  'HEALTH.REHAB': ['Physiotherapy & Rehabilitation', 'Fisioterapia y Rehabilitación', 'Kinésithérapie et rééducation'],
  'HEALTH.MIND': ['Psychology', 'Psicología', 'Psychologie'],
  'SOCIAL.TEACH': ['Education & Teaching', 'Magisterio y Educación', "Sciences de l'éducation"],
  'SOCIAL.LEARN': ['Learning Design & EdTech', 'Diseño Instruccional y EdTech', 'Ingénierie pédagogique et EdTech'],
  'SOCIAL.CARE': ['Social Work', 'Trabajo Social', 'Travail social'],
  'SOCIAL.IMPACT': ['International Development', 'Cooperación Internacional y ONG', 'Développement international et ONG'],
  'LAW_GOV.LEGAL': ['Law', 'Derecho', 'Droit'],
  'LAW_GOV.POLICY': ['Political Science & Public Policy', 'Ciencias Políticas y Gestión Pública', 'Science politique et action publique'],
  'LAW_GOV.INTL': ['International Relations', 'Relaciones Internacionales', 'Relations internationales'],
  'LAW_GOV.JUSTICE': ['Criminology & Security', 'Criminología y Seguridad', 'Criminologie et sécurité'],
  'BUILT_ENV.ARCH': ['Architecture & Interior Design', 'Arquitectura e Interiorismo', "Architecture et design d'intérieur"],
  'BUILT_ENV.CIVIL': ['Civil Engineering & Urban Planning', 'Ingeniería Civil y Urbanismo', 'Génie civil et urbanisme'],
  'BUILT_ENV.MECH': ['Mechanical & Aerospace Engineering', 'Ingeniería Mecánica y Aeroespacial', 'Génie mécanique et aérospatial'],
  'BUILT_ENV.BUILD': ['Construction Management', 'Edificación y Gestión de Obras', 'Génie de la construction'],
  'NATURE.ECO': ['Ecology & Conservation', 'Ecología y Conservación', 'Écologie et conservation'],
  'NATURE.EARTH': ['Marine & Earth Sciences', 'Ciencias del Mar y de la Tierra', 'Sciences de la mer et de la Terre'],
  'NATURE.FOOD': ['Agriculture, Food & Veterinary Science', 'Agronomía, Alimentación y Veterinaria', 'Agronomie, alimentation et vétérinaire'],
  'NATURE.CLIMATE': ['Sustainability & ESG', 'Sostenibilidad y ESG', 'Développement durable et RSE'],
};

/* ── markets (figures are rough, illustrative ranges in local currency) ── */
const M = {
  ES: { cur: 'EUR', fx: 1, ppp: 1.15, lang: 'es', bachYears: 4, mastYears: 1, conf: 'B', pay: { HIGH: 28000, MID: 22000, LOW: 19000 }, cfShare: 0.62,
        pubBach: [1300, 2600], pubMast: [2200, 4500], priv: [9000, 19000], grow: [1.32, 1.6] },
  FR: { cur: 'EUR', fx: 1, ppp: 1.0, lang: 'fr', bachYears: 3, mastYears: 2, conf: 'B', pay: { HIGH: 36000, MID: 29000, LOW: 25000 }, cfShare: 0.6,
        pubBach: [178, 178], pubMast: [254, 254], priv: [11000, 17000], grow: [1.3, 1.55] },
  UK: { cur: 'GBP', fx: 1.17, ppp: 0.95, lang: 'en', bachYears: 3, mastYears: 1, conf: 'A', pay: { HIGH: 33000, MID: 27000, LOW: 24000 }, cfShare: 0.62,
        pubBach: [9790, 9790], pubMast: [11000, 19000], priv: [12000, 16000], grow: [1.3, 1.6] },
  IE: { cur: 'EUR', fx: 1, ppp: 0.9, lang: 'en', bachYears: 4, mastYears: 1, conf: 'B', pay: { HIGH: 40000, MID: 33000, LOW: 29000 }, cfShare: 0.6,
        pubBach: [2500, 2500], pubMast: [7000, 13000], priv: [6500, 11000], grow: [1.3, 1.55] },
  US: { cur: 'USD', fx: 0.92, ppp: 0.85, lang: 'en', bachYears: 4, mastYears: 2, conf: 'A', pay: null, cfShare: 0.55,
        pubBach: [11600, 11600], pubMast: [13000, 17000], priv: [52000, 62000], grow: [1.35, 1.7] },
  MX: { cur: 'MXN', fx: 0.05, ppp: 1.85, lang: 'es', bachYears: 4.5, mastYears: 2, conf: 'C', pay: { HIGH: 300000, MID: 210000, LOW: 170000 }, cfShare: 0.55,
        pubBach: [2000, 8000], pubMast: [4000, 12000], priv: [120000, 260000], grow: [1.35, 1.75] },
};

/* ── 24 FICTIONAL institutions (4 per market). `takes` = domains they host ── */
const INST = [
  { id: 'es-mad-pub', c: 'ES', name: 'Universidad Pública Demo de Madrid', kind: 'university', control: 'public', city: 'Madrid', living: 11000, takes: ['SOCIAL', 'LAW_GOV', 'HEALTH'] },
  { id: 'es-val-pol', c: 'ES', name: 'Universidad Politécnica Demo de Valencia', kind: 'university', control: 'public', city: 'Valencia', living: 8500, takes: ['SCIENCE_TECH', 'BUILT_ENV', 'NATURE'] },
  { id: 'es-bcn-bs', c: 'ES', name: 'Business School Demo Barcelona', kind: 'business_school', control: 'private', city: 'Barcelona', living: 12000, takes: ['BUSINESS', 'NATURE.CLIMATE'], langs: ['en', 'es'] },
  { id: 'es-mad-pri', c: 'ES', name: 'Universidad Privada Demo de Madrid', kind: 'university', control: 'private', city: 'Madrid', living: 11000, takes: ['CREATIVE'] },
  { id: 'fr-par-uni', c: 'FR', name: 'Université Démo de Paris', kind: 'university', control: 'public', city: 'Paris', living: 14000, takes: ['SOCIAL', 'LAW_GOV', 'HEALTH', 'SCIENCE_TECH.SCI'] },
  { id: 'fr-tls-ing', c: 'FR', name: "École d'ingénieurs Démo Toulouse", kind: 'engineering_school', control: 'public', city: 'Toulouse', living: 9000, takes: ['SCIENCE_TECH', 'BUILT_ENV', 'NATURE'] },
  { id: 'fr-lyo-bs', c: 'FR', name: 'École de commerce Démo Lyon', kind: 'business_school', control: 'private', city: 'Lyon', living: 10000, takes: ['BUSINESS', 'NATURE.CLIMATE'], langs: ['fr', 'en'] },
  { id: 'fr-bdx-des', c: 'FR', name: 'École de design Démo Bordeaux', kind: 'art_school', control: 'private', city: 'Bordeaux', living: 9500, takes: ['CREATIVE'] },
  { id: 'uk-lon-uni', c: 'UK', name: 'Demo University of London', kind: 'university', control: 'public', city: 'London', living: 17000, takes: ['SOCIAL', 'LAW_GOV', 'HEALTH'] },
  { id: 'uk-edi-tec', c: 'UK', name: 'Demo Institute of Technology Edinburgh', kind: 'university', control: 'public', city: 'Edinburgh', living: 12500, takes: ['SCIENCE_TECH', 'BUILT_ENV', 'NATURE'], bachYears: 4 },
  { id: 'uk-man-bs', c: 'UK', name: 'Demo Business School Manchester', kind: 'business_school', control: 'public', city: 'Manchester', living: 12000, takes: ['BUSINESS', 'NATURE.CLIMATE'] },
  { id: 'uk-bri-art', c: 'UK', name: 'Demo College of Arts Bristol', kind: 'art_school', control: 'private', city: 'Bristol', living: 12500, takes: ['CREATIVE'] },
  { id: 'ie-dub-uni', c: 'IE', name: 'Demo University Dublin', kind: 'university', control: 'public', city: 'Dublin', living: 15000, takes: ['SOCIAL', 'LAW_GOV', 'HEALTH', 'SCIENCE_TECH.SCI'] },
  { id: 'ie-cor-tu', c: 'IE', name: 'Demo Technological University Cork', kind: 'university', control: 'public', city: 'Cork', living: 11000, takes: ['SCIENCE_TECH', 'BUILT_ENV', 'NATURE'] },
  { id: 'ie-dub-bc', c: 'IE', name: 'Demo Business College Dublin', kind: 'college', control: 'private', city: 'Dublin', living: 15000, takes: ['BUSINESS', 'NATURE.CLIMATE'] },
  { id: 'ie-gal-art', c: 'IE', name: 'Demo College of Art Galway', kind: 'art_school', control: 'public', city: 'Galway', living: 10500, takes: ['CREATIVE'] },
  { id: 'us-aus-st', c: 'US', name: 'Demo State University (Austin, TX)', kind: 'university', control: 'public', city: 'Austin', living: 15000, takes: ['SOCIAL', 'LAW_GOV', 'HEALTH', 'NATURE'] },
  { id: 'us-bos-it', c: 'US', name: 'Demo Institute of Technology (Boston, MA)', kind: 'university', control: 'private', city: 'Boston', living: 21000, takes: ['SCIENCE_TECH', 'BUILT_ENV'] },
  { id: 'us-nyc-bs', c: 'US', name: 'Demo Business School (New York, NY)', kind: 'business_school', control: 'private', city: 'New York', living: 23000, takes: ['BUSINESS', 'NATURE.CLIMATE'] },
  { id: 'us-la-art', c: 'US', name: 'Demo College of Art & Design (Los Angeles, CA)', kind: 'art_school', control: 'private', city: 'Los Angeles', living: 20000, takes: ['CREATIVE'] },
  { id: 'mx-cdmx-un', c: 'MX', name: 'Universidad Nacional Demo (CDMX)', kind: 'university', control: 'public', city: 'Ciudad de México', living: 150000, takes: ['SOCIAL', 'LAW_GOV', 'HEALTH', 'NATURE', 'SCIENCE_TECH.SCI'] },
  { id: 'mx-mty-tec', c: 'MX', name: 'Instituto Tecnológico Demo del Norte (Monterrey)', kind: 'university', control: 'private', city: 'Monterrey', living: 140000, takes: ['SCIENCE_TECH', 'BUILT_ENV'] },
  { id: 'mx-gdl-neg', c: 'MX', name: 'Escuela de Negocios Demo (Guadalajara)', kind: 'business_school', control: 'private', city: 'Guadalajara', living: 120000, takes: ['BUSINESS', 'NATURE.CLIMATE'], online: true },
  { id: 'mx-pue-dis', c: 'MX', name: 'Universidad de Diseño Demo (Puebla)', kind: 'art_school', control: 'private', city: 'Puebla', living: 100000, takes: ['CREATIVE'] },
];

function instFor(country, sub) {
  const dom = sub.split('.')[0];
  const list = INST.filter((i) => i.c === country);
  return list.find((i) => i.takes.includes(sub)) || list.find((i) => i.takes.includes(dom)) || list[0];
}

function title(country, level, sub, inst) {
  const [en, es, fr] = FIELD[sub];
  const isMba = sub === 'BUSINESS.STRAT' && level === 'master';
  if (isMba) return country === 'MX' ? 'MBA (Maestría en Administración)' : 'MBA';
  if (country === 'ES') return level === 'bachelor' ? `Grado en ${es}` : `Máster en ${es}`;
  if (country === 'MX') return level === 'bachelor' ? `Licenciatura en ${es}` : `Maestría en ${es}`;
  if (country === 'FR') {
    if (inst.kind === 'business_school') return level === 'bachelor' ? `Bachelor ${fr}` : `MSc ${fr}`;
    if (inst.kind === 'engineering_school') return level === 'bachelor' ? `Bachelor ${fr}` : `Diplôme d'ingénieur — ${fr}`;
    return level === 'bachelor' ? `Licence ${fr}` : `Master ${fr}`;
  }
  if (country === 'US') return level === 'bachelor' ? `BS in ${en}` : `MS in ${en}`;
  return level === 'bachelor' ? `BSc ${en}` : `MSc ${en}`;
}

/* careers by subfield (English names = the keys Wikigai stores in results) */
const careersBySub = {};
const payBySub = {};
Object.values(S2.careers).forEach((c) => {
  (careersBySub[c.subfield] = careersBySub[c.subfield] || []).push(c.career);
  (payBySub[c.subfield] = payBySub[c.subfield] || []).push(c);
});
const band = (sub) => {
  const n = { HIGH: 0, MID: 0, LOW: 0 };
  (payBySub[sub] || []).forEach((c) => { if (n[c.euPayBand] != null) n[c.euPayBand] += 1; }); // 'VAR' (variable pay) is ignored
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0][0];
};
const usPay = (sub) => { const v = (payBySub[sub] || []).map((c) => c.usMedianPay2025).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 70000; };

/* ── ROI (same method as Business_Model/Schools_Listings/wikigai_schools_scoring.py, simplified) ── */
function roi(p, mk) {
  const r = 0.05, tax = 0.75, D = p.durationYears;
  const eur = (v) => v * mk.fx * mk.ppp;
  const aid = p.scholarshipShare * p.avgAward;
  const cf = eur(p.salaryY1) * mk.cfShare;
  let pvCost = 0;
  for (let y = 0; y < Math.ceil(D); y++) {
    const frac = Math.min(1, D - y);
    pvCost += (Math.max(0, eur(p.tuition) - eur(aid)) + eur(p.livingCost) + 0.25 * cf * tax) * frac / (1 + r) ** y;
  }
  const g = (p.salaryY5 / p.salaryY1) ** 0.25;
  let pvGain = 0, cum = 0, payback = null;
  for (let t = 1; t <= 10; t++) {
    const sal = eur(t <= 5 ? p.salaryY1 * g ** (t - 1) : p.salaryY5 * 1.02 ** (t - 5));
    const cft = cf * 1.015 ** (D + t - 1);
    const d = (p.employment * (sal - cft) * tax) / (1 + r) ** (D + t - 1);
    pvGain += d; cum += d;
    if (payback === null && cum >= pvCost) payback = t;
  }
  return { ratio: (pvGain - pvCost) / pvCost, payback, pvCostEur: Math.round(pvCost) };
}

/* ── build ── */
const out = [];
for (const country of Object.keys(M)) {
  const mk = M[country];
  for (const sub of Object.keys(FIELD)) {
    const inst = instFor(country, sub);
    const R = rng(country + sub);
    const level = (hash(sub + country) % 3 === 0) ? 'master' : 'bachelor';
    const pub = inst.control === 'public';
    const rangeT = pub ? (level === 'bachelor' ? mk.pubBach : mk.pubMast) : mk.priv;
    const tuition = rangeT[0] === rangeT[1] ? rangeT[0] : round(between(R, ...rangeT), country === 'MX' ? 1000 : 10); // fixed public fees stay exact (FR 178/254, UK 9,790, IE 2,500)
    const tuitionIntl = country === 'FR' && pub ? (level === 'bachelor' ? 2895 : 3941)
      : country === 'UK' ? round(between(R, 19000, 31000), 100)
      : country === 'IE' ? round(between(R, 15000, 26000), 100)
      : country === 'US' && pub ? 30000
      : country === 'ES' && pub ? round(tuition * 2.2, 10) : tuition;
    const b = band(sub);
    const y1base = country === 'US' ? Math.max(38000, usPay(sub) * 0.58) : mk.pay[b];
    const salaryY1 = round(y1base * between(R, 0.9, 1.12) * (level === 'master' ? 1.12 : 1), country === 'MX' ? 1000 : 100);
    const salaryY5 = round(salaryY1 * between(R, ...mk.grow), country === 'MX' ? 1000 : 100);
    const selective = sub === 'HEALTH.MED';
    const acceptance = +(pub
      ? (selective ? between(R, 0.06, 0.18) : country === 'MX' ? between(R, 0.12, 0.35) : between(R, 0.3, 0.85))
      : inst.id === 'us-bos-it' ? between(R, 0.05, 0.09) : between(R, 0.6, 0.92)).toFixed(2);
    const p = {
      id: `${country.toLowerCase()}-${sub.toLowerCase().replace('.', '-')}`,
      country, city: inst.city,
      institution: { id: inst.id, name: inst.name, kind: inst.kind, control: inst.control },
      title: title(country, level, sub, inst),
      field: { en: FIELD[sub][0], es: FIELD[sub][1], fr: FIELD[sub][2] },
      level: sub === 'BUSINESS.STRAT' && level === 'master' ? 'mba' : level,
      domain: sub.split('.')[0], subfield: sub,
      careers: careersBySub[sub] || [],
      durationYears: level === 'bachelor' ? (inst.bachYears || mk.bachYears) : mk.mastYears,
      langs: inst.langs || [mk.lang],
      mode: inst.online && R() > 0.4 ? 'online' : (R() > 0.85 ? 'hybrid' : 'campus'),
      currency: mk.cur,
      tuition, tuitionIntl,
      livingCost: inst.living,
      salaryY1, salaryY5,
      employment: +between(R, b === 'HIGH' ? 0.84 : 0.72, b === 'LOW' ? 0.86 : 0.95).toFixed(2),
      acceptance,
      scholarshipShare: +between(R, pub ? 0.12 : 0.2, pub ? 0.35 : 0.5).toFixed(2),
      avgAward: round(Math.max(tuition * between(R, 0.2, 0.5), country === 'MX' ? 0 : 500), country === 'MX' ? 1000 : 50),
      intlPct: +between(R, country === 'MX' ? 0.02 : 0.06, country === 'MX' ? 0.08 : 0.38).toFixed(2),
      confidence: R() > 0.8 ? String.fromCharCode(mk.conf.charCodeAt(0) + 1) : mk.conf,
    };
    const tEur = p.tuition * mk.fx * mk.ppp;
    p.tuitionBand = tEur < 3000 ? 1 : tEur < 12000 ? 2 : 3;
    p.costYearEur = Math.round((p.tuition + p.livingCost) * mk.fx);           // nominal € (display)
    const q = roi(p, mk);
    p.roiRatio = +q.ratio.toFixed(3); p.paybackYears = q.payback; p.pvCostEur = q.pvCostEur;
    out.push(p);
  }
}
/* ROI Score = mid-rank percentile of the ROI ratio inside the same level group */
const groups = {};
out.forEach((p) => { const k = p.level === 'bachelor' ? 'b' : 'm'; (groups[k] = groups[k] || []).push(p.roiRatio); });
out.forEach((p) => {
  const arr = groups[p.level === 'bachelor' ? 'b' : 'm'];
  const below = arr.filter((x) => x < p.roiRatio).length, eq = arr.filter((x) => x === p.roiRatio).length;
  p.roiScore = Math.round((100 * (below + 0.5 * eq)) / arr.length);
});

const file = path.join(ROOT, 'backend/src/data/schools-demo.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({
  _note: 'DEMO DATA — fictional "Demo" institutions with illustrative figures. Not real statistics. Built by tools/schools/build-demo.js (v20261112d).',
  version: 'demo-v20261112d', markets: Object.keys(M), currencies: Object.fromEntries(Object.entries(M).map(([k, v]) => [k, { cur: v.cur, fx: v.fx }])),
  institutions: INST.map(({ id, c, name, kind, control, city }) => ({ id, country: c, name, kind, control, city })),
  programmes: out,
}, null, 1));
console.log(`✓ ${out.length} demo programmes, ${INST.length} institutions → ${path.relative(ROOT, file)}`);
const lv = {}; out.forEach((p) => { lv[p.level] = (lv[p.level] || 0) + 1; });
console.log('  levels', lv, '| ROI score range', Math.min(...out.map((p) => p.roiScore)), '-', Math.max(...out.map((p) => p.roiScore)));
