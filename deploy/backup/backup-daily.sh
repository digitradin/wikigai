#!/usr/bin/env bash
# Daily: refresh the off-site copy on this Mac, then check pipeline health.
# Prints one line. Exit 1 = needs attention (stale/failed/unreachable).
set -uo pipefail
D=$(cd "$(dirname "$0")" && pwd)
echo "== check =="
"$D/backup-check.sh"; RC=$?
if [ "$RC" -eq 0 ]; then
  echo "== pull =="
  "$D/backup-pull.sh" || { echo "ALERT pull failed"; exit 1; }
else
  echo "== pull skipped (pipeline unhealthy) =="
fi
exit "$RC"
