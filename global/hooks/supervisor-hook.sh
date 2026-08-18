#!/usr/bin/env bash
# Fast, fail-open transport from Claude lifecycle hooks to the local Supervisor.
# The existing agent-guard remains the independent permission enforcement hook.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FORWARDER="$KIT_ROOT/supervisor/dist/src/hooks/forwarder.js"

if [[ ! -f "$FORWARDER" ]] || ! command -v node >/dev/null; then
  exit 0
fi

node "$FORWARDER" 2>/dev/null || true
exit 0
