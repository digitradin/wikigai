const fs = require('fs');
const path = require('path');
const db = require('./db');

/**
 * Run SQL migration files from /deploy/migrations (or ./deploy/migrations relative
 * to the app root) in filename order. Each file is expected to be idempotent
 * (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / etc.).
 */
async function runMigrations() {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.join(__dirname, '..', '..', 'deploy', 'migrations'),
    '/app/deploy/migrations',
  ].filter(Boolean);

  let dir = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) { dir = c; break; }
  }
  if (!dir) {
    console.warn('[migrate] no migrations dir found; skipping');
    return;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      await db.query(sql);
      console.log(`[migrate] applied ${f}`);
    } catch (e) {
      console.error(`[migrate] FAILED ${f}: ${e.message}`);
      throw e;
    }
  }
}

module.exports = { runMigrations };
