# Test results — independent audit, 2026-09-07

Source: commit `06e3974d2c80dc1434ec0e575a40f605484fc58b`, branch `feature/codex-shared-kit`, four pre-existing modified files included. Audit folder: `/tmp/agentic-kit-audit-2026-09-07`.

## Context and interpretation

All commands below were run in isolated synthetic environments. The exact clean environment policy and subprocess termination are in `fixtures/run-command.py`. HOME, TMPDIR, XDG and CODEX_HOME point into this audit folder; inherited credentials and Git global configuration are excluded. Explicit CLI shims reject real model/service/account use. Fake model executables from tests are identified as mocks. The source implementation was never corrected. Public registry operations were attempted without credentials and failed at DNS. No dangerous command submitted to a guard was executed.

`run-command.py` itself exits zero after recording its child result; **the child exit_code in the table/JSON is authoritative**. Likewise a characterization script may exit zero because it successfully reproduced an unwanted behavior. Successful mocks prove contracts, not real integrations. A blocked test is neither a success nor a kit defect.

The original command wrapper had an argument parsing error during the first npm attempt (it interpreted --cwd as a command). This was corrected in the audit-only harness before the recorded npm preflight; no kit command ran in that failed harness invocation. Browser fixture diagnosis also needed a tool-VM-compatible route callback. Neither is attributed to the kit.

## Exact command ledger

Every line links to the captured combined stdout/stderr; the same stem .json holds start time, cwd, environment policy, timeout, elapsed duration and child exit code. Cwd is written explicitly, including for mutations and diagnostics. Long independent operations were bounded by the wrapper; direct child diagnostics use their own additional timeout.

### snapshot-git

- Commande exacte : `git init -q -b audit-snapshot`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T10:59:30.668606+00:00` ; durée : 0.011 s ; borne : 120 s ; timeout atteint : False.
- **Code enfant : 0 — SUCCÈS.**
- [Sortie](evidence/snapshot-git.log) ; [métadonnées](evidence/snapshot-git.json).

### snapshot-index

- Commande exacte : `git add .`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T10:59:30.853154+00:00` ; durée : 0.085 s ; borne : 120 s ; timeout atteint : False.
- **Code enfant : 0 — SUCCÈS.**
- [Sortie](evidence/snapshot-index.log) ; [métadonnées](evidence/snapshot-index.json).

### npm-preflight

- Commande exacte : `npm ci --ignore-scripts`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source/supervisor`
- Début UTC : `2026-09-07T10:59:50.338961+00:00` ; durée : 0.968 s ; borne : 60 s ; timeout atteint : False.
- **Code enfant : 1 — BLOQUÉ — DNS registre (EAI_AGAIN).**
- [Sortie](evidence/npm-preflight.log) ; [métadonnées](evidence/npm-preflight.json).

### guard-self-test

- Commande exacte : `./global/hooks/agent-guard.sh --self-test`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T10:59:51.585064+00:00` ; durée : 6.276 s ; borne : 90 s ; timeout atteint : False.
- **Code enfant : 1 — ÉCHEC contextualisé — racine sous /tmp ; voir témoin corrigé de contexte.**
- [Sortie](evidence/guard-self-test.log) ; [métadonnées](evidence/guard-self-test.json).

### validate-kit

- Commande exacte : `./scripts/validate-kit.sh`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T10:59:51.604529+00:00` ; durée : 8.494 s ; borne : 90 s ; timeout atteint : False.
- **Code enfant : 1 — ÉCHEC contextualisé — racine sous /tmp ; voir témoin corrigé de contexte.**
- [Sortie](evidence/validate-kit.log) ; [métadonnées](evidence/validate-kit.json).

### smoke-install

- Commande exacte : `./scripts/smoke-install.sh`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T10:59:51.658234+00:00` ; durée : 0.916 s ; borne : 90 s ; timeout atteint : False.
- **Code enfant : 0 — SUCCÈS.**
- [Sortie](evidence/smoke-install.log) ; [métadonnées](evidence/smoke-install.json).

### shellcheck

- Commande exacte : `bash -c 'shellcheck setup/*.sh scripts/*.sh global/hooks/*.sh supervisor/bin/* supervisor/scripts/*.sh'`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T10:59:51.660910+00:00` ; durée : 2.029 s ; borne : 60 s ; timeout atteint : False.
- **Code enfant : 0 — SUCCÈS.**
- [Sortie](evidence/shellcheck.log) ; [métadonnées](evidence/shellcheck.json).

### npm-ci

- Commande exacte : `npm ci`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source/supervisor`
- Début UTC : `2026-09-07T11:00:37.104292+00:00` ; durée : 0.727 s ; borne : 60 s ; timeout atteint : False.
- **Code enfant : 1 — BLOQUÉ — DNS registre (EAI_AGAIN).**
- [Sortie](evidence/npm-ci.log) ; [métadonnées](evidence/npm-ci.json).

### local-operations-tests

- Commande exacte : `python3 -m unittest discover -s scripts -p test_local_operations.py`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:00:38.816830+00:00` ; durée : 0.318 s ; borne : 60 s ; timeout atteint : False.
- **Code enfant : 0 — SUCCÈS.**
- [Sortie](evidence/local-operations-tests.log) ; [métadonnées](evidence/local-operations-tests.json).

### shared-kit-tests

- Commande exacte : `python3 scripts/test_agentic.py`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:00:38.880318+00:00` ; durée : 1.114 s ; borne : 120 s ; timeout atteint : False.
- **Code enfant : 0 — SUCCÈS.**
- [Sortie](evidence/shared-kit-tests.log) ; [métadonnées](evidence/shared-kit-tests.json).

### file-scope-tests

- Commande exacte : `python3 scripts/test_file_scope.py`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:00:38.891133+00:00` ; durée : 0.107 s ; borne : 60 s ; timeout atteint : False.
- **Code enfant : 0 — SUCCÈS.**
- [Sortie](evidence/file-scope-tests.log) ; [métadonnées](evidence/file-scope-tests.json).

### supervisor-typecheck

- Commande exacte : `npm run typecheck`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source/supervisor`
- Début UTC : `2026-09-07T11:02:16.218048+00:00` ; durée : 8.974 s ; borne : 60 s ; timeout atteint : False.
- **Code enfant : 0 — SUCCÈS.**
- [Sortie](evidence/supervisor-typecheck.log) ; [métadonnées](evidence/supervisor-typecheck.json).

### supervisor-tests

- Commande exacte : `npm test`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source/supervisor`
- Début UTC : `2026-09-07T11:02:17.258959+00:00` ; durée : 18.371 s ; borne : 120 s ; timeout atteint : False.
- **Code enfant : 1 — BLOQUÉ partiellement — sockets locales EPERM.**
- [Sortie](evidence/supervisor-tests.log) ; [métadonnées](evidence/supervisor-tests.json).

### guard-characterization

- Commande exacte : `python3 /tmp/agentic-kit-audit-2026-09-07/fixtures/guards/characterize.py`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:03:43.515084+00:00` ; durée : 13.124 s ; borne : 120 s ; timeout atteint : False.
- **Code enfant : 0 — CARACTÉRISATION — contient comportements corrects et défauts.**
- [Sortie](evidence/guard-characterization.log) ; [métadonnées](evidence/guard-characterization.json).

### supervisor-http-diagnostic

- Commande exacte : `node dist/tests/hook-e2e.test.js`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source/supervisor`
- Début UTC : `2026-09-07T11:04:12.907879+00:00` ; durée : 0.396 s ; borne : 30 s ; timeout atteint : False.
- **Code enfant : 1 — BLOQUÉ partiellement — sockets locales EPERM.**
- [Sortie](evidence/supervisor-http-diagnostic.log) ; [métadonnées](evidence/supervisor-http-diagnostic.json).

### guard-self-test-logical-home

- Commande exacte : `env CLAUDE_PROJECTS_ROOT=/home/agentic-kit-audit-synthetic/projects ./global/hooks/agent-guard.sh --self-test`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:04:12.943818+00:00` ; durée : 6.637 s ; borne : 90 s ; timeout atteint : False.
- **Code enfant : 0 — SUCCÈS.**
- [Sortie](evidence/guard-self-test-logical-home.log) ; [métadonnées](evidence/guard-self-test-logical-home.json).

### supervisor-build

- Commande exacte : `npm run build`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source/supervisor`
- Début UTC : `2026-09-07T11:04:12.965523+00:00` ; durée : 9.174 s ; borne : 60 s ; timeout atteint : False.
- **Code enfant : 0 — SUCCÈS.**
- [Sortie](evidence/supervisor-build.log) ; [métadonnées](evidence/supervisor-build.json).

### supervisor-characterization

- Commande exacte : `node /tmp/agentic-kit-audit-2026-09-07/fixtures/supervisor/characterize.mjs /tmp/agentic-kit-audit-2026-09-07`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:05:52.055276+00:00` ; durée : 0.698 s ; borne : 30 s ; timeout atteint : False.
- **Code enfant : 0 — CARACTÉRISATION — contient comportements corrects et défauts.**
- [Sortie](evidence/supervisor-characterization.log) ; [métadonnées](evidence/supervisor-characterization.json).

### supervisor-module-diagnostics

- Commande exacte : `python3 /tmp/agentic-kit-audit-2026-09-07/fixtures/diagnose-suite.py`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:06:23.520637+00:00` ; durée : 7.715 s ; borne : 120 s ; timeout atteint : False.
- **Code enfant : 0 — DIAGNOSTIC — 66 tests réussis, 13 bloqués EPERM.**
- [Sortie](evidence/supervisor-module-diagnostics.log) ; [métadonnées](evidence/supervisor-module-diagnostics.json).

### supervisor-process-bound

- Commande exacte : `node /tmp/agentic-kit-audit-2026-09-07/fixtures/supervisor/bounded-process.mjs /tmp/agentic-kit-audit-2026-09-07`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:07:17.980787+00:00` ; durée : 0.538 s ; borne : 5 s ; timeout atteint : False.
- **Code enfant : 1 — NON CONCLUANT — fixture prend timeout, pas output-limit.**
- [Sortie](evidence/supervisor-process-bound.log) ; [métadonnées](evidence/supervisor-process-bound.json).

### validate-logical-project-root

- Commande exacte : `env CLAUDE_PROJECTS_ROOT=/home/agentic-kit-audit-synthetic/projects ./scripts/validate-kit.sh`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:07:18.686142+00:00` ; durée : 7.196 s ; borne : 90 s ; timeout atteint : False.
- **Code enfant : 0 — SUCCÈS.**
- [Sortie](evidence/validate-logical-project-root.log) ; [métadonnées](evidence/validate-logical-project-root.json).

### check-runtime

- Commande exacte : `env CLAUDE_PROJECTS_ROOT=/home/agentic-kit-audit-synthetic/projects ./scripts/check-runtime.sh`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:07:19.894005+00:00` ; durée : 7.639 s ; borne : 90 s ; timeout atteint : False.
- **Code enfant : 97 — BLOQUÉ — CLI réelle interdite par isolation, pas état hôte.**
- [Sortie](evidence/check-runtime.log) ; [métadonnées](evidence/check-runtime.json).

### supervisor-process-bound-relaxed

- Commande exacte : `node /tmp/agentic-kit-audit-2026-09-07/fixtures/supervisor/bounded-process.mjs /tmp/agentic-kit-audit-2026-09-07`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:07:46.302814+00:00` ; durée : 1.329 s ; borne : 10 s ; timeout atteint : False.
- **Code enfant : 1 — NON CONCLUANT — fixture prend timeout, pas output-limit.**
- [Sortie](evidence/supervisor-process-bound-relaxed.log) ; [métadonnées](evidence/supervisor-process-bound-relaxed.json).

### mutation-sensitivity

- Commande exacte : `python3 /tmp/agentic-kit-audit-2026-09-07/fixtures/mutations.py`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:09:17.670054+00:00` ; durée : 19.424 s ; borne : 120 s ; timeout atteint : False.
- **Code enfant : 0 — EXPÉRIENCE — 3 mutations détectées, voir codes enfants.**
- [Sortie](evidence/mutation-sensitivity.log) ; [métadonnées](evidence/mutation-sensitivity.json).

### fake-process-diagnostic

- Commande exacte : `node /tmp/agentic-kit-audit-2026-09-07/fixtures/supervisor/bounded-process/fake-codex`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:09:37.038850+00:00` ; durée : 3.06 s ; borne : 5 s ; timeout atteint : False.
- **Code enfant : 0 — SUCCÈS.**
- [Sortie](evidence/fake-process-diagnostic.log) ; [métadonnées](evidence/fake-process-diagnostic.json).

### kimi-validation

- Commande exacte : `./kimi/scripts/validate-kit.sh`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:09:38.237644+00:00` ; durée : 0.378 s ; borne : 60 s ; timeout atteint : False.
- **Code enfant : 0 — SUCCÈS.**
- [Sortie](evidence/kimi-validation.log) ; [métadonnées](evidence/kimi-validation.json).

### kimi-smoke

- Commande exacte : `./kimi/scripts/smoke-install.sh`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:09:38.780086+00:00` ; durée : 0.047 s ; borne : 60 s ; timeout atteint : False.
- **Code enfant : 0 — SUCCÈS.**
- [Sortie](evidence/kimi-smoke.log) ; [métadonnées](evidence/kimi-smoke.json).

### comparison-starter-oracle

- Commande exacte : `python3 /tmp/agentic-kit-audit-2026-09-07/fixtures/comparison/evaluator/evaluate.py /tmp/agentic-kit-audit-2026-09-07/fixtures/comparison/starter`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:10:54.701836+00:00` ; durée : 0.084 s ; borne : 30 s ; timeout atteint : False.
- **Code enfant : 1 — ATTENDU — starter volontairement incomplet, 6/12 ; aucun score kit.**
- [Sortie](evidence/comparison-starter-oracle.log) ; [métadonnées](evidence/comparison-starter-oracle.json).

### guard-missing-jq

- Commande exacte : `python3 /tmp/agentic-kit-audit-2026-09-07/fixtures/guards/missing-jq.py`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:10:54.980162+00:00` ; durée : 0.316 s ; borne : 15 s ; timeout atteint : False.
- **Code enfant : 0 — CARACTÉRISATION — contient comportements corrects et défauts.**
- [Sortie](evidence/guard-missing-jq.log) ; [métadonnées](evidence/guard-missing-jq.json).

### npm-audit

- Commande exacte : `npm audit --omit=dev --audit-level=high`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source/supervisor`
- Début UTC : `2026-09-07T11:11:19.267764+00:00` ; durée : 0.875 s ; borne : 45 s ; timeout atteint : False.
- **Code enfant : 1 — BLOQUÉ — DNS registre (EAI_AGAIN).**
- [Sortie](evidence/npm-audit.log) ; [métadonnées](evidence/npm-audit.json).

### kimi-shellcheck

- Commande exacte : `bash -c 'shellcheck kimi/setup/*.sh kimi/scripts/*.sh'`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:11:20.331885+00:00` ; durée : 0.187 s ; borne : 45 s ; timeout atteint : False.
- **Code enfant : 0 — SUCCÈS.**
- [Sortie](evidence/kimi-shellcheck.log) ; [métadonnées](evidence/kimi-shellcheck.json).

### incomplete-codex-output

- Commande exacte : `node /tmp/agentic-kit-audit-2026-09-07/fixtures/supervisor/incomplete-output.mjs /tmp/agentic-kit-audit-2026-09-07`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:12:50.439859+00:00` ; durée : 0.336 s ; borne : 10 s ; timeout atteint : False.
- **Code enfant : 1 — DÉFAUT OBSERVÉ — EPIPE non intercepté du runner.**
- [Sortie](evidence/incomplete-codex-output.log) ; [métadonnées](evidence/incomplete-codex-output.json).

### incomplete-output-consumed

- Commande exacte : `node /tmp/agentic-kit-audit-2026-09-07/fixtures/supervisor/incomplete-output-consumed.mjs /tmp/agentic-kit-audit-2026-09-07`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:13:21.666187+00:00` ; durée : 0.3 s ; borne : 10 s ; timeout atteint : False.
- **Code enfant : 0 — SUCCÈS.**
- [Sortie](evidence/incomplete-output-consumed.log) ; [métadonnées](evidence/incomplete-output-consumed.json).

### runner-early-exit-repeat

- Commande exacte : `node /tmp/agentic-kit-audit-2026-09-07/fixtures/supervisor/incomplete-output.mjs /tmp/agentic-kit-audit-2026-09-07`
- Cwd : `/tmp/agentic-kit-audit-2026-09-07/work/source`
- Début UTC : `2026-09-07T11:13:22.137169+00:00` ; durée : 0.322 s ; borne : 10 s ; timeout atteint : False.
- **Code enfant : 1 — DÉFAUT OBSERVÉ — EPIPE non intercepté du runner.**
- [Sortie](evidence/runner-early-exit-repeat.log) ; [métadonnées](evidence/runner-early-exit-repeat.json).

## Detailed Supervisor test accounting

The documented `npm test` builds and invokes node --test on 16 modules: 12 modules succeeded, four failed. Running each module directly to diagnose those failures exposes **79 individual tests: 66 succeeded, 13 failed only because listen(127.0.0.1) returned EPERM**. The actual 13 paths were examined; they all have this error, not an assertion proving a product defect. No whole-suite PASS is claimed. This diagnostic rerun is not counted as a second independent replication of model quality.

| Module | Pass | Fail/blocked | Reason | Evidence |
|---|---:|---:|---|---|
| acceptance.test.js | 7 | 0 | Assertions completed | [log](evidence/supervisor-modules/acceptance.test.log) |
| activity-server.test.js | 3 | 1 | EPERM loopback | [log](evidence/supervisor-modules/activity-server.test.log) |
| capabilities.test.js | 4 | 0 | Assertions completed | [log](evidence/supervisor-modules/capabilities.test.log) |
| config.test.js | 2 | 0 | Assertions completed | [log](evidence/supervisor-modules/config.test.log) |
| control-client.test.js | 3 | 0 | Assertions completed | [log](evidence/supervisor-modules/control-client.test.log) |
| control-server.test.js | 4 | 8 | EPERM loopback | [log](evidence/supervisor-modules/control-server.test.log) |
| database.test.js | 9 | 0 | Assertions completed | [log](evidence/supervisor-modules/database.test.log) |
| dispatcher.test.js | 5 | 0 | Assertions completed | [log](evidence/supervisor-modules/dispatcher.test.log) |
| hook-e2e.test.js | 0 | 1 | EPERM loopback | [log](evidence/supervisor-modules/hook-e2e.test.log) |
| hook-launcher.test.js | 1 | 0 | Assertions completed | [log](evidence/supervisor-modules/hook-launcher.test.log) |
| normalize.test.js | 4 | 0 | Assertions completed | [log](evidence/supervisor-modules/normalize.test.log) |
| parser.test.js | 4 | 0 | Assertions completed | [log](evidence/supervisor-modules/parser.test.log) |
| queue.test.js | 6 | 0 | Assertions completed | [log](evidence/supervisor-modules/queue.test.log) |
| repository-contract.test.js | 4 | 0 | Assertions completed | [log](evidence/supervisor-modules/repository-contract.test.log) |
| runner.test.js | 5 | 0 | Assertions completed | [log](evidence/supervisor-modules/runner.test.log) |
| telegram-server.test.js | 5 | 3 | EPERM loopback | [log](evidence/supervisor-modules/telegram-server.test.log) |

## Guard characterization and context counterexample

`fixtures/guards/characterize.py` submits 50 JSON payloads to the actual hook. It creates only synthetic directories and symlinks inside the audit. Every child is bounded at 5 seconds. Paths such as /etc in payloads are strings for a decision; no such file is opened or mutated.

| Scenario | Hook decision | Child exit |
|---|---|---:|
| file-current | NO_OPINION | 0 |
| file-outside | deny | 0 |
| file-other | ask | 0 |
| file-other-relative | ask | 0 |
| file-live | ask | 0 |
| file-live-relative | ask | 0 |
| file-symlink-live | NO_OPINION | 0 |
| file-rules | deny | 0 |
| file-symlink-rules | NO_OPINION | 0 |
| file-env | ask | 0 |
| file-symlink-env | NO_OPINION | 0 |
| file-role-memory | NO_OPINION | 0 |
| file-nonmemory-config | deny | 0 |
| file-unregistered-live | NO_OPINION | 0 |
| shell-current-test | NO_OPINION | 0 |
| shell-other-delete | NO_OPINION | 0 |
| shell-live-delete | ask | 0 |
| shell-live-symlink-delete | NO_OPINION | 0 |
| shell-outside-delete | deny | 0 |
| shell-outside-quoted-delete | NO_OPINION | 0 |
| shell-cd-outside-delete | NO_OPINION | 0 |
| shell-absolute-executable-delete | NO_OPINION | 0 |
| shell-builder-push | deny | 0 |
| shell-orchestrator-push | NO_OPINION | 0 |
| shell-builder-wrapper-deploy | deny | 0 |
| shell-builder-renamed-wrapper | NO_OPINION | 0 |
| shell-builder-sh-c-push | deny | 0 |
| shell-builder-git-C-push | NO_OPINION | 0 |
| shell-builder-quoted-push | NO_OPINION | 0 |
| shell-builder-substitution | NO_OPINION | 0 |
| shell-builder-false-positive-echo | NO_OPINION | 0 |
| shell-cross-live-pm2 | NO_OPINION | 0 |
| shell-live-redirect | NO_OPINION | 0 |
| shell-rules-redirect | NO_OPINION | 0 |
| shell-secret | deny | 0 |
| shell-secret-quoted | deny | 0 |
| shell-secret-absolute-executable | NO_OPINION | 0 |
| shell-secret-symlink | NO_OPINION | 0 |
| shell-env-template | NO_OPINION | 0 |
| shell-secret-ssh | deny | 0 |
| shell-secret-variable | NO_OPINION | 0 |
| shell-npm-broad | ask | 0 |
| shell-npm-named | NO_OPINION | 0 |
| shell-npm-composed | ask | 0 |
| shell-npm-wrapper-broad | NO_OPINION | 0 |
| shell-live-pm2 | ask | 0 |
| shell-live-copy | NO_OPINION | 0 |
| shell-live-npm-wrapper | NO_OPINION | 0 |
| read-not-dispatched | NO_OPINION | 0 |
| mcp-not-dispatched | NO_OPINION | 0 |

NO_OPINION means the hook supplies no decision; it does not establish runtime ALLOW. Native Claude permissions, classifier and remote tools were not evaluated. Literal/direct controls often work, while symlinks and syntax variants miss the hook's lexical recognition.

The first self-test failure was `rm traversal`: HOME inside /tmp makes the traversal destination match the explicit /tmp exception. A second run sets only `CLAUDE_PROJECTS_ROOT=/home/agentic-kit-audit-synthetic/projects`; this is a lexical path and no project/file is created there. The same source then passes all its built-in assertions. This is a portability assumption in the test, not proof that traversal from an ordinary /home/projects tree is accepted.

`fixtures/guards/missing-jq.py` separately repeats the same builder/git-push payload with normal PATH and an empty synthetic PATH. Result: deny versus silent exit0. No payload command executed.

## Supervisor additional scenarios

Actual SQLite and queue/dispatcher code are exercised, with a JS runner that returns a predetermined audit result. Fetch injection exercises forwardHook without a server. Every scenario is in fixtures/supervisor/characterize.mjs and its log; root-level wrapper bound 30s.

| Scenario | Actual observed behavior | Interpretation |
|---|---|---|
| stale_pass_after_code_change | PASS persists after file bytes change; same audit ID | SUP-01 |
| stop_gate_history_250 / phase_gate_history_500 | Old BLOCK still in DB; respective gate returns PASS | SUP-03 |
| reviewer_evidence_coalesced_after_start | Late marker in DB context, absent from prompt; one PASS audit | SUP-02 |
| duplicate_raw_hook | Identical payload normalizes twice into 2 events/audits | SUP-07 |
| raw_codex_output_persisted | Synthetic canary survives in stdout/stderr columns | SUP-04; no real secret |
| human_persistence_project_isolation | HUMAN_REQUIRED after reopen/new PASS; other project PASS | Positive persistence/isolation |
| recovery_retry_budget | Interrupted audit recovered, attempt2 exhausted -> ERROR | Positive retry/error handling |
| mock_forwarder_gate | Four non-PASS states block; ERROR only message; PASS silent | SUP-05; real Claude consumption unknown |
| mock_forwarder_transport_failure | Null output | Fail-open transport observed |
| mock_forwarder_recursive_stop | Existing BLOCK ignored when stop_hook_active=true | Recursion protection, further reliance on orchestrator |
| incomplete CLI consumes stdin then exits | CODEX_NO_OUTPUT, no PASS | Correct structured rejection |
| incomplete CLI exits immediately before reading | Unhandled stdin EPIPE, process code1, reproduced twice | SUP-08 |
| output limit / ignoring TERM | Attempts yielded CODEX_TIMEOUT, wrong path for intended experiment | SUP-06 remains inspection only |

The output-limit fixture originally used child self-exit800ms / nominal timeout200ms. Its audit-only fixture was then changed to self-exit3000ms / timeout1000ms, with a 10s outer bound. Neither run reproduced the desired limit path. A direct `node fake-codex` diagnostic was also recorded. No indefinite child or recursive real auditor was started.

## Workflow and memory scenarios

The delegated architect executed `timeout 60s python3 fixtures/workflow/characterize_workflow.py --source <snapshot> --evidence <audit>/evidence/workflow` using the absolute paths preserved in its contribution. Eight scenarios, 13 internal commands, per-command timeout15s, total measured1.43s. Exact commands, outputs, codes and fixture links: [characterization-results.json](evidence/workflow/characterization-results.json). The stub tool exit7 is an injected outage, not an integration failure.

- Migration preserves bytes and aliases; second init is idempotent.
- A/B project state is separate in the tested local reads.
- QA PASS can be recorded without the declared screenshot existing; declarative checkpoint, no Supervisor verdict.
- Stale decision and malicious-looking instruction remain in memory; no model consumed them.
- Cross-project memory symlink refused by init.
- Missing PROJECT_STATE does not prevent launching stub; exit7 recorded, no QA PASS inferred.
- Individual event symlink read by `agentic log` prints a synthetic external canary (WF-01).

## Mutation sensitivity

Mutations are not bugs in the original source. Three disposable copies were edited after baseline measures; original and main audited copy remained unchanged.

| Mutant command | Cwd | Exit | Evidence |
|---|---|---:|---|
| `/bin/bash /tmp/agentic-kit-audit-2026-09-07/work/mutations/guard/agent-guard.sh --self-test` | `/tmp/agentic-kit-audit-2026-09-07/work/mutations/guard` | 1 | [log](evidence/mutations/guard-role-check-removed.log) |
| `npm run build` | `/tmp/agentic-kit-audit-2026-09-07/work/mutations/parser-security-floor/supervisor` | 0 | [log](evidence/mutations/parser-security-floor-build.log) |
| `node dist/tests/parser.test.js` | `/tmp/agentic-kit-audit-2026-09-07/work/mutations/parser-security-floor/supervisor` | 1 | [log](evidence/mutations/parser-security-floor-test.log) |
| `npm run build` | `/tmp/agentic-kit-audit-2026-09-07/work/mutations/retry-counter/supervisor` | 0 | [log](evidence/mutations/retry-counter-build.log) |
| `node dist/tests/database.test.js` | `/tmp/agentic-kit-audit-2026-09-07/work/mutations/retry-counter/supervisor` | 1 | [log](evidence/mutations/retry-counter-test.log) |

The guard mutant removes only the role restriction, the parser mutant neutralizes the security BLOCK floor, and the DB mutant increments attempt_count by zero. Both TypeScript mutants compile; their behavioral tests then fail. Three selected regressions were detected; no mutation-coverage percentage or claim that other faults would be detected.

## Actual browser test with synthetic HTTP

Chromium150.0.7871.114 rendered the unmodified Control Center assets at a reserved synthetic origin. Every request was intercepted; only fixed fixture paths were fulfilled, every other request aborted. Eight fresh contexts, service workers blocked, EventSource absent to exercise polling. No existing browser state, real account, real server or live app inspected. Successful browser batch17.7s; earlier audit-tool diagnosis separate.

[Exact successful Playwright callback](fixtures/browser/qa/run-control-browser.js), [measurements](evidence/browser/results.json), [QA narrative](contributions/browser.md).

| Case | Outcome | Screenshot |
|---|---|---|
| Populated390×844 | Correct counts, no overflow, skip link/focus/link activation | [PNG](evidence/browser/populated-390.png) |
| Populated768×1024 | Correct counts, no overflow | [PNG](evidence/browser/populated-768.png) |
| Populated1440×900 | Correct counts, no overflow | [PNG](evidence/browser/populated-1440.png) |
| Populated1920×1080 | Correct counts, no overflow | [PNG](evidence/browser/populated-1920.png) |
| Empty390×844 | Explicit empty state, no fictional project | [PNG](evidence/browser/empty-390.png) |
| HTTP503 then valid | Visible unavailable state; normal polling recovery; expected503 console error, no JS exception | [PNG](evidence/browser/error-recovery-1440.png) |
| HTTP200 {} | False healthy/empty display; BR-01 | [PNG](evidence/browser/malformed-1440.png) |
| HTML payload390×844 | Inert text, zero external requests/injected images, no overflow | [PNG](evidence/browser/injection-390.png) |

Real API/auth/SSE, screen reader, measured contrast/zoom, detailed project thread, real slow network, public deployment and G4 remain NOT TESTED. Browser fixture tool failed initially because its VM had no URL/import/require; corrected route callback used explicit string parsing. Zero audit contexts remain; no user context closed.

## Comparison fixture and unexecuted operations

The independent starter evaluator reports6/12. Six missing properties are intentional and belong to the benchmark starter, not agentic-kit. No builder ran A/B/C. See [protocol](fixtures/comparison/PROTOCOL.md) for matched models, explicit budget and missing authorized authentication, separated homes, blinded evaluation and measurements. Tool outage probe is synthetic and never touches a real package service. Actual G1–G4 decisions and deployment are not simulated as real approvals.

Not run during the experimental audit: system bootstrap, real native Claude installer/doctor/login, global setup or PM2, real Supervisor daemon, real Codex audit, provider MCP configuration, account/credential access, real Telegram, production data, deploy, commit of source or report. CI YAML inspected, scripts/commands executed locally as listed; no GitHub Actions run or remote CI status claimed.

The source preservation and exact initial version are in [preservation-check.json](evidence/preservation-check.json). Source hashes match initial values; the four existing dirty files were left unchanged.

## Subsequent publication authorization

After audit completion, the user explicitly authorized a commit and push limited to `docs/audits/2026-09-07/`. This publication changes neither the audited implementation nor the experimental results above.
