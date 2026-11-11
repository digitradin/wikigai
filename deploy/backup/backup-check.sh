#!/usr/bin/env bash
# Verifies the PROD backup pipeline is healthy. Prints one line: OK ... or ALERT ...
set -uo pipefail
KEY=/Users/tomas/.ssh/digitradin-dashboard
HOST=root@76.13.248.104
SSH="ssh -i $KEY -o StrictHostKeyChecking=no -o ConnectTimeout=20 -o BatchMode=yes"
OUT=$($SSH "$HOST" 'M=/var/backups/wikigai-prod/MANIFEST.txt
[ -f /var/backups/wikigai-prod/.FAILED ] && { echo "FAILED_MARKER $(cat /var/backups/wikigai-prod/.FAILED | tr "\n" ";")"; exit 0; }
[ -r "$M" ] || { echo "NO_MANIFEST"; exit 0; }
echo "OK $(grep -m1 "^generated_utc=" "$M" | cut -d= -f2) $(grep -m1 "^users=" "$M" | cut -d= -f2) $(grep -m1 "^latest_bytes=" "$M" | cut -d= -f2) cron=$(crontab -l 2>/dev/null | grep -c pg-backup.sh) files=$(ls /var/backups/wikigai-prod/*.age 2>/dev/null | wc -l)"' 2>&1) || { echo "ALERT unreadable: $OUT"; exit 1; }
case "$OUT" in
  OK*)
    GEN=$(echo "$OUT" | awk '{print $2}')
    AGEH=$(python3 - "$GEN" <<'PY'
import sys,datetime
t=datetime.datetime.strptime(sys.argv[1],"%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
print(int((datetime.datetime.now(datetime.timezone.utc)-t).total_seconds()//3600))
PY
)
    if [ "$AGEH" -gt 26 ]; then echo "ALERT backup is ${AGEH}h old ($OUT)"; exit 1; fi
    echo "OK ${AGEH}h old | $OUT" ;;
  *) echo "ALERT $OUT"; exit 1 ;;
esac
