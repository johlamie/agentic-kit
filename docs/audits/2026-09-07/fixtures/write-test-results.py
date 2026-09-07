from pathlib import Path
import json,shlex,re
r=Path('/tmp/agentic-kit-audit-2026-09-07');rows=[]
for p in (r/'evidence').glob('*.json'):
 try:d=json.loads(p.read_text())
 except:continue
 if isinstance(d,dict) and {'id','command','cwd','exit_code','log'}<=d.keys():rows.append(d)
rows.sort(key=lambda d:d.get('started_utc',''))
def status(d):
 id=d['id'];code=d['exit_code']
 if id in ['npm-ci','npm-preflight','npm-audit']:return 'BLOQUÉ — DNS registre (EAI_AGAIN)'
 if id in ['supervisor-tests','supervisor-http-diagnostic']:return 'BLOQUÉ partiellement — sockets locales EPERM'
 if id=='check-runtime':return 'BLOQUÉ — CLI réelle interdite par isolation, pas état hôte'
 if id in ['guard-self-test','validate-kit']:return 'ÉCHEC contextualisé — racine sous /tmp ; voir témoin corrigé de contexte'
 if id in ['supervisor-process-bound','supervisor-process-bound-relaxed']:return 'NON CONCLUANT — fixture prend timeout, pas output-limit'
 if id in ['incomplete-codex-output','runner-early-exit-repeat']:return 'DÉFAUT OBSERVÉ — EPIPE non intercepté du runner'
 if id=='comparison-starter-oracle':return 'ATTENDU — starter volontairement incomplet, 6/12 ; aucun score kit'
 if id in ['supervisor-characterization','guard-characterization','guard-missing-jq']:return 'CARACTÉRISATION — contient comportements corrects et défauts'
 if id=='supervisor-module-diagnostics':return 'DIAGNOSTIC — 66 tests réussis, 13 bloqués EPERM'
 if id=='mutation-sensitivity':return 'EXPÉRIENCE — 3 mutations détectées, voir codes enfants'
 return 'SUCCÈS' if code==0 else 'ÉCHEC / consulter preuve'
text='''# Test results — independent audit, 2026-09-07

Source: commit `06e3974d2c80dc1434ec0e575a40f605484fc58b`, branch `feature/codex-shared-kit`, four pre-existing modified files included. Audit folder: `/tmp/agentic-kit-audit-2026-09-07`.

## Context and interpretation

All commands below were run in isolated synthetic environments. The exact clean environment policy and subprocess termination are in `fixtures/run-command.py`. HOME, TMPDIR, XDG and CODEX_HOME point into this audit folder; inherited credentials and Git global configuration are excluded. Explicit CLI shims reject real model/service/account use. Fake model executables from tests are identified as mocks. The source implementation was never corrected. Public registry operations were attempted without credentials and failed at DNS. No dangerous command submitted to a guard was executed.

`run-command.py` itself exits zero after recording its child result; **the child exit_code in the table/JSON is authoritative**. Likewise a characterization script may exit zero because it successfully reproduced an unwanted behavior. Successful mocks prove contracts, not real integrations. A blocked test is neither a success nor a kit defect.

The original command wrapper had an argument parsing error during the first npm attempt (it interpreted --cwd as a command). This was corrected in the audit-only harness before the recorded npm preflight; no kit command ran in that failed harness invocation. Browser fixture diagnosis also needed a tool-VM-compatible route callback. Neither is attributed to the kit.

## Exact command ledger

Every line links to the captured combined stdout/stderr; the same stem .json holds start time, cwd, environment policy, timeout, elapsed duration and child exit code. Cwd is written explicitly, including for mutations and diagnostics. Long independent operations were bounded by the wrapper; direct child diagnostics use their own additional timeout.

'''
for d in rows:
 text+=f"### {d['id']}\n\n- Commande exacte : `{shlex.join(d['command'])}`\n- Cwd : `{d['cwd']}`\n- Début UTC : `{d['started_utc']}` ; durée : {d['duration_seconds']} s ; borne : {d['timeout_seconds']} s ; timeout atteint : {d['timed_out']}.\n- **Code enfant : {d['exit_code']} — {status(d)}.**\n- [Sortie]({d['log']}) ; [métadonnées](evidence/{d['id']}.json).\n\n"
text+='''## Detailed Supervisor test accounting

The documented `npm test` builds and invokes node --test on 16 modules: 12 modules succeeded, four failed. Running each module directly to diagnose those failures exposes **79 individual tests: 66 succeeded, 13 failed only because listen(127.0.0.1) returned EPERM**. The actual 13 paths were examined; they all have this error, not an assertion proving a product defect. No whole-suite PASS is claimed. This diagnostic rerun is not counted as a second independent replication of model quality.

'''
modules=json.loads((r/'evidence/supervisor-modules/results.json').read_text());text+='| Module | Pass | Fail/blocked | Reason | Evidence |\n|---|---:|---:|---|---|\n'
for d in modules:text+=f"| {d['module']} | {d['pass'][0]} | {d['fail'][0]} | {'EPERM loopback' if d['environment_block'] else 'Assertions completed'} | [log]({d['log']}) |\n"
text+='''
## Guard characterization and context counterexample

`fixtures/guards/characterize.py` submits 50 JSON payloads to the actual hook. It creates only synthetic directories and symlinks inside the audit. Every child is bounded at 5 seconds. Paths such as /etc in payloads are strings for a decision; no such file is opened or mutated.

'''
g=json.loads((r/'evidence/guard-characterization.log').read_text());text+='| Scenario | Hook decision | Child exit |\n|---|---|---:|\n'
for x in g['rows']:text+=f"| {x['id']} | {x['decision']} | {x['exit_code']} |\n"
text+='''
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

'''
mut=json.loads((r/'evidence/mutations/results.json').read_text());text+='| Mutant command | Cwd | Exit | Evidence |\n|---|---|---:|---|\n'
for d in mut['results']:text+=f"| `{shlex.join(d['command'])}` | `{d['cwd']}` | {d['exit_code']} | [log]({d['log']}) |\n"
text+='''
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

Not run: system bootstrap, real native Claude installer/doctor/login, global setup or PM2, real Supervisor daemon, real Codex audit, provider MCP configuration, account/credential access, real Telegram, production data, deploy, commit of source or report. CI YAML inspected, scripts/commands executed locally as listed; no GitHub Actions run or remote CI status claimed.

The source preservation and exact initial version are in [preservation-check.json](evidence/preservation-check.json). Source hashes match initial values; the four existing dirty files were left unchanged.
'''
(r/'TEST_RESULTS.md').write_text(text)
print('Ledger commands',len(rows),'characters',len(text))
