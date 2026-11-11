#!/usr/bin/env bash
# Wikigai PROD database backup — encrypted, two-copy rotation.
#   pg_dump (custom format) | age -r <public key>   -> /var/backups/wikigai-prod/
#   Keeps exactly two files: wikigai-prod_N.dump.age (latest) and wikigai-prod_N-1.dump.age.
#   The private key lives with Tomas/CTO and is NEVER on this server.
#   Env overrides exist only so the failure path can be tested safely.
set -euo pipefail
STACK_DIR=${STACK_DIR:-/opt/startups/wikigai/prod}
ENV_FILE=${ENV_FILE:-$STACK_DIR/.env.production}
DB_CONTAINER=${DB_CONTAINER:-wikigai-prod-db}
DEST=${DEST:-/var/backups/wikigai-prod}
PUB=${PUB:-/etc/wikigai-backup.pub}
LOG=${LOG:-/var/log/wikigai-backup.log}
umask 077
log(){ printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG" >&2; }
fail(){
  log "FAILED: $*"
  printf 'failed_utc=%s\nreason=%s\nhost=%s\n' "$(date -u +%FT%TZ)" "$*" "$(hostname -f 2>/dev/null || hostname)" \
    > "$DEST/.FAILED" 2>/dev/null || true
  exit 1
}
[ -r "$ENV_FILE" ] || fail "env file not readable: $ENV_FILE"
[ -r "$PUB" ] || fail "public key missing: $PUB"
RECIPIENT=$(head -1 "$PUB"); case "$RECIPIENT" in age1*) ;; *) fail "bad recipient" ;; esac
PGUSER=$(grep -m1 '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2-)
PGDB=$(grep -m1 '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2-)
[ -n "${PGUSER:-}" ] && [ -n "${PGDB:-}" ] || fail "POSTGRES_USER/POSTGRES_DB missing"

mkdir -p "$DEST"
STAGE=$(mktemp -d /dev/shm/wikigai-bk.XXXXXX 2>/dev/null || mktemp -d /tmp/wikigai-bk.XXXXXX)
trap 'rm -rf "$STAGE"' EXIT

log "dump start (db=$PGDB user=$PGUSER)"
docker exec "$DB_CONTAINER" pg_dump -U "$PGUSER" -d "$PGDB" -Fc > "$STAGE/db.dump" || fail "pg_dump failed"
SIZE=$(stat -c %s "$STAGE/db.dump")
[ "$SIZE" -gt 10000 ] || fail "dump too small ($SIZE bytes)"

docker exec -i "$DB_CONTAINER" pg_restore --list < "$STAGE/db.dump" > "$STAGE/list.txt" 2>/dev/null || fail "pg_restore --list failed"
grep -q 'TABLE DATA' "$STAGE/list.txt" || fail "dump has no table data"
TABLES=$(grep -c 'TABLE DATA' "$STAGE/list.txt")
USERS=$(docker exec "$DB_CONTAINER" psql -U "$PGUSER" -d "$PGDB" -tAc 'select count(*) from users' 2>/dev/null | tr -d ' ' || echo '?')

age -r "$RECIPIENT" -o "$STAGE/db.dump.age" < "$STAGE/db.dump" || fail "age encryption failed"
ENCSIZE=$(stat -c %s "$STAGE/db.dump.age")
[ "$ENCSIZE" -gt 10000 ] || fail "encrypted file too small"
SHA=$(sha256sum "$STAGE/db.dump.age" | cut -d' ' -f1)

# rotate: N -> N-1, new -> N (only after the new file is complete)
[ -f "$DEST/wikigai-prod_N.dump.age" ] && mv -f "$DEST/wikigai-prod_N.dump.age" "$DEST/wikigai-prod_N-1.dump.age"
mv -f "$STAGE/db.dump.age" "$DEST/wikigai-prod_N.dump.age"
PREV=none
[ -f "$DEST/wikigai-prod_N-1.dump.age" ] && PREV=wikigai-prod_N-1.dump.age
cat > "$DEST/MANIFEST.txt" <<EOF
generated_utc=$(date -u +%FT%TZ)
source=wikigai-prod-db/$PGDB
latest=wikigai-prod_N.dump.age
latest_bytes=$ENCSIZE
latest_sha256=$SHA
plaintext_bytes=$SIZE
tables=$TABLES
users=$USERS
previous=$PREV
encryption=age (x25519) recipient ${RECIPIENT:0:14}...
EOF
rm -f "$DEST/.FAILED"
log "OK latest=${ENCSIZE}B sha=${SHA:0:12} tables=$TABLES users=$USERS"

# off-site push is enabled only when a git remote is configured
if [ -r /etc/wikigai-backup.git ]; then
  REMOTE=$(head -1 /etc/wikigai-backup.git)
  GITDIR=$STACK_DIR/backup/.gitpush
  log "push start -> $REMOTE"
  rm -rf "$GITDIR"; mkdir -p "$GITDIR"; cd "$GITDIR"
  git init -q -b main .
  cp "$DEST/wikigai-prod_N.dump.age" "$DEST/MANIFEST.txt" .
  [ -f "$DEST/wikigai-prod_N-1.dump.age" ] && cp "$DEST/wikigai-prod_N-1.dump.age" .
  git add -A
  git -c user.email=backup@wikigai.com -c user.name=wikigai-backup commit -qm "backup $(date -u +%F)" || true
  git remote add origin "$REMOTE"
  git push -f -q origin main || fail "git push failed"
  git gc -q --prune=now || true
  cd /; rm -rf "$GITDIR"
  log "push OK"
else
  log "off-site git push skipped (no /etc/wikigai-backup.git); the CTO pulls N to Tomas's Mac as the off-site copy"
fi
