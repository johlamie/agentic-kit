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
for item in CLAUDE.md settings.json agents skills templates hooks; do
  target="$CLAUDE_DIR/$item"
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "Backing up existing $item -> $item.bak-$STAMP"
    mv "$target" "$target.bak-$STAMP"
  fi
  rm -f "$target"
  ln -s "$REPO/global/$item" "$target"
  echo "linked: ~/.claude/$item -> global/$item"
done

# settings.json registers the guard as ~/.claude/hooks/agent-guard.sh; Claude Code
# runs it directly, so the executable bit has to survive a fresh clone.
chmod +x "$REPO"/global/hooks/*.sh

# The list of live projects. Agent-denied in settings.json on purpose: only the
# user adds a project here, so the agent can never quietly un-mark one.
if [ ! -f "$CLAUDE_DIR/production-projects" ]; then
  cat > "$CLAUDE_DIR/production-projects" << 'PROD'
# Projects that are LIVE. One project directory name per line.
# Any command touching one of these is escalated to you by hooks/agent-guard.sh.
# Add a project here yourself when it first ships (G4) — the agent cannot.
PROD
  echo "created: ~/.claude/production-projects (empty — add projects as they ship)"
fi

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
