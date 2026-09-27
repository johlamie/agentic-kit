#!/usr/bin/env bash
# Exercise link-kit.sh in an isolated HOME without touching the real user setup.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_HOME="$(mktemp -d)"
trap 'rm -rf "$TEST_HOME"' EXIT

HOME="$TEST_HOME" "$ROOT/setup/link-kit.sh" >/dev/null

for item in CLAUDE.md settings.json agents skills templates hooks; do
  link="$TEST_HOME/.claude/$item"
  [[ -L "$link" ]] || { echo "FAIL  missing symlink: $link" >&2; exit 1; }
  [[ -e "$link" ]] || { echo "FAIL  broken symlink: $link" >&2; exit 1; }
done

# settings.json points PreToolUse at this exact path; if it is not executable
# after a fresh install, every hook decision silently disappears.
[[ -x "$TEST_HOME/.claude/hooks/agent-guard.sh" ]] || {
  echo "FAIL  guard hook missing or not executable in a fresh install" >&2
  exit 1
}

[[ -f "$TEST_HOME/.claude/production-projects" ]] || {
  echo "FAIL  production-projects list was not created" >&2
  exit 1
}

[[ -d "$TEST_HOME/.claude/agent-memory" ]] || {
  echo "FAIL  user agent-memory directory was not created" >&2
  exit 1
}

cmp "$TEST_HOME/.claude/agent-memory/designer/MEMORY.md" "$ROOT/global/templates/user-memory/designer.md" >/dev/null || {
  echo "FAIL  designer memory was not seeded" >&2
  exit 1
}
# Seeding is idempotent and never overwrites the user's memory.
echo "local edit" >> "$TEST_HOME/.claude/agent-memory/designer/MEMORY.md"
HOME="$TEST_HOME" "$ROOT/setup/seed-user-memory.sh" >/dev/null
grep -qx "local edit" "$TEST_HOME/.claude/agent-memory/designer/MEMORY.md" || {
  echo "FAIL  seed-user-memory.sh overwrote an existing memory" >&2
  exit 1
}

cmp "$TEST_HOME/.claude/CLAUDE.md" "$ROOT/global/CLAUDE.md" >/dev/null
echo "PASS  isolated installation smoke test"

"$ROOT/supervisor/scripts/smoke-install.sh"
