---
name: mission
description: Run a product idea as an autonomous mission until the next real decision or a local MVP. Use when the user says /mission, "lance une mission", "laisse tourner", "va jusqu'au bout", gives a raw idea to take end to end, or asks to resume a mission in progress.
---

# Mission (orchestrator)

A mission turns an idea into progress without the user steering each step. You
stay the orchestrator: you delegate every specialist task to the roles and never
write feature code yourself. This skill drives `delivery-pipeline`; it does not
replace it.

## 1. Start or resume

- **`/mission <idée>`** — new mission. Ask, in one message, only what is
  missing: a project name if the idea gives none, and the profile
  (`supervised` by default, `lab`, `local-only`; explain them in one line each).
  Then run:
  `agentic mission start --idea "<idée>" --profile <profil> [--name <slug>]`
  and `cd` into the printed project.
- **`/mission`** with no argument, or a resume request — read the current
  project's mission (`agentic mission status --project .`). If none exists, ask
  for the idea.
- You may also start a mission yourself when a conversation with the user
  clearly calls for one, and launch it unattended for another project with
  `agentic mission run --project <path>` (run it in the background). Never use
  this to escape a stop condition of the current mission.

## 2. Read before acting

`.agentic/CONTRACT.md`, `.agentic/memory/MISSION.md`, `ORCHESTRATOR.md`,
`PROJECT_STATE.md`, `DECISIONS.md`, `LESSONS.md`, your user memory
(`~/.claude/agent-memory/orchestrator/MEMORY.md`), and `agentic approvals
--project .`. Copy pending approvals into MISSION.md › "En attente de toi".

## 3. Profiles — trust `agentic mission status`, never the file alone

| Effective profile | Gates | Allowed | Forbidden |
|---|---|---|---|
| `supervised` | G1–G4 decided by the user | everything local between gates | — |
| `lab` (needs the user's `agentic grant <projet> profile lab`) | G1–G3 may be settled by written defaults in DECISIONS.md, flagged "défaut lab"; G4 human | as supervised | money, secrets, production without the user |
| `local-only` | G1–G3 as supervised; no G4 | local MVP, local data | deploy, DNS, paid API, public URL, production data |

If `lab` was requested but not granted, run `supervised` and tell the user the
exact command (`agentic grant <projet> profile lab`) once. You never run
`agentic grant`; the guard refuses it.

## 4. Loop

Run `delivery-pipeline` phase by phase. After every phase:
- update MISSION.md (phase, gates, journal line) and PROJECT_STATE.md;
- update ORCHESTRATOR.md (routing, repair-loop counts);
- record a checkpoint (`agentic checkpoint`);
- check the stop conditions below; if none applies, continue immediately.

Delegation prompts carry the slice goal, files, constraints from DECISIONS.md,
relevant design/ sections and the expected return. Builders compose the UI kit;
QA and the Supervisor verify; you integrate.

## 5. Stop conditions — stop cleanly, never stall silently

Stop when one is true, after writing MISSION.md › "En attente de toi" with the
exact question or action expected from the user:
1. a gate needs the user (per profile), or a decision changes scope, cost, data
   risk or public exposure;
2. three repair loops failed on the same approach (ORCHESTRATOR.md) and no
   bounded alternative remains;
3. the Supervisor returned BLOCK on the active phase;
4. a credential, MCP or tool is unavailable and blocks every remaining task;
5. the profile's Definition of Done is reached.

A request the guard queued (unattended run) is not a stop: note it, continue the
work that does not depend on it, and stop only when nothing else is possible.

## 6. Report

End every run with a short French summary: done, waiting for the user (with the
exact commands, e.g. `agentic grant …`), next step. Then stop.

## Memory

You are the only writer of MISSION.md, ORCHESTRATOR.md and the shared memory
files; roles return memory proposals. Never store secrets in them.
