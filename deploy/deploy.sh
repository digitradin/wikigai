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

# Server settings copied from this Mac (values never printed):
#   WikiVids  → YOUTUBE_API_KEY
#   AI (Plans) → every free LLM key you filled in (see deploy/AI_RESEARCH_SETUP.md)
# Taken from deploy/.secrets.env if present, otherwise from tools/local/local.env. Empty values are skipped.
SYNC_KEYS="YOUTUBE_API_KEY AI_ROUTER_URL AI_ROUTER_TOKEN AI_ROUTER_MODEL GROQ_API_KEY GROQ_MODEL OPENROUTER_API_KEY OPENROUTER_MODEL MISTRAL_API_KEY MISTRAL_MODEL CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN CLOUDFLARE_MODEL ZAI_API_KEY ZAI_MODEL GEMINI_API_KEY GEMINI_MODEL NVIDIA_API_KEY NVIDIA_MODEL AI_PROVIDER_ORDER AI_STRATEGY PLAN_DAILY_LIMIT"
PAIRS=""; NAMES=""
for key in $SYNC_KEYS; do
  for f in "$SRC_DIR/deploy/.secrets.env" "$SRC_DIR/tools/local/local.env"; do
    [ -f "$f" ] || continue
    v=$(grep -E "^$key=" "$f" | tail -1 | cut -d= -f2- | tr -d '\r"'"'"' ' || true)
    if [ -n "$v" ]; then PAIRS="$PAIRS$key=$v"$'\n'; NAMES="$NAMES $key"; break; fi
  done
done
if [ -n "$PAIRS" ]; then
  echo "▶ Settings →  server:$NAMES"
  REMOTE_SET_KEYS=$(cat <<'RS'
f="$1"
[ -f "$f" ] || { echo "  (no .env.production on the server yet — skipped)"; exit 0; }
changed=0
while IFS= read -r line; do
  [ -n "$line" ] || continue
  k="${line%%=*}"
  old=$(grep "^$k=" "$f" | tail -1 || true)
  [ "$old" = "$line" ] && continue
  tmp=$(mktemp); grep -v "^$k=" "$f" > "$tmp" || true
  printf '%s\n' "$line" >> "$tmp"; cat "$tmp" > "$f"; rm -f "$tmp"; changed=$((changed+1))
done
echo "  $changed setting(s) updated"
RS
)
  printf '%s' "$PAIRS" | ssh -i "$VPS_KEY" "$VPS_HOST" "bash -c $(printf %q "$REMOTE_SET_KEYS") _ $REMOTE_DIR/.env.production"
else
  echo "▶ No YouTube / AI keys found locally — server settings left as they are."
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

echo "▶ Checking the free AI providers from the server (My learning › Plans)"
ssh -i "$VPS_KEY" "$VPS_HOST" bash -s <<'CHK' || true
docker exec cps-backend node -e "
const llm=require('/app/src/lib/llm.js');
const p=llm.providers();
if(!p.length){console.log('  – no AI key on the server: Plans will say AI is not switched on yet');process.exit(0)}
(async()=>{for(const x of p){try{const r=await fetch(x.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+x.token},body:JSON.stringify({model:x.model,messages:[{role:'user',content:'Reply with {\\\"ok\\\":true}'}],max_tokens:20})});console.log('  '+(r.ok?'✅':'✖')+' '+x.id+' ('+x.model+') '+r.status)}catch(e){console.log('  ✖ '+x.id+' '+e.message)}}})()" || echo "  (check skipped — backend not running yet)"
CHK

echo "✅ Deploy complete."
