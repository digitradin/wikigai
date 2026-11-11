#!/usr/bin/env bash
# Pull the newest encrypted Wikigai PROD backup to Tomas's Mac — the off-site copy.
# Keeps N and N-1 only. Verifies sha256 against the server MANIFEST. Never decrypts.
set -euo pipefail
KEY=/Users/tomas/.ssh/digitradin-dashboard
HOST=root@76.13.248.104
SRC=/var/backups/wikigai-prod
DEST=/Users/tomas/.openclaw/Digitradin/SupportFunctions/CTO/backups/wikigai-prod
umask 077
SSH="ssh -i $KEY -o StrictHostKeyChecking=no -o ConnectTimeout=20"
mkdir -p "$DEST"; chmod 700 "$DEST"

$SSH "$HOST" "cat $SRC/MANIFEST.txt" > "$DEST/MANIFEST.txt.tmp"
mv -f "$DEST/MANIFEST.txt.tmp" "$DEST/MANIFEST.txt"
EXPECT=$(grep -m1 '^latest_sha256=' "$DEST/MANIFEST.txt" | cut -d= -f2)
[ -n "$EXPECT" ] || { echo "ALERT: no latest_sha256 in MANIFEST"; exit 2; }

scp -q -i "$KEY" -o StrictHostKeyChecking=no "$HOST:$SRC/wikigai-prod_N.dump.age" "$DEST/wikigai-prod_N.dump.age.tmp"
ACTUAL=$(shasum -a 256 "$DEST/wikigai-prod_N.dump.age.tmp" | cut -d' ' -f1)
if [ "$ACTUAL" != "$EXPECT" ]; then
  rm -f "$DEST/wikigai-prod_N.dump.age.tmp"
  echo "ALERT: sha256 mismatch (server $EXPECT, pulled $ACTUAL)"
  exit 3
fi
[ -f "$DEST/wikigai-prod_N.dump.age" ] && mv -f "$DEST/wikigai-prod_N.dump.age" "$DEST/wikigai-prod_N-1.dump.age"
mv -f "$DEST/wikigai-prod_N.dump.age.tmp" "$DEST/wikigai-prod_N.dump.age"

scp -q -i "$KEY" -o StrictHostKeyChecking=no "$HOST:$SRC/wikigai-prod_N-1.dump.age" "$DEST/wikigai-prod_N-1.dump.age" 2>/dev/null || true
chmod 600 "$DEST"/*.age "$DEST"/MANIFEST.txt
echo "OK off-site copy updated: $(ls -1 "$DEST" | tr '\n' ' ') | generated $(grep -m1 '^generated_utc=' "$DEST/MANIFEST.txt" | cut -d= -f2) | users $(grep -m1 '^users=' "$DEST/MANIFEST.txt" | cut -d= -f2)"
