# ORCHESTRATOR
> Owner: orchestrator. The mission's working brain: who does what, what keeps
> failing. Short and current; history belongs in DECISIONS.md and LESSONS.md.

## Routing
One row per slice. Reviewer / QA / Visual hold the last verdict (PASS,
CHALLENGE, FAIL, BLOCK) or stay empty. The Supervisor control center reads
this table as is: keep the header exactly.
| Slice | Role | Status | Reviewer | QA | Visual | Notes |
|---|---|---|---|---|---|---|

## Repair loops (stop at 3 on the same approach)
| Approach | Attempts | Last failure | Next alternative |
|---|---|---|---|

## Recurring failures
- (none)

## Pending approvals
Requests queued by the guard during unattended runs (`agentic approvals`).
They are copied to MISSION.md › "En attente de toi" for the user.
