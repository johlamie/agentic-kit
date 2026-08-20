#!/usr/bin/env bash
# Fast, offline validation of the versioned kit. Safe to run in CI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

failures=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; failures=$((failures + 1)); }

root_visual_artifacts="$(find . -maxdepth 1 -type f \
  \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) \
  -printf '%f\n' | sort)"
if [[ -z "$root_visual_artifacts" ]]; then
  pass "repository root contains no raster capture artifacts"
else
  fail "raster captures must be stored under .artifacts/screenshots/<run-id>/: ${root_visual_artifacts//$'\n'/, }"
fi

if [[ -s .artifacts/README.md ]] \
   && grep -Fq '.artifacts/screenshots/<run-id>/' .artifacts/README.md; then
  pass "visual artifact storage policy is documented"
else
  fail "missing visual artifact storage policy"
fi

if jq empty global/settings.json >/dev/null 2>&1; then
  pass "global/settings.json is valid JSON"
else
  fail "global/settings.json is not valid JSON"
fi

for script in setup/*.sh scripts/*.sh global/hooks/*.sh supervisor/bin/* supervisor/scripts/*.sh; do
  if bash -n "$script"; then
    pass "$script has valid Bash syntax"
  else
    fail "$script has invalid Bash syntax"
  fi
done

# The guard is the only executable the permission model depends on. Check that
# it is installed as settings.json expects, and that it still decides correctly.
if [[ -x global/hooks/agent-guard.sh ]]; then
  pass "guard hook is present and executable"
else
  fail "global/hooks/agent-guard.sh missing or not executable"
fi

# The tilde is intentionally unexpanded: we are asserting the literal string
# stored in settings.json, which Claude Code expands itself at hook time.
# shellcheck disable=SC2088
if jq -e '.hooks.PreToolUse[] | select(.matcher | test("Bash")) | .hooks[] | select(.command == "~/.claude/hooks/agent-guard.sh")' \
     global/settings.json >/dev/null 2>&1; then
  pass "settings.json registers the guard hook on PreToolUse"
else
  fail "settings.json does not register ~/.claude/hooks/agent-guard.sh on PreToolUse"
fi

if ./global/hooks/agent-guard.sh --self-test >/dev/null 2>&1; then
  pass "guard hook self-test (agent tiers, rm targets, production projects)"
else
  fail "guard hook self-test FAILED — run ./global/hooks/agent-guard.sh --self-test"
fi

required_agents=(architect builder designer devops product-manager qa researcher reviewer)
for name in "${required_agents[@]}"; do
  file="global/agents/$name.md"
  if [[ ! -f "$file" ]]; then
    fail "missing agent: $name"
    continue
  fi
  for key in name description tools memory model; do
    if ! sed -n '1,/^---$/p' "$file" | grep -Eq "^${key}: .+"; then
      fail "$file is missing frontmatter key: $key"
    fi
  done
done
pass "required agent manifests were inspected"

required_skills=(adopt-project delivery-pipeline retrospective)
for name in "${required_skills[@]}"; do
  file="global/skills/$name/SKILL.md"
  if [[ ! -f "$file" ]]; then
    fail "missing skill: $name"
    continue
  fi
  for key in name description; do
    if ! sed -n '1,/^---$/p' "$file" | grep -Eq "^${key}: .+"; then
      fail "$file is missing frontmatter key: $key"
    fi
  done
done
pass "required skill manifests were inspected"

for file in PROJECT_STATE.md DECISIONS.md LESSONS.md CAPABILITY_GAPS.md; do
  if [[ -s "global/templates/memory/$file" ]]; then
    pass "memory template exists: $file"
  else
    fail "missing or empty memory template: $file"
  fi
done

# The three permission tiers, in the order Claude Code evaluates them. Each list
# is asserted separately: a rule drifting from deny to ask (or out entirely) is
# exactly the regression that would go unnoticed until it mattered.
assert_rule() { # assert_rule <deny|ask|allow> <rule>
  if jq -e --arg t "$1" --arg r "$2" '.permissions[$t] | index($r) != null' \
       global/settings.json >/dev/null; then
    pass "$1 rule present: $2"
  else
    fail "$1 rule MISSING: $2"
  fi
}

# Tier 1 — wrecks the server or leaks its keys. Never, by anyone, hook included.
for rule in 'Bash(ufw:*)' 'Bash(sudo systemctl stop ssh:*)' 'Bash(sudo rm:*)' \
            'Bash(mkfs:*)' 'Bash(sudo apt-get purge:*)' 'Read(./.env)' \
            'Read(~/.ssh/**)' 'Read(~/.config/agentic-kit/supervisor.env)' \
            'Read(~/.config/agentic-kit/supervisor-hook-token)' 'Write(~/.claude/CLAUDE.md)' \
            'Write(~/.claude/hooks/**)' 'Write(~/.claude/production-projects)'; do
  assert_rule deny "$rule"
done

# Tier 2 — irreversible but legitimate: the user decides, every time.
for rule in 'Bash(npm uninstall:*)' 'Bash(npx prisma migrate deploy:*)' \
            'Bash(supabase projects delete:*)' 'Bash(eas submit:*)'; do
  assert_rule ask "$rule"
done

# Tier 3 — what the judge is meant to run on its own. If one of these silently
# fell back into deny, the whole point of the model would be gone.
for rule in 'Bash(git push:*)' 'Bash(git merge:*)' 'Bash(sudo nginx:*)' \
            'Bash(sudo certbot:*)' 'Bash(firebase deploy:*)'; do
  assert_rule allow "$rule"
done

# 44e17e9's doctrine, applied to the ask tier: a rule that only covers the `npx`
# spelling leaves the bare binary unguarded, and vice versa. This check exists
# because exactly that happened once, silently, while resolving a merge conflict.
missing_pair=$(jq -r '
  .permissions.ask as $ask
  | [ $ask[]
      | select(startswith("Bash(npx "))
      | sub("^Bash\\(npx "; "Bash(") as $bare
      | select(($ask | index($bare)) == null)
      | "\(.)  (bare form missing: \($bare))" ]
  + [ $ask[]
      | select(startswith("Bash(") and (startswith("Bash(npx ") | not))
      | sub("^Bash\\("; "Bash(npx ") as $npx
      | select(($ask | index($npx)) != null | not)
      | empty ]
  | join("; ")' global/settings.json)
if [[ -z "$missing_pair" ]]; then
  pass "every npx-spelled ask rule has its bare counterpart"
else
  fail "ask rule covers only the npx spelling: $missing_pair"
fi

# A denied command must never also be allowed: deny wins, so the allow entry
# would be a lie about what the kit can do.
if overlap=$(jq -r '[.permissions.allow[] as $a | .permissions.deny[] | select(. == $a)] | join(", ")' \
               global/settings.json) && [[ -z "$overlap" ]]; then
  pass "no rule is both allowed and denied"
else
  fail "rules present in BOTH allow and deny: $overlap"
fi

if [[ "$(jq -r '.permissions.defaultMode' global/settings.json)" == "auto" ]]; then
  pass "permissions.defaultMode is auto (current Claude settings syntax)"
else
  fail "permissions.defaultMode is not auto — the judge would never run"
fi

if [[ "$(jq -r '.autoMode.classifyAllShell' global/settings.json)" == "true" ]]; then
  pass "classifyAllShell is on (closes the npm-script wrapper hole)"
else
  fail "autoMode.classifyAllShell is not true — narrow allow rules bypass the judge"
fi

# Independent Supervisor structure and hook integration.
required_hook_events=(SessionStart UserPromptSubmit SubagentStart SubagentStop PostToolUse PostToolUseFailure PermissionRequest PermissionDenied Elicitation ElicitationResult Stop SessionEnd)
for event_name in "${required_hook_events[@]}"; do
  if jq -e --arg event "$event_name" '.hooks[$event][]?.hooks[]? | select(.command == "~/.claude/hooks/supervisor-hook.sh")' \
       global/settings.json >/dev/null; then
    pass "Supervisor hook registered: $event_name"
  else
    fail "Supervisor hook missing: $event_name"
  fi
done

if jq -e '.hooks.Notification == null' global/settings.json >/dev/null \
   && jq -e '.hooks.PreToolUse[] | select(.matcher == "AskUserQuestion|ExitPlanMode") | .hooks[] | select(.command == "~/.claude/hooks/supervisor-hook.sh")' global/settings.json >/dev/null; then
  pass "Supervisor uses immediate structured human-attention hooks instead of generic notifications"
else
  fail "Supervisor human-attention hook contract is incomplete"
fi

required_supervisor_files=(
  supervisor/package.json supervisor/package-lock.json supervisor/tsconfig.json
  supervisor/config/supervisor.example.env supervisor/schemas/hook-event.schema.json
  supervisor/schemas/audit-result.schema.json supervisor/ecosystem.config.cjs
  supervisor/bin/agentic-supervisor supervisor/README.md
  docs/HUMAN_ACTIONS_AND_CONFIGURATION.md docs/PROJECT_WORKFLOW_GUIDE.md
  setup/supervisor-setup.sh setup/codex-mcp-setup.sh
)
for file in "${required_supervisor_files[@]}"; do
  if [[ -s "$file" ]]; then pass "Supervisor file exists: $file"; else fail "missing Supervisor file: $file"; fi
done

for schema in supervisor/schemas/*.json supervisor/package.json supervisor/package-lock.json; do
  if jq empty "$schema" >/dev/null 2>&1; then pass "valid JSON: $schema"; else fail "invalid JSON: $schema"; fi
done

if [[ "$(jq -r '.engines.node' supervisor/package.json)" == ">=22" ]]; then
  pass "Supervisor requires Node.js 22+"
else
  fail "Supervisor Node.js engine requirement is missing"
fi

if grep -qx 'SUPERVISOR_UI_PROPOSAL_MODE=isolated' supervisor/config/supervisor.example.env \
   && grep -qx 'SUPERVISOR_HOST=127.0.0.1' supervisor/config/supervisor.example.env \
   && grep -qx 'SUPERVISOR_ACTIVITY_UI=true' supervisor/config/supervisor.example.env; then
  pass "Supervisor example keeps proposals isolated and HTTP on loopback"
else
  fail "unsafe Supervisor example configuration"
fi

required_supervisor_skills=(
  accessibility-review api-source-due-diligence architecture-challenge
  pre-deploy-audit security-review ui-ux-due-diligence visual-quality-audit
)
for name in "${required_supervisor_skills[@]}"; do
  file="supervisor/skills/$name/SKILL.md"
  interface="supervisor/skills/$name/agents/openai.yaml"
  if [[ ! -r "$file" || ! -r "$interface" ]]; then
    fail "missing Supervisor skill files: $name"
    continue
  fi
  if [[ "$(sed -n '1p' "$file")" == "---" ]] \
     && grep -qx "name: $name" "$file" \
     && grep -Eq '^description: .+' "$file" \
     && grep -Fq '$' "$interface"; then
    pass "Supervisor skill metadata valid: $name"
  else
    fail "invalid Supervisor skill metadata: $name"
  fi
  while IFS= read -r reference; do
    resolved="$(cd "$(dirname "$file")" && realpath -m "$reference")"
    if [[ -r "$resolved" && "$resolved" == "$ROOT/shared/protocols/"* ]]; then
      pass "Supervisor skill protocol resolves: $name -> $(basename "$resolved")"
    else
      fail "Supervisor skill has missing/unsafe protocol reference: $name -> $reference"
    fi
  done < <(grep -oE '\.\./\.\./\.\./shared/protocols/[A-Za-z0-9._-]+\.md' "$file" | sort -u)
done

if grep -RIEq -- '--dangerously-bypass|--yolo|danger-full-access|chmod[[:space:]]+777' \
     supervisor/src supervisor/scripts supervisor/skills shared/protocols; then
  fail "Supervisor contains a privilege-escalation instruction"
else
  pass "Supervisor contains no known privilege-escalation instruction"
fi

if grep -RIEq '\b(kimi|grok)\b' supervisor/src supervisor/scripts supervisor/package.json setup/codex-mcp-setup.sh; then
  fail "Kimi/Grok integration found in Supervisor executable paths"
else
  pass "Supervisor executable paths contain no Kimi/Grok integration"
fi

tracked_env="$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -Ev '\.env\.(example|sample|template)$' || true)"
if [[ -n "$tracked_env" ]]; then
  fail "tracked environment file may contain secrets: $tracked_env"
else
  pass "no tracked runtime .env file"
fi

if (( failures > 0 )); then
  printf '\n%d validation(s) failed.\n' "$failures" >&2
  exit 1
fi
printf '\nAll offline validations passed.\n'
