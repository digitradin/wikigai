const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: false,
});

// Track clients whose session-level GUCs have been set. Keyed by the process
// id of the physical connection so recycled connections are re-initialized.
const initialized = new Set();

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

async function ensureConfig(client) {
  const pid = client.processID;
  if (initialized.has(pid)) return;
  // Session-scoped (is_local = false) so the setting survives across the
  // implicit transactions of subsequent statements on this connection.
  await client.query('SELECT set_config($1, $2, false)', [
    'app.survey_encryption_key',
    process.env.SURVEY_DB_ENCRYPTION_KEY || '',
  ]);
  initialized.add(pid);
}

async function query(text, params) {
  const start = Date.now();
  const client = await pool.connect();
  try {
    await ensureConfig(client);
    const result = await client.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`[db] Slow query (${duration}ms): ${text.substring(0, 100)}`);
    }
    return result;
  } finally {
    client.release();
  }
}

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await ensureConfig(client);
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getOne(text, params) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

async function getAll(text, params) {
  const result = await query(text, params);
  return result.rows;
}

module.exports = { pool, query, transaction, getOne, getAll };
