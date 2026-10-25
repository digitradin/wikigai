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
const analytics = require('./analytics/collect');
const seo = require('./seo');

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
  referrerPolicy: { policy: 'same-origin' },
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
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(requestLogger);

// ── Rate limiting ─────────────────────────────────────────────────
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait and try again.' },
});
app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);
app.use('/api/user/delete-account', authLimiter); // password check: same brute-force limit as sign-in
app.use('/api/admin/', authLimiter);               // statistics token: same brute-force limit

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
app.get('/api/config', (req, res) => {
  res.json({
    ok: true,
    pricing: {
      mode: process.env.PRICING_MODE || 'free', // free for everyone; donations optional
      donationUrl: process.env.DONATION_URL || '',
      paywall: false,
    },
    shareUrl: process.env.PUBLIC_URL || 'https://wikigai.digitradin.cloud',
    data: { version: '2B-0.1', refreshCadenceMonths: 6 },
  });
});
app.use('/api/auth', authRoutes);
app.use('/api/captcha', captchaRoutes);
app.use('/api/user', userRoutes);
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

// ── Pretty page routes ────────────────────────────────────────────
// public pages (/, /signup, /support, /login and their /fr/ /es/ versions) are rendered by seo.mount
const privatePages = { '/verify': 'verify.html', '/forgot': 'forgot.html', '/reset': 'reset.html', '/survey': 'survey.html', '/ikigai': 'ikigai.html', '/account': 'account.html', '/learning': 'learning.html', '/dashboard': 'dashboard/index.html' };
const sendPrivate = (file) => (req, res) => res.type('html').set('Cache-Control', 'no-cache').send(seo.renderPrivate(file));
for (const [route, file] of Object.entries(privatePages)) app.get(route, sendPrivate(file));
app.get('/dashboard/*', sendPrivate('dashboard/index.html'));
// Ikigai hub menu pages (client-side routed): /ikigai/love|skills|needs|pay
app.get('/ikigai/*', sendPrivate('ikigai.html'));
// My learning (client-side routed): /learning/plans|videos|tools|schools
app.get('/learning/*', sendPrivate('learning.html'));

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
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[cps-backend] Running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}
start();

module.exports = app;
