#!/usr/bin/env bash
# After a deploy: has every page rendered anew with what the CMS holds
# (/next/refresh). The image is built without a database – its pages carry
# the code's own stamp colors and texts until then.
#
# Runs ON THE HETZNER SERVER, by the deploy pipeline right after the new
# container is up – or by hand:
#   cd /opt/apps/boop && bash scripts/refresh-pages.sh
#
# Like setup-cron.sh it calls the route INSIDE the container (no port on the
# host), with node (no curl in the image). The app needs a moment to start:
# it tries for about a minute.
set -euo pipefail

APP_DIR="/opt/apps/boop"
ENV_FILE="${APP_DIR}/.env"
cd "$APP_DIR"

CRON_SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"'')"
if [ -z "${CRON_SECRET}" ]; then
  echo "✗ CRON_SECRET is not set in ${ENV_FILE} – pages not refreshed." >&2
  exit 1
fi

URL="http://localhost:3000/next/refresh?secret=${CRON_SECRET}"
for attempt in $(seq 1 20); do
  if docker compose exec -T boop node -e 'require("http").get(process.argv[1],r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on("error",()=>process.exit(1))' "$URL" >/dev/null 2>&1; then
    echo "✓ Pages refreshed (attempt ${attempt})."
    exit 0
  fi
  sleep 3
done
echo "✗ The app didn't answer – pages not refreshed. Saving “Site” in the admin does it too." >&2
exit 1
