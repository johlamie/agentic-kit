---
name: pre-deploy-audit
description: Verify release readiness without deploying. Use before the Claude G4 human decision, a staging handoff, or a release candidate to assess tests, security, migrations, environment separation, backups, rollback, health checks, observability, costs, external dependencies, and unresolved audit findings.
---

# Pre-deploy Audit

Determine whether the release is technically ready for the existing human G4 decision. A PASS never authorizes or performs deployment.

## Workflow

1. Read `../../../shared/protocols/pre-deploy.md` and `../../../shared/protocols/security-review.md`.
2. Identify the exact release artifact and attribution. Reject ambiguous, stale, or unreviewed scope.
3. Require executed test/build/typecheck evidence, reviewed configuration and migrations, environment separation, secret hygiene, dependency status, backup and rollback plans, health checks, observability, rate/cost awareness, and demo/operational readiness.
4. Reconcile unresolved research, architecture, code, QA, security, accessibility, visual UX, and reviewer-meta findings. Verify remediation evidence rather than accepting assertions.
5. Check failure recovery, restart behavior, data compatibility, and rollback rehearsal in proportion to risk.
6. Return `PASS`, `CHALLENGE`, `BLOCK`, or `HUMAN_REQUIRED` with remaining actions and evidence gaps.

Never push, deploy, mutate production, change DNS/infrastructure, create accounts, spend money, accept terms, or access credentials. Preserve G4 as a human-only gate.
