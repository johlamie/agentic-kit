#!/usr/bin/env bash
# Remove service/link integration while preserving audit state and user config.
set -euo pipefail

SUPERVISOR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_LINK="$HOME/.local/bin/agentic-supervisor"
SKILLS_ROOT="$HOME/.agents/skills"

if command -v pm2 >/dev/null && pm2 describe agentic-supervisor >/dev/null 2>&1; then
  pm2 delete agentic-supervisor
  pm2 save
fi

if [[ -L "$CLI_LINK" ]] && [[ "$(readlink -f "$CLI_LINK")" == "$SUPERVISOR_ROOT/bin/agentic-supervisor" ]]; then
  rm -f "$CLI_LINK"
fi

for skill in "$SUPERVISOR_ROOT"/skills/*; do
  [[ -d "$skill" ]] || continue
  target="$SKILLS_ROOT/$(basename "$skill")"
  if [[ -L "$target" ]] && [[ "$(readlink -f "$target")" == "$skill" ]]; then
    rm -f "$target"
  fi
done

cat <<'EOF'
Supervisor service and repository-owned links removed.

Preserved deliberately:
  ~/.config/agentic-kit/supervisor.env
  ~/.config/agentic-kit/supervisor-hook-token
  ~/.local/state/agentic-kit/supervisor/

To disable hook forwarding without uninstalling Claude Kit, set
SUPERVISOR_LEVEL=off and stop the PM2 process. Remove preserved files manually
only after reviewing them; this script never deletes audit history or secrets.
EOF
