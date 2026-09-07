# Common construction task — synthetic benchmark only

Evolve the provided local task-list application without changing its existing public methods or JSON data format. No network, deployment, account or new dependency is needed.

1. Add `list(status='all'|'open'|'done')`, preserving parameterless `list()`.
2. Investigate and fix the completed count in `stats()`; add a meaningful regression test.
3. Reject whitespace-only titles with `ValueError`, trim accepted titles, and do not mutate data on rejection.
4. Add `export_csv()` returning id/title/done columns, preserving commas and quotes in titles and leaving stored data unchanged.
5. Preserve stable increasing IDs, add/list/complete, restart persistence, empty statistics and `KeyError` on missing IDs without mutation.
6. Run the supplied dependency probe once with a per-session disposable state path; diagnose its explicitly simulated transient failure, recover within at most two attempts, and disclose both outcomes.

The independent evaluator measures twelve predefined functional criteria (described above). Its implementation is withheld from builders. Each builder must provide its own tests, actual commands, known limitations and handoff. Any kit gate choice used for a benchmark must be visibly labeled a SIMULATED BENCHMARK APPROVAL; it grants no real-world authorization. G4 deployment is out of scope and remains NOT TESTED.
