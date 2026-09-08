# Independent CLI QA — codex / qa

Verdict: PASS

Scope: WF01 corrected event-log reader, real local CLI processes and synthetic Git repository.
Candidate code was read-only for QA; all writes are under the QA directory.
No model invocation, provider, browser, real account, personal memory or notification was used.

## Predeclared acceptance results

- [x] Uninitialized project log returns empty without error
- [x] Real init creates contract and local legacy memory links
- [x] Initialized project empty log
- [x] Two real checkpoints persist explicit codex/qa attribution and next action
- [x] Log returns real checkpoint files in filename order
- [x] Fresh CLI process resumes exact persisted log
- [x] Non-JSON file does not alter log
- [x] External event symlink refused without canary leak
- [x] External events-directory symlink refused
- [x] External .agentic-directory symlink refused
- [x] FIFO event refused promptly rather than blocking
- [x] Normal persisted log recovers after removing hostile fixtures
- [x] External synthetic canary unchanged
- [x] Audited CLI content unchanged

## Evidence and reproduction

- Exact command/exit/stdout/stderr/timing: cli-results.json.
- Script: run_cli_qa.py; execute with /usr/bin/python3 -I -B.
- Fixture root: /tmp/agentic-kit-merge-2026-09-08/qa/cli-fixtures-1788900726302718382
- Candidate scripts/agentic.py SHA-256: 10a6dd758eb95c48135fda32582738eccd0e6d5ed76af0854f2f8e1151496e14
- Every subprocess has a three-second timeout; the outer runner also has a 30-second timeout.
- Child environment is allowlisted; HOME, TMPDIR, CODEX_HOME, CLAUDE_CONFIG_DIR, XDG and Git configuration use synthetic paths.
- Git hooks/templates come only from the empty synthetic template directory.

## Limits

This is real CLI/file-system behavior, not an agent memory reasoning or model handoff test.
Successful log persistence does not prove the model obeys the recorded next action.
No race attack, concurrent hostile filesystem mutation, deployment or UI behavior was evaluated here.
Normal checkpoint files may precede an unsafe filename before log rejects it; the security criterion is no unsafe target disclosure.
No shared-memory update is proposed.
