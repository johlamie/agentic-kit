#!/usr/bin/env bash
# Post-install diagnostic for a real VPS. It does not change configuration.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

"$ROOT/scripts/validate-kit.sh"
"$ROOT/scripts/smoke-install.sh"

required_commands=(claude codex node npm git jq sqlite3 pm2)
optional_commands=(supabase firebase eas nginx certbot)

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
codex --version
codex login status
node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(":memory:"); db.exec("select 1"); db.close();'
echo "PASS  Node SQLite capability is available"

# A guard hook that silently never fires is the worst failure this kit has: the
# per-agent restrictions and the production-project escalation would both be
# gone, with nothing in the output to say so. Resolve the path exactly as
# settings.json spells it, through a shell, the way Claude Code invokes it.
echo
echo "Guard hook:"
hook_path="$(jq -r '.hooks.PreToolUse[0].hooks[0].command' "$HOME/.claude/settings.json" 2>/dev/null)"
if [ -z "$hook_path" ] || [ "$hook_path" = "null" ]; then
  echo "FAIL  no PreToolUse hook registered in ~/.claude/settings.json" >&2
  exit 1
fi
resolved="$(sh -c "printf '%s' $hook_path")"
if [ ! -x "$resolved" ]; then
  echo "FAIL  hook registered as '$hook_path' resolves to '$resolved', which is not executable" >&2
  echo "      run ./setup/link-kit.sh again" >&2
  exit 1
fi
echo "PASS  hook resolves to an executable: $resolved"
if sh -c "$hook_path --self-test" >/dev/null 2>&1; then
  echo "PASS  hook decides correctly (complete decision table)"
else
  echo "FAIL  hook self-test failed: run $resolved --self-test" >&2
  exit 1
fi

if [ -f "$HOME/.claude/production-projects" ]; then
  live="$(sed -e 's/#.*//' -e 's/[[:space:]]*$//' "$HOME/.claude/production-projects" | grep -cv '^$' || true)"
  echo "PASS  production-projects list present ($live project(s) marked live)"
else
  echo "WARN  ~/.claude/production-projects missing: no project is treated as live" >&2
fi

echo
echo "Codex Supervisor:"
if command -v agentic-supervisor >/dev/null; then
  SUPERVISOR_CLI="$(command -v agentic-supervisor)"
elif [ -x "$ROOT/supervisor/bin/agentic-supervisor" ]; then
  SUPERVISOR_CLI="$ROOT/supervisor/bin/agentic-supervisor"
else
  echo "FAIL  agentic-supervisor CLI is unavailable" >&2
  exit 1
fi

if "$SUPERVISOR_CLI" status; then
  echo "PASS  Supervisor daemon, localhost receiver, DB, and queue are reachable"
else
  echo "FAIL  Supervisor daemon is not reachable; run ./setup/supervisor-setup.sh" >&2
  exit 1
fi

if "$SUPERVISOR_CLI" doctor; then
  echo "PASS  Supervisor required health checks"
else
  echo "FAIL  Supervisor doctor found a required capability failure" >&2
  exit 1
fi

if "$SUPERVISOR_CLI" mcp-status; then
  echo "PASS  Codex MCP: Playwright"
else
  echo "WARN  Codex MCP: Playwright missing/error — rendered UI audits remain uncleared" >&2
fi

if skills_output="$("$SUPERVISOR_CLI" skills)" && [ -n "$skills_output" ]; then
  skill_count="$(printf '%s\n' "$skills_output" | wc -l)"
  echo "PASS  Codex Supervisor skills available ($skill_count)"
else
  echo "FAIL  no Codex Supervisor skills found" >&2
  exit 1
fi

echo
echo "Codex MCP status (separate from Claude MCP):"
codex mcp list || {
  echo "WARN  Codex MCP listing failed" >&2
}

echo
echo "Claude MCP status (authentication failures require manual action):"
claude mcp list || {
  echo "WARN  one or more MCP servers are unavailable or unauthenticated" >&2
}
