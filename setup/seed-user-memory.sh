#!/usr/bin/env bash
# Seed user-scope role memories from global/templates/user-memory/<role>.md into
# ~/.claude/agent-memory/<role>/MEMORY.md. Never overwrites: an existing memory
# is the user's, and the seed is only printed as a path to merge by hand.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
MEMORY_ROOT="$HOME/.claude/agent-memory"

if [[ -L "$MEMORY_ROOT" ]]; then
  echo "Refusing to seed: $MEMORY_ROOT is a symlink" >&2
  exit 1
fi
mkdir -p "$MEMORY_ROOT"

for seed in "$REPO"/global/templates/user-memory/*.md; do
  [[ -e "$seed" ]] || continue
  role="$(basename "$seed" .md)"
  target="$MEMORY_ROOT/$role/MEMORY.md"
  if [[ -L "$MEMORY_ROOT/$role" || -L "$target" ]]; then
    echo "skipped: $role (symlinked memory is not touched)" >&2
  elif [[ -e "$target" ]]; then
    echo "kept: ~/.claude/agent-memory/$role/MEMORY.md (merge new seed lines from $seed if wanted)"
  else
    mkdir -p "$MEMORY_ROOT/$role"
    cp "$seed" "$target"
    echo "seeded: ~/.claude/agent-memory/$role/MEMORY.md"
  fi
done
