---
name: delivery-pipeline
description: Full agency pipeline from raw idea to deployed, accessible MVP. Use whenever the user brings a new idea or project.
---

# Delivery Pipeline — Idea → Deployed MVP

Phases run autonomously between the four user gates (G1-G4). Codex Supervisor
audits are independent machine gates between milestones; they inform but never
replace a user gate or grant permission. Update `.claude/memory/PROJECT_STATE.md`
at every phase transition and read `.claude/supervisor/LATEST.md` when present.

Supervisor decisions use one vocabulary:

- `PASS`: continue to the next required step.
- `CHALLENGE`: route the evidence back to the responsible agent and re-audit.
- `BLOCK`: the phase/slice is not complete; repair before proceeding.
- `HUMAN_REQUIRED`: present the narrow decision to the user while continuing
  unrelated safe work when the report says that is allowed.
- `PENDING`/`ERROR`: never treat as PASS. Independent non-gated work may
  continue, but the required phase remains uncleared.

Hooks enqueue audits asynchronously. At a required boundary, use
`agentic-supervisor wait --project "$PWD" --phase <phase>` and interpret its
documented exit code; do not assume that merely scheduling an audit cleared it.

## Phase 0 — Project shell
Create/confirm the project directory, `git init`, copy memory templates from
`~/.claude/templates/memory/` to `.claude/memory/`, `.gitignore` (with `.env`,
`node_modules`, `qa/evidence`). Then `git checkout -b feature/<slug>`: every
commit from here on lands on that branch, never on main.

On an existing project, the same rule applies to each new feature or evolution:
branch off main first, build there, integrate at Phase 7.5.

## Phase 1 — Discovery → `product-manager`
Raw idea in; SPEC.md out (features, MoSCoW, user stories, flow, success
criteria). **GATE G1**: user approves scope.

## Phase 2 — Research → `researcher`
SPEC in; RESEARCH.md out (competitors, patterns to steal, tech landscape with
pricing, risks). Trigger/await the Supervisor research audit before treating
source and API assumptions as architecture inputs. It independently checks
official APIs/downloads and structured sources before scraping. No new human
gate — feeds Phase 3 after PASS or remediation.

## Phase 3 — Tech selection & architecture → `architect`
SPEC + RESEARCH in; TECH.md (decision matrix: platform, DB Supabase/Firebase/
local, services, monthly cost) + ARCHITECTURE.md (schema, API, slice plan) out.
Run the Supervisor architecture/security audit and repair CHALLENGE/BLOCK items.
**GATE G2** remains the user's approval of stack and budget; a Supervisor PASS
does not approve cost, credentials, provisioning, or production action.

## Phase 4 — Design → `designer` (skip only if no UI, justified in writing)
SPEC + RESEARCH + architecture summary in; 2 design directions out. Run
`design_due_diligence` before G3 so Codex can challenge information architecture,
flows, references, accessibility intent, generic design patterns, and system
quality. If justified, it may add an isolated alternative C under
`.claude/supervisor/proposals/`; it never overwrites the active design.

**GATE G3** remains the user's choice. Present a compact comparison only:
directions A/B, Codex recommendation and score, material strengths/risks,
targeted changes, and optional C. Do not flood the user with raw research. After
the user chooses, designer completes `design/` (DESIGN.md, tokens.md, wireframes).

## Phase 5 — Provisioning & scaffold → `devops` then orchestrator
Devops provisions per TECH.md checklist (cloud project, schema, RLS/rules,
demo account, .env). Orchestrator scaffolds the repo per ARCHITECTURE.md
(framework init, Prisma/collections, CI basics, i18n module, seed script).
Commit `chore: scaffold`. For material auth/data/infrastructure deviations,
request a manual Supervisor architecture or security audit before building.

## Phase 6 — Build → `builder` ×N
One slice per builder; parallel only for slices with disjoint files. Each
prompt: slice goal + schema + paths + conventions + relevant design/ sections.

## Phase 7 — Verify → `reviewer` then `qa`, per slice
reviewer (static) PASS → qa (dynamic, local) PASS → Supervisor slice audit. The
Supervisor coalesces builder/reviewer/QA evidence and meta-audits false PASS
risk; it does not run a costly audit after every tool call. For UI slices, run
`visual_ux_audit` on the real local URL at mobile, tablet, desktop, and large
desktop viewports. Inspect interactions, responsive behavior, accessibility,
states, hierarchy, consistency, trust, and perceived quality—not source alone.

Claude reviewer + qa PASS and Supervisor PASS are required for slice DONE.
FAIL/CHALLENGE/BLOCK returns to the responsible builder/designer with the concise
report. Three failed repair cycles on one slice → escalate to the user with the
diagnosis. Browser/MCP failure is an audit infrastructure ERROR, not a bad UI
score and not a PASS.

## Phase 7.5 — Integrate (orchestrator)
Every slice for this checkpoint is reviewer+qa PASS. Merge `feature/<slug>`
into the project's local main, then delete the branch:

    git checkout main && git merge feature/<slug> && git branch -d feature/<slug>

No gate for a project that is not yet live — that is the point of the branch.
If the project is listed in `~/.claude/production-projects`, the guard hook
escalates the merge to the user; present what changed and wait.
Record the merge in PROJECT_STATE.md. On a FAIL that surfaces late, stay on the
branch and go back to Phase 6 — main keeps the last known-good state.

## Phase 8 — Ship → `devops`
Run the Supervisor pre-deploy/security audit first. It checks executed tests,
migrations, environment separation, secrets, backups, rollback, health checks,
cost/rate assumptions, visual/accessibility evidence, and unresolved findings.
**GATE G4** remains human: user approves public exposure + any remaining cost.
Deploy (web: subdomain+SSL; mobile: Expo link/QR + web preview), run seed,
then `qa` re-runs the full flow against the PUBLIC target and request the
Supervisor final verification. Neither audit may deploy or authorize deploy.
First ship of a project: tell the user to add its name to
`~/.claude/production-projects` — from then on every change to it is escalated
to them. You cannot write that file yourself.

## Phase 9 — Handoff (orchestrator)
Produce: README (run/dev instructions), `GUIDE.md` (1-page user guide, French),
known-limitations list, URLs + test credentials + rollback command.
Update PROJECT_STATE.md to "shipped v0.x" only after the required final audit
is recorded. End the final Claude message with `SUPERVISOR_FINAL` so the Stop
hook can coalesce one meaningful final audit rather than auditing every stop.

## Phase 10 — Retrospective
Run the `retrospective` skill. Always. Log capability gaps and propose
system improvements.
