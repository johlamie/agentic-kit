# Shared Claude Code / Codex session contract

This contract applies to projects initialized with `agentic init`. Keep the
user's requested scope and existing approvals; a tool switch is not a new task
or a reason to repeat an approval. Project-specific instructions still apply.

## Read and resume

At session start, read `.agentic/memory/PROJECT_STATE.md`, `DECISIONS.md`,
`LESSONS.md`, `CAPABILITY_GAPS.md`, then the latest `.agentic/events/*.json`.
Confirm the current branch and existing changes before editing. Summarize the
current objective, blockers, and next action in French. Do not infer a PASS or
human approval from an old conversation, a session exit code, or an event.

`.agentic/memory/` is the single project memory. `.claude/memory/` points to it
for compatibility with existing Claude skills and Supervisor readers. Do not
create a separate Codex memory. `.agentic/agent-memory/<role>/MEMORY.md` is the
shared project role memory; `.claude/agent-memory/` points to the same directory.
User role memory stays in `~/.claude/agent-memory/<role>/MEMORY.md`, readable by
both tools. This existing private location preserves the server map and user
preferences without copying them into Git. Write access to user memory may need
runtime approval in Codex; return a proposed update if access is unavailable.
Never copy secrets or unrelated project facts into project memory.

## Ownership and attribution

Launch with `agentic run claude` or `agentic run codex`. The launcher sets
`AGENTIC_TOOL`, `AGENTIC_SESSION_ID`, and `AGENTIC_AGENT=orchestrator`. It locks
the Git checkout family, including linked worktrees, until the process exits.
Direct launches and other editors do not honor this advisory lock. Do not run
two writers in the same checkout; use a separate clone for independent work.

The orchestrator owns shared memory. Subagents read it and return proposed
memory changes, test evidence and affected paths. Parallelize only independent
slices with disjoint files. Include role, scope, decisions, expected outputs and
session ID when delegating. Each tool uses its own runtime agent configuration.

After meaningful work, write PROJECT_STATE with completed work, actual checks,
remaining risks, next steps, and the tool/role/session. Append dated, attributed
decisions and lessons; explicitly supersede obsolete decisions. Then record:

```bash
agentic checkpoint --agent builder --summary "Implemented account validation" \
  --test "unit tests: PASS" --next "Reviewer then browser QA" --file src/account.ts
```

The role above is an example: name the actual producer. Outside the launcher,
pass `--tool claude` or `--tool codex`; never guess the producer from Git's user.
Events are separate immutable JSON files, so independent checkpoints do not
append to one shared log. Session events record pre-existing dirty paths and
exit status, not file contents or prompts. Listed paths are observations, not
proof of exclusive authorship. Checkpoints contain self-reported attribution.

For an authorized commit, stage only intended files, inspect the staged diff,
then use `agentic commit --agent builder -m "feat: validate accounts"`. It
preserves Git author identity and adds `Agentic-Tool`, `Agentic-Agent`, and
`Agentic-Session` trailers. It never stages, merges, pushes or signs commits.
Do not attribute mixed Claude/Codex contributions to only the last producer:
split commits by contribution or supply the additional trailers explicitly.

## Pass the project to the other tool

Checkpoint before exiting. Start the other tool in the same project. It reads
the files above and continues; raw chats, hidden reasoning, native agent memory
injection and permissions are not transferred. A killed session can lack an
end event; inspect the actual files/tests and repair the checkpoint first.

## Runtime boundaries

Same roles and deliverables do not mean identical tool permissions. Claude's
hooks and classifier are not installed in Codex. Codex uses its own sandbox,
approvals and MCP credentials. Never claim a textual role restriction enforces
an OS or MCP boundary. A shell sandbox does not constrain remote MCP writes.
Read `~/.claude/production-projects` when present; production changes, public
exposure, paid resources and destructive actions require the applicable human
approval. Never weaken permissions to resume work in the other tool.

The current Supervisor receives Claude lifecycle hooks. A direct Codex session
does not generate those hooks or Telegram lifecycle notifications. Request
audits explicitly with `agentic-supervisor audit --project "$PWD" --type <type>
--producer codex` using the updated Supervisor, then await the relevant phase.
A separate Codex audit is a separate run, not an independent model vendor.
Unavailable/stale audits remain pending/error; never fabricate a PASS. The
Supervisor database, credentials and proposals remain separate from memory.
