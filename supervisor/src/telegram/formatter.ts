import { basename } from "node:path";
import { redactText } from "../security/redact.js";
import type { AuditRecord, AuditResult, NormalizedEvent } from "../types.js";

const DECISION_LABELS: Record<AuditResult["decision"], { icon: string; label: string }> = {
  PASS: { icon: "✅", label: "VALIDÉ (PASS)" },
  CHALLENGE: { icon: "⚠️", label: "AMÉLIORATIONS REQUISES (CHALLENGE)" },
  BLOCK: { icon: "🚨", label: "BLOQUÉ (BLOCK)" },
  HUMAN_REQUIRED: { icon: "👤", label: "ACTION HUMAINE REQUISE (HUMAN_REQUIRED)" },
};

const AUDIT_LABELS: Record<AuditRecord["audit_type"], string> = {
  research: "recherche et sources",
  architecture: "architecture",
  code: "code",
  reviewer_meta: "méta-audit reviewer",
  qa: "QA",
  deployment: "pré-déploiement",
  final: "audit final",
  design_due_diligence: "audit préalable du design",
  visual_ux_audit: "audit visuel UI/UX",
  security: "sécurité",
};

export function formatAuditNotification(audit: AuditRecord, result: AuditResult): string {
  const decision = DECISION_LABELS[result.decision];
  const human = result.human_request
    ? `\n\nAction humaine :\n${result.human_request.requested_action}\n\nLes autres travaux peuvent continuer : ${result.human_request.safe_to_continue_other_work ? "oui" : "non"}`
    : "";
  return redactText(`${decision.icon} Codex Supervisor — ${decision.label}

Projet : ${basename(audit.project_path)}
Audit : ${AUDIT_LABELS[audit.audit_type]}
ID d’audit : ${audit.id}

${result.summary}${human}`, 3_500);
}

export function formatPermissionNotification(event: NormalizedEvent): string {
  const notificationType = typeof event.metadata.notification_type === "string"
    ? event.metadata.notification_type
    : "permission_prompt";
  const labels: Record<string, { title: string; fallback: string }> = {
    permission_prompt: { title: "Autorisation requise", fallback: "Claude attend une décision d’autorisation." },
    idle_prompt: { title: "Réponse requise", fallback: "Claude attend ta réponse." },
    elicitation_dialog: { title: "Saisie MCP requise", fallback: "Une intégration MCP attend ta réponse." },
    agent_needs_input: { title: "Réponse requise par un agent", fallback: "Un agent Claude attend ta réponse." },
  };
  const label = labels[notificationType] ?? { title: "Intervention requise", fallback: "Claude requiert ton attention." };
  const message = typeof event.metadata.message === "string" ? event.metadata.message : label.fallback;
  return redactText(`🔐 Agentic Kit — ${label.title}

Projet : ${basename(event.project_path)}
Agent : ${event.agent_type ?? "orchestrator"}

${message}

Ouvre la session Claude pour répondre.`, 3_500);
}

export function formatFailureNotification(projectPath: string, auditType: string, error: string): string {
  return redactText(`⚠️ Codex Supervisor — Audit indisponible

Projet : ${basename(projectPath)}
Audit : ${auditType}

${error}

Aucun PASS n’a été enregistré. Les travaux indépendants peuvent continuer, mais cette porte de validation obligatoire reste non validée.`, 3_500);
}
