#!/bin/bash
# Double-click to publish Wikigai to the Hostinger VPS (uses your SSH key).
cd "$(dirname "$0")" || exit 1
echo "▶ Publishing Wikigai to Hostinger…"
bash deploy/deploy.sh || { echo "✖ Deploy failed — see the messages above."; read -r -p "Press Enter to close"; exit 1; }
echo
echo "▶ Checking the live site"
for h in wikigai.digitradin.cloud survey.digitradin.cloud; do
  printf "%-28s " "$h"; curl -s -o /dev/null -m 20 -w "%{http_code}\n" "https://$h/" || echo "not reachable"
done
echo
echo "✅ Done. Open https://wikigai.digitradin.cloud/"
read -r -p "Press Enter to close"
