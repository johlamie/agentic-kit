#!/usr/bin/env bash
# bootstrap-vps.sh — Fresh Ubuntu 22.04 VPS → full agentic dev environment
# Run as a sudo-capable NON-root user. Review before running; idempotent-ish.
set -euo pipefail

echo "== [1/7] System packages =="
sudo apt-get update -y
sudo apt-get install -y git curl unzip build-essential python3-pip python3-venv \
  nginx certbot python3-certbot-nginx ufw sqlite3 jq

echo "== [2/7] Node.js 22 + global tools =="
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo npm install -g pm2 firebase-tools eas-cli

# Install Kimi Code CLI as a user-owned binary (same rationale as the native
# installer in the Claude Code edition of this script: a sudo-owned global
# install breaks automatic updates).
if ! command -v kimi >/dev/null; then
  curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash
fi
export PATH="$HOME/.local/bin:$PATH"
command -v kimi >/dev/null || {
  echo "ERROR: Kimi Code was installed but is not available on PATH." >&2
  # Single quotes on purpose: this line is meant to be copied verbatim into a
  # shell profile, where $HOME expands then — not here.
  # shellcheck disable=SC2016
  echo 'Add export PATH="$HOME/.local/bin:$PATH" to your shell profile.' >&2
  exit 1
}

echo "== [3/7] Supabase CLI =="
if ! command -v supabase >/dev/null; then
  ARCH=$(dpkg --print-architecture) # amd64 / arm64
  curl -fsSL -o /tmp/supabase.deb \
    "https://github.com/supabase/cli/releases/latest/download/supabase_linux_${ARCH}.deb"
  sudo dpkg -i /tmp/supabase.deb
fi

echo "== [4/7] Playwright (browsers + deps for headless QA) =="
npx -y playwright install --with-deps chromium

echo "== [5/7] Firewall (adjust SSH port to your setup BEFORE enabling) =="
sudo ufw allow 22/tcp   # SSH — change if your sshd listens elsewhere
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "== [6/7] Install the agentic kit globally (symlinks: git-editable) =="
mkdir -p ~/projects
"$(dirname "$0")/link-kit.sh"

echo "== [7/7] PM2 boot persistence =="
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1 | sudo bash || true

cat << 'EOF'

DONE. Manual steps remaining:
  1. Authenticate Kimi Code:     kimi   (first run, follow login)
  2. Generate MCP config:        ./kimi/setup/mcp-setup.sh   (needs tokens, see comments)
     then inside kimi:           /mcp-config login mobbin   (OAuth — browser machine)
  3. Login CLIs used by devops:  supabase login · firebase login --no-localhost
  4. Point a wildcard DNS (*.yourdomain.tld) at this VPS for per-project subdomains.
  5. Validate the kit:           cd ~/agentic-kit && ./kimi/scripts/validate-kit.sh \
                                 && ./kimi/scripts/smoke-install.sh
EOF
