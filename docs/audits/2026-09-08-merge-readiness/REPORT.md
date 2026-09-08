# Merge readiness — 2026-09-08

**Decision: locally validated for a supervised-use merge, subject to the new
commit's GitHub Actions checks passing. This is not a declaration of safe
unattended delivery or production autonomy.**

The user requested the necessary corrections before merging
`feature/codex-shared-kit`. Main was not merged, deployed or modified. The
[independent audit](../2026-09-07/AUDIT_REPORT.md) remains historical evidence;
its unresolved Supervisor findings still apply.

## Candidate and preservation

- Starting branch commit: `09809838d19714c58f35015118ae5616ff67d388`.
- Main, verified against the remote: `a32f44121462034e305025287cfedfaee82ae5c4`.
- Test workspace: `/tmp/agentic-kit-merge-2026-09-08/candidate`.
- The candidate is the starting commit plus the six changes described below.
  Its 319 pre-existing tracked files are identified in
  [tested-files.sha256](evidence/tested-files.sha256). The report's own Git
  commit identifies the published candidate; newly added evidence is excluded
  from that manifest.
- Four pre-existing edits in `global/agents/builder.md`,
  `global/agents/product-manager.md`, `global/agents/reviewer.md` and
  `global/settings.json` were preserved byte-for-byte and excluded. The candidate
  uses their committed versions. This approval does not cover those local edits.
- No personal memory, production database, live application or real model
  session was used. The Supervisor's fake Codex runners and simulated Telegram
  transports remain simulations, even though local HTTP and SQLite are real.

## Corrections included

1. **WF-01: event-log symlink disclosure.** `scripts/agentic.py` now opens the
   project, `.agentic` and `events` through pinned directory descriptors without
   following symlinks. Event files must be regular files and are opened with
   `O_NOFOLLOW|O_NONBLOCK`. Internal links are intentionally refused too.
   `scripts/test_agentic.py` adds four tests, covering normal ordering, missing
   directories, linked files/directories, broken/cyclic links and FIFOs. The new
   regression fails against the old reader; the corrected CLI passes independent
   end-to-end checks without disclosing a synthetic canary.
2. **Release-script guard regression.** The branch's narrowed mutation pattern
   lost common live-project invocations such as `npm run deploy:prod` and
   `./deploy.sh`. `global/hooks/agent-guard.sh` now recognizes the demonstrated
   invocations at command boundaries. Eight new adverse assertions fail before
   the correction and pass afterwards; diff/echo/scratch cases remain unchanged.
   This explicit filter does not parse arbitrary shell scripts or replace a
   sandbox. A missing hook decision is not a native permission grant.
3. **Production dependency check.** `supervisor/package-lock.json` changes only
   the `fast-uri` record, from 3.1.5 to 3.1.7, within AJV's existing `^3.0.1`
   range. The original production audit reported one high-severity dependency
   with four advisories; the corrected audit reports zero vulnerabilities.
   The [upstream advisory](https://github.com/advisories/GHSA-5jgf-p345-68v8)
   describes an affected host-canonicalization case. Exploitability through this
   kit was not demonstrated. No major upgrade or dependency was added.
4. **WF-02 documentation.** `README.md` and `docs/PROJECT_WORKFLOW_GUIDE.md` no
   longer treat an unlisted live project or a PASS as merge/deployment permission.
   Their description of shell filtering now states its partial coverage and the
   dependency on runtime controls.

## Verification

Environment: Linux, Node 22.23.1, npm 10.9.8, Python 3.10.12,
ShellCheck 0.8.0. Commands use a clean allowlisted environment, synthetic HOME,
config/cache/temp directories, and blocked real model/service CLI names.
All downloaded dependencies were inspected for installation lifecycle scripts
before ordinary `npm ci`; none were present. Installed symlinks stay within
`node_modules`. Commands are bounded to 60 or 120 seconds.

| Check on candidate | Observed result |
|---|---|
| Shared-memory/launcher/event tests | 24/24 PASS |
| Local-operation permission tests | 12/12 PASS |
| Physical file-scope tests | 2/2 PASS |
| Guard self-test | 53/53 PASS |
| Offline manifests and configuration | PASS |
| ShellCheck, including Kimi scripts | PASS |
| Claude/Supervisor installation smoke tests | PASS; Supervisor external CLIs mocked |
| Kimi validation and installation smoke | PASS |
| Patched `npm ci` | PASS |
| Patched `npm run typecheck` | PASS |
| Patched `npm test` | 79/79 PASS, zero skipped |
| Patched `npm run build` | PASS |
| Patched `npm audit --omit=dev --audit-level=high` | PASS; zero reported vulnerabilities |
| Independent real CLI QA | 14/14 PASS |
| Independent hook JSON decision QA | 10/10 PASS; commands never executed |
| Static independent reviewer | PASS on all six changed files |

Exact commands, exit codes, timing and context are in
[TEST_RESULTS.json](TEST_RESULTS.json); output is under [evidence](evidence/).
The [QA report](qa/RESULTS.md) distinguishes real CLI persistence from untested
model reasoning. [Hook QA](qa/GUARD_RESULTS.md) verifies the final JSON decisions.
[Reviewer evidence](REVIEW.md) records the separate review.
Before/after regressions are retained; they are not counted as current failures.

Initial restricted executions encountered registry DNS errors and localhost
socket restrictions. With scoped execution approval and the same isolated
fixtures, registry access succeeded and all 79 Supervisor tests passed. Neither
environmental failure was treated as a kit defect. The tests were then rerun
with the patched dependency and also passed.

## Remote checks and limits

The previous published commit's
[GitHub Actions run](https://github.com/johlamie/agentic-kit/actions/runs/34132938125)
failed specifically at `Audit production dependencies`; native Claude install,
offline validation and Kimi validation passed. The dependency correction now
passes the same command locally. The new commit must also pass its own
[branch workflow run](https://github.com/johlamie/agentic-kit/actions?query=branch%3Afeature%2Fcodex-shared-kit).
This document is prepared before that publication; the final conversation and
GitHub run provide the subsequent remote result.

`check-runtime.sh` was inspected, not executed against the host: it reads actual
installed configuration, authentication and daemon status. No real Claude/Codex
model handoff, authenticated MCP action, paid benchmark or deployment was added
to this maintenance check. No changed UI requires a new browser acceptance run.

The important Supervisor defects from the audit, including stale PASS,
late evidence and nonblocking infrastructure errors, already exist on main.
Their implementation was not changed here. Do not use a Supervisor PASS as the
sole approval for the bytes being merged or delivered. Verify the current diff
and tests, preserve human gates, and work in a physically separate development
checkout for live projects.

The branch also deliberately delegates `psql/mysql` decisions to native
classification instead of blanket role denial. Its SELECT test proves no
technical SQL read-only restriction; use confirmed disposable/local targets or
read-only database accounts. General symlink and shell-filter limitations from
the audit remain open.

## Handoff and rollback

Merge this published commit only after its checks pass and the diff is accepted.
The existing main reference was verified before publication; if main changes,
inspect and test the resulting integration instead of reusing this evidence.
Do not include the four preserved local edits without reviewing them separately.

These changes introduce no data migration or global installation. Rollback can
revert the corrective commit in Git through the normal reviewed workflow; doing
so reintroduces the fixed disclosure, guard regressions and dependency advisory.
No service restart or deployment is implied by the merge.

**Usable for supervised development: yes. Demonstrated reliable unattended
production delivery: no.** The next highest-value work remains binding mandatory
Supervisor verdicts to the exact candidate and consuming failures consistently.
