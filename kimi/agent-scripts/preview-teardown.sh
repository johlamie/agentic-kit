#!/usr/bin/env bash
# preview-teardown.sh — remove a preview environment created by
# preview-deploy.sh. Run when a PR merges or closes.
#
# Usage: preview-teardown.sh <project> <branch-or-pr-slug>
set -euo pipefail

project="${1:?usage: preview-teardown.sh <project> <slug>}"
raw_slug="${2:?usage: preview-teardown.sh <project> <slug>}"
domain="${PREVIEW_DOMAIN:?export PREVIEW_DOMAIN=preview.yourdomain.tld first}"

slug="$(printf '%s' "$raw_slug" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | tr -s '-' | sed 's/^-\|-$//g')"
[ -n "$slug" ] || { echo "REFUSED: slug '$raw_slug' has no usable characters." >&2; exit 1; }

host="${project}-${slug}.${domain}"
pm2_name="preview-${project}-${slug}"

echo "== Tearing down preview: https://${host}  (pm2: ${pm2_name}) =="

pm2 delete "$pm2_name" 2>/dev/null || echo "(no pm2 process named $pm2_name — skipping)"
pm2 save

sudo rm -f "/etc/nginx/sites-enabled/${host}" "/etc/nginx/sites-available/${host}"
sudo nginx -t
sudo systemctl reload nginx
sudo certbot delete --cert-name "$host" --non-interactive || echo "(no cert named $host — skipping)"

echo "Torn down: ${host}"
