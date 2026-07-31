#!/usr/bin/env bash
# preview-deploy.sh — stand up (or refresh) a per-branch/PR preview environment
# for a web project, on a namespaced subdomain, behind shared Basic Auth.
#
# This is the ONLY sanctioned entry point to nginx/certbot/pm2 for previews —
# raw nginx/certbot/systemctl stay denied in settings.json, and pm2 delete is
# denied too. The namespace is enforced in code: this script refuses to touch
# anything outside <project>-<slug>.<PREVIEW_DOMAIN> / pm2 process
# `preview-<project>-<slug>`, so an agent cannot trick it into touching the
# production vhost or the production pm2 process of the same project.
#
# Usage:   preview-deploy.sh <project> <branch-or-pr-slug> <local-port>
# Env:     PREVIEW_DOMAIN (required)     e.g. preview.example.tld
#          CERTBOT_EMAIL (required)      cert expiry notices
#          PREVIEW_HTPASSWD (optional)   default: ~/.preview-htpasswd
set -euo pipefail

project="${1:?usage: preview-deploy.sh <project> <slug> <port>}"
raw_slug="${2:?usage: preview-deploy.sh <project> <slug> <port>}"
port="${3:?usage: preview-deploy.sh <project> <slug> <port>}"
domain="${PREVIEW_DOMAIN:?export PREVIEW_DOMAIN=preview.yourdomain.tld first}"
: "${CERTBOT_EMAIL:?export CERTBOT_EMAIL=you@example.com first}"
htpasswd_file="${PREVIEW_HTPASSWD:-$HOME/.preview-htpasswd}"

# Slug is derived, not trusted verbatim: lowercased, non [a-z0-9] collapsed to
# '-'. This is what keeps the vhost/pm2 name inside the preview namespace.
slug="$(printf '%s' "$raw_slug" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | tr -s '-' | sed 's/^-\|-$//g')"
[ -n "$slug" ] || { echo "REFUSED: slug '$raw_slug' has no usable characters." >&2; exit 1; }

host="${project}-${slug}.${domain}"
pm2_name="preview-${project}-${slug}"
vhost_file="/etc/nginx/sites-available/${host}"

echo "== Preview: https://${host} -> 127.0.0.1:${port}  (pm2: ${pm2_name}) =="

# Shared Basic Auth credentials for ALL previews on this VPS (never the
# production site): generated once, reused across every project's previews.
# This — not a per-preview gate — is what makes an unlisted public subdomain
# acceptable without stopping for G4/G5 on every single deploy.
if [ ! -f "$htpasswd_file" ]; then
  pass="$(openssl rand -base64 18)"
  printf 'preview:%s\n' "$(openssl passwd -apr1 "$pass")" > "$htpasswd_file"
  echo "Created shared preview credentials — user: preview / pass: ${pass}"
  echo "(relay this password to the user ONCE; only the hash is kept on disk)"
fi

if pm2 describe "$pm2_name" >/dev/null 2>&1; then
  pm2 restart "$pm2_name"
else
  pm2 start npm --name "$pm2_name" --cwd "$(pwd)" -- start -- --port "$port"
fi
pm2 save

sudo tee "$vhost_file" >/dev/null <<NGINX
server {
    listen 80;
    server_name ${host};
    auth_basic "Preview";
    auth_basic_user_file ${htpasswd_file};
    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
sudo ln -sf "$vhost_file" "/etc/nginx/sites-enabled/${host}"
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d "$host" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect

echo "READY: https://${host}  (Basic Auth user: preview — see credentials above, or ask devops agent-memory for the current password)"
