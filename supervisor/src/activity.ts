import { resolve } from "node:path";
import { SupervisorDatabase } from "./db.js";
import { humanAttentionFromEvent } from "./human/attention.js";
import { redactText } from "./security/redact.js";
import type { ActivityItem, ActivitySnapshot, AuditRecord, AuditResult, NormalizedEvent } from "./types.js";

type ActivityListener = () => void;

export class ActivityBus {
  private readonly listeners = new Map<string, Set<ActivityListener>>();

  public subscribe(projectPath: string, listener: ActivityListener): () => void {
    const key = resolve(projectPath);
    const projectListeners = this.listeners.get(key) ?? new Set<ActivityListener>();
    projectListeners.add(listener);
    this.listeners.set(key, projectListeners);
    return () => {
      projectListeners.delete(listener);
      if (projectListeners.size === 0) this.listeners.delete(key);
    };
  }

  public publish(projectPath: string): void {
    const projectListeners = this.listeners.get(resolve(projectPath));
    if (!projectListeners) return;
    for (const listener of [...projectListeners]) listener();
  }

  public get subscriberCount(): number {
    let count = 0;
    for (const listeners of this.listeners.values()) count += listeners.size;
    return count;
  }
}

const AUDIT_LABELS: Record<AuditRecord["audit_type"], string> = {
  research: "Recherche et sources",
  architecture: "Architecture",
  code: "Code",
  reviewer_meta: "Revue indépendante",
  qa: "QA",
  deployment: "Pré-déploiement",
  final: "Audit final",
  design_due_diligence: "Direction produit et design",
  visual_ux_audit: "Qualité visuelle UI/UX",
  security: "Sécurité",
};

function stringValue(value: unknown, maxLength = 2_000): string | null {
  return typeof value === "string" && value.trim() ? redactText(value.trim(), maxLength) : null;
}

function eventItem(event: NormalizedEvent): ActivityItem | null {
  const attention = humanAttentionFromEvent(event);
  if (attention) {
    return {
      id: event.id,
      type: "human",
      label: event.event_type === "permission.requested" ? "AUTORISATION" : "HUMAN_REQUIRED",
      category: attention.type === "elicitation" ? "MCP" : "Intervention",
      timestamp: event.timestamp,
      title: attention.title,
      summary: attention.reason,
      details: [...attention.details, `Action attendue : ${attention.requestedAction}`].join("\n"),
      auditId: null,
    };
  }

  const agent = event.agent_type ? event.agent_type.replace(/[_-]+/gu, " ") : "agent";
  switch (event.event_type) {
    case "session.started":
      return {
        id: event.id,
        type: "info",
        label: "DÉMARRAGE",
        category: "Session",
        timestamp: event.timestamp,
        title: "La supervision du projet a démarré",
        summary: "Le Supervisor a ouvert le suivi de cette session et la vue d’activité est disponible.",
        details: "Les événements structurés sont persistés localement. Aucun processus web distinct n’est créé pour ce projet.",
        auditId: null,
      };
    case "session.ended":
      return {
        id: event.id,
        type: "info",
        label: "ARRÊT",
        category: "Session",
        timestamp: event.timestamp,
        title: "La session de supervision est terminée",
        summary: "La vue du projet est désactivée dès que sa dernière session se ferme.",
        details: `Motif : ${stringValue(event.metadata.reason, 100) ?? "other"}`,
        auditId: null,
      };
    case "agent.started":
      return {
        id: event.id,
        type: "info",
        label: "EN COURS",
        category: "Agent",
        timestamp: event.timestamp,
        title: `${agent} a commencé son travail`,
        summary: "Le jalon est suivi sans lancer automatiquement un audit coûteux.",
        details: event.agent_id ? `Agent ID : ${redactText(event.agent_id, 300)}` : "Cycle agent démarré.",
        auditId: null,
      };
    case "agent.completed":
      return {
        id: event.id,
        type: "info",
        label: "LIVRÉ",
        category: "Agent",
        timestamp: event.timestamp,
        title: `${agent} a terminé son jalon`,
        summary: stringValue(event.last_message, 1_400) ?? "Le livrable est prêt pour le contrôle suivant.",
        details: "Le Dispatcher décide si ce jalon justifie un audit indépendant ou doit être regroupé avec d’autres preuves.",
        auditId: null,
      };
    case "human.resolved":
      return {
        id: event.id,
        type: "info",
        label: "REPRISE",
        category: "Intervention",
        timestamp: event.timestamp,
        title: "La demande humaine a reçu une réponse",
        summary: "Le flux concerné peut reprendre avec la réponse fournie dans Claude.",
        details: stringValue(event.metadata.action, 300) ?? "La réponse reste dans la session Claude et n’est pas recopiée dans Telegram.",
        auditId: null,
      };
    case "permission.denied": {
      const command = stringValue(event.metadata.command_summary, 500);
      return {
        id: event.id,
        type: "info",
        label: "REFUSÉ",
        category: "Permission",
        timestamp: event.timestamp,
        title: "Le mode automatique a refusé une opération",
        summary: stringValue(event.metadata.reason, 1_000) ?? "La règle de sécurité a refusé l’opération sans élargir les permissions.",
        details: `Outil : ${stringValue(event.metadata.tool_name, 200) ?? "inconnu"}${command ? `\nCommande : ${command}` : ""}`,
        auditId: null,
      };
    }
    default:
      return null;
  }
}

function parseAuditResult(audit: AuditRecord): AuditResult | null {
  if (!audit.result_json) return null;
  try { return JSON.parse(audit.result_json) as AuditResult; }
  catch { return null; }
}

function auditItem(audit: AuditRecord): ActivityItem {
  const result = parseAuditResult(audit);
  const decision = audit.decision;
  const type = audit.status === "failed"
    ? "error"
    : decision === "PASS"
      ? "pass"
      : decision === "CHALLENGE"
        ? "challenge"
        : decision === "BLOCK"
          ? "block"
          : decision === "HUMAN_REQUIRED"
            ? "human"
            : "info";
  const label = audit.status === "failed"
    ? "INDISPONIBLE"
    : decision ?? (audit.status === "running" ? "EN COURS" : "PLANIFIÉ");
  const statusSummary = audit.status === "pending"
    ? "Le contrôle a été regroupé dans la file et démarrera hors du chemin critique de Claude."
    : audit.status === "running"
      ? "Le contrôle indépendant est en cours, en lecture seule."
      : audit.status === "failed"
        ? "Le contrôle n’a pas pu produire de verdict et ne compte pas comme un PASS."
        : "Le contrôle indépendant est terminé.";
  const findingDetails = result?.findings.slice(0, 4).map((finding) =>
    `${finding.title} — ${finding.recommended_action}`,
  ) ?? [];
  const humanDetails = result?.human_request
    ? [`Pourquoi : ${result.human_request.reason}`, `Action attendue : ${result.human_request.requested_action}`]
    : [];
  const errorDetails = audit.last_error ? [`Erreur : ${audit.last_error}`] : [];
  return {
    id: `audit-${audit.id}`,
    type,
    label,
    category: AUDIT_LABELS[audit.audit_type],
    timestamp: audit.completed_at ?? audit.started_at ?? audit.updated_at,
    title: audit.status === "completed"
      ? `${AUDIT_LABELS[audit.audit_type]} — ${decision ?? "sans décision"}`
      : `${AUDIT_LABELS[audit.audit_type]} — ${label.toLowerCase()}`,
    summary: redactText(audit.summary ?? statusSummary, 2_000),
    details: redactText([...humanDetails, ...findingDetails, ...errorDetails].join("\n") || statusSummary, 5_000),
    auditId: audit.id,
  };
}

export function buildActivitySnapshot(
  database: SupervisorDatabase,
  slug: string,
  staleMs: number,
): ActivitySnapshot | null {
  const project = database.activeProjectBySlug(slug, staleMs);
  if (!project) return null;
  const items = [
    ...database.listEvents(project.path, 250).map(eventItem).filter((item): item is ActivityItem => item !== null),
    ...database.listAudits(project.path, 250).map(auditItem),
  ]
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id))
    .slice(-200);
  const latestSignalAt = items.at(-1)?.timestamp ?? project.lastSeenAt;
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    project: { name: project.name, slug: project.slug },
    status: "active",
    activeSessionCount: project.activeSessionCount,
    startedAt: project.startedAt,
    latestSignalAt,
    interventionCount: database.openHumanRequestCount(project.path),
    queue: database.projectQueueCounts(project.path),
    items,
  };
}
