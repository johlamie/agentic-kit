---
name: architecture-challenge
description: Independently challenge a proposed software architecture, major technical decision, or implementation plan. Use before the Claude G2 gate, for consequential migrations or external dependencies, or when requirements, ownership, security boundaries, failure modes, observability, rollback, cost, and testability need adversarial review.
---

# Architecture Challenge

Test whether the smallest proposed architecture actually satisfies the requirements and operating constraints.

## Workflow

1. Read `../../../shared/protocols/architecture-challenge.md` and, for external data, `../../../shared/protocols/source-due-diligence.md`.
2. Build a requirement-to-component-to-verification map. Identify omissions and assumptions rather than filling them silently.
3. Trace trust boundaries, authorization, data ownership, concurrency, transactions, failure/recovery, external dependencies, cost, observability, rollback, and test seams.
4. Test at least one viable alternative for every consequential or difficult-to-reverse decision. Compare concrete tradeoffs; novelty is not evidence.
5. Challenge operational behavior under partial failure, restart, duplicate delivery, stale data, provider outage, and degraded dependencies.
6. Classify findings by impact and evidence. Return `PASS`, `CHALLENGE`, `BLOCK`, or `HUMAN_REQUIRED` with the smallest verifiable remediation.

Do not redesign the system merely to express preference, and do not approve deployment or broaden permissions.
