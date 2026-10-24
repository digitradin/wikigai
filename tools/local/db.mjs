/* Wikigai — local test database (no Docker, no Postgres install needed).
   Runs a real PostgreSQL engine (PGlite, WebAssembly) with pgcrypto and exposes it
   on 127.0.0.1:<port> so the real backend connects to it exactly like on the server.
   Data is kept in tools/local/.data/ between runs (delete that folder to start fresh).
   Usage: node tools/local/db.mjs [port]   (started for you by "Test Wikigai Locally.command") */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const port = parseInt(process.argv[2] || process.env.LOCAL_DB_PORT || '54329', 10);
const dataDir = path.join(here, '.data');
mkdirSync(dataDir, { recursive: true });

const db = await PGlite.create({ dataDir, extensions: { pgcrypto } });
// Same bootstrap the server's Postgres container runs on first start (idempotent).
await db.exec(readFileSync(path.join(root, 'deploy', 'init-db.sql'), 'utf8'));

const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 50 });
await server.start();
console.log(`[local-db] PostgreSQL (PGlite) ready on 127.0.0.1:${port} — data in ${path.relative(root, dataDir)}`);
const stop = async () => { try { await server.stop(); await db.close(); } catch { /* ignore */ } process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
