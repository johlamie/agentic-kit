# Code audit assignment

Read the relevant requirements and architecture, inspect `git status`, `git
diff`, changed files, and tests. Verify correctness, authorization, validation,
failure paths, concurrency, transaction boundaries, secrets/logging, dependency
risk, performance, maintainability, and whether tests exercise real behavior.
Do not edit or generate a patch.

Treat missing ownership checks, injection, secret exposure, data corruption,
falsified test claims, or dangerous destructive behavior as BLOCK. Use
CHALLENGE for material test or design-quality gaps that can be repaired without
stopping all independent work.
