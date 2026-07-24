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

for script in setup/*.sh scripts/*.sh; do
  if bash -n "$script"; then
    pass "$script has valid Bash syntax"
  else
    fail "$script has invalid Bash syntax"
  fi
done

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
  [[ -s "global/templates/memory/$file" ]] \
    && pass "memory template exists: $file" \
    || fail "missing or empty memory template: $file"
done

for denied in 'Bash(git push:*)' 'Read(./.env)' 'Write(~/.claude/CLAUDE.md)'; do
  jq -e --arg rule "$denied" '.permissions.deny | index($rule) != null' \
    global/settings.json >/dev/null \
    && pass "critical deny rule present: $denied" \
    || fail "critical deny rule missing: $denied"
done

if (( failures > 0 )); then
  printf '\n%d validation(s) failed.\n' "$failures" >&2
  exit 1
fi
printf '\nAll offline validations passed.\n'
