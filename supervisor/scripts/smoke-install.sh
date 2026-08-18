#!/usr/bin/env bash
# Exercise setup UX in an isolated HOME with fake external CLIs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_HOME="$(mktemp -d)"
trap 'rm -rf "$TEST_HOME"' EXIT
mkdir -p "$TEST_HOME/bin"

make_fake() {
  local name="$1"
  shift
  {
    echo '#!/usr/bin/env bash'
    printf '%s\n' "$@"
  } > "$TEST_HOME/bin/$name"
  chmod +x "$TEST_HOME/bin/$name"
}

# These strings become the bodies of fake scripts; expansion belongs there.
# shellcheck disable=SC2016
make_fake node \
  'if [[ "${1:-}" == "-p" ]]; then echo 22; exit 0; fi' \
  'if [[ "${1:-}" == "-e" && "${2:-}" == *randomBytes* ]]; then printf "%064d" 0; fi' \
  'exit 0'
# shellcheck disable=SC2016
make_fake npm 'exit 0'
# shellcheck disable=SC2016
make_fake codex 'if [[ "${1:-}" == "--version" ]]; then echo "codex-cli 0.test"; fi; exit 0'

HOME="$TEST_HOME" PATH="$TEST_HOME/bin:$PATH" "$ROOT/setup/supervisor-setup.sh" --no-start >/dev/null

[[ -L "$TEST_HOME/.local/bin/agentic-supervisor" ]]
[[ "$(readlink -f "$TEST_HOME/.local/bin/agentic-supervisor")" == "$ROOT/supervisor/bin/agentic-supervisor" ]]
HOME="$TEST_HOME" PATH="$TEST_HOME/bin:$PATH" "$TEST_HOME/.local/bin/agentic-supervisor" --help
[[ "$(stat -c '%a' "$TEST_HOME/.config/agentic-kit/supervisor.env")" == "600" ]]
[[ "$(stat -c '%a' "$TEST_HOME/.config/agentic-kit/supervisor-hook-token")" == "600" ]]
[[ "$(wc -c < "$TEST_HOME/.config/agentic-kit/supervisor-hook-token")" -eq 64 ]]

for skill in "$ROOT"/supervisor/skills/*; do
  name="$(basename "$skill")"
  [[ -L "$TEST_HOME/.agents/skills/$name" ]]
  [[ "$(readlink -f "$TEST_HOME/.agents/skills/$name")" == "$skill" ]]
done

echo "PASS  isolated Supervisor setup smoke test"
