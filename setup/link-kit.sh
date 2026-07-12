#!/usr/bin/env bash
# link-kit.sh — Install the kit into ~/.claude/ using SYMLINKS, so that any
# improvement you make on the VPS lives inside the git repo and can be committed.
# Run from the repo: ./setup/link-kit.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
CLAUDE_DIR="$HOME/.claude"

echo "Repo: $REPO"
mkdir -p "$CLAUDE_DIR"

# Backup anything real that we are about to replace with a symlink
STAMP="$(date +%F-%H%M)"
for item in CLAUDE.md settings.json agents skills templates; do
  target="$CLAUDE_DIR/$item"
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "Backing up existing $item -> $item.bak-$STAMP"
    mv "$target" "$target.bak-$STAMP"
  fi
  rm -f "$target"
  ln -s "$REPO/global/$item" "$target"
  echo "linked: ~/.claude/$item -> global/$item"
done

# These stay LOCAL, never symlinked into the repo (machine-specific / sensitive):
#   ~/.claude/agent-memory/   (user-scope agent memories: server map, preferences)
#   ~/.claude/settings.local.json  (personal overrides, not versioned)
mkdir -p "$CLAUDE_DIR/agent-memory"

cat << 'EOF'

Done. Now:
  - Edit agents/skills directly in the repo (or let Claude edit them there);
    changes are live immediately in ~/.claude/.
  - Commit improvements:  git add -A && git commit -m "feat(kit): new skill X"
  - Verify in claude:     /agents   and   /permissions
EOF
