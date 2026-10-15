#!/usr/bin/env bash
# Idempotent deploy of the CPS backend to the VPS.
# Usage: ./deploy.sh   (run from deploy/ or pass path)
set -euo pipefail

VPS_HOST="${VPS_HOST:-root@76.13.248.104}"
VPS_KEY="${VPS_KEY:-$HOME/.ssh/digitradin-dashboard}"
REMOTE_DIR="${REMOTE_DIR:-/opt/cps}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "▶ Syncing $SRC_DIR → $VPS_HOST:$REMOTE_DIR"
ssh -i "$VPS_KEY" "$VPS_HOST" "mkdir -p $REMOTE_DIR"
rsync -az --delete \
  -e "ssh -i $VPS_KEY" \
  --exclude '.git' --exclude 'node_modules' --exclude '.DS_Store' \
  "$SRC_DIR/backend" "$SRC_DIR/frontend" "$SRC_DIR/deploy" \
  "$VPS_HOST:$REMOTE_DIR/"

if [ ! -f "$SRC_DIR/deploy/.env.production" ]; then
  echo "▶ No local .env.production — preserving remote copy if present."
fi

echo "▶ Building & (re)starting cps-backend"
ssh -i "$VPS_KEY" "$VPS_HOST" bash -s <<EOF
set -euo pipefail
cd $REMOTE_DIR/deploy
if [ ! -f $REMOTE_DIR/.env.production ]; then
  echo "!! $REMOTE_DIR/.env.production is missing. Create it from deploy/.env.production.example first." >&2
  exit 1
fi
# The legacy survey-backend also claims survey.digitradin.cloud; stop it so
# Traefik routing is unambiguous for the new CPS stack.
docker stop survey-backend 2>/dev/null || true
docker rm   survey-backend 2>/dev/null || true
docker compose -f docker-compose.yml up -d --build
docker compose -f docker-compose.yml ps
EOF

echo "✅ Deploy complete."
