---
name: adopt-project
description: Onboard an EXISTING project into the orchestration system by analyzing the repo and generating the memory files. Use when the user says "adopte ce projet" or when working in a repo that has no .claude/memory/ directory.
---

# Adopt Project — Existing Repo → Orchestrated Project

Goal: give an existing codebase the same memory foundation as a new project,
without disturbing its code.

## Step 1 — Analyze (delegate to a general subagent to keep context clean)

Gather: stack (package.json / pyproject / prisma schema), folder structure,
deploy setup (PM2 name, port, Nginx), git log last 30 commits (what's been
worked on), TODO/FIXME markers, test coverage presence.

## Step 2 — Generate memory files

Create `.claude/memory/` and fill:
- `PROJECT_STATE.md`: current objective inferred from recent commits,
  done / in-progress / next candidates. Mark uncertain items with `(?)`.
- `DECISIONS.md`: architecture decisions visible in the code (stack choices,
  auth approach, DB schema conventions), dated `[adopted]`.
- `LESSONS.md` and `CAPABILITY_GAPS.md`: empty templates.

## Step 3 — Project CLAUDE.md (delta only)

If no project CLAUDE.md exists, create one containing ONLY what differs from
the global `~/.claude/CLAUDE.md`: project name, port, PM2 process name, run
commands, any project-specific rule. Never duplicate global rules.

## Step 4 — Validate with the user

Show the generated PROJECT_STATE.md summary and every `(?)` item as questions.
Correct, then commit: `chore: adopt orchestration system`.
