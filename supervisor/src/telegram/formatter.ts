import { basename } from "node:path";
import { redactText } from "../security/redact.js";
import type { AuditRecord, AuditResult, HumanAttention, NormalizedEvent } from "../types.js";

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
    ? `\n\nPourquoi :\n${result.human_request.reason}\n\nAction attendue :\n${result.human_request.requested_action}\n\nLes autres travaux peuvent continuer : ${result.human_request.safe_to_continue_other_work ? "oui" : "non"}`
    : "";
  return redactText(`${decision.icon} Kriton Supervisor — ${decision.label}

Projet : ${basename(audit.project_path)}
Audit : ${AUDIT_LABELS[audit.audit_type]}
ID d’audit : ${audit.id}

${result.summary}${human}`, 3_500);
}

export function formatHumanAttentionNotification(event: NormalizedEvent, attention: HumanAttention): string {
  const icon = attention.type === "permission" ? "🔐" : attention.type === "elicitation" ? "🔌" : "👤";
  const details = attention.details.length
    ? `\n\nDétails :\n${attention.details.map((detail) => `• ${detail}`).join("\n")}`
    : "";
  return redactText(`${icon} Kriton Supervisor — ${attention.title}

Projet : ${basename(event.project_path)}
Source : évènement structuré ${String(event.metadata.hook_event_name ?? event.event_type)}
Agent : ${event.agent_type ?? "orchestrator"}

Pourquoi :
${attention.reason}${details}

Action attendue :
${attention.requestedAction}

Les autres travaux peuvent continuer : ${attention.safeToContinue ? "oui" : "non"}`, 3_500);
}

export function formatFailureNotification(projectPath: string, auditType: string, error: string): string {
  return redactText(`⚠️ Kriton Supervisor — Audit indisponible

Projet : ${basename(projectPath)}
Audit : ${auditType}

${error}

Aucun PASS n’a été enregistré. Les travaux indépendants peuvent continuer, mais cette porte de validation obligatoire reste non validée.`, 3_500);
}
