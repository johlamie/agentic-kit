#!/usr/bin/env bash
# Fast, offline validation of the versioned kit. Safe to run in CI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

failures=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; failures=$((failures + 1)); }

if jq empty global/settings.json >/dev/null 2>&1; then
  pass "global/settings.json is valid JSON"
else
  fail "global/settings.json is not valid JSON"
fi

for script in setup/*.sh scripts/*.sh global/hooks/*.sh; do
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

if hook_cmd=$(jq -er '.hooks.PreToolUse[0].hooks[0].command' global/settings.json 2>/dev/null) \
   && [[ "$hook_cmd" == "~/.claude/hooks/agent-guard.sh" ]]; then
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
            'Read(~/.ssh/**)' 'Write(~/.claude/CLAUDE.md)' \
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

if [[ "$(jq -r '.defaultMode' global/settings.json)" == "auto" ]]; then
  pass "defaultMode is auto (the classifier judges what allow/ask/deny do not)"
else
  fail "defaultMode is not auto — the judge would never run"
fi

if [[ "$(jq -r '.autoMode.classifyAllShell' global/settings.json)" == "true" ]]; then
  pass "classifyAllShell is on (closes the npm-script wrapper hole)"
else
  fail "autoMode.classifyAllShell is not true — narrow allow rules bypass the judge"
fi

if (( failures > 0 )); then
  printf '\n%d validation(s) failed.\n' "$failures" >&2
  exit 1
fi
printf '\nAll offline validations passed.\n'
