# Audit artefacts

Versioned report directory: `docs/audits/2026-09-07/`.
Original isolated measurement directory: `/tmp/agentic-kit-audit-2026-09-07`.
Start with `SYNTHESE.md`, then `AUDIT_REPORT.md`. `FINDINGS.json` is the structured record; `TEST_RESULTS.md` records exact commands, contexts and outcomes.

- `evidence/`: sanitized command output, source hashes, environment/precondition diagnostics, measured behavior and browser screenshots. All secret-looking canaries in characterization fixtures are explicitly synthetic.
- `fixtures/`: audit-only characterization, mutation and comparative evaluation scripts. Guard command strings are data and must never be executed as shell commands.
- `contributions/`: scoped role reports. Their partial verdicts are interpreted within the overall report's coverage; they are not independent model-quality experiments.
The following directories remain only in the original isolated audit directory, not in Git:

- `work/source/`: exact isolated working-tree snapshot, including initial uncommitted changes. No implementation fixes applied. `work/dependencies/` is the inspected offline fallback, not proof of registry integrity.
- `work/mutations/`: intentionally faulty disposable copies. Never use as fixes or as the audited source.

Scripts currently use the absolute audit root above. Run them through `fixtures/run-command.py` to preserve the clean environment and bounds. Some synthetic databases persist by design; use a fresh disposable runtime directory before repeating database characterization. Inspect any script and symlink before rerunning. Do not point scripts at a real project or a real HOME.

This versioned directory includes reports, evidence, contributions and authored fixture scripts. It excludes working checkouts, installed dependencies, raw synthetic databases and generated fake-home trees. Reproduction uses the retained `work/source` here or a separately verified copy matching the manifest and initial dirty state. No credentials, account configuration or personal memory was copied into this audit.

The preservation rule forbade committing during measurements and was respected. After audit completion, the user explicitly authorized committing and pushing this report directory. The experimental snapshot and results remain unchanged. Tests of Git attribution used only their own synthetic repositories.

Publication note: trailing whitespace and extra final blank lines were normalized in the versioned Markdown and plaintext logs. Commands, codes and substantive output were preserved. Original raw output remains in the isolated audit directory.
