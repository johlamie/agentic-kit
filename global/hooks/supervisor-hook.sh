#!/usr/bin/env bash
# Fast, fail-open transport from Claude lifecycle hooks to the local Supervisor.
# The existing agent-guard remains the independent permission enforcement hook.
set -uo pipefail

# Claude invokes this file through ~/.claude/hooks, which is normally a symlink
# to global/hooks. Resolve the file itself before deriving the repository root;
# otherwise the launcher silently looks for ~/supervisor instead of the kit.
SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
KIT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FORWARDER="$KIT_ROOT/supervisor/dist/src/hooks/forwarder.js"

if [[ ! -f "$FORWARDER" ]] || ! command -v node >/dev/null; then
  exit 0
fi

node "$FORWARDER" 2>/dev/null || true
exit 0
