#!/usr/bin/env bash
# Build and install the independent Codex Supervisor without changing Codex MCP config.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUPERVISOR_ROOT="$ROOT/supervisor"
CONFIG_ROOT="$HOME/.config/agentic-kit"
STATE_ROOT="$HOME/.local/state/agentic-kit/supervisor"
ENV_FILE="$CONFIG_ROOT/supervisor.env"
DEFAULT_TOKEN_FILE="$CONFIG_ROOT/supervisor-hook-token"
START_SERVICE=1

usage() {
  cat <<'EOF'
Usage: ./setup/supervisor-setup.sh [--no-start]

Builds the Supervisor, creates private local configuration if absent, links the
CLI and Codex skills, and starts PM2 unless --no-start is supplied. It never
overwrites an existing env/token file and never edits Codex MCP configuration.
EOF
}

for argument in "$@"; do
  case "$argument" in
    --no-start) START_SERVICE=0 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $argument" >&2; usage >&2; exit 2 ;;
  esac
done

for command_name in node npm codex; do
  command -v "$command_name" >/dev/null || {
    echo "ERROR: required command unavailable: $command_name" >&2
    exit 1
  }
done

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
[[ "$node_major" -ge 22 ]] || { echo "ERROR: Node.js 22+ is required" >&2; exit 1; }
node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(":memory:"); db.exec("select 1"); db.close();' >/dev/null
codex --version

umask 077
mkdir -p "$CONFIG_ROOT" "$STATE_ROOT/logs" "$HOME/.local/bin" "$HOME/.agents/skills"
chmod 700 "$CONFIG_ROOT" "$STATE_ROOT" "$STATE_ROOT/logs" "$HOME/.agents" "$HOME/.agents/skills"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$SUPERVISOR_ROOT/config/supervisor.example.env" "$ENV_FILE"
  echo "created: $ENV_FILE"
else
  echo "preserved: $ENV_FILE"
fi
chmod 600 "$ENV_FILE"

token_setting="$(sed -n 's/^SUPERVISOR_HOOK_TOKEN_FILE=//p' "$ENV_FILE" | tail -n 1)"
token_setting="${token_setting%\"}"; token_setting="${token_setting#\"}"
token_setting="${token_setting%\'}"; token_setting="${token_setting#\'}"
case "$token_setting" in
  "") TOKEN_FILE="$DEFAULT_TOKEN_FILE" ;;
  \~/*) TOKEN_FILE="$HOME/${token_setting#\~/}" ;;
  /*) TOKEN_FILE="$token_setting" ;;
  *) echo "ERROR: SUPERVISOR_HOOK_TOKEN_FILE must be absolute or start with ~/" >&2; exit 1 ;;
esac
mkdir -p "$(dirname "$TOKEN_FILE")"
if [[ ! -f "$TOKEN_FILE" ]]; then
  node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))' > "$TOKEN_FILE"
  echo "created: $TOKEN_FILE"
else
  echo "preserved: $TOKEN_FILE"
fi
chmod 600 "$TOKEN_FILE"

cd "$SUPERVISOR_ROOT"
npm ci
npm run build

chmod +x "$SUPERVISOR_ROOT/bin/agentic-supervisor" "$SUPERVISOR_ROOT/scripts/"*.sh "$ROOT/global/hooks/supervisor-hook.sh"
cli_link="$HOME/.local/bin/agentic-supervisor"
if [[ -e "$cli_link" && ! -L "$cli_link" ]]; then
  echo "ERROR: refusing to overwrite non-symlink CLI at $cli_link" >&2
  exit 1
fi
ln -sfn "$SUPERVISOR_ROOT/bin/agentic-supervisor" "$cli_link"

for skill in "$SUPERVISOR_ROOT"/skills/*; do
  [[ -d "$skill" ]] || continue
  target="$HOME/.agents/skills/$(basename "$skill")"
  if [[ -e "$target" && ! -L "$target" ]]; then
    echo "WARN: preserving existing Codex skill: $target" >&2
    continue
  fi
  ln -sfn "$skill" "$target"
done

if [[ "$START_SERVICE" -eq 1 ]]; then
  "$SUPERVISOR_ROOT/scripts/install-service.sh"
else
  echo "Skipped PM2 start (--no-start)."
fi

cat <<'EOF'

Supervisor setup complete.
  Configure optional MCPs: ./setup/codex-mcp-setup.sh --playwright --context7
  Configure Telegram:      edit ~/.config/agentic-kit/supervisor.env
  Verify:                  agentic-supervisor doctor
EOF
