import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { AUDIT_LABELS, auditItem, auditLabel, auditTone, controlAuditSummary, eventItem } from "./activity.js";
import type { SupervisorConfig } from "./config.js";
import type { ActiveRunRecord, SupervisorDatabase } from "./db.js";
import {
  listPortfolio, productionSet, readProjectFiles,
  type MissionGate, type MissionSlice, type MissionState, type ProjectFiles, type RepairLoop,
} from "./missions.js";
import { redactText, safeProjectLabel } from "./security/redact.js";
import type {
  ActivityItemType, ActivityProject, AuditRecord, ControlAttentionItem, ControlAuditSummary,
} from "./types.js";

/** Mission-aware part of the control snapshot: what waits for the user, what is
 *  blocked, what runs, and every project of the portfolio. Built only while a
 *  tab asks for it; costs a fixed number of SQL statements plus bounded reads
 *  of small Markdown files. */

export type ProjectState = MissionState | "none";

export interface ControlProjectView {
  /** Opaque, stable identifier: never the absolute path. */
  key: string;
  name: string;
  slug: string | null;
  /** `~/…` when the project lives under the user's home and its name is safe; otherwise null. */
  displayPath: string | null;
  state: ProjectState;
  active: boolean;
  production: boolean;
  lastActivityAt: string | null;
  openRequests: number;
  latestAudit: ControlAuditSummary | null;
  mission: null | {
    idea: string;
    requestedProfile: string;
    effectiveProfile: string;
    phase: string;
    nextStep: string | null;
    gates: MissionGate[];
    waiting: string[];
    definitionOfDone: string[];
    journal: string[];
  };
  slices: MissionSlice[];
  slicesDeclared: boolean;
  repairLoops: RepairLoop[];
  pendingApprovals: number;
  decisions: string[];
  grants: string[];
}

export type WaitingKind = "claude" | "gate" | "block" | "queued" | "mission" | "grant";

export interface ControlWaitingItem {
  id: string;
  kind: WaitingKind;
  priority: 1 | 2 | 3;
  projectKey: string;
  projectName: string;
  title: string;
  unblocks: string | null;
  why: string | null;
  command: string | null;
  since: string | null;
}

export interface ControlFlag { projectKey: string; projectName: string; text: string; meta: string | null; tone: ActivityItemType }

export interface ControlRun {
  id: string;
  projectKey: string;
  projectName: string;
  tool: "Claude" | "Codex";
  unattended: boolean;
  startedAt: string;
  lastSignalAt: string;
  silent: boolean;
  agents: Array<{ role: string; since: string }>;
}

export interface ControlTimelineItem { id: string; at: string; tone: ActivityItemType; label: string; projectName: string; title: string }

export interface ControlAuditRow {
  id: string; projectName: string; typeLabel: string; label: string; tone: ActivityItemType; at: string; summary: string;
}

export interface MissionControl {
  projects: ControlProjectView[];
  waiting: ControlWaitingItem[];
  blocked: ControlFlag[];
  watch: ControlFlag[];
  runs: ControlRun[];
  activity: ControlTimelineItem[];
  audits: ControlAuditRow[];
  counts: { waiting: number; blocked: number; runs: number; missions: number; gates: number; audits: number };
  projectsRoot: string;
}

export const SILENT_RUN_MS = 15 * 60_000;
const PORTFOLIO_LIMIT = 200;

/** Home-relative path for commands the user copies; absolute paths never leave the daemon. */
function displayPath(path: string, masked = false): string | null {
  const home = homedir();
  if (masked || !path.startsWith(`${home}/`)) return null;
  const shown = `~/${path.slice(home.length + 1)}`;
  return redactText(shown, 300) === shown ? shown : null;
}

function projectKey(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 16);
}

function projectState(files: ProjectFiles, active: boolean, latest: AuditRecord | null, openRequests: number): ProjectState {
  const mission = files.mission;
  const blockedAudit = latest?.status === "completed" && latest.decision === "BLOCK";
  if (!mission) return blockedAudit ? "blocked" : active ? "running" : "none";
  if (blockedAudit || mission.gates.some((gate) => gate.status === "blocked")) return "blocked";
  if (mission.gates.some((gate) => gate.status === "waiting") || mission.waiting.length > 0
      || files.approvals.length > 0 || openRequests > 0) return "waiting";
  if (mission.done) return "done";
  return active ? "running" : "paused";
}

/** First `code` span of a line that looks like a command the user can paste. */
/** The guard writes its reasons in English for the agent; the UI says in French what the user decides. */
export function queuedTitle(command: string | null, tool: string | null, project: string): string {
  const push = command?.match(/^agentic grant \S+ push (\S+)$/u);
  if (push) return `Autoriser le push sur ${push[1]} de ${project} ?`;
  const grant = command?.match(/^agentic grant \S+ (.+)$/u);
  if (grant) return `Autoriser « ${grant[1]} » sur ${project} ?`;
  return `Action protégée en attente de ton accord sur ${project}${tool ? ` (${tool})` : ""}`;
}

export function commandIn(text: string, projectName: string): string | null {
  for (const match of text.matchAll(/`([^`]{3,300})`/gu)) {
    const value = (match[1] ?? "").replace(/<projet>|<project>/gu, projectName).trim();
    if (/^(?:!\s*)?(?:agentic|cd|git|claude|codex|npm|pnpm|yarn|npx)\b/u.test(value)) return value.replace(/^!\s*/u, "");
  }
  return null;
}

function stripCode(text: string): string {
  return text.replace(/`([^`]*)`/gu, "$1");
}

function firstSentence(text: string, max = 140): string {
  const sentence = text.split(/(?<=[.!?])\s/u)[0] ?? text;
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}

function waitingItems(
  views: ControlProjectView[],
  files: Map<string, ProjectFiles>,
  audits: Map<string, AuditRecord>,
  attention: ControlAttentionItem[],
): ControlWaitingItem[] {
  const items: ControlWaitingItem[] = [];
  const byName = new Map(views.map((view) => [view.name, view]));
  for (const request of attention) {
    const view = byName.get(request.projectName);
    items.push({
      id: `claude-${request.id}`,
      kind: "claude",
      priority: 1,
      projectKey: view?.key ?? request.projectName,
      projectName: request.projectName,
      title: request.title,
      unblocks: request.safeToContinue ? null : "une session Claude est en pause",
      why: [request.reason, request.requestedAction].filter(Boolean).join(" · "),
      command: null,
      since: request.createdAt,
    });
  }
  for (const view of views) {
    const project = files.get(view.key);
    const mission = view.mission;
    const resume = view.displayPath ? `cd ${view.displayPath} && agentic run claude` : null;
    if (mission) {
      for (const gate of mission.gates.filter((item) => item.status === "waiting")) {
        items.push({
          id: `gate-${view.key}-${gate.id}`,
          kind: "gate",
          priority: 1,
          projectKey: view.key,
          projectName: view.name,
          title: `Valider la porte ${gate.id} de ${view.name}${gate.decision ? ` : ${gate.decision}` : ""}`,
          unblocks: "débloque toute la mission",
          why: mission.nextStep ? `Prochaine étape : ${mission.nextStep}` : null,
          command: resume,
          since: project?.mission?.updatedAt ?? null,
        });
      }
    }
    const latest = audits.get(view.key);
    if (latest?.status === "completed" && latest.decision === "BLOCK") {
      items.push({
        id: `block-${latest.id}`,
        kind: "block",
        priority: 1,
        projectKey: view.key,
        projectName: view.name,
        title: `Décider du correctif : ${AUDIT_LABELS[latest.audit_type]} bloqué sur ${view.name}`,
        unblocks: mission ? `débloque la phase « ${mission.phase} »` : "débloque la suite du travail",
        why: latest.summary ? firstSentence(redactText(latest.summary, 600), 200) : null,
        command: resume,
        since: latest.completed_at ?? latest.updated_at,
      });
    }
    for (const approval of project?.approvals ?? []) {
      items.push({
        id: `queued-${view.key}-${approval.file}`,
        kind: "queued",
        priority: 2,
        projectKey: view.key,
        projectName: view.name,
        title: queuedTitle(commandIn(approval.reason, view.name), approval.tool, view.name),
        unblocks: "mis en file pendant un run sans surveillance",
        why: approval.detail,
        command: commandIn(approval.reason, view.name),
        since: approval.requestedAt,
      });
    }
    const labPending = mission?.requestedProfile === "lab" && mission.effectiveProfile !== "lab";
    if (labPending) {
      items.push({
        id: `grant-${view.key}-lab`,
        kind: "grant",
        priority: 3,
        projectKey: view.key,
        projectName: view.name,
        title: `Profil lab demandé pour ${view.name}, la mission tourne en supervised`,
        unblocks: "autorise les portes G1 à G3 par défauts écrits",
        why: null,
        command: `agentic grant ${view.name} profile lab`,
        since: project?.mission?.updatedAt ?? null,
      });
    }
    for (const [index, line] of (mission?.waiting ?? []).entries()) {
      if (labPending && /profil(e)? lab/iu.test(line)) continue;
      items.push({
        id: `mission-${view.key}-${index}`,
        kind: "mission",
        priority: 2,
        projectKey: view.key,
        projectName: view.name,
        title: firstSentence(stripCode(line), 160),
        unblocks: null,
        why: null,
        command: commandIn(line, view.name) ?? resume,
        since: project?.mission?.updatedAt ?? null,
      });
    }
  }
  return items.sort((left, right) =>
    left.priority - right.priority
    || (left.since ?? "9999").localeCompare(right.since ?? "9999")
    || left.id.localeCompare(right.id));
}

function runView(run: ActiveRunRecord, key: string, name: string, nowMs: number): ControlRun {
  const newestFirst = run.events;
  const lastSignalAt = newestFirst[0]?.timestamp ?? run.lastSeenAt;
  const active = new Map<string, { role: string; since: string }>();
  for (const event of [...newestFirst].reverse()) {
    const id = event.agent_id ?? event.agent_type ?? "agent";
    if (event.event_type === "agent.started") {
      active.set(id, { role: redactText((event.agent_type ?? "agent").replace(/[_-]+/gu, " "), 60), since: event.timestamp });
    } else if (event.event_type === "agent.completed") active.delete(id);
  }
  return {
    id: run.sessionId,
    projectKey: key,
    projectName: name,
    tool: newestFirst.some((event) => event.producer === "codex") ? "Codex" : "Claude",
    unattended: newestFirst.some((event) => event.metadata?.unattended === true),
    startedAt: run.startedAt,
    lastSignalAt,
    silent: nowMs - Date.parse(lastSignalAt) > SILENT_RUN_MS,
    agents: [...active.values()].slice(-8),
  };
}

function projectName(path: string): string {
  const label = safeProjectLabel(basename(path), basename(path));
  return label.name;
}

export interface MissionControlInput {
  activeProjects: ActivityProject[];
  recentProjects: ActivityProject[];
  latestAudits: Map<string, AuditRecord>;
  openRequests: Map<string, number>;
  attention: ControlAttentionItem[];
}

export function buildMissionControl(
  database: SupervisorDatabase,
  config: SupervisorConfig,
  input: MissionControlInput,
  nowMs = Date.now(),
): MissionControl {
  const sources = { productionList: config.productionList, grantsDir: config.grantsDir };
  const production = productionSet(config.productionList);
  const dbByPath = new Map<string, { project: ActivityProject; active: boolean }>();
  for (const project of input.recentProjects) dbByPath.set(resolve(project.path), { project, active: false });
  for (const project of input.activeProjects) dbByPath.set(resolve(project.path), { project, active: true });

  const paths: string[] = [];
  const seen = new Set<string>();
  for (const path of [...input.activeProjects.map((project) => project.path), ...listPortfolio(config.projectsRoot, PORTFOLIO_LIMIT), ...input.recentProjects.map((project) => project.path)]) {
    const key = resolve(path);
    if (seen.has(key) || paths.length >= PORTFOLIO_LIMIT) continue;
    seen.add(key);
    paths.push(key);
  }

  const files = new Map<string, ProjectFiles>();
  const audits = new Map<string, AuditRecord>();
  const keyOfPath = new Map<string, string>();
  const views: ControlProjectView[] = paths.map((path) => {
    const key = projectKey(path);
    keyOfPath.set(path, key);
    const project = readProjectFiles(path, sources, production);
    files.set(key, project);
    const db = dbByPath.get(path);
    const latest = db ? input.latestAudits.get(db.project.id) ?? null : null;
    if (latest) audits.set(key, latest);
    const openRequests = db ? input.openRequests.get(db.project.id) ?? 0 : 0;
    const label = db ? safeProjectLabel(db.project.name, db.project.slug) : safeProjectLabel(basename(path), basename(path));
    const masked = label.slug === null && label.name !== basename(path);
    const lastActivity = [db?.project.lastSeenAt, project.lastActivityAt].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
    return {
      key,
      name: label.name,
      slug: db ? label.slug : null,
      displayPath: displayPath(path, masked),
      state: projectState(project, db?.active ?? false, latest, openRequests),
      active: db?.active ?? false,
      production: project.production,
      lastActivityAt: lastActivity,
      openRequests,
      latestAudit: controlAuditSummary(latest),
      mission: project.mission && {
        idea: project.mission.idea,
        requestedProfile: project.mission.requestedProfile,
        effectiveProfile: project.mission.effectiveProfile,
        phase: project.mission.phase,
        nextStep: project.mission.nextStep,
        gates: project.mission.gates,
        waiting: project.mission.waiting,
        definitionOfDone: project.mission.definitionOfDone,
        journal: project.mission.journal,
      },
      slices: project.slices,
      slicesDeclared: project.slicesDeclared,
      repairLoops: project.repairLoops,
      pendingApprovals: project.approvals.length,
      decisions: project.decisions,
      grants: project.grants,
    };
  });

  const byKey = new Map(views.map((view) => [view.key, view]));
  const runs = database.listActiveRuns(config.activitySessionStaleMs).map((run) => {
    const key = keyOfPath.get(resolve(run.projectPath)) ?? projectKey(resolve(run.projectPath));
    return runView(run, key, byKey.get(key)?.name ?? safeProjectLabel(run.projectName, run.projectSlug).name, nowMs);
  });

  const waiting = waitingItems(views, files, audits, input.attention);
  const blocked: ControlFlag[] = [];
  const watch: ControlFlag[] = [];
  for (const view of views) {
    const latest = audits.get(view.key);
    if (view.state === "blocked") {
      const reason = latest?.decision === "BLOCK" ? `BLOCK ${AUDIT_LABELS[latest.audit_type].toLowerCase()}` : "porte bloquée";
      blocked.push({ projectKey: view.key, projectName: view.name, text: reason, meta: view.mission?.phase ?? null, tone: "block" });
    } else if (view.mission?.gates.some((gate) => gate.status === "waiting")) {
      const gate = view.mission.gates.find((item) => item.status === "waiting");
      blocked.push({ projectKey: view.key, projectName: view.name, text: `porte ${gate?.id ?? ""} à valider`, meta: view.mission.phase, tone: "human" });
    }
    for (const loop of view.repairLoops.filter((item) => item.attempts >= 2)) {
      watch.push({ projectKey: view.key, projectName: view.name, text: loop.approach, meta: `réparation ${loop.attempts}/3`, tone: "challenge" });
    }
    if (latest?.status === "completed" && latest.decision === "CHALLENGE") {
      watch.push({ projectKey: view.key, projectName: view.name, text: `${AUDIT_LABELS[latest.audit_type]} à corriger`, meta: "CHALLENGE", tone: "challenge" });
    }
  }
  for (const run of runs.filter((item) => item.silent)) {
    const minutes = Math.round((nowMs - Date.parse(run.lastSignalAt)) / 60_000);
    watch.push({ projectKey: run.projectKey, projectName: run.projectName, text: `${run.tool} sans signal`, meta: `${minutes} min`, tone: "challenge" });
  }

  const recentAudits = database.listAudits(undefined, 40);
  const activity: ControlTimelineItem[] = [
    ...database.listEvents(undefined, 80).flatMap((event) => {
      const item = eventItem(event);
      return item ? [{ id: item.id, at: item.timestamp, tone: item.type, label: item.label, projectName: projectName(event.project_path), title: item.title }] : [];
    }),
    ...recentAudits.map((audit) => {
      const item = auditItem(audit);
      return { id: item.id, at: item.timestamp, tone: item.type, label: item.label, projectName: projectName(audit.project_path), title: item.title };
    }),
  ].sort((left, right) => right.at.localeCompare(left.at)).slice(0, 40);

  const auditRows: ControlAuditRow[] = recentAudits.slice(0, 30).map((audit) => ({
    id: audit.id,
    projectName: projectName(audit.project_path),
    typeLabel: AUDIT_LABELS[audit.audit_type],
    label: auditLabel(audit),
    tone: auditTone(audit),
    at: audit.completed_at ?? audit.started_at ?? audit.updated_at,
    summary: redactText(audit.summary ?? "", 400),
  }));

  return {
    projects: views,
    waiting,
    blocked,
    watch,
    runs,
    activity,
    audits: auditRows,
    counts: {
      waiting: waiting.length,
      blocked: blocked.length,
      runs: runs.length,
      missions: views.filter((view) => view.mission && view.state !== "done").length,
      gates: views.reduce((total, view) => total + (view.mission?.gates.filter((gate) => gate.status === "waiting").length ?? 0), 0),
      audits: [...audits.values()].filter((audit) => audit.decision === "BLOCK" || audit.decision === "CHALLENGE").length,
    },
    projectsRoot: displayPath(config.projectsRoot) ?? basename(config.projectsRoot),
  };
}
