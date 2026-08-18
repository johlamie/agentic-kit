#!/usr/bin/env bash
# Install or reload the local-only Supervisor process in the current user's PM2.
set -euo pipefail

SUPERVISOR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_ROOT="${SUPERVISOR_DATA_DIR:-$HOME/.local/state/agentic-kit/supervisor}"

command -v pm2 >/dev/null || {
  echo "ERROR: pm2 is required. Install it with: npm install --global pm2" >&2
  exit 1
}
[[ -f "$SUPERVISOR_ROOT/dist/src/index.js" ]] || {
  echo "ERROR: Supervisor is not built. Run: cd $SUPERVISOR_ROOT && npm ci && npm run build" >&2
  exit 1
}

mkdir -p "$STATE_ROOT/logs"
chmod 700 "$STATE_ROOT" "$STATE_ROOT/logs"
pm2 startOrReload "$SUPERVISOR_ROOT/ecosystem.config.cjs" --only agentic-supervisor
pm2 save

echo "Supervisor service installed."
echo "  status: agentic-supervisor status"
echo "  logs:   pm2 logs agentic-supervisor"
