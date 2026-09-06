---
name: delivery-pipeline
description: Coordinate the eight agentic roles from a new product idea to a verified delivery, with scope, budget, design and deployment gates.
---

Read `.agentic/CONTRACT.md` and the current state before acting. For an existing
maintenance request, use only the relevant phases and record why others do not
apply. Preserve the user's approvals across Claude/Codex handoffs.

1. Initialize shared memory with `agentic init`; create a feature branch from
   the appropriate base without discarding existing changes.
2. Delegate SPEC.md to `product-manager`; G1 approves scope.
3. Delegate sourced RESEARCH.md to `researcher`, then TECH.md and
   ARCHITECTURE.md to `architect`; G2 approves stack and budget.
4. For UI, delegate two grounded directions to `designer`; G3 selects one,
   then complete design/DESIGN.md, tokens and states.
5. Delegate provisioning preparation to `devops` and implementation slices to
   `builder`. Run independent slices in parallel only with disjoint files.
6. `reviewer` checks each slice, then `qa` exercises real flows. Failed checks
   go back to the responsible role. Three failed repair cycles require a
   concise diagnosis and a user decision. For web UI, inspect 390, 768, 1440
   and 1920px viewports and save evidence under `.artifacts/screenshots/`.
7. Prepare the integrated diff and executed checks. Merge only within the
   user's authorized workflow; retain a requested review branch.
8. `devops` prepares deployment and rollback. G4 approves public exposure and
   production actions. After deployment, `qa` verifies the actual public URL.
9. Deliver links, demo access through a suitable private channel, README,
   GUIDE.md, limitations and rollback. Update state and run `retrospective`.

At research, architecture, design, code, QA, pre-deploy and final boundaries,
request the corresponding Supervisor audit explicitly (Codex has no Claude
lifecycle hooks):

```bash
agentic-supervisor audit --project "$PWD" --type architecture --producer codex
agentic-supervisor wait --project "$PWD" --phase architecture
```

Supported audit aliases are research, architecture, code, qa, deploy, final,
design, visual and security; a visual audit also needs `--url`. Use the
Supervisor's documented phase names for waits. Read the actual report and
resolve CHALLENGE/BLOCK. PENDING/ERROR/missing infrastructure is never PASS.
An audit cannot grant G1–G4 approval. Do not send Telegram messages yourself.
