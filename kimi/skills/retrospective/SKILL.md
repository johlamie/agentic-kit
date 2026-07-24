---
name: retrospective
description: Capture lessons and propose system improvements after a task, a bug, or at session end. Use after completing an MVP phase, after any significant failure, or when the user says "retro" or "checkpoint".
type: prompt
---

# Retrospective — The Self-Improvement Loop

## Step 1 — Harvest lessons

Review what just happened. Append to `.kimi-code/memory/LESSONS.md`, format:
`- [YYYY-MM-DD] [category: bug|process|tooling|estimation] lesson (1-2 lines, actionable)`

Only record lessons that would change future behavior. No noise.

## Step 2 — Capability gap check

Answer honestly: during this task, did I lack...
- a **skill** (a playbook I had to improvise)? → propose creating
  `.kimi-code/skills/<name>/SKILL.md` and draft it.
- a **worker profile** (a role I kept re-briefing)? → propose a new role skill
  `.kimi-code/skills/<name>/SKILL.md` with the right scope (Kimi Code has no
  custom subagents: roles are skills dispatched to built-in `coder` subagents).
- a **tool/MCP server** (GitHub, Supabase, Playwright, Sentry...)? → propose the
  exact `~/.kimi-code/mcp.json` entry.
- an **API / service / database**? → log in `CAPABILITY_GAPS.md` with cost estimate.

## Step 3 — Rule updates

If a lesson invalidates or should amend a rule in AGENTS.md or a skill,
propose the exact diff to the user. Never edit AGENTS.md rules without approval.

## Step 4 — Report

3-part summary to the user (French, concise):
1. Ce qui a bien marché
2. Leçons enregistrées
3. Améliorations proposées (avec commande/diff concrète, prêt à appliquer)
