import { basename } from "node:path";
import { redactText } from "../security/redact.js";
import type { AuditRecord, AuditResult, NormalizedEvent } from "../types.js";

export function formatAuditNotification(audit: AuditRecord, result: AuditResult): string {
  const icon = result.decision === "BLOCK" ? "🚨" : result.decision === "HUMAN_REQUIRED" ? "🤖" : "✅";
  const human = result.human_request
    ? `\n\nHuman action:\n${result.human_request.requested_action}\n\nOther work may continue: ${result.human_request.safe_to_continue_other_work ? "yes" : "no"}`
    : "";
  return redactText(`${icon} Codex Supervisor — ${result.decision}

Project: ${basename(audit.project_path)}
Audit: ${audit.audit_type}
Audit ID: ${audit.id}

${result.summary}${human}`, 3_500);
}

export function formatPermissionNotification(event: NormalizedEvent): string {
  const notificationType = typeof event.metadata.notification_type === "string"
    ? event.metadata.notification_type
    : "permission_prompt";
  const labels: Record<string, { title: string; fallback: string }> = {
    permission_prompt: { title: "Permission required", fallback: "Claude requires a permission decision." },
    idle_prompt: { title: "Response required", fallback: "Claude is waiting for your response." },
    elicitation_dialog: { title: "MCP input required", fallback: "An MCP integration is waiting for your input." },
    agent_needs_input: { title: "Agent input required", fallback: "A Claude agent is waiting for your input." },
  };
  const label = labels[notificationType] ?? { title: "Attention required", fallback: "Claude requires your attention." };
  const message = typeof event.metadata.message === "string" ? event.metadata.message : label.fallback;
  return redactText(`🔐 Agentic Kit — ${label.title}

Project: ${basename(event.project_path)}
Agent: ${event.agent_type ?? "orchestrator"}

${message}

Open the Claude session to approve or reject.`, 3_500);
}

export function formatFailureNotification(projectPath: string, auditType: string, error: string): string {
  return redactText(`⚠️ Codex Supervisor — Audit unavailable

Project: ${basename(projectPath)}
Audit: ${auditType}

${error}

No PASS was recorded. Independent work may continue, but this required gate remains uncleared.`, 3_500);
}
