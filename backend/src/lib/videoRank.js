/* Wikigai video search — the hidden "signal over noise" filters (inspired by SGNL-style
   learning search). Users only type/edit a few words and pick one of their domains; all of
   this happens behind the scenes:

   1. Query shaping   — the user's words + a learning intent word in their language
                        ("tutorial", "explicado", "cours"…); YouTube is asked for relevance AND
                        view-count orders, embeddable videos only, SafeSearch, the user's language.
   2. Hard filters    — no Shorts (< 3 min), no marathons (> 3 h), no live/upcoming streams,
                        minimum views, entertainment/gaming/music/comedy categories dropped,
                        clickbait patterns dropped (ALL CAPS, "!!!", prank, reaction…),
                        must match the selected domain or the user's words.
   3. Ranking         — mostly popularity (views) and description/title match, then the domain
                        fit, like ratio, learning intent, a sensible length and freshness.
   Everything here is pure functions so it can be tested without calling YouTube. */
'use strict';

const strip = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const words = (s) => strip(s).split(/[^a-z0-9+#]+/).filter((w) => w.length > 1 && !STOP.has(w));
const STOP = new Set(['the', 'and', 'for', 'with', 'how', 'what', 'les', 'des', 'une', 'pour', 'avec', 'los', 'las', 'del', 'con', 'para', 'por', 'que', 'una', 'en', 'de', 'la', 'le', 'el', 'to', 'of', 'in', 'a', 'an', 'is', 'du', 'et', 'y', 'o']);

/* learning intent appended to the query, per language */
const INTENT = { en: 'tutorial explained', fr: 'cours expliqué', es: 'curso explicado' };
const EDU_WORDS = ['tutorial', 'course', 'explained', 'lesson', 'guide', 'introduction', 'intro', 'beginner', 'beginners', 'learn', 'how to', 'masterclass', 'lecture', 'crash course', 'step by step', 'fundamentals', 'basics',
  'cours', 'explique', 'tuto', 'apprendre', 'debutant', 'lecon', 'formation', 'curso', 'explicado', 'aprender', 'principiantes', 'leccion', 'clase', 'introduccion', 'como'];
const CLICKBAIT = /(!!!|\?\?\?|\b(prank|reaction|reacts?|gone wrong|you won'?t believe|shocking|exposed|drama|giveaway|asmr|mukbang|challenge accepted|try not to)\b)/i;

/* YouTube categories: 27 Education, 28 Science & Tech, 26 Howto & Style, 25 News & Politics,
   29 Nonprofits, 22 People & Blogs, 1 Film & Animation, 19 Travel, 15 Pets & Animals,
   2 Autos, 17 Sports, 10 Music, 20 Gaming, 23 Comedy, 24 Entertainment */
const BLOCKED_CATEGORIES = new Set(['10', '20', '23', '24', '43', '44']);
const GOOD_CATEGORIES = { '27': 1, '28': 0.9, '26': 0.7, '25': 0.6, '29': 0.6, '22': 0.4, '1': 0.4, '19': 0.3, '15': 0.4, '2': 0.3, '17': 0.2 };

/* hidden domain vocabularies (EN + FR + ES, accent-free) — used to keep results on-topic */
const DOMAIN_TERMS = {
  SCIENCE_TECH: ['programming', 'software', 'coding', 'code', 'developer', 'engineering', 'engineer', 'computer', 'data', 'ai', 'artificial intelligence', 'machine learning', 'robot', 'robotics', 'electronics', 'cloud', 'security', 'cyber', 'physics', 'chemistry', 'biology', 'science', 'scientist', 'math', 'mathematics', 'algorithm', 'python', 'javascript', 'research', 'lab', 'technology', 'tech',
    'programmation', 'logiciel', 'informatique', 'donnees', 'ingenieur', 'ingenierie', 'sciences', 'physique', 'chimie', 'biologie', 'technologie', 'programacion', 'datos', 'ingenieria', 'ingeniero', 'ciencia', 'fisica', 'quimica', 'biologia', 'tecnologia', 'informatica'],
  CREATIVE: ['design', 'designer', 'graphic', 'illustration', 'drawing', 'art', 'artist', 'photography', 'photo', 'video editing', 'film', 'filmmaking', 'animation', 'motion', '3d', 'blender', 'ux', 'ui', 'branding', 'logo', 'typography', 'writing', 'writer', 'journalism', 'music production', 'creative', 'figma', 'photoshop',
    'dessin', 'graphisme', 'cinema', 'ecriture', 'journalisme', 'diseno', 'dibujo', 'arte', 'fotografia', 'cine', 'animacion', 'escritura', 'periodismo', 'creativo', 'creatif'],
  BUSINESS: ['business', 'entrepreneur', 'startup', 'marketing', 'sales', 'finance', 'accounting', 'investing', 'economics', 'management', 'manager', 'strategy', 'leadership', 'excel', 'consulting', 'supply chain', 'operations', 'hr', 'human resources', 'negotiation', 'company', 'money',
    'entreprise', 'entrepreneuriat', 'comptabilite', 'economie', 'gestion', 'strategie', 'vente', 'negocio', 'empresa', 'emprendimiento', 'contabilidad', 'finanzas', 'economia', 'gestion', 'estrategia', 'ventas', 'liderazgo'],
  HEALTH: ['health', 'medicine', 'medical', 'doctor', 'nurse', 'nursing', 'anatomy', 'physiology', 'pharmacy', 'pharmacology', 'therapy', 'therapist', 'physiotherapy', 'psychology', 'mental health', 'hospital', 'patient', 'clinical', 'emergency', 'paramedic', 'dentist', 'nutrition',
    'sante', 'medecine', 'medecin', 'infirmier', 'infirmiere', 'anatomie', 'pharmacie', 'psychologie', 'kinesitherapie', 'salud', 'medicina', 'medico', 'enfermeria', 'enfermera', 'anatomia', 'farmacia', 'psicologia', 'fisioterapia', 'paciente'],
  SOCIAL: ['teaching', 'teacher', 'education', 'school', 'classroom', 'pedagogy', 'learning', 'students', 'social work', 'social worker', 'community', 'counseling', 'childcare', 'nonprofit', 'volunteer', 'sociology', 'edtech', 'instructional design', 'coaching',
    'enseignement', 'enseignant', 'ecole', 'pedagogie', 'travail social', 'educateur', 'association', 'sociologie', 'ensenanza', 'profesor', 'docente', 'educacion', 'escuela', 'pedagogia', 'trabajo social', 'comunidad', 'sociologia'],
  LAW_GOV: ['law', 'legal', 'lawyer', 'attorney', 'court', 'justice', 'constitution', 'government', 'policy', 'politics', 'public administration', 'diplomacy', 'international relations', 'police', 'criminology', 'human rights', 'european union', 'parliament',
    'droit', 'avocat', 'juridique', 'tribunal', 'politique', 'gouvernement', 'diplomatie', 'relations internationales', 'derecho', 'abogado', 'juridico', 'tribunal', 'politica', 'gobierno', 'diplomacia', 'relaciones internacionales', 'criminologia'],
  BUILT_ENV: ['architecture', 'architect', 'civil engineering', 'construction', 'building', 'structural', 'mechanical', 'aerospace', 'energy', 'renewable', 'urban planning', 'interior design', 'cad', 'autocad', 'revit', 'engineering', 'engineer', 'bridge', 'real estate', 'hvac',
    'architecte', 'genie civil', 'batiment', 'mecanique', 'aeronautique', 'energie', 'urbanisme', 'arquitectura', 'arquitecto', 'ingenieria civil', 'construccion', 'edificio', 'mecanica', 'aeroespacial', 'energia', 'urbanismo'],
  NATURE: ['nature', 'ecology', 'environment', 'environmental', 'climate', 'sustainability', 'conservation', 'wildlife', 'biology', 'marine', 'ocean', 'geology', 'earth science', 'agriculture', 'farming', 'forestry', 'veterinary', 'animals', 'botany', 'renewable',
    'ecologie', 'environnement', 'climat', 'durable', 'faune', 'oceanographie', 'geologie', 'agriculture', 'veterinaire', 'ecologia', 'medio ambiente', 'clima', 'sostenibilidad', 'conservacion', 'fauna', 'oceano', 'geologia', 'agricultura', 'veterinaria', 'naturaleza'],
};

/* ISO-8601 duration → seconds (PT1H2M3S) */
function isoSeconds(d) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(d || ''));
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

function hits(text, terms) {
  let n = 0;
  for (const t of terms) { if (t.includes(' ') ? text.includes(t) : new RegExp('\\b' + t.replace(/[+#]/g, '\\$&') + '\\b').test(text)) n += 1; }
  return n;
}

function isClickbait(title) {
  const letters = String(title || '').replace(/[^A-Za-zÀ-ÿ]/g, '');
  const caps = letters.replace(/[^A-ZÀ-Þ]/g, '').length;
  return CLICKBAIT.test(title || '') || (letters.length > 12 && caps / letters.length > 0.6);
}

/* v = YouTube videos.list item (snippet, statistics, contentDetails); ctx = { query, domain, minViews } */
function scoreVideo(v, ctx) {
  const sn = v.snippet || {}, st = v.statistics || {}, cd = v.contentDetails || {};
  const secs = isoSeconds(cd.duration);
  const views = +st.viewCount || 0, likes = +st.likeCount || 0;
  const reasons = [];
  if (sn.liveBroadcastContent && sn.liveBroadcastContent !== 'none') reasons.push('live');
  if (secs < 180) reasons.push('short');
  if (secs > 3 * 3600) reasons.push('too-long');
  if (views < (ctx.minViews ?? 1000)) reasons.push('few-views');
  if (BLOCKED_CATEGORIES.has(String(sn.categoryId))) reasons.push('category');
  if (isClickbait(sn.title)) reasons.push('clickbait');
  if (/#shorts?\b/i.test((sn.title || '') + ' ' + (sn.description || ''))) reasons.push('short');

  const title = strip(sn.title), desc = strip(sn.description).slice(0, 3000), tags = strip((sn.tags || []).join(' '));
  const all = title + ' ' + desc + ' ' + tags;
  const q = [...new Set(words(ctx.query))];
  const qTitle = q.length ? q.filter((w) => title.includes(w)).length / q.length : 0;
  const qDesc = q.length ? q.filter((w) => desc.includes(w) || tags.includes(w)).length / q.length : 0;
  const R = Math.min(1, 0.65 * qTitle + 0.35 * qDesc);                       // description / title match
  const dTerms = DOMAIN_TERMS[ctx.domain] || [];
  const D = dTerms.length ? Math.min(1, hits(all, dTerms) / 3) : 0.5;        // fits the selected domain
  if (dTerms.length && D === 0 && R < 0.5) reasons.push('off-domain');
  const P = Math.min(1, Math.log10(views + 1) / 7);                          // popularity (10M views ≈ 1)
  const L = views ? Math.min(1, (likes / views) * 25) : 0;                   // ~4% like ratio ≈ 1
  const E = hits(all, EDU_WORDS) ? 1 : 0;                                    // learning intent
  const C = GOOD_CATEGORIES[String(sn.categoryId)] ?? 0.2;                   // educational category
  const len = secs >= 240 && secs <= 2700 ? 1 : secs <= 5400 ? 0.7 : 0.4;    // 4–45 min is the sweet spot
  const ageY = sn.publishedAt ? (Date.now() - Date.parse(sn.publishedAt)) / 3.15e10 : 5;
  const F = ageY < 3 ? 1 : ageY < 7 ? 0.7 : 0.4;                            // freshness
  const score = 0.34 * P + 0.30 * R + 0.12 * D + 0.08 * L + 0.06 * E + 0.05 * C + 0.03 * len + 0.02 * F;
  return { ok: reasons.length === 0, reasons, score: Math.round(score * 1000) / 1000, secs, views };
}

/* shape the public result (no internal signals leak to the browser) */
function publicItem(v, s) {
  const sn = v.snippet || {};
  const th = sn.thumbnails || {};
  return {
    id: v.id,
    title: sn.title || '',
    channel: sn.channelTitle || '',
    published: (sn.publishedAt || '').slice(0, 10),
    thumb: (th.high || th.medium || th.default || {}).url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    durationS: s.secs,
    views: s.views,
  };
}

function rank(items, ctx, limit = 18) {
  const scored = items.map((v) => ({ v, s: scoreVideo(v, ctx) }));
  const kept = scored.filter((x) => x.s.ok).sort((a, b) => b.s.score - a.s.score);
  // at most 3 videos per channel, so one creator does not fill the page
  const perChannel = {};
  const out = [];
  for (const x of kept) {
    const ch = (x.v.snippet && x.v.snippet.channelId) || '?';
    perChannel[ch] = (perChannel[ch] || 0) + 1;
    if (perChannel[ch] > 3) continue;
    out.push(publicItem(x.v, x.s));
    if (out.length >= limit) break;
  }
  return { items: out, considered: items.length, dropped: scored.length - kept.length };
}

module.exports = { rank, scoreVideo, isoSeconds, isClickbait, words, INTENT, DOMAIN_TERMS };
