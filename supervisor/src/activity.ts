import { resolve } from "node:path";
import { SUPERVISOR_VERSION, type SupervisorConfig } from "./config.js";
import { SupervisorDatabase } from "./db.js";
import { humanAttentionFromEvent } from "./human/attention.js";
import { redactText, safeProjectLabel } from "./security/redact.js";
import type {
  ActivityItem,
  ActivityItemType,
  ActivityProject,
  ActivitySnapshot,
  AuditRecord,
  AuditResult,
  ControlAttentionItem,
  ControlAuditSummary,
  ControlProject,
  ControlSnapshot,
  HumanRequestSource,
  NormalizedEvent,
  QueueCounts,
} from "./types.js";

type ActivityListener = () => void;

export class ActivityBus {
  private readonly listeners = new Map<string, Set<ActivityListener>>();
  private readonly globalListeners = new Set<ActivityListener>();

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

  public subscribeAll(listener: ActivityListener): () => void {
    this.globalListeners.add(listener);
    return () => { this.globalListeners.delete(listener); };
  }

  public publish(projectPath: string): void {
    const projectListeners = this.listeners.get(resolve(projectPath));
    if (projectListeners) for (const listener of [...projectListeners]) listener();
    for (const listener of [...this.globalListeners]) listener();
  }

  public get subscriberCount(): number {
    let count = this.globalListeners.size;
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

/** Claude's raw end reasons are enum-like identifiers; the view stays French. */
const SESSION_END_REASONS: Record<string, string> = {
  clear: "la session a été effacée",
  logout: "l’utilisateur s’est déconnecté",
  prompt_input_exit: "la saisie a été interrompue",
  other: "non précisé",
};

function sessionEndReason(value: unknown): string {
  const raw = stringValue(value, 100);
  if (!raw) return "non précisé";
  return SESSION_END_REASONS[raw] ?? "non précisé";
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
        details: `Motif : ${sessionEndReason(event.metadata.reason)}`,
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

function auditTone(audit: AuditRecord): ActivityItemType {
  if (audit.status === "failed") return "error";
  switch (audit.decision) {
    case "PASS": return "pass";
    case "CHALLENGE": return "challenge";
    case "BLOCK": return "block";
    case "HUMAN_REQUIRED": return "human";
    default: return "info";
  }
}

function auditLabel(audit: AuditRecord): string {
  if (audit.status === "failed") return "INDISPONIBLE";
  return audit.decision ?? (audit.status === "running" ? "EN COURS" : "PLANIFIÉ");
}

function auditItem(audit: AuditRecord): ActivityItem {
  const result = parseAuditResult(audit);
  const decision = audit.decision;
  const type = auditTone(audit);
  const label = auditLabel(audit);
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

const ATTENTION_TITLES: Record<HumanRequestSource, string> = {
  permission: "Autorisation requise",
  question: "Décision humaine requise",
  elicitation: "Saisie MCP requise",
  audit: "Arbitrage requis après audit",
};

const CONTROL_ATTENTION_LIMIT = 50;
/** Hard bound on the rows a single snapshot may carry, active projects first. */
const CONTROL_PROJECT_LIMIT = 200;

function controlAuditSummary(audit: AuditRecord | null): ControlAuditSummary | null {
  if (!audit) return null;
  return {
    type: audit.audit_type,
    typeLabel: AUDIT_LABELS[audit.audit_type],
    tone: auditTone(audit),
    label: auditLabel(audit),
    decision: audit.decision,
    status: audit.status,
    at: audit.completed_at ?? audit.started_at ?? audit.updated_at,
    summary: redactText(audit.summary ?? "", 600),
  };
}

interface ControlAggregates {
  queues: Map<string, QueueCounts>;
  requests: Map<string, number>;
  audits: Map<string, AuditRecord>;
}

const EMPTY_QUEUE: QueueCounts = { pending: 0, running: 0, completed: 0, failed: 0 };

function controlProject(project: ActivityProject, active: boolean, aggregates: ControlAggregates): ControlProject {
  const label = safeProjectLabel(project.name, project.slug);
  return {
    name: label.name,
    slug: label.slug,
    active,
    activeSessionCount: project.activeSessionCount,
    startedAt: project.startedAt,
    lastSeenAt: project.lastSeenAt,
    openHumanRequests: aggregates.requests.get(project.id) ?? 0,
    queue: aggregates.queues.get(project.id) ?? { ...EMPTY_QUEUE },
    latestAudit: controlAuditSummary(aggregates.audits.get(project.id) ?? null),
  };
}

export interface ControlRuntimeState {
  telegramConfigured: boolean;
  activeStreams: number;
}

export function buildControlSnapshot(
  database: SupervisorDatabase,
  config: SupervisorConfig,
  runtime: ControlRuntimeState,
): ControlSnapshot {
  // One page of rows, active projects first, then the remaining budget of recent
  // ones. Every per-project value below is resolved by three batch queries, so a
  // snapshot costs a constant number of round-trips whatever the project count.
  const activePage = database.listActiveProjects(config.activitySessionStaleMs, CONTROL_PROJECT_LIMIT + 1);
  const activeProjects = activePage.slice(0, CONTROL_PROJECT_LIMIT);
  const activeSlugs = new Set(activeProjects.map((project) => project.slug));
  const remaining = CONTROL_PROJECT_LIMIT - activeProjects.length;
  const recentPage = database.listRecentProjects(
    config.controlRecentMs,
    config.activitySessionStaleMs,
    Math.max(1, remaining + 1),
  );
  const recentProjects = remaining > 0
    ? recentPage.filter((project) => !activeSlugs.has(project.slug)).slice(0, remaining)
    : [];
  const projectsTruncated = activePage.length > CONTROL_PROJECT_LIMIT
    || (remaining > 0 ? recentPage.length > remaining : recentPage.length > 0);

  const ids = [...activeProjects, ...recentProjects].map((project) => project.id);
  const aggregates: ControlAggregates = {
    queues: database.projectQueueCountsBatch(ids),
    requests: database.openHumanRequestCountsBatch(ids),
    audits: database.latestAuditsBatch(ids),
  };

  const attention: ControlAttentionItem[] = database.listOpenHumanRequests(CONTROL_ATTENTION_LIMIT)
    .map((request) => ({
      id: request.id,
      projectName: request.projectName,
      projectSlug: request.projectSlug,
      source: request.source,
      title: ATTENTION_TITLES[request.source] ?? ATTENTION_TITLES.question,
      reason: request.message,
      requestedAction: request.requestedAction,
      createdAt: request.createdAt,
      safeToContinue: request.safeToContinue,
    }));
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    daemon: {
      version: SUPERVISOR_VERSION,
      level: config.level,
      database: database.ping() ? "ok" : "error",
      queue: database.activeQueueCounts(),
      telegram: runtime.telegramConfigured ? "configured" : "not_configured",
      activeStreams: runtime.activeStreams,
    },
    attention,
    attentionTotal: database.openHumanRequestCount(),
    attentionLimit: CONTROL_ATTENTION_LIMIT,
    projects: [
      ...activeProjects.map((project) => controlProject(project, true, aggregates)),
      ...recentProjects.map((project) => controlProject(project, false, aggregates)),
    ],
    projectLimit: CONTROL_PROJECT_LIMIT,
    projectsTruncated,
  };
}
