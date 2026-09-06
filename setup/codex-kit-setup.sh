#!/usr/bin/env bash
# Install the delivery role kit; MCP authentication remains a separate step.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 "$ROOT/scripts/agentic.py" install "$@"
