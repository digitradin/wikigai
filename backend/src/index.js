require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const { rateLimit } = require('express-rate-limit');

const db = require('./lib/db');
const { runMigrations } = require('./lib/migrate');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');

const authRoutes = require('./routes/auth');
const captchaRoutes = require('./routes/captcha');
const userRoutes = require('./routes/user');
const surveyRoutes = require('./routes/survey');
const resultsRoutes = require('./routes/results');
const healthRoute = require('./routes/health');
const adminRoutes = require('./routes/admin');
const learnRoutes = require('./routes/learn');
const videoRoutes = require('./routes/videos');
const planRoutes = require('./routes/plans');
const schoolRoutes = require('./routes/schools'); // v20261112d: schools directory (public + My learning › Schools)
const privacyRoutes = require('./routes/privacy'); // v20261111b: public data deletion (/delete-my-data)
const tiktokRoutes = require('./routes/tiktok');   // v20261112b: Share to TikTok
const oauthRoutes = require('./routes/oauth');     // v20261112c: sign in with apps (TikTok; Google/Facebook/Instagram hidden)
const analytics = require('./analytics/collect');
const seo = require('./seo');
const { guardMemberPages } = require('./lib/pageGuard');

const app = express();
const PORT = process.env.PORT || 3000;
// In Docker the site is copied to backend/public; locally it is read from frontend/public.
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public');

// Behind Traefik: use the visitor's real address (X-Forwarded-For, one proxy hop)
// for rate limiting and anonymous analytics — otherwise every visitor looks the same.
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS || '1', 10));

// ── Security headers ──────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"], // allow inline onclick handlers (buttons use them)
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      connectSrc: ["'self'", 'https://api.gohighlevel.com'],
      frameSrc: ["'self'", 'https://www.youtube-nocookie.com'], // WikiVids player (privacy-enhanced YouTube embeds)
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }, // YouTube embeds need the site origin (else player error 153); paths/queries never leave the site
  noSniff: true,
}));

// ── CORS ──────────────────────────────────────────────────────────
const allowedOrigins = [
  'https://wikigai.digitradin.cloud',
  'https://survey.digitradin.cloud',
  'https://api.survey.digitradin.cloud',
  'https://wikigai.com',
  'https://www.wikigai.com',
  'https://ikigai.digitradin.cloud',
  /^https:\/\/preprod(-api)?\.survey\.digitradin\.cloud$/,
  /^https:\/\/[\w-]+\.gohighlevel\.com$/,
  // owner statistics page (stand-alone, on the Digitradin dashboard)
  ...(process.env.STATS_ALLOWED_ORIGINS || 'https://dashboard.digitradin.cloud').split(',').map((s) => s.trim()).filter(Boolean),
];
// In preprod/testing mode, also allow localhost and any tunnel origin so the
// flow can be exercised before DNS/certs are in place.
if (process.env.EXPOSE_PINS === 'true' || process.env.NODE_ENV !== 'production') {
  allowedOrigins.push(
    /^http:\/\/localhost(:\d+)?$/,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/,
    /^https?:\/\/[\w.-]+:\d+$/, // any host:port tunnel (e.g. ngrok/localtunnel)
  );
}
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => (o instanceof RegExp ? o.test(origin) : o === origin))) {
      cb(null, true);
    } else {
      console.warn('[cors] rejected origin:', origin);
      cb(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-WK-Lang'],
  maxAge: 86400,
}));
app.options('*', cors());

// ── Body parsing ──────────────────────────────────────────────────
app.use('/api/tiktok/media', express.json({ limit: '12mb' })); // v20261112b: 2–4 carousel JPEGs (checked in routes/tiktok.js)
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(requestLogger);

// ── Rate limiting ─────────────────────────────────────────────────
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: parseInt(process.env.API_RATE_MAX || '60', 10), standardHeaders: true, legacyHeaders: false }); // API_RATE_MAX: tests only
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: parseInt(process.env.AUTH_RATE_MAX || '40', 10), standardHeaders: true, legacyHeaders: false, // AUTH_RATE_MAX: tests only
  message: { error: 'Too many attempts. Please wait and try again.' },
});
app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);
app.use('/api/user/delete-account', authLimiter); // password check: same brute-force limit as sign-in
app.use('/api/privacy/', authLimiter);              // v20261111b: emailed deletion codes — same limit as sign-in
app.use(['/api/tiktok/start', '/api/oauth/:provider/start', '/auth/:provider/callback'], authLimiter); // sign in with apps — same limit as sign-in
app.use('/api/admin/', authLimiter);               // statistics token: same brute-force limit

// ── Members-only pages: visitors without a session are sent to /login (before any static file) ──
app.use(guardMemberPages);

// ── SEO: robots, sitemap, localized public pages (/, /fr/, /es/…), noindex on private areas ──
seo.mount(app, PUBLIC_DIR);

// ── Static frontend ───────────────────────────────────────────────
app.use(express.static(PUBLIC_DIR, { maxAge: '5m', etag: true, index: false }));
app.use('/dashboard', express.static(path.join(PUBLIC_DIR, 'dashboard'), { maxAge: '5m' }));
app.use('/widget', express.static(path.join(PUBLIC_DIR, 'widget'), { maxAge: '5m' }));

// Widget may be framed by GHL pages
app.get('/widget*', (req, res, next) => {
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://*.gohighlevel.com");
  next();
});

// ── API routes ────────────────────────────────────────────────────
app.use('/health', healthRoute);
// Public runtime config: pricing is on hold (free + optional donations).
// PRICING_MODE: 'free' (default) | 'donation' — the SMS paywall is not active.
// Visitor country for the sign-up form (pre-filled, user can change it) — v20261028b
const { countryFromRequest } = require('./lib/geo');
app.get('/api/geo', (req, res) => { res.set('Cache-Control', 'private, no-store'); res.json({ ok: true, ...countryFromRequest(req) }); });

app.get('/api/config', (req, res) => {
  res.json({
    ok: true,
    pricing: {
      mode: process.env.PRICING_MODE || 'free', // free for everyone; donations optional
      donationUrl: process.env.DONATION_URL || '',
      paywall: false,
    },
    shareUrl: process.env.PUBLIC_URL || 'https://wikigai.com',
    tiktok: require('./lib/tiktok').flags(), // v20261112b: { login, share } — off until TIKTOK_LOGIN / TIKTOK_SHARE = true
    auth: { providers: require('./lib/oauth').publicList() }, // v20261112c: sign-in apps switched on for this stack (none by default)
    data: { version: '2B-0.1', refreshCadenceMonths: 6 },
  });
});
app.use('/api/auth', authRoutes);
app.use('/api/captcha', captchaRoutes);
app.use('/api/user', userRoutes);
app.use('/api/privacy', privacyRoutes);
// v20261112b: TikTok sign-in / linking / sharing
app.use('/api/tiktok', tiktokRoutes);
app.use('/api/oauth', oauthRoutes);                       // v20261112c
app.get('/auth/:provider/callback', oauthRoutes.callback); // /auth/tiktok/callback (registered at TikTok), /auth/google/callback…
app.get('/tt-media/:token/:n.jpg', tiktokRoutes.media);
app.use('/api/survey', surveyRoutes);
app.use('/api/results', resultsRoutes);
// first-party, cookieless analytics
app.use('/api/t', analytics.router);
// owner statistics API (token-protected; the page lives on dashboard.digitradin.cloud, not on this site)
app.use('/api/admin', adminRoutes);
// local testing only: serve the stand-alone stats page at /__stats (never in production)
if (process.env.NODE_ENV !== 'production') {
  app.get('/__stats', (req, res) => res.sendFile(path.join(__dirname, '..', '..', 'deploy', 'dashboard', 'wikigai-stats.html')));
}
// My learning › Plans (AI research via the Digitradin AI router)
app.use('/api/learn', learnRoutes);
// My learning › Videos (filtered YouTube search + saved WikiVids)
app.use('/api/videos', videoRoutes);
// My learning › Plans v2: profession → outlook + 10 skills → 30d / 3m / 1y plan (free LLM providers, lib/llm.js)
app.use('/api/plans', planRoutes);
// v20261112d: schools directory — public (insights removed server-side) + members (full data, match, shortlist)
app.use('/api/schools', schoolRoutes);

// ── Pretty page routes ────────────────────────────────────────────
// public pages (/, /signup, /support, /login, /privacy, /terms, /delete-my-data and their /fr/ /es/ versions) are rendered by seo.mount
const privatePages = { '/verify': 'verify.html', '/forgot': 'forgot.html', '/reset': 'reset.html', '/survey': 'survey.html', '/ikigai': 'ikigai.html', '/account': 'account.html', '/learning': 'learning.html', '/favorites': 'learning.html', '/dashboard': 'dashboard/index.html', '/share/tiktok': 'share-tiktok.html', '/auth/done': 'auth-done.html', '/auth/tiktok/done': 'auth-done.html' };
const sendPrivate = (file) => (req, res) => res.type('html').set('Cache-Control', 'no-cache').send(seo.renderPrivate(file));
for (const [route, file] of Object.entries(privatePages)) app.get(route, sendPrivate(file));
app.get('/dashboard/*', sendPrivate('dashboard/index.html'));
// Ikigai hub menu pages (client-side routed): /ikigai/love|skills|needs|pay
app.get('/ikigai/*', sendPrivate('ikigai.html'));
// My learning (client-side routed): /learning/plans|videos|tools|schools
app.get('/learning/*', sendPrivate('learning.html'));
// My favourites (v20261101c, same client-routed page): /favorites/plans|videos|courses
app.get('/favorites/*', sendPrivate('learning.html'));

app.get('/favicon.ico', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'assets', 'brand', 'favicon.png')));

app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────
async function start() {
  try {
    await runMigrations();
  } catch (e) {
    console.error('[startup] migrations failed:', e.message);
  }
  analytics.startRetention();
  require('./lib/retention').startLearningRetention(); // v20261101e: unsaved plans, caches, limit logs
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[cps-backend] Running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}
start();

module.exports = app;
