#!/usr/bin/env bash
# Fast, offline validation of the versioned Kimi Code kit. Safe to run in CI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # the kimi/ directory
cd "$ROOT"

failures=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; failures=$((failures + 1)); }

if python3 -m json.tool config/mcp.example.json >/dev/null 2>&1; then
  pass "config/mcp.example.json is valid JSON"
else
  fail "config/mcp.example.json is not valid JSON"
fi

# TOML validation: tomllib (python ≥3.11) or tomli when available; otherwise a
# structural check of the only constructs this file uses (standard lib only,
# so the script stays offline and dependency-free on Ubuntu 22.04 / py3.10).
if python3 - <<'PY' >/dev/null 2>&1
import re, sys

text = open("config/permissions.toml").read()
try:
    import tomllib
except ModuleNotFoundError:
    try:
        import tomli as tomllib
    except ModuleNotFoundError:
        tomllib = None

if tomllib is not None:
    data = tomllib.loads(text)
    rules = data["permission"]["rules"]
else:
    # Structural fallback: only comments, blank lines, [[permission.rules]]
    # headers and decision/pattern/scope/reason assignments are allowed.
    rules, current = [], None
    for lineno, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line == "[[permission.rules]]":
            current = {}
            rules.append(current)
            continue
        m = re.fullmatch(r'(decision|pattern|scope|reason) = "([^"]*)"', line)
        if m is None or current is None:
            sys.exit("line %d: unexpected TOML construct: %r" % (lineno, raw))
        current[m.group(1)] = m.group(2)

assert rules, "no [[permission.rules]] blocks found"
for r in rules:
    assert r.get("decision") in ("allow", "deny", "ask"), "bad/missing decision"
    assert r.get("pattern"), "bad/missing pattern"
PY
then
  pass "config/permissions.toml is valid with well-formed rules"
else
  fail "config/permissions.toml is not valid or has malformed rules"
fi

for script in setup/*.sh scripts/*.sh; do
  if bash -n "$script"; then
    pass "$script has valid Bash syntax"
  else
    fail "$script has invalid Bash syntax"
  fi
done

required_skills=(architect builder designer devops product-manager qa researcher reviewer adopt-project delivery-pipeline retrospective)
for name in "${required_skills[@]}"; do
  file="skills/$name/SKILL.md"
  if [[ ! -f "$file" ]]; then
    fail "missing skill: $name"
    continue
  fi
  for key in name description type; do
    if ! sed -n '1,/^---$/p' "$file" | grep -Eq "^${key}: .+"; then
      fail "$file is missing frontmatter key: $key"
    fi
  done
  for forbidden in tools memory model; do
    if sed -n '1,/^---$/p' "$file" | grep -Eq "^${forbidden}: .+"; then
      fail "$file has a Claude-only frontmatter key: $forbidden"
    fi
  done
done
pass "required skill manifests were inspected"

for file in PROJECT_STATE.md DECISIONS.md LESSONS.md CAPABILITY_GAPS.md; do
  if [[ -s "templates/memory/$file" ]]; then
    pass "memory template exists: $file"
  else
    fail "missing or empty memory template: $file"
  fi
done

for denied in 'Bash(git push*)' 'Read(./.env)' 'Write(~/.kimi-code/AGENTS.md)'; do
  if grep -Fq "pattern = \"$denied\"" config/permissions.toml; then
    pass "critical deny rule present: $denied"
  else
    fail "critical deny rule missing: $denied"
  fi
done

# Converted files must not keep functional .claude references. Only README.md
# (comparison notes) may mention .claude; provenance comments say "Claude Code".
if grep -rn '\.claude' AGENTS.md skills templates config setup 2>/dev/null; then
  fail "stray .claude reference found in converted files"
else
  pass "no stray .claude references in converted files"
fi

if (( failures > 0 )); then
  printf '\n%d validation(s) failed.\n' "$failures" >&2
  exit 1
fi
printf '\nAll offline validations passed.\n'
