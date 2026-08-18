#!/usr/bin/env bash
# bootstrap-vps.sh — Fresh Ubuntu 22.04 VPS → full agentic dev environment
# Run as a sudo-capable NON-root user. Review before running; idempotent-ish.
set -euo pipefail

echo "== [1/8] System packages =="
sudo apt-get update -y
sudo apt-get install -y git curl unzip build-essential python3-pip python3-venv \
  nginx certbot python3-certbot-nginx ufw sqlite3 jq

echo "== [2/8] Node.js 22 + global tools =="
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo npm install -g pm2 firebase-tools eas-cli

# OpenAI's current supported npm package for the Codex CLI. Do not replace or
# downgrade an existing install; `codex update` owns upgrades after bootstrap.
if ! command -v codex >/dev/null; then
  sudo npm install -g @openai/codex
fi
codex --version
node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(":memory:"); db.exec("select 1"); db.close();' >/dev/null

# Install Claude Code as a user-owned native binary. Anthropic discourages a
# sudo-owned global npm install because it prevents automatic updates.
if command -v claude >/dev/null; then
  claude install stable
else
  curl -fsSL https://claude.ai/install.sh | bash
fi
export PATH="$HOME/.local/bin:$PATH"
command -v claude >/dev/null || {
  echo "ERROR: Claude Code was installed but is not available on PATH." >&2
  # Single quotes on purpose: this line is meant to be copied verbatim into a
  # shell profile, where $HOME expands then — not here.
  # shellcheck disable=SC2016
  echo 'Add export PATH="$HOME/.local/bin:$PATH" to your shell profile.' >&2
  exit 1
}

echo "== [3/8] Supabase CLI =="
if ! command -v supabase >/dev/null; then
  ARCH=$(dpkg --print-architecture) # amd64 / arm64
  curl -fsSL -o /tmp/supabase.deb \
    "https://github.com/supabase/cli/releases/latest/download/supabase_linux_${ARCH}.deb"
  sudo dpkg -i /tmp/supabase.deb
fi

echo "== [4/8] Playwright (browsers + deps for headless QA) =="
npx -y playwright install --with-deps chromium

echo "== [5/8] Firewall (adjust SSH port to your setup BEFORE enabling) =="
sudo ufw allow 22/tcp   # SSH — change if your sshd listens elsewhere
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "== [6/8] Install the agentic kit globally (symlinks: git-editable) =="
mkdir -p ~/projects
"$(dirname "$0")/link-kit.sh"

echo "== [7/8] Verify Supervisor prerequisites =="
for required in codex node npm sqlite3 pm2 jq; do
  command -v "$required" >/dev/null || { echo "ERROR: missing Supervisor prerequisite: $required" >&2; exit 1; }
done

echo "== [8/8] PM2 boot persistence =="
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1 | sudo bash || true

cat << 'EOF'

DONE. Manual steps remaining:
  1. Authenticate Claude Code:    claude   (first run, follow login)
  2. Authenticate Codex:          codex    (first run, follow login)
  3. Register Claude MCP servers: ./setup/mcp-setup.sh
  4. Install the Supervisor:      ./setup/supervisor-setup.sh
  5. Register Codex browser MCP:  ./setup/codex-mcp-setup.sh --playwright --context7
  6. Login CLIs used by devops:   supabase login · firebase login --no-localhost
  7. Point wildcard DNS manually if the product needs per-project subdomains.
  8. Verify the complete kit:     ./scripts/check-runtime.sh
EOF
