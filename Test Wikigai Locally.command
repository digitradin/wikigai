#!/bin/bash
# Double-click: run THIS version of Wikigai on your Mac — the real backend + a real
# PostgreSQL engine (PGlite), no Docker, nothing sent to the server.
# Opens http://localhost:8080 . Close this window (or press Ctrl+C) to stop.
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
PORT="${WK_PORT:-8080}"
DB_PORT="${WK_DB_PORT:-54329}"
LOCAL="$ROOT/tools/local"
pause() { read -r -p "Press Enter to close"; }

echo "▶ Wikigai — local test of $(basename "$ROOT")"
if ! command -v node >/dev/null 2>&1; then
  echo "✖ Node.js is not installed. Install the LTS version from https://nodejs.org (one-time), then double-click again."
  pause; exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then echo "✖ Node.js $NODE_MAJOR is too old — install the LTS version (20+) from https://nodejs.org"; pause; exit 1; fi
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✖ Port $PORT is already in use (another local Wikigai still running?). Close it first."; pause; exit 1
fi

# one-time installs (kept inside this version folder)
[ -d "$ROOT/backend/node_modules" ] || { echo "▶ Installing backend packages (first run only)…"; (cd "$ROOT/backend" && npm install --no-audit --no-fund --loglevel=error) || { pause; exit 1; }; }
[ -d "$LOCAL/node_modules" ]        || { echo "▶ Installing local database (first run only)…";  (cd "$LOCAL" && npm install --no-audit --no-fund --loglevel=error) || { pause; exit 1; }; }

# local-only settings (never used on the server). Edit tools/local/local.env to change them.
if [ ! -f "$LOCAL/local.env" ]; then
  R() { node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"; }
  cat > "$LOCAL/local.env" <<CONF
# Local test settings — only used by "Test Wikigai Locally.command".
# Emails allowed to open /admin locally (sign up with one of them).
ADMIN_EMAILS=admin@wikigai.local,digitradin@gmail.com
SURVEY_HASH_SALT=$(R)
SURVEY_DB_ENCRYPTION_KEY=$(R)
SURVEY_JWT_SECRET=$(R)
SESSION_SECRET=$(R)
CONF
fi
# AI research (My learning › Plans) — added once to older local.env files too
if ! grep -q '^AI_ROUTER_TOKEN=' "$LOCAL/local.env"; then
  cat >> "$LOCAL/local.env" <<'CONF'

# AI research (My learning › Plans). Paste an rt_… token from
# https://router.digitradin.cloud → My Tools → API tokens. Leave empty to test without AI.
AI_ROUTER_URL=https://router.digitradin.cloud
AI_ROUTER_TOKEN=
AI_ROUTER_MODEL=auto
CONF
fi
set -a; . "$LOCAL/local.env"; set +a
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:$DB_PORT/postgres"
export PORT NODE_ENV=development EXPOSE_PINS=true SMTP_HOST=
export PUBLIC_DIR="$ROOT/frontend/public" MIGRATIONS_DIR="$ROOT/deploy/migrations"
export OUTBOX_DIR="$LOCAL/.data/outbox"
mkdir -p "$OUTBOX_DIR"

cleanup() { echo; echo "▶ Stopping local Wikigai…"; kill "$APP_PID" "$DB_PID" 2>/dev/null; wait 2>/dev/null; echo "Stopped."; }
trap cleanup EXIT INT TERM HUP

echo "▶ Starting local database…"
node "$LOCAL/db.mjs" "$DB_PORT" & DB_PID=$!
for i in $(seq 1 60); do nc -z 127.0.0.1 "$DB_PORT" 2>/dev/null && break; sleep 0.5; done

echo "▶ Starting Wikigai…"
node "$ROOT/backend/src/index.js" & APP_PID=$!
for i in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$PORT/health" && break; sleep 0.5; done

if curl -s -o /dev/null "http://localhost:$PORT/health"; then
  cat <<INFO

✅ Wikigai is running locally:  http://localhost:$PORT
   • Sign-up/login codes are shown on screen (no real emails are sent;
     copies are saved in tools/local/.data/outbox).
   • Owner stats: sign up with admin@wikigai.local (or an email listed in
     tools/local/local.env), then open http://localhost:$PORT/admin
   • Your local data stays in tools/local/.data (delete that folder to reset).
   • French / Spanish: http://localhost:$PORT/fr/  ·  http://localhost:$PORT/es/
   • AI research (My learning › Plans): add your router token to tools/local/local.env
     (AI_ROUTER_TOKEN=…) and restart this window.

   Leave this window open while testing. Close it (or press Ctrl+C) to stop.
INFO
  open "http://localhost:$PORT/"
  wait "$APP_PID"
else
  echo "✖ Wikigai did not start — see the messages above."; pause
fi
