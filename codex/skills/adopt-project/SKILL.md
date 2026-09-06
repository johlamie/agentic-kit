---
name: adopt-project
description: Adopt an existing repository into the shared Claude Code and Codex workflow, or resume one whose recorded state needs reconstruction.
---

If shared memory is absent, run `agentic init` at the Git root before starting
a launcher session. It preserves existing project instructions,
migrates legacy Claude memory with compatibility links, and refuses ambiguous
memory conflicts. Read `.agentic/CONTRACT.md` and existing memory first.

Inspect the stack, recent commits, current diff, test commands and deployment
configuration without reading secrets. Fill gaps in PROJECT_STATE, dated
DECISIONS, LESSONS and CAPABILITY_GAPS. Preserve previous decisions and human
approvals; distinguish inferred facts from confirmed facts. Ask only about
uncertainties that affect the next action. Record a checkpoint with the actual
producer; commit only if authorized. Adoption does not deploy or change servers.
