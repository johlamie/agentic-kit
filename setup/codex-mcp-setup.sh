#!/usr/bin/env bash
# Explicit, idempotent Codex MCP registration. Does not copy Claude credentials.
set -euo pipefail

INSTALL_PLAYWRIGHT=0
INSTALL_CONTEXT7=0
INSTALL_DEVTOOLS=0
INSTALL_MOBBIN=0
INSTALL_GITHUB_READONLY=0
OAUTH_CALLBACK_PORT=8765

usage() {
  cat <<'EOF'
Usage: ./setup/codex-mcp-setup.sh [options]

With no option, only prints Codex MCP status.
  --playwright       Browser/DOM and interaction audits (required for visual UX)
  --context7         Current library documentation (optional)
  --chrome-devtools  Network/performance inspection (optional)
  --mobbin           Official Mobbin remote server (OAuth required after registration)
  --github-readonly  Official GitHub repos/PRs and Actions servers, read-only (PAT required)
  --all-safe         Register all three non-authenticated servers

The installed Codex CLI may start OAuth discovery immediately after adding an
OAuth remote server. This script interrupts that interactive wait and never
accepts OAuth. GitHub uses a separately created, read-only fine-grained PAT via
GITHUB_PAT_TOKEN because its remote server does not support dynamic client
registration. Tokens are never copied from Claude config or stored here.
EOF
}

for argument in "$@"; do
  case "$argument" in
    --playwright) INSTALL_PLAYWRIGHT=1 ;;
    --context7) INSTALL_CONTEXT7=1 ;;
    --chrome-devtools) INSTALL_DEVTOOLS=1 ;;
    --mobbin) INSTALL_MOBBIN=1 ;;
    --github-readonly) INSTALL_GITHUB_READONLY=1 ;;
    --all-safe) INSTALL_PLAYWRIGHT=1; INSTALL_CONTEXT7=1; INSTALL_DEVTOOLS=1 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $argument" >&2; usage >&2; exit 2 ;;
  esac
done

command -v codex >/dev/null || { echo "ERROR: codex is not installed" >&2; exit 1; }
command -v jq >/dev/null || { echo "ERROR: jq is required" >&2; exit 1; }
command -v timeout >/dev/null || { echo "ERROR: timeout is required" >&2; exit 1; }

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
add_http_if_missing() {
  local name="$1"
  local url="$2"
  if mcp_present "$name"; then
    echo "preserved: Codex MCP $name"
    return
  fi
  # Current Codex versions can begin OAuth as part of `mcp add`. Bound and hide
  # that transient flow: only registration is automated; authorization is not.
  if timeout --signal=INT --kill-after=2s 5s codex mcp add "$name" --url "$url" >/dev/null 2>&1; then
    :
  fi
  current="$(codex mcp list --json)"
  if ! mcp_present "$name"; then
    echo "ERROR: failed to register Codex MCP $name" >&2
    return 1
  fi
  echo "registered: Codex MCP $name (authentication pending)"
}
add_http_with_bearer() {
  local name="$1"
  local url="$2"
  local token_env="$3"
  if jq -e --arg name "$name" --arg url "$url" --arg token_env "$token_env" \
    '.[] | select(.name == $name and .transport.url == $url and .transport.bearer_token_env_var == $token_env)' \
    <<<"$current" >/dev/null; then
    echo "preserved: Codex MCP $name"
    return
  fi
  if mcp_present "$name"; then
    codex mcp remove "$name" >/dev/null
    echo "updated: removed incompatible Codex MCP $name registration"
    current="$(codex mcp list --json)"
  fi
  codex mcp add "$name" --url "$url" --bearer-token-env-var "$token_env" >/dev/null
  current="$(codex mcp list --json)"
  if ! jq -e --arg name "$name" --arg url "$url" --arg token_env "$token_env" \
    '.[] | select(.name == $name and .transport.url == $url and .transport.bearer_token_env_var == $token_env)' \
    <<<"$current" >/dev/null; then
    echo "ERROR: failed to register Codex MCP $name with bearer-token environment" >&2
    return 1
  fi
  echo "registered: Codex MCP $name (GITHUB_PAT_TOKEN required at runtime)"
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

if [[ "$INSTALL_MOBBIN" -eq 1 ]]; then
  add_http_if_missing mobbin https://api.mobbin.com/mcp
fi

if [[ "$INSTALL_GITHUB_READONLY" -eq 1 ]]; then
  # Keep repository/PR access and CI access separate so each remote endpoint
  # exposes only its documented read tools. The remote GitHub server does not
  # support dynamic OAuth client registration, so use a separate fine-grained
  # PAT from the process environment without putting it in Codex configuration.
  add_http_with_bearer github https://api.githubcopilot.com/mcp/readonly GITHUB_PAT_TOKEN
  add_http_with_bearer github-actions https://api.githubcopilot.com/mcp/x/actions/readonly GITHUB_PAT_TOKEN
fi

echo
codex mcp list
echo
echo "Figma: optional, requires a separately authorized Codex-compatible server."
if [[ "$INSTALL_MOBBIN" -eq 1 ]]; then
  echo "Mobbin OAuth (human action): codex mcp login mobbin -c mcp_oauth_callback_port=$OAUTH_CALLBACK_PORT"
else
  echo "Mobbin: optional; register with --mobbin (eligible paid plan and human OAuth required)."
fi
if [[ "$INSTALL_GITHUB_READONLY" -eq 1 ]]; then
  echo "GitHub PAT (human action): set GITHUB_PAT_TOKEN in the private Supervisor environment."
  echo "GitHub OAuth login is not used: the remote server does not support dynamic client registration."
else
  echo "GitHub: optional; register read-only repos/PRs and CI with --github-readonly, then set GITHUB_PAT_TOKEN."
fi
