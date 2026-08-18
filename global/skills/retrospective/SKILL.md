---
name: retrospective
description: Capture lessons and propose system improvements after a task, a bug, or at session end. Use after completing an MVP phase, after any significant failure, or when the user says "retro" or "checkpoint".
---

# Retrospective — The Self-Improvement Loop

## Step 1 — Harvest lessons

Review what just happened. Append to `.claude/memory/LESSONS.md`, format:
`- [YYYY-MM-DD] [category: bug|process|tooling|estimation] lesson (1-2 lines, actionable)`

Only record lessons that would change future behavior. No noise.

## Step 2 — Capability gap check

Answer honestly: during this task, did I lack...
- a **skill** (a playbook I had to improvise)? → propose creating
  `.claude/skills/<name>/SKILL.md` and draft it.
- a **subagent** (a worker profile I kept re-briefing)? → propose
  `.claude/agents/<name>.md` with the right tools/memory scope.
- a **tool/MCP server** (GitHub, Supabase, Playwright, Sentry...)? → propose the
  exact `claude mcp add` command.
- an **API / service / database**? → log in `CAPABILITY_GAPS.md` with cost estimate.

## Step 3 — Rule updates

If a lesson invalidates or should amend a rule in CLAUDE.md or a skill,
propose the exact diff to the user. Never edit CLAUDE.md rules without approval.

## Step 4 — Supervisor evidence

Read `.claude/supervisor/STATE.json` and the relevant concise audit reports when
present. Record: audits run, challenges, blocks, false positives noticed,
issues missed by earlier reviewers, human escalations, capability gaps,
unreliable sources, UI score movement, and tooling improvements. Keep Claude
and Codex attribution separate. A retrospective may propose tuning, but it must
never silently lower thresholds, disable a required gate, or weaken permissions.

## Step 5 — Report

3-part summary to the user (French, concise):
1. Ce qui a bien marché
2. Leçons enregistrées
3. Améliorations proposées (avec commande/diff concrète, prêt à appliquer)
