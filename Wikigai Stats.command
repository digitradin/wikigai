#!/bin/bash
# Double-click: READ-ONLY Wikigai usage report from the Hostinger VPS (uses your SSH key).
# Collects only aggregate counts — no emails, names or IP addresses leave the server.
# Saves the report to reports/wikigai-stats-<date>.txt in this folder.
cd "$(dirname "$0")" || exit 1
VPS_HOST="${VPS_HOST:-root@76.13.248.104}"
VPS_KEY="${VPS_KEY:-$HOME/.ssh/digitradin-dashboard}"
DAYS="${DAYS:-21}"
mkdir -p reports
OUT="reports/wikigai-stats-$(date +%Y%m%d-%H%M).txt"
echo "▶ Reading Wikigai stats from the server (last $DAYS days)…"
ssh -i "$VPS_KEY" -o ConnectTimeout=20 "$VPS_HOST" "DAYS=$DAYS bash -s" > "$OUT" 2>&1 <<'REMOTE'
set -u
Q() { docker exec cps-db psql -U survey_user -d survey_db -At -F ' | ' -c "$1" 2>&1; }
echo "WIKIGAI STATS — generated $(date -u +%Y-%m-%dT%H:%MZ) — window: last ${DAYS} days"
echo
echo "## 1. Accounts (users table) — test accounts = names starting smoke_/e2e"
echo "total | verified | unverified | test_accounts | new_${DAYS}d | new_7d | verified_new_${DAYS}d"
Q "SELECT count(*), count(*) FILTER (WHERE email_verified), count(*) FILTER (WHERE NOT email_verified),
          count(*) FILTER (WHERE name ILIKE 'smoke%' OR name ILIKE 'e2e%'),
          count(*) FILTER (WHERE created_at > now()-interval '${DAYS} days'),
          count(*) FILTER (WHERE created_at > now()-interval '7 days'),
          count(*) FILTER (WHERE email_verified AND created_at > now()-interval '${DAYS} days')
   FROM users;"
echo "first_signup | latest_signup"
Q "SELECT min(created_at)::date, max(created_at) FROM users WHERE NOT (name ILIKE 'smoke%' OR name ILIKE 'e2e%');"
echo
echo "## 2. Sign-ups per day (real accounts only)"
echo "day | signups | verified"
Q "SELECT d::date, coalesce(u.c,0), coalesce(u.v,0)
   FROM generate_series(current_date - (${DAYS}-1), current_date, interval '1 day') d
   LEFT JOIN (SELECT created_at::date day, count(*) c, count(*) FILTER (WHERE email_verified) v FROM users
              WHERE NOT (name ILIKE 'smoke%' OR name ILIKE 'e2e%') GROUP BY 1) u ON u.day = d::date ORDER BY 1;"
echo
echo "## 3. Language of accounts"
Q "SELECT locale, count(*) FROM users WHERE NOT (name ILIKE 'smoke%' OR name ILIKE 'e2e%') GROUP BY 1 ORDER BY 2 DESC;"
echo
echo "## 4. Returning users (last sign-in)"
echo "signed_in_7d | signed_in_${DAYS}d | never_signed_in_again"
Q "SELECT count(*) FILTER (WHERE last_login_at > now()-interval '7 days'),
          count(*) FILTER (WHERE last_login_at > now()-interval '${DAYS} days'),
          count(*) FILTER (WHERE last_login_at IS NULL)
   FROM users WHERE NOT (name ILIKE 'smoke%' OR name ILIKE 'e2e%');"
echo
echo "## 5. Survey funnel (saved results)"
echo "result_rows | stage1_started | stage1_done | stage2_done | stage3_done(grades/match) | grades_skipped | refresh_optin"
Q "SELECT count(*),
          count(*) FILTER (WHERE results ? 'stage_1'),
          count(*) FILTER (WHERE results->'stage_1' ? 'completedAt' OR (results->'stage_1' ? 'ranked' AND coalesce(results->'stage_1'->>'partial','false') <> 'true')),
          count(*) FILTER (WHERE jsonb_typeof(results->'stage_2'->'love') = 'array'),
          count(*) FILTER (WHERE results->'stage_3' ? 'completedAt'),
          count(*) FILTER (WHERE results->'stage_3'->>'gradesSkipped' = 'true'),
          count(*) FILTER (WHERE results->'stage_3'->'refresh'->>'optIn' = 'true')
   FROM user_results WHERE NOT (user_name ILIKE 'smoke%' OR user_name ILIKE 'e2e%');"
echo "results saved per day (last activity)"
Q "SELECT updated_at::date, count(*) FROM user_results WHERE updated_at > now()-interval '${DAYS} days'
   AND NOT (user_name ILIKE 'smoke%' OR user_name ILIKE 'e2e%') GROUP BY 1 ORDER BY 1;"
echo
echo "## 6. Top Stage 1 domains (rank 1 among completed)"
Q "SELECT r->>'area', count(*) FROM user_results,
          LATERAL (SELECT e FROM jsonb_array_elements(results->'stage_1'->'ranked') e ORDER BY (e->>'score')::numeric DESC LIMIT 1) t(r)
   WHERE jsonb_typeof(results->'stage_1'->'ranked') = 'array' AND NOT (user_name ILIKE 'smoke%' OR user_name ILIKE 'e2e%')
   GROUP BY 1 ORDER BY 2 DESC;"
echo
echo "## 7. Page views from app logs (no IPs logged; covers only since the last deploy/restart)"
echo "app_started_at: $(docker inspect -f '{{.State.StartedAt}}' cps-backend 2>/dev/null)"
L=$(docker logs cps-backend --since "$((DAYS*24))h" 2>&1)
PAGES=$(printf '%s\n' "$L" | grep -E '\] GET /[^ ]* (200|304) ' | grep -vE ' GET /(api|assets|health|favicon|robots|widget)' )
echo "page_views_total: $(printf '%s\n' "$PAGES" | grep -c 'GET' )"
echo "page views per day:"
printf '%s\n' "$PAGES" | grep 'GET' | cut -c2-11 | sort | uniq -c
echo "page views by page:"
printf '%s\n' "$PAGES" | grep 'GET' | awk '{print $4}' | sed -E 's/\?.*//; s#^/ikigai/.*#/ikigai/*#' | sort | uniq -c | sort -rn | head -15
echo "key actions (successful):"
for a in 'POST /api/auth/signup 20' 'POST /api/auth/verify 200' 'POST /api/auth/login 200' 'POST /api/auth/login 400' 'POST /api/user/results 200' 'PUT /api/user/locale 200'; do
  printf '  %-34s %s\n' "$a" "$(printf '%s\n' "$L" | grep -c "$a")"
done
echo
echo "## 8. Visitors from the web proxy (Traefik) — only if its access log is on"
T=$(docker ps --format '{{.Names}} {{.Image}}' | grep -i traefik | awk '{print $1}' | head -1)
if [ -n "$T" ]; then
  echo "traefik_container: $T"
  AL=$(docker inspect "$T" -f '{{join .Args " "}} {{join .Config.Cmd " "}}' 2>/dev/null | tr ' ' '\n' | grep -i 'accesslog' | tr '\n' ' ')
  echo "accesslog_flags: ${AL:-none found}"
  F=$(printf '%s' "$AL" | tr ' ' '\n' | grep -i 'accesslog.filepath=' | cut -d= -f2)
  if [ -n "$F" ]; then A=$(docker exec "$T" sh -c "cat $F 2>/dev/null"); else A=$(docker logs "$T" --since "$((DAYS*24))h" 2>&1); fi
  W=$(printf '%s\n' "$A" | grep -E 'cps-main|wikigai\.digitradin\.cloud' | grep -vE '"GET /(api|assets|health|favicon)')
  echo "proxy_requests_pages: $(printf '%s\n' "$W" | grep -c .)"
  echo "unique_visitors (distinct IPs, count only): $(printf '%s\n' "$W" | awk '{print $1}' | grep -E '^[0-9a-f.:]+$' | sort -u | grep -c .)"
  echo "unique visitors per day:"
  printf '%s\n' "$W" | sed -nE 's/^([0-9a-f.:]+) .*\[([0-9]{2}\/[A-Za-z]{3}\/[0-9]{4}).*/\2 \1/p' | sort -u | awk '{print $1}' | uniq -c
else
  echo "no traefik container found"
fi
echo
echo "END"
REMOTE
cat "$OUT"
echo
echo "✅ Saved to $OUT — tell Claude it's ready."
read -r -p "Press Enter to close"
