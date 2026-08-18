#!/usr/bin/env bash
# Explicit, idempotent Codex MCP registration. Does not copy Claude credentials.
set -euo pipefail

INSTALL_PLAYWRIGHT=0
INSTALL_CONTEXT7=0
INSTALL_DEVTOOLS=0

usage() {
  cat <<'EOF'
Usage: ./setup/codex-mcp-setup.sh [options]

With no option, only prints Codex MCP status.
  --playwright       Browser/DOM and interaction audits (required for visual UX)
  --context7         Current library documentation (optional)
  --chrome-devtools  Network/performance inspection (optional)
  --all-safe         Register all three non-authenticated servers

Figma and Mobbin are intentionally not registered here: they may require OAuth,
accounts, or paid access. GitHub tokens are never copied from Claude config.
EOF
}

for argument in "$@"; do
  case "$argument" in
    --playwright) INSTALL_PLAYWRIGHT=1 ;;
    --context7) INSTALL_CONTEXT7=1 ;;
    --chrome-devtools) INSTALL_DEVTOOLS=1 ;;
    --all-safe) INSTALL_PLAYWRIGHT=1; INSTALL_CONTEXT7=1; INSTALL_DEVTOOLS=1 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $argument" >&2; usage >&2; exit 2 ;;
  esac
done

command -v codex >/dev/null || { echo "ERROR: codex is not installed" >&2; exit 1; }
command -v jq >/dev/null || { echo "ERROR: jq is required" >&2; exit 1; }

current="$(codex mcp list --json)"
mcp_present() { jq -e --arg name "$1" '.[] | select(.name == $name)' <<<"$current" >/dev/null; }
add_if_missing() {
  local name="$1"; shift
  if mcp_present "$name"; then
    echo "preserved: Codex MCP $name"
    return
  fi
  codex mcp add "$name" -- "$@"
  echo "registered: Codex MCP $name"
  current="$(codex mcp list --json)"
}

if [[ "$INSTALL_PLAYWRIGHT" -eq 1 ]]; then
  browser_output="$HOME/.local/state/agentic-kit/supervisor/browser-evidence"
  mkdir -p "$browser_output"
  chmod 700 "$browser_output"
  add_if_missing playwright npx -y @playwright/mcp@latest --isolated --headless --block-service-workers --output-dir "$browser_output"
fi

if [[ "$INSTALL_CONTEXT7" -eq 1 ]]; then
  # Use the official local package in basic mode. The remote endpoint currently
  # starts an interactive OAuth flow in Codex, which must never be accepted by
  # an unattended setup script.
  add_if_missing context7 npx -y @upstash/context7-mcp@latest
fi

if [[ "$INSTALL_DEVTOOLS" -eq 1 ]]; then
  add_if_missing chrome-devtools npx -y chrome-devtools-mcp@latest --headless --no-usage-statistics --no-performance-crux
fi

echo
codex mcp list
echo
echo "Figma: optional, requires a separately authorized Codex-compatible server."
echo "Mobbin: optional, may require a paid account and OAuth; no setup was attempted."
