#!/usr/bin/env bash
# Exercise link-kit.sh in an isolated HOME without touching the real user setup.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_HOME="$(mktemp -d)"
trap 'rm -rf "$TEST_HOME"' EXIT

HOME="$TEST_HOME" "$ROOT/setup/link-kit.sh" >/dev/null

for item in CLAUDE.md settings.json agents skills templates scripts; do
  link="$TEST_HOME/.claude/$item"
  [[ -L "$link" ]] || { echo "FAIL  missing symlink: $link" >&2; exit 1; }
  [[ -e "$link" ]] || { echo "FAIL  broken symlink: $link" >&2; exit 1; }
done

for script in git-safe-push.sh preview-deploy.sh preview-teardown.sh; do
  file="$TEST_HOME/.claude/scripts/$script"
  [[ -x "$file" ]] || { echo "FAIL  runtime script missing/not executable: $file" >&2; exit 1; }
done

[[ -d "$TEST_HOME/.claude/agent-memory" ]] || {
  echo "FAIL  user agent-memory directory was not created" >&2
  exit 1
}

cmp "$TEST_HOME/.claude/CLAUDE.md" "$ROOT/global/CLAUDE.md" >/dev/null
echo "PASS  isolated installation smoke test"
