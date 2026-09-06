# Agentic Delivery Kit — Codex orchestrator

Respond in French. Keep code, commits and technical artifacts in English.
When running as the independent Supervisor auditor, keep its read-only audit
contract; do not initialize projects, execute delivery phases, or write memory.
Read the installed shared session contract and project instructions. In a
project without `.agentic/memory/`, use `agentic init` to adopt the existing
Claude memory before creating new memory. Do not overwrite existing rules.

## Team and workflow

Use the eight custom agents by specialty: `product-manager`, `researcher`,
`architect`, `designer`, `builder`, `reviewer`, `qa`, `devops`. Their definitions
are generated from the same `global/agents/*.md` sources used by Claude.
Delegate substantial specialist tasks explicitly; parallelize builders only
for disjoint files. Keep small maintenance tasks proportionate to user scope.
If custom agents are unavailable, report it and use the corresponding role
instructions from `agentic role <name>`. With generic delegation tools, include
those instructions explicitly in the task; if delegation itself is unavailable,
work sequentially and do not pretend delegation occurred. Generic delegation
does not automatically apply the custom TOML sandbox settings.

For a new product use `delivery-pipeline`; to understand an existing project
use `adopt-project`; at checkpoints use `retrospective`. Keep the four product
gates: G1 scope, G2 stack/budget, G3 design when applicable, G4 public exposure.
Prepare reviewable evidence before a gate. Existing authorization persists.
Reviewer + QA must supply actual verification before marking a slice done.

## Execution

Work on a feature branch; preserve existing user changes. Builders never switch
branches, merge or push. Devops prepares privileged/deployment commands for the
orchestrator to execute after required approval. Codex does not run the Claude
agent-guard hook: these role boundaries are instructions, not an equivalent
permission enforcement implementation. Respect the active Codex sandbox and
approval policy. Do not bypass denials or grant blanket filesystem/network access.
Reviewer is configured read-only: return memory proposals and ask the parent
to run checks that require writes. Other roles inherit the parent sandbox.

Verify MCP capabilities before relying on them (`codex mcp list`, then actual
tool availability). Reuse `setup/codex-mcp-setup.sh` for supported registrations;
never copy Claude tokens. Devops can use installed provider CLIs if authorized;
missing provider MCPs are capability gaps, not a reason to invent results.
Do not auto-enable cloud write tools in an audit environment.

Use `.artifacts/screenshots/<run-id>/` for temporary visual evidence. Keep
secrets out of tracked memory/events/commits. Keep the Supervisor audit producer
accurate and explicitly trigger required audits from Codex. Audit errors never
authorize progressing past a required gate.
