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
#      project listed in ~/.claude/production-projects escalates commands that
#      change what users see: deploys, services, migrations, and pushes or merges
#      into protected branches. Pushing a work branch does not. Per-project
#      grants written by the user (`agentic grant`) refine this; agents can
#      neither write nor run them.
#
#   5. UNATTENDED RUNS. With AGENTIC_UNATTENDED=1 (headless `agentic run`), a
#      confirmation is queued under .agentic/approvals/ and refused, so the run
#      continues with other work instead of stopping on a prompt nobody sees.
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
GRANTS_DIR="${AGENTIC_GRANTS_DIR:-$HOME/.config/agentic-kit/grants}"
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REQ_TOOL="${REQ_TOOL:-Bash}"
REQ_DETAIL="${REQ_DETAIL:-}"

# Commands reserved to the orchestrator: server surface, publication, and
# anything that reaches production. Role agents propose these and return them;
# they never run them. This is the pre-judge behaviour, preserved verbatim.
# Every alternative ends on a word boundary. Without it `git merge` also matches
# `git merge-base`, a read-only lookup — which this hook duly refused once.
ORCHESTRATOR_ONLY='(^|[;&|[:space:]])(sudo|nginx|certbot|systemctl|ufw|dropdb)([[:space:]]|$)|pm2[[:space:]]+(delete|stop)([[:space:]]|$)|git[[:space:]]+(push|merge)([[:space:]]|$)|(firebase|npm[[:space:]]+run|yarn|pnpm|npx[[:space:]]+firebase)[[:space:]]+deploy([[:space:]]|$)|prisma[[:space:]]+migrate[[:space:]]+deploy([[:space:]]|$)|eas[[:space:]]+submit([[:space:]]|$)|(supabase|firebase)[[:space:]]+projects[:[:space:]]*delete([[:space:]]|$)'

# Commands that change a running system. Harmless on a scratch project, worth a
# prompt on one that is already serving users.
MUTATING='(^|[;&|[:space:]])(rm|nginx|certbot|systemctl|sudo)([[:space:]]|$)|pm2[[:space:]]+(restart|reload|stop|delete|start)([[:space:]]|$)|git[[:space:]]+(push|merge)([[:space:]]|$)|(^|[;&|[:space:]])(deploy|migrate)([[:space:]]|$)|db[[:space:]]+(push|reset)([[:space:]]|$)|eas[[:space:]]+(submit|update)([[:space:]]|$)'
# Common release script invocations, anchored at a command boundary so a diff
# or message naming deploy.sh stays read-only. This is not a shell parser.
RELEASE_SCRIPT="(^|[;&|])[[:space:]]*((sh|bash|zsh|dash)[[:space:]]+(-c[[:space:]]+)?[\"']?)?((npm[[:space:]]+run|yarn([[:space:]]+run)?|pnpm([[:space:]]+run)?)[[:space:]]+|(\./|\.\./|/)([^[:space:]/;&|]+/)*)(deploy|migrate)([:._-][[:alnum:]_.:-]+)?([[:space:]\"';&|]|$)"

emit() { # emit <allow|deny|ask> <reason>
  local decision="$1" reason="$2" queued
  if [ "$decision" = ask ] && [ "${AGENTIC_UNATTENDED:-}" = 1 ]; then
    # Nobody is there to answer: queue the request and let the run go on.
    queued="$(queue_approval "$reason")"
    decision=deny
    reason="Queued for the user's approval${queued:+ in $queued}: $reason Do not retry or work around it; continue with other work and list it in MISSION.md under 'En attente de toi'."
  fi
  jq -cn --arg d "$decision" --arg r "$reason" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
  exit 0
}

queue_approval() { # queue_approval <reason> → prints the record path, if any
  local root dir file
  root="$(git -C "${CWD:-$PWD}" rev-parse --show-toplevel 2>/dev/null)" || return 0
  [ -d "$root/.agentic" ] && [ ! -L "$root/.agentic" ] || return 0
  dir="$root/.agentic/approvals"
  [ ! -L "$dir" ] || return 0
  mkdir -p "$dir" 2>/dev/null || return 0
  file="$dir/$(date -u +%Y%m%dT%H%M%SZ)-$$.json"
  jq -n --arg tool "$REQ_TOOL" --arg detail "${REQ_DETAIL:0:2000}" --arg reason "$1" \
        --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{version:1, requested_at:$at, tool:$tool, detail:$detail, reason:$reason, status:"pending"}' \
        > "$file" 2>/dev/null && printf '.agentic/approvals/%s' "${file##*/}"
}

# Drop heredoc bodies: lines after `<<WORD` up to the line `WORD`.
strip_heredocs() {
  awk '
    skip { if ($0 ~ "^[[:space:]]*" end "[[:space:]]*$") { skip = 0 } ; next }
    { print }
    match($0, /<<-?[[:space:]]*["\047]?[A-Za-z_][A-Za-z0-9_]*["\047]?/) {
      end = substr($0, RSTART, RLENGTH); gsub(/^<<-?[[:space:]]*["\047]?|["\047]?$/, "", end); skip = 1
    }'
}

grants_file() { printf '%s/%s' "$GRANTS_DIR" "$1"; }

has_grant() { # has_grant <project> <grant line>
  local file; file="$(grants_file "$1")"
  [ -f "$file" ] && [ ! -L "$file" ] || return 1
  sed -e 's/#.*//' -e 's/[[:space:]]\+/ /g' -e 's/^ //' -e 's/ $//' "$file" | grep -qxF -- "$2"
}

# Why a command changes a production project, or nothing when it does not.
production_reason() { # production_reason <project> <scan>
  local project="$1" seg verdict
  while IFS= read -r seg; do
    printf '%s' "$seg" | grep -Eq "$MUTATING|$RELEASE_SCRIPT" || continue
    if printf '%s' "$seg" | grep -Eq '(^|[[:space:]])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+(push|merge)([[:space:]]|$)'; then
      verdict="$(python3 "$HOOK_DIR/branch-scope.py" "$seg" "$CWD" "$(grants_file "$project")")" \
        || verdict="Branch scope could not be checked; confirm this git operation."
      [ -z "$verdict" ] || { printf "'%s' is in production: %s" "$project" "$verdict"; return; }
    elif printf '%s' "$seg" | grep -Eq '^[[:space:]]*rm([[:space:]]|$)' && has_grant "$project" checkout-not-served; then
      continue
    else
      printf "'%s' is listed as running in production (%s). This command changes it. Confirm, refuse, or say what to do instead." "$project" "$PRODUCTION_LIST"
      return
    fi
  done < <(printf '%s\n' "$2" | sed -E 's/(&&|\|\||;|\|)/\n/g')
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
    || printf '%s' "$cleaned" | grep -Eq '(~|\$HOME|/home/[^/[:space:]]+)/\.(ssh|aws|config/gcloud|config/agentic-kit/(supervisor\.env|supervisor-hook-token)|codex/(auth\.json|config\.toml))(/|$|[[:space:]"'"'"'>])'
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

  # Permit scoped role notes, never a symlink into rules or credentials.
  if python3 "$(dirname "${BASH_SOURCE[0]}")/file-scope.py" memory "$target" "$HOME"; then
    return 0
  fi

  case "$target" in
    "$GRANTS_DIR"|"$GRANTS_DIR/"*)
      emit deny "Refused: grants are written by the user with \`agentic grant\`, never by an agent." ;;
    "$HOME/.claude"|"$HOME/.claude/"*|"$HOME/.ssh"|"$HOME/.ssh/"*|"$HOME/.aws"|"$HOME/.aws/"*|"$HOME/.config/gcloud"|"$HOME/.config/gcloud/"*|"$HOME/.config/agentic-kit/supervisor.env"|"$HOME/.config/agentic-kit/supervisor-hook-token"|"$HOME/.codex/auth.json"|"$HOME/.codex/config.toml")
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
      if is_production "$target_project" && ! has_grant "$target_project" checkout-not-served; then
        emit ask "'$target_project' is listed as running in production ($PRODUCTION_LIST) and its checkout may be served live. Confirm this $tool_name change, or record \`agentic grant $target_project checkout-not-served\` if production runs elsewhere."
      fi
      if python3 "$(dirname "${BASH_SOURCE[0]}")/file-scope.py" additional "$target" "$HOME"; then
        return 0
      fi
      if [ -n "$current_project" ] && [ "$current_project" != "$target_project" ]; then
        emit ask "This $tool_name reaches from '$current_project' into a different project ('$target_project'). Confirm the cross-project change."
      fi
      return 0 ;;
    "$cwd_abs"|"$cwd_abs/"*|/tmp/*)
      return 0 ;;
    *)
      if python3 "$(dirname "${BASH_SOURCE[0]}")/file-scope.py" additional "$target" "$HOME"; then
        return 0
      fi
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

  # -- 0. Grants are the user's keys. An agent never sets them, by command or by
  # writing the files. A heredoc body (a commit message) is data unless a shell
  # runs it, so it is ignored here like quoted text.
  local executable
  executable="$(printf '%s' "$cmd" | strip_heredocs)"
  if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])(sh|bash|zsh|dash|ksh|eval|env|xargs|timeout|nohup)([[:space:]]|$)'; then
    executable="$cmd"
  fi
  if printf '%s' "$executable" | sed -e "s/'[^']*'/''/g" -e 's/"[^"]*"/""/g' \
     | grep -Eq 'agentic(\.py)?[[:space:]]+(grant|revoke)([[:space:]]|$)'; then
    emit deny "Refused: only the user records grants (\`agentic grant\`). Tell them the exact grant you need and why."
  fi
  if printf '%s' "$executable" | grep -Fq "agentic-kit/grants" \
     && printf '%s' "$executable" | grep -Eq '>|(^|[;&|[:space:]])(tee|cp|mv|ln|install|truncate|rm|chmod|chown|dd|python3?|perl|node|ruby)([[:space:]]|$)|sed[[:space:]]+-i'; then
    emit deny "Refused: grants are written by the user with \`agentic grant\`, never by an agent."
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

  # Selected reversible operations use target context, not a blanket ask.
  # Empty output defers to the native classifier; this never grants allow.
  local reason
  if ! reason="$(python3 "$(dirname "${BASH_SOURCE[0]}")/local-operations.py" "$cmd" "$CWD")"; then
    emit ask "Local operation scope could not be checked; inspect the hook error before proceeding."
  fi
  [ -z "$reason" ] || emit ask "$reason"

  # -- 3. Projects that are already live — the working directory's and any the
  # command reaches into.
  if printf '%s' "$scan" | grep -Eq "$MUTATING|$RELEASE_SCRIPT"; then
    local project production
    for project in $(projects_touched "$cmd" | sort -u); do
      if is_production "$project"; then
        production="$(production_reason "$project" "$scan")"
        [ -z "$production" ] || emit ask "$production"
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
  check "devops database diagnostic defers to classifier" none "devops" "psql -c 'SELECT 1'" "$P/demo"
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
  check "diff deploy documentation is read-only" none "" "git diff -- docs/deploy.md" "$P/live-app"
  check "actual live deploy asks" ask "" "firebase deploy" "$P/live-app"
  check "live npm deploy suffix asks" ask "" "npm run deploy:prod" "$P/live-app"
  check "live npm migration suffix asks" ask "" "npm run migrate:prod" "$P/live-app"
  check "live pnpm deploy suffix asks" ask "" "pnpm run deploy:prod" "$P/live-app"
  check "live yarn deploy suffix asks" ask "" "yarn deploy:prod" "$P/live-app"
  check "live local deployment script asks" ask "" "./deploy.sh" "$P/live-app"
  check "live composed deployment script asks" ask "" "npm test && ./scripts/deploy.sh" "$P/live-app"
  check "live shell migration script asks" ask "" "bash ./scripts/migrate.sh" "$P/live-app"
  check "live shell command deployment asks" ask "" "bash -c './deploy.sh'" "$P/live-app"
  check "diff deployment script is read-only" none "" "git diff ./deploy.sh" "$P/live-app"
  check "echo deployment script is read-only" none "" "echo ./deploy.sh" "$P/live-app"
  check "quoted deployment message is read-only" none "" "echo 'npm run deploy:prod'" "$P/live-app"
  check "scratch deployment script defers" none "" "./deploy.sh" "$P/demo"
  check "reading a live project is ok" none  ""        "npm test"                    "$P/live-app"
  check "mutating a scratch project"   none  ""        "pm2 restart demo"            "$P/demo"
  # Reaching into another project from the one you are sitting in. The working
  # directory alone would have called these routine.
  check "deleting into a live project" ask   ""        "rm $P/live-app/config.ts"    "$P/demo"
  check "deleting into a scratch one"  none  ""        "rm $P/other/config.ts"       "$P/demo"
  check "reading a live project file"  none  ""        "cat $P/live-app/config.ts"   "$P/demo"

  # Branch-aware production policy: a work branch push changes nothing users see.
  local grants; grants="$(mktemp -d)"; GRANTS_DIR="$grants"
  check "live push of a work branch"    none  ""        "git push -u origin feature/courses-2026-09" "$P/live-app"
  check "live push of a work branch with output piping" none "" "git log -1 && git push -u origin feature/x 2>&1 | tail -3" "$P/live-app"
  check "live push to main asks"        ask   ""        "git push origin main"        "$P/live-app"
  check "live push HEAD:main asks"      ask   ""        "git push origin HEAD:main"   "$P/live-app"
  check "live push of all branches asks" ask  ""        "git push --all origin"       "$P/live-app"
  check "live push of a tag asks"       ask   ""        "git push origin refs/tags/v1" "$P/live-app"
  check "live push of unknown branch asks" ask ""       "git push"                    "$P/live-app"
  check "live push to release branch asks" ask ""       "git push origin release/1.2" "$P/live-app"
  check "live merge in a served checkout asks" ask ""   "git merge feature/x"         "$P/live-app"
  check "scratch push to main defers"   none  ""        "git push origin main"        "$P/demo"
  printf 'push main\n# comment\ndeploy-branch stable\ncheckout-not-served\n' > "$grants/live-app"
  check "granted push to main"          none  ""        "git push origin main"        "$P/live-app"
  check "declared deploy branch asks"   ask   ""        "git push origin stable"      "$P/live-app"
  check "rm in a checkout not served"   none  ""        "rm -rf dist"                 "$P/live-app"
  check "deploy still asks with grants" ask   ""        "firebase deploy"             "$P/live-app"
  check_file_early() {
    got="$( evaluate_file "$3" "$4" "$5" "$6" | jq -r '.hookSpecificOutput.permissionDecision // "none"' 2>/dev/null )"
    [ -n "$got" ] || got=none
    if [ "$got" = "$2" ]; then printf 'PASS  %-52s -> %s\n' "$1" "$got"
    else printf 'FAIL  %-52s -> %s (expected %s)\n' "$1" "$got" "$2" >&2; fails=$((fails + 1)); fi
  }
  check_file_early "edit in a checkout not served" none Edit "" "$P/live-app/src/app.ts" "$P/live-app"
  # Grants are the user's: agents can neither run nor write them.
  check "agent cannot grant itself"     deny  ""        "agentic grant live-app push main" "$P/demo"
  check "agent cannot grant via script" deny  ""        "python3 ~/agentic-kit/scripts/agentic.py revoke live-app push main" "$P/demo"
  check "agent cannot write grants"     deny  ""        "echo 'push main' >> ~/.config/agentic-kit/grants/live-app" "$P/demo"
  check "agent may read grants"         none  ""        "cat ~/.config/agentic-kit/grants/live-app" "$P/demo"
  check "commit message naming a grant" none  ""        "$(printf 'git commit -q -F - <<'"'"'EOF'"'"'\nUse agentic grant x push main in ~/.config/agentic-kit/grants\nEOF\ngit log -1 2>&1 | tail -1')" "$P/demo"
  check "shell heredoc granting is caught" deny ""      "$(printf 'bash <<EOF\nagentic grant live-app push main\nEOF')" "$P/demo"
  check "quoted path write is caught"   deny  ""        "echo 'push main' > \"\$HOME/.config/agentic-kit/grants/live-app\"" "$P/demo"
  check_file_early "grant file write denied" deny Write "" "$grants/live-app" "$P/demo"

  # Unattended runs queue confirmations instead of stopping on them.
  local unattended; unattended="$(mktemp -d)"
  git init -q "$unattended" && mkdir "$unattended/.agentic"
  AGENTIC_UNATTENDED=1
  check "unattended confirmation is queued" deny "" "rm -rf $P/demo" "$unattended"
  if ls "$unattended/.agentic/approvals/"*.json >/dev/null 2>&1; then
    printf 'PASS  %-52s -> %s\n' "unattended request recorded" "queued"
  else
    printf 'FAIL  %-52s\n' "unattended request recorded" >&2; fails=$((fails + 1))
  fi
  unset AGENTIC_UNATTENDED
  rm -rf "$grants" "$unattended"
  GRANTS_DIR="${AGENTIC_GRANTS_DIR:-$HOME/.config/agentic-kit/grants}"
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
  check_file "shared role memory is writable" none Write builder "$HOME/.claude/agent-memory/builder/MEMORY.md" "$P/demo"
  check_file "non-memory config remains denied" deny Write builder "$HOME/.claude/agent-memory/builder/config.json" "$P/demo"
  check_file "self-modifying agent rules denied" deny Edit builder "$HOME/.claude/settings.json" "$P/demo"
  check_file "environment secret write asks" ask Write builder "$P/demo/.env" "$P/demo"
  check "Bash cannot read .env" deny "" "cat .env" "$P/demo"
  check "Bash can read env template" none "" "cat .env.example" "$P/demo"
  check "Bash cannot read SSH keys" deny "" "head -1 ~/.ssh/id_ed25519" "$P/demo"
  check "Bash cannot read Supervisor env" deny "" "cat ~/.config/agentic-kit/supervisor.env" "$P/demo"
  check_file "Supervisor token write denied" deny Write builder "$HOME/.config/agentic-kit/supervisor-hook-token" "$P/demo"
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
    REQ_TOOL=Bash
    REQ_DETAIL="$(jq -r '.tool_input.command // ""' <<<"$payload" 2>/dev/null)"
    evaluate "$agent_type" "$(jq -r '.tool_input.command // ""' <<<"$payload" 2>/dev/null)" "$cwd" ;;
  Write|Edit|NotebookEdit)
    REQ_TOOL="$tool_name"
    REQ_DETAIL="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<<"$payload" 2>/dev/null)"
    evaluate_file "$tool_name" "$agent_type" "$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<<"$payload" 2>/dev/null)" "$cwd" ;;
esac
exit 0
