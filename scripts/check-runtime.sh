#!/usr/bin/env bash
# Post-install diagnostic for a real VPS. It does not change configuration.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

"$ROOT/scripts/validate-kit.sh"
"$ROOT/scripts/smoke-install.sh"

required_commands=(claude node npm git jq)
optional_commands=(pm2 supabase firebase eas nginx certbot)

for command_name in "${required_commands[@]}"; do
  command -v "$command_name" >/dev/null || {
    echo "FAIL  required command unavailable: $command_name" >&2
    exit 1
  }
  echo "PASS  required command available: $command_name"
done

for command_name in "${optional_commands[@]}"; do
  if command -v "$command_name" >/dev/null; then
    echo "PASS  delivery command available: $command_name"
  else
    echo "WARN  delivery command unavailable: $command_name"
  fi
done

claude --version
claude doctor

echo
echo "MCP status (authentication failures require manual action):"
claude mcp list || {
  echo "WARN  one or more MCP servers are unavailable or unauthenticated" >&2
}
