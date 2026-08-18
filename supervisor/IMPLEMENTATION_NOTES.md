# Codex Supervisor implementation notes

## Repository architecture

- `global/` is the Claude Code control plane. `setup/link-kit.sh` symlinks its
  orchestrator contract, agents, skills, templates, hooks, and settings into
  `~/.claude/`.
- `global/settings.json` combines static permission tiers, auto-mode policy,
  and the existing `PreToolUse` guard. The guard is security-critical and must
  remain independent from Supervisor availability.
- `global/skills/delivery-pipeline/SKILL.md` owns phases and human gates G1-G4;
  `retrospective` owns the improvement loop.
- `scripts/` and `.github/workflows/validate.yml` provide offline validation,
  isolated installation smoke tests, and runtime diagnostics.
- `kimi/` is an unrelated parallel implementation. It remains untouched and is
  never imported, called, or configured by the Supervisor.

## Baseline (2026-08-17)

- PASS: `./scripts/validate-kit.sh`
- PASS: `./scripts/smoke-install.sh`
- PASS: `./global/hooks/agent-guard.sh --self-test` (25 cases)
- PASS: `./kimi/scripts/validate-kit.sh`
- PASS: `./kimi/scripts/smoke-install.sh`
- UNAVAILABLE: ShellCheck is not installed (`command not found`).
- Runtime check passes local binaries and Claude doctor; Supabase CLI is
  missing and all configured Claude MCP servers fail in the restricted network
  environment. These are recorded capabilities, not silently treated as PASS.
- Installed: Claude Code 2.1.224, Codex CLI 0.147.0, Node 22.23.1,
  npm 10.9.8, SQLite 3.37.2. Codex is authenticated through ChatGPT and has no
  MCP servers configured.

## Integration decisions

1. Keep the Supervisor isolated under `supervisor/`, implemented in strict
   TypeScript on Node 22 with Node's built-in SQLite API and a small dependency
   set.
2. Bind the daemon only to `127.0.0.1`. A setup-generated local hook token
   protects the receiver from browser-originated localhost requests.
3. Use one fast command hook for structured forwarding. Hook payloads are
   allowlisted, truncated, and redacted before transport; audits never execute
   inside a hook.
4. Persist normalized events and a recoverable audit queue in SQLite. Coalesce
   builder/reviewer/QA evidence and audit milestones rather than tool calls.
5. Invoke `codex exec` with argument arrays, stdin prompts, `--ephemeral`,
   global `--sandbox read-only` and `--ask-for-approval never` before `exec`,
   followed by exec-local `--output-schema` and a
   bounded timeout/output budget. Never use full-access compatibility flags.
6. Store concise project-facing decisions under `.claude/supervisor/`; keep raw
   visual evidence ignored. Codex proposals may write only to an isolated
   proposal directory and never to application paths.
7. Preserve G1-G4. Machine gates inform or block the relevant phase, while G3
   and G4 remain explicit human decisions.
8. Keep MCP configuration opt-in and idempotent. The setup helper can add
   Playwright and optional capabilities without copying Claude credentials or
   replacing existing Codex configuration.
9. Maintain Codex skills in `supervisor/skills/`; installation exposes them via
   symlinks under `~/.agents/skills`, the current Codex discovery location.

## Implemented integration points

- Lifecycle hooks were added to `global/settings.json` without replacing the existing
  guard.
- `global/CLAUDE.md`, the delivery pipeline, retrospective, and project memory
  templates now include concise Supervisor gates and audit state.
- Setup/runtime helpers, PM2 configuration, uninstall scripts, and root
  validation/CI coverage were added.
- The root README now covers installation, operations, security boundaries,
  optional integrations, and rollback.

## Risk areas

- Hook recursion and stop deadlocks: honor `stop_hook_active`, bound hook time,
  and fail open only for transport failure while reporting degraded health.
- Secrets: never ingest transcripts wholesale, `.env`, credential directories,
  cookies, auth files, or raw tool output; redact before persistence and
  Telegram delivery.
- Prompt injection: external content is delimited as untrusted evidence and can
  never alter role, permissions, or command policy.
- CLI drift: `doctor` reports versions/capabilities; tests inject a fake Codex
  process and CI never requires a live account.
- Browser failures: represent missing browser/auth/target as audit
  infrastructure errors, never as a low UI score.
- Existing security: Supervisor cannot execute a denied Claude operation and
  cannot convert audit PASS into deployment authorization.
