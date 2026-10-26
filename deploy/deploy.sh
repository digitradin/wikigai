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

# WikiVids: copy the YouTube key to the server's settings (never printed).
# Taken from deploy/.secrets.env if present, otherwise from tools/local/local.env.
YT_KEY=""; YT_SRC=""
for f in "$SRC_DIR/deploy/.secrets.env" "$SRC_DIR/tools/local/local.env"; do
  [ -f "$f" ] || continue
  k=$(grep -E '^YOUTUBE_API_KEY=' "$f" | tail -1 | cut -d= -f2- | tr -d '\r"'"'"' ' || true)
  if [ -n "$k" ]; then YT_KEY="$k"; YT_SRC="${f#$SRC_DIR/}"; break; fi
done
if [ -n "$YT_KEY" ]; then
  echo "▶ YouTube key (from $YT_SRC) → server settings"
  REMOTE_SET_KEY=$(cat <<'RS'
f="$1"; k=$(cat)
[ -f "$f" ] || { echo "  (no .env.production on the server yet — skipped)"; exit 0; }
old=$(grep '^YOUTUBE_API_KEY=' "$f" | tail -1 | cut -d= -f2- || true)
if [ "$old" = "$k" ]; then echo "  already set — unchanged"; exit 0; fi
tmp=$(mktemp); grep -v '^YOUTUBE_API_KEY=' "$f" > "$tmp" || true
printf 'YOUTUBE_API_KEY=%s\n' "$k" >> "$tmp"; cat "$tmp" > "$f"; rm -f "$tmp"; echo "  updated"
RS
)
  printf '%s' "$YT_KEY" | ssh -i "$VPS_KEY" "$VPS_HOST" "bash -c $(printf %q "$REMOTE_SET_KEY") _ $REMOTE_DIR/.env.production"
else
  echo "▶ No YouTube key found locally — server settings left as they are."
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

echo "▶ Checking the YouTube key from the server"
ssh -i "$VPS_KEY" "$VPS_HOST" bash -s <<'CHK' || true
for i in $(seq 1 30); do docker exec cps-backend true 2>/dev/null && break; sleep 2; done
docker exec cps-backend node -e "
const k=process.env.YOUTUBE_API_KEY;
if(!k){console.log('  – no YouTube key on the server: the Videos page will say it is not switched on yet');process.exit(0)}
fetch('https://www.googleapis.com/youtube/v3/videos?part=id&id=jNQXAC9IVRw&key='+encodeURIComponent(k))
 .then(r=>r.json()).then(d=>console.log(d.error?'  ✖ YouTube refused the key: '+d.error.message:'  ✅ YouTube accepted the key — WikiVids is on'))
 .catch(e=>console.log('  ✖ Could not reach YouTube: '+e.message))" || echo "  (check skipped — backend not running yet)"
CHK

echo "✅ Deploy complete."
