# Guard JSON QA — codex / qa

Verdict: PASS

Real hook processes received PreToolUse Bash JSON on stdin. Payload commands were never executed.
The synthetic live project exists only as a cwd string; no directory was created or opened under /home.
Production listing, HOME, TMPDIR and configuration paths are new synthetic fixtures under qa/.

## Acceptance results

| Project | Payload command (inert text) | Expected | Observed | Result |
|---|---|---|---|---|
| live-app | npm run deploy:prod | ask | ask | PASS |
| live-app | npm run migrate:prod | ask | ask | PASS |
| live-app | ./deploy.sh | ask | ask | PASS |
| live-app | bash ./scripts/migrate.sh | ask | ask | PASS |
| live-app | git diff ./deploy.sh | NO_OPINION | NO_OPINION | PASS |
| live-app | echo ./deploy.sh | NO_OPINION | NO_OPINION | PASS |
| scratch-app | npm run deploy:prod | NO_OPINION | NO_OPINION | PASS |
| scratch-app | npm run migrate:prod | NO_OPINION | NO_OPINION | PASS |
| scratch-app | ./deploy.sh | NO_OPINION | NO_OPINION | PASS |
| scratch-app | bash ./scripts/migrate.sh | NO_OPINION | NO_OPINION | PASS |

All source hashes remained unchanged: True.
Each hook process has a three-second timeout; the outer execution has a 45-second bound.

## Evidence

- guard-results.json: exact input payloads, output JSON/empty output, exit codes, timings and hashes.
- run_guard_qa.py: independent executable fixture.
- GUARD_ACCEPTANCE.md: criteria recorded before execution.
- Fixture root: /tmp/agentic-kit-merge-2026-09-08/qa/guard-fixtures-1788900846551430630

## Limits

NO_OPINION is not permission: it defers to the remaining runtime permission system.
ASK is a hook decision, not evidence of an actual human dialog or approval.
This test does not exercise Claude hook registration, a deployment, model behavior, arbitrary shell parsing, symlinked project roots or a sandbox boundary.
No global configuration, live app, genuine account, personal memory or network service was accessed.
