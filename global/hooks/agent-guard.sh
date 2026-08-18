#!/usr/bin/env bash
# agent-guard.sh — PreToolUse gate for the agentic delivery kit.
#
# settings.json holds ONE permission set for the whole session, and its patterns
# match the literal command string. This script adds the context-aware checks
# that static patterns cannot express:
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
#   4. FILE-TOOL SCOPE. Write/Edit/NotebookEdit calls are checked against the
#      current project, production list, agent rules, and protected locations.
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
# Every alternative ends on a word boundary. Without it `git merge` also matches
# `git merge-base`, a read-only lookup — which this hook duly refused once.
ORCHESTRATOR_ONLY='(^|[;&|[:space:]])(sudo|nginx|certbot|systemctl|ufw|dropdb|psql|mysql)([[:space:]]|$)|pm2[[:space:]]+(delete|stop)([[:space:]]|$)|git[[:space:]]+(push|merge)([[:space:]]|$)|(firebase|npm[[:space:]]+run|yarn|pnpm|npx[[:space:]]+firebase)[[:space:]]+deploy([[:space:]]|$)|prisma[[:space:]]+migrate[[:space:]]+deploy([[:space:]]|$)|eas[[:space:]]+submit([[:space:]]|$)|(supabase|firebase)[[:space:]]+projects[:[:space:]]*delete([[:space:]]|$)'

# Commands that change a running system. Harmless on a scratch project, worth a
# prompt on one that is already serving users.
MUTATING='(^|[;&|[:space:]])(rm|nginx|certbot|systemctl|sudo)([[:space:]]|$)|pm2[[:space:]]+(restart|reload|stop|delete|start)([[:space:]]|$)|git[[:space:]]+(push|merge)([[:space:]]|$)|deploy|migrate|db[[:space:]]+(push|reset)([[:space:]]|$)|eas[[:space:]]+(submit|update)([[:space:]]|$)'

emit() { # emit <allow|deny|ask> <reason>
  jq -cn --arg d "$1" --arg r "$2" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
  exit 0
}

# Expand ~ and relative paths so the safe-zone test compares real locations.
abs_path() {
  local p="$1"
  # The quotes below are the whole point: these patterns match the LITERAL text
  # "~/" and "$HOME/" as it appears in a command the agent wrote, before any
  # shell got to expand it. Letting them expand here would compare the pattern
  # against itself and match nothing.
  # shellcheck disable=SC2088,SC2016
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

# Every project a command could affect: the working directory's, PLUS any
# project named by a path in the command itself. Without the second half,
# deleting a file in a live project while sitting in a scratch one would sail
# through — the working directory says "scratch", the damage says otherwise.
projects_touched() {
  local cmd="$1" tok p name
  name="$(project_of "$CWD")"
  [ -n "$name" ] && printf '%s\n' "$name"
  # Deliberate word splitting: we are inspecting shell tokens.
  # shellcheck disable=SC2086
  set -- $cmd
  for tok in "$@"; do
    case "$tok" in -*) continue ;; esac
    p="$(abs_path "$tok")"
    case "$p" in
      "$PROJECTS_ROOT"/*)
        p="${p#"$PROJECTS_ROOT"/}"
        printf '%s\n' "${p%%/*}" ;;
    esac
  done
}

is_production() {
  local name="$1"
  [ -n "$name" ] || return 1
  [ -f "$PRODUCTION_LIST" ] || return 1
  # One project per line; '#' comments and blank lines ignored.
  grep -qxF -- "$name" <(sed -e 's/#.*//' -e 's/[[:space:]]*$//' "$PRODUCTION_LIST" | grep -v '^$')
}

# A shell command can bypass a Read permission rule (for example, `cat .env`).
# Keep a narrow second line of defence for commands that can disclose or move
# protected credentials. Template env files remain readable.
references_sensitive_path() {
  local cleaned
  cleaned="$(printf '%s' "$1" | sed -E 's/\.env\.(example|sample|template)([^A-Za-z0-9_-]|$)/ENV_TEMPLATE\2/g')"
  # Literal $HOME is command text at this point; expansion would be a bug.
  # shellcheck disable=SC2016
  printf '%s' "$cleaned" | grep -Eq '(^|[/[:space:]"'"'"'=<])\.env($|[./[:space:]"'"'"'>])' \
    || printf '%s' "$cleaned" | grep -Eq '(~|\$HOME|/home/[^/[:space:]]+)/\.(ssh|aws|config/gcloud|codex/(auth\.json|config\.toml))(/|$|[[:space:]"'"'"'>])'
}

can_disclose_files() {
  printf '%s' "$1" | grep -Eq '(^|[;&|[:space:]])(cat|head|tail|less|more|sed|awk|grep|rg|find|cp|mv|tar|zip|unzip|base64|xxd|strings|source|curl|wget|python|python3|node|ruby|perl|sh|bash|zsh|dash)([[:space:]]|$)'
}

evaluate_file() { # evaluate_file <tool_name> <agent_type> <path> <cwd>
  local tool_name="$1" file_path="$3" cwd="$4"
  local target cwd_abs current_project target_project base
  [ -n "$file_path" ] || return 0
  CWD="$cwd"
  target="$(abs_path "$file_path")"
  cwd_abs="$(abs_path "$cwd")"
  base="${target##*/}"

  case "$target" in
    "$HOME/.claude"|"$HOME/.claude/"*|"$HOME/.ssh"|"$HOME/.ssh/"*|"$HOME/.aws"|"$HOME/.aws/"*|"$HOME/.config/gcloud"|"$HOME/.config/gcloud/"*|"$HOME/.codex/auth.json"|"$HOME/.codex/config.toml")
      emit deny "Refused: $tool_name cannot modify protected agent rules or credential locations." ;;
  esac

  case "$base" in
    .env|.env.local|.env.development|.env.test|.env.staging|.env.production)
      emit ask "This $tool_name changes a credential-bearing environment file. Confirm the exact non-secret change; do not place credentials in the agent context." ;;
  esac

  current_project="$(project_of "$cwd")"
  case "$target" in
    "$PROJECTS_ROOT"/*)
      target_project="${target#"$PROJECTS_ROOT"/}"
      target_project="${target_project%%/*}"
      if is_production "$target_project"; then
        emit ask "'$target_project' is listed as running in production ($PRODUCTION_LIST). Confirm this $tool_name change."
      fi
      if [ -n "$current_project" ] && [ "$current_project" != "$target_project" ]; then
        emit ask "This $tool_name reaches from '$current_project' into a different project ('$target_project'). Confirm the cross-project change."
      fi
      return 0 ;;
    "$cwd_abs"|"$cwd_abs/"*|/tmp/*)
      return 0 ;;
    *)
      emit deny "Refused: $tool_name targets '$target', outside the current project scope." ;;
  esac
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

  # A Bash tool can otherwise read paths denied to Claude's Read tool.
  if can_disclose_files "$scan" && references_sensitive_path "$cmd"; then
    emit deny "Refused: this shell command can disclose or move protected credentials. Use a non-secret fixture or ask the user for a narrow human-assisted step."
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

  # -- 3. Projects that are already live — the working directory's and any the
  # command reaches into.
  if printf '%s' "$scan" | grep -Eq "$MUTATING"; then
    local project
    for project in $(projects_touched "$cmd" | sort -u); do
      if is_production "$project"; then
        emit ask "'$project' is listed as running in production ($PRODUCTION_LIST). This command changes it. Confirm, refuse, or say what to do instead."
      fi
    done
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

  # Read-only lookups whose names merely start like a restricted one. The first
  # was refused for real: `git merge` matched the prefix of `git merge-base`.
  check "git merge-base is read-only"   none  "claude"  "git merge-base main HEAD"    "$P/demo"
  check "git push is still caught"      deny  "claude"  "git push origin feature/x"   "$P/demo"
  check "git merge is still caught"     deny  "claude"  "git merge feature/x"         "$P/demo"

  # Production projects
  local tmp; tmp="$(mktemp)"; printf '# live\nlive-app\n' > "$tmp"
  PRODUCTION_LIST="$tmp"
  check "mutating a live project asks" ask   ""        "pm2 restart live-app"        "$P/live-app"
  check "reading a live project is ok" none  ""        "npm test"                    "$P/live-app"
  check "mutating a scratch project"   none  ""        "pm2 restart demo"            "$P/demo"
  # Reaching into another project from the one you are sitting in. The working
  # directory alone would have called these routine.
  check "deleting into a live project" ask   ""        "rm $P/live-app/config.ts"    "$P/demo"
  check "deleting into a scratch one"  none  ""        "rm $P/other/config.ts"       "$P/demo"
  check "reading a live project file"  none  ""        "cat $P/live-app/config.ts"   "$P/demo"
  rm -f "$tmp"

  # File tools use the same scope and production policy as Bash mutations.
  tmp="$(mktemp)"; printf 'live-app\n' > "$tmp"
  PRODUCTION_LIST="$tmp"
  check_file() { # check_file <label> <expected> <tool> <agent> <path> <cwd>
    got="$( evaluate_file "$3" "$4" "$5" "$6" | jq -r '.hookSpecificOutput.permissionDecision // "none"' 2>/dev/null )"
    [ -n "$got" ] || got=none
    if [ "$got" = "$2" ]; then
      printf 'PASS  %-52s -> %s\n' "$1" "$got"
    else
      printf 'FAIL  %-52s -> %s (expected %s)\n' "$1" "$got" "$2" >&2
      fails=$((fails + 1))
    fi
  }
  check_file "write inside current project" none Write builder "$P/demo/src/app.ts" "$P/demo"
  check_file "edit live project asks" ask Edit builder "$P/live-app/src/app.ts" "$P/live-app"
  check_file "cross-project edit asks" ask Edit builder "$P/other/src/app.ts" "$P/demo"
  check_file "write outside project denied" deny Write builder "/etc/nginx/site" "$P/demo"
  check_file "self-modifying agent rules denied" deny Edit builder "$HOME/.claude/settings.json" "$P/demo"
  check_file "environment secret write asks" ask Write builder "$P/demo/.env" "$P/demo"
  check "Bash cannot read .env" deny "" "cat .env" "$P/demo"
  check "Bash can read env template" none "" "cat .env.example" "$P/demo"
  check "Bash cannot read SSH keys" deny "" "head -1 ~/.ssh/id_ed25519" "$P/demo"
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
tool_name="$(jq -r '.tool_name // ""' <<<"$payload" 2>/dev/null)"
agent_type="$(jq -r '.agent_type // ""' <<<"$payload" 2>/dev/null)"
cwd="$(jq -r '.cwd // ""' <<<"$payload" 2>/dev/null)"
case "$tool_name" in
  Bash)
    evaluate "$agent_type" "$(jq -r '.tool_input.command // ""' <<<"$payload" 2>/dev/null)" "$cwd" ;;
  Write|Edit|NotebookEdit)
    evaluate_file "$tool_name" "$agent_type" "$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<<"$payload" 2>/dev/null)" "$cwd" ;;
esac
exit 0
