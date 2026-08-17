#!/usr/bin/env bash
# agent-guard.sh — PreToolUse gate for the agentic delivery kit.
#
# settings.json holds ONE permission set for the whole session, and its patterns
# match the literal command string. That leaves three jobs it cannot do, which
# are exactly this script's three jobs:
#
#   1. TWO TIERS. A subagent inherits the session's permissions; there is no
#      per-agent rule syntax. This hook reads `agent_type` — present only inside
#      a subagent — so the 8 role agents keep the restrictions they had before
#      the judge existed, while the orchestrator gets the wider set.
#
#   2. PATH-AWARE rm. `Bash(rm -rf:*)` in deny is all-or-nothing: it blocks
#      cleaning a build directory as firmly as wiping /etc. Here the targets are
#      parsed: inside a project it is routine, a whole project root is an app
#      deletion (ask), anywhere else is refused.
#
#   3. PRODUCTION PROJECTS. "already live" is a fact, not a text pattern. Any
#      project listed in ~/.claude/production-projects escalates mutating
#      commands to a prompt, whatever the command happens to be called.
#
# CONTRACT: always exit 0. Printing nothing means "no opinion" and the normal
# flow continues (deny rules, then ask rules, then the auto-mode classifier).
# Printing a decision short-circuits that flow — except deny rules, which win
# over any hook output, so this script can never widen what settings.json forbids.
#
# Run `agent-guard.sh --self-test` to exercise the decision table (used by CI).

set -uo pipefail

PRODUCTION_LIST="${CLAUDE_PRODUCTION_PROJECTS:-$HOME/.claude/production-projects}"
PROJECTS_ROOT="${CLAUDE_PROJECTS_ROOT:-$HOME/projects}"

# Commands reserved to the orchestrator: server surface, publication, and
# anything that reaches production. Role agents propose these and return them;
# they never run them. This is the pre-judge behaviour, preserved verbatim.
ORCHESTRATOR_ONLY='(^|[;&|[:space:]])(sudo|nginx|certbot|systemctl|ufw|dropdb|psql|mysql)([[:space:]]|$)|pm2[[:space:]]+(delete|stop)|git[[:space:]]+(push|merge)|(firebase|npm[[:space:]]+run|yarn|pnpm|npx[[:space:]]+firebase)[[:space:]]+deploy|prisma[[:space:]]+migrate[[:space:]]+deploy|eas[[:space:]]+submit|(supabase|firebase)[[:space:]]+projects[:[:space:]]*delete'

# Commands that change a running system. Harmless on a scratch project, worth a
# prompt on one that is already serving users.
MUTATING='(^|[;&|[:space:]])(rm|nginx|certbot|systemctl|sudo)([[:space:]]|$)|pm2[[:space:]]+(restart|reload|stop|delete|start)|git[[:space:]]+(push|merge)|deploy|migrate|db[[:space:]]+(push|reset)|eas[[:space:]]+(submit|update)'

emit() { # emit <allow|deny|ask> <reason>
  jq -cn --arg d "$1" --arg r "$2" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
  exit 0
}

# Expand ~ and relative paths so the safe-zone test compares real locations.
abs_path() {
  local p="$1"
  case "$p" in
    '~')    p="$HOME" ;;
    '~/'*)  p="$HOME/${p#\~/}" ;;
    '$HOME') p="$HOME" ;;
    '$HOME/'*) p="$HOME/${p#\$HOME/}" ;;
    /*)     ;;
    *)      p="${CWD:-$PWD}/$p" ;;
  esac
  # Collapse the ../ that a traversal attempt would rely on, without needing the
  # path to exist (realpath -m is not portable enough to depend on here).
  local out=() part
  local IFS='/'
  for part in $p; do
    case "$part" in
      ''|.) continue ;;
      ..)   [ ${#out[@]} -gt 0 ] && unset 'out[${#out[@]}-1]' ;;
      *)    out+=("$part") ;;
    esac
  done
  printf '/%s' "${out[@]}"
}

# Where does a path sit relative to the projects root?
#   inside  — below a project directory: ordinary work
#   root    — a whole project directory: deleting an entire app
#   outside — anywhere else: not this agent's business
classify_path() {
  local p; p="$(abs_path "$1")"
  case "$p" in
    "$PROJECTS_ROOT"/*/*) printf 'inside' ;;
    "$PROJECTS_ROOT"/*)   printf 'root' ;;
    /tmp/*)               printf 'inside' ;;
    *)                    printf 'outside' ;;
  esac
}

# Walk the tokens of an rm invocation and report the worst target it touches.
rm_verdict() {
  local cmd="$1" tok in_rm=0 worst='' cls
  # Deliberate word splitting: we are inspecting shell tokens.
  # shellcheck disable=SC2086
  set -- $cmd
  for tok in "$@"; do
    case "$tok" in
      rm)                  in_rm=1; continue ;;
      '&&'|'||'|';'|'|')   in_rm=0; continue ;;
    esac
    [ "$in_rm" = 1 ] || continue
    case "$tok" in -*) continue ;; esac
    cls="$(classify_path "$tok")"
    case "$cls" in
      outside) worst='outside'; break ;;
      root)    worst='root' ;;
      inside)  [ -n "$worst" ] || worst='inside' ;;
    esac
  done
  printf '%s' "${worst:-inside}"
}

# Which project does this working directory belong to?
project_of() {
  local d; d="$(abs_path "${1:-$PWD}")"
  case "$d" in
    "$PROJECTS_ROOT"/*) d="${d#"$PROJECTS_ROOT"/}"; printf '%s' "${d%%/*}" ;;
    *) printf '' ;;
  esac
}

is_production() {
  local name="$1"
  [ -n "$name" ] || return 1
  [ -f "$PRODUCTION_LIST" ] || return 1
  # One project per line; '#' comments and blank lines ignored.
  grep -qxF -- "$name" <(sed -e 's/#.*//' -e 's/[[:space:]]*$//' "$PRODUCTION_LIST" | grep -v '^$')
}

evaluate() { # evaluate <agent_type> <command> <cwd>  → prints decision JSON or nothing
  local agent_type="$1" cmd="$2" scan
  CWD="$3"

  # Quoted text is DATA, not a command. A commit message or a grep pattern that
  # merely mentions `firebase projects:delete` is not an attempt to run it —
  # this hook refused its own commit over exactly that. So strip quoted segments
  # before pattern-matching, EXCEPT when the command hands a string to a shell,
  # where the quoted part really is the command being run.
  scan="$cmd"
  if ! printf '%s' "$cmd" \
       | grep -Eq '(^|[;&|[:space:]])(sh|bash|zsh|dash|ksh|eval|env|xargs|timeout|nohup)([[:space:]]|$)'; then
    scan="$(printf '%s' "$cmd" | sed -e "s/'[^']*'/''/g" -e 's/"[^"]*"/""/g')"
  fi

  # -- 1. Path-aware rm, before anything else: the worst outcome on this list.
  # Detected on the stripped text, but targets are read from the real command.
  if printf '%s' "$scan" | grep -Eq '(^|[;&|[:space:]])rm([[:space:]]|$)'; then
    case "$(rm_verdict "$cmd")" in
      outside)
        emit deny "Refused: this rm reaches outside $PROJECTS_ROOT. Deleting files outside a project is not something an agent does unattended — tell the user the exact path and let them run it." ;;
      root)
        emit ask "This deletes an entire project directory under $PROJECTS_ROOT, not files inside one. Confirm you want the whole app removed." ;;
    esac
  fi

  # -- 2. Two tiers: role agents keep their pre-judge restrictions.
  if [ -n "$agent_type" ] && printf '%s' "$scan" | grep -Eq "$ORCHESTRATOR_ONLY"; then
    emit deny "Reserved to the orchestrator (you are running as '$agent_type'). Return the exact command and why it is needed; the orchestrator runs it."
  fi

  # -- 3. Projects that are already live.
  local project; project="$(project_of "$CWD")"
  if is_production "$project" && printf '%s' "$scan" | grep -Eq "$MUTATING"; then
    emit ask "'$project' is listed as running in production ($PRODUCTION_LIST). This command changes it. Confirm, refuse, or say what to do instead."
  fi

  return 0
}

self_test() {
  local fails=0 got
  check() { # check <label> <expected: allow|deny|ask|none> <agent> <cmd> <cwd>
    got="$( evaluate "$3" "$4" "$5" | jq -r '.hookSpecificOutput.permissionDecision // "none"' 2>/dev/null )"
    [ -n "$got" ] || got=none
    if [ "$got" = "$2" ]; then
      printf 'PASS  %-52s -> %s\n' "$1" "$got"
    else
      printf 'FAIL  %-52s -> %s (expected %s)\n' "$1" "$got" "$2" >&2
      fails=$((fails + 1))
    fi
  }

  local P="$PROJECTS_ROOT"
  # Path-aware rm
  check "rm inside a project"          none  ""        "rm -rf node_modules"        "$P/demo"
  check "rm of a whole project"        ask   ""        "rm -rf $P/demo"             "$P"
  check "rm outside the projects root" deny  ""        "rm -rf /etc/nginx"          "$P/demo"
  check "rm traversal out of a project" deny ""        "rm -rf $P/demo/../../.ssh"  "$P/demo"
  check "rm in /tmp"                   none  ""        "rm -rf /tmp/build"          "$P/demo"
  # Two tiers
  check "builder cannot reload nginx"  deny  "builder" "sudo systemctl reload nginx" "$P/demo"
  check "builder cannot push"          deny  "builder" "git push origin feature/x"   "$P/demo"
  check "builder can run tests"        none  "builder" "npm test"                    "$P/demo"
  check "orchestrator may reload nginx" none ""        "sudo systemctl reload nginx" "$P/demo"
  check "devops cannot deploy alone"   deny  "devops"  "firebase deploy"             "$P/demo"
  # Quoted text is data, not commands. Every case below is a real command this
  # hook wrongly refused, or would have: the first one blocked its own commit.
  check "commit message naming a sensitive command" \
                                       none  "claude"  "git commit -m \"restore firebase projects:delete in ask\"" "$P/demo"
  check "grep for a sensitive command"  none  "builder" "grep -rn 'sudo systemctl' ."  "$P/demo"
  check "echo describing a deploy"      none  "devops"  "echo 'run firebase deploy next'" "$P/demo"
  check "rm mentioned in a commit msg"  none  "claude"  "git commit -m \"guard rm -rf /etc\"" "$P/demo"
  # ...but a shell invoker really does run its quoted argument.
  check "sh -c hiding a server command" deny  "builder" "sh -c \"sudo systemctl stop nginx\"" "$P/demo"
  check "bash -c hiding a push"         deny  "builder" "bash -c 'git push origin main'" "$P/demo"

  # Production projects
  local tmp; tmp="$(mktemp)"; printf '# live\nlive-app\n' > "$tmp"
  PRODUCTION_LIST="$tmp"
  check "mutating a live project asks" ask   ""        "pm2 restart live-app"        "$P/live-app"
  check "reading a live project is ok" none  ""        "npm test"                    "$P/live-app"
  check "mutating a scratch project"   none  ""        "pm2 restart demo"            "$P/demo"
  rm -f "$tmp"

  if [ "$fails" -gt 0 ]; then
    printf '\n%d self-test failure(s).\n' "$fails" >&2
    return 1
  fi
  printf '\nagent-guard: all self-tests passed.\n'
}

if [ "${1:-}" = "--self-test" ]; then
  self_test
  exit $?
fi

command -v jq >/dev/null || exit 0   # no jq, no opinion — never block on tooling

payload="$(cat)"
# Malformed input is not our problem to report: stay silent, stay non-blocking.
[ "$(jq -r '.tool_name // ""' <<<"$payload" 2>/dev/null)" = "Bash" ] || exit 0

evaluate \
  "$(jq -r '.agent_type // ""'          <<<"$payload" 2>/dev/null)" \
  "$(jq -r '.tool_input.command // ""'  <<<"$payload" 2>/dev/null)" \
  "$(jq -r '.cwd // ""'                 <<<"$payload" 2>/dev/null)"
exit 0
