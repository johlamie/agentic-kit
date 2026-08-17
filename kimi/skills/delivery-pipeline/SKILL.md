---
name: delivery-pipeline
description: Full agency pipeline from raw idea to deployed, accessible MVP. Use whenever the user brings a new idea or project.
type: prompt
---

# Delivery Pipeline — Idea → Deployed MVP

Phases run autonomously between the four user gates (G1-G4). Update
`.kimi-code/memory/PROJECT_STATE.md` at every phase transition.

Kimi Code has no custom subagents: `→ <role>` below means dispatching a
built-in `coder` subagent whose prompt orders it to invoke skill `<role>` and
includes the phase inputs (goal, file paths, constraints from DECISIONS.md,
expected return format). Several `coder` subagents can run in parallel on
disjoint work.

## Phase 0 — Project shell
Create/confirm the project directory, `git init`, copy memory templates from
`~/.kimi-code/templates/memory/` to `.kimi-code/memory/`, `.gitignore` (with
`.env`, `node_modules`, `qa/evidence`). Then `git checkout -b feature/<slug>`:
every commit from here on lands on that branch, never on main.

On an existing project, the same rule applies to each new feature or evolution:
branch off main first, build there, integrate at Phase 7.5.

## Phase 1 — Discovery → `coder` + skill `product-manager`
Raw idea in; SPEC.md out (features, MoSCoW, user stories, flow, success
criteria). **GATE G1**: user approves scope.

## Phase 2 — Research → `coder` + skill `researcher`
SPEC in; RESEARCH.md out (competitors, patterns to steal, tech landscape with
pricing, risks). No gate — feeds Phase 3.

## Phase 3 — Tech selection & architecture → `coder` + skill `architect`
SPEC + RESEARCH in; TECH.md (decision matrix: platform, DB Supabase/Firebase/
local, services, monthly cost) + ARCHITECTURE.md (schema, API, slice plan) out.
**GATE G2**: user approves stack and budget.

## Phase 4 — Design → `coder` + skill `designer` (skip only if no UI, justified in writing)
SPEC + RESEARCH + architecture summary in; 2 design directions out.
**GATE G3**: user picks direction. Then designer completes `design/`
(DESIGN.md, tokens.md, wireframes).

## Phase 5 — Provisioning & scaffold → `coder` + skill `devops`, then orchestrator
Devops provisions per TECH.md checklist (cloud project, schema, RLS/rules,
demo account, .env). Orchestrator scaffolds the repo per ARCHITECTURE.md
(framework init, Prisma/collections, CI basics, i18n module, seed script).
Commit `chore: scaffold`.

## Phase 6 — Build → `coder` + skill `builder`, ×N
One slice per builder subagent; parallel only for slices with disjoint files.
Each prompt: slice goal + schema + paths + conventions + relevant design/
sections.

## Phase 7 — Verify → `coder` + skill `reviewer`, then `coder` + skill `qa`, per slice
reviewer (static) PASS → qa (dynamic, local) PASS → slice DONE.
FAIL → back to the same builder with the report. 3 fails on one slice →
escalate to user with diagnosis.

## Phase 7.5 — Integrate (orchestrator)
Every slice for this checkpoint is reviewer+qa PASS. Merge `feature/<slug>`
into the project's local main, then delete the branch:

    git checkout main && git merge feature/<slug> && git branch -d feature/<slug>

Local only — `git push` stays denied on the Kimi side (no classifier, no hook:
see README "Limites connues"). Record the merge in PROJECT_STATE.md. On a FAIL
that surfaces late, stay on the branch and go back to Phase 6 — main keeps the
last known-good state.

## Phase 8 — Ship → `coder` + skill `devops`
**GATE G4**: user approves public exposure + any remaining cost.
Deploy (web: subdomain+SSL; mobile: Expo link/QR + web preview), run seed,
then `qa` re-runs the full flow against the PUBLIC target.

## Phase 9 — Handoff (orchestrator)
Produce: README (run/dev instructions), `GUIDE.md` (1-page user guide, French),
known-limitations list, URLs + test credentials + rollback command.
Update PROJECT_STATE.md to "shipped v0.x".

## Phase 10 — Retrospective
Run the `retrospective` skill. Always. Log capability gaps and propose
system improvements.
