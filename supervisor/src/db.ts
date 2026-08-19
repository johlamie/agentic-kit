import { randomUUID, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type {
  AuditDecision,
  AuditFinding,
  AuditRecord,
  AuditResult,
  AuditType,
  ActivityProject,
  GateResult,
  HumanAttention,
  NormalizedEvent,
  QueueCounts,
  Severity,
} from "./types.js";

type Row = Record<string, unknown>;

const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  claude_session_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL,
  UNIQUE(project_id, claude_session_id)
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  producer TEXT NOT NULL,
  candidate_id TEXT,
  audit_target TEXT,
  event_type TEXT NOT NULL,
  agent_type TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  processed_at TEXT
);
CREATE INDEX IF NOT EXISTS events_project_created_idx ON events(project_id, created_at DESC);
CREATE TABLE IF NOT EXISTS audits (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_path TEXT NOT NULL,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  trigger_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  audit_type TEXT NOT NULL,
  status TEXT NOT NULL,
  decision TEXT,
  severity TEXT,
  summary TEXT,
  result_json TEXT,
  context_json TEXT NOT NULL,
  producer TEXT NOT NULL DEFAULT 'claude',
  candidate_id TEXT,
  audit_target TEXT,
  codex_thread_id TEXT,
  coalesce_key TEXT,
  not_before TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS audits_queue_idx ON audits(status, not_before, created_at);
CREATE INDEX IF NOT EXISTS audits_project_idx ON audits(project_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS audits_event_type_unique
  ON audits(trigger_event_id, audit_type)
  WHERE trigger_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS audits_active_coalesce_unique
  ON audits(coalesce_key)
  WHERE coalesce_key IS NOT NULL AND status IN ('pending', 'running');
CREATE TABLE IF NOT EXISTS audit_findings (
  id TEXT PRIMARY KEY,
  audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  evidence_classification TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS human_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  audit_id TEXT REFERENCES audits(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  requested_action TEXT NOT NULL,
  safe_to_continue INTEGER NOT NULL,
  status TEXT NOT NULL,
  telegram_message_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS codex_runs (
  id TEXT PRIMARY KEY,
  audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  thread_id TEXT,
  status TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  stdout_excerpt TEXT NOT NULL,
  stderr_excerpt TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);
`;

const MIGRATION_002 = `
ALTER TABLE projects ADD COLUMN route_slug TEXT;
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;
ALTER TABLE sessions ADD COLUMN end_reason TEXT;
ALTER TABLE human_requests ADD COLUMN session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE human_requests ADD COLUMN trigger_event_id TEXT REFERENCES events(id) ON DELETE SET NULL;
UPDATE sessions SET last_seen_at = COALESCE(ended_at, started_at);
UPDATE sessions SET status = 'ended', ended_at = COALESCE(ended_at, last_seen_at)
  WHERE status = 'stopping';
CREATE INDEX sessions_project_status_idx ON sessions(project_id, status, last_seen_at DESC);
CREATE UNIQUE INDEX human_requests_trigger_unique ON human_requests(trigger_event_id)
  WHERE trigger_event_id IS NOT NULL;
`;

function now(): string { return new Date().toISOString(); }

function projectId(projectPath: string): string {
  const name = basename(projectPath).replace(/[^A-Za-z0-9_-]+/gu, "-").slice(0, 40) || "project";
  const hash = createHash("sha256").update(projectPath).digest("hex").slice(0, 12);
  return `${name}-${hash}`;
}

function projectSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64) || "project";
}

const RESERVED_PROJECT_SLUGS = new Set(["health", "v1", "_supervisor"]);

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function rowToAudit(row: Row): AuditRecord {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    project_path: String(row.project_path),
    session_id: asString(row.session_id),
    trigger_event_id: asString(row.trigger_event_id),
    audit_type: String(row.audit_type) as AuditType,
    status: String(row.status) as AuditRecord["status"],
    decision: asString(row.decision) as AuditDecision | null,
    severity: asString(row.severity) as Severity | null,
    summary: asString(row.summary),
    result_json: asString(row.result_json),
    context_json: String(row.context_json),
    producer: String(row.producer),
    candidate_id: asString(row.candidate_id),
    audit_target: asString(row.audit_target),
    coalesce_key: asString(row.coalesce_key),
    not_before: String(row.not_before),
    attempt_count: asNumber(row.attempt_count),
    max_attempts: asNumber(row.max_attempts),
    started_at: asString(row.started_at),
    completed_at: asString(row.completed_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    last_error: asString(row.last_error),
  };
}

function rowToActivityProject(row: Row): ActivityProject {
  return {
    id: String(row.id),
    path: String(row.path),
    name: String(row.name),
    slug: String(row.route_slug),
    activeSessionCount: asNumber(row.active_session_count),
    startedAt: String(row.started_at),
    lastSeenAt: String(row.last_seen_at),
  };
}

export interface EnqueueAuditInput {
  projectPath: string;
  claudeSessionId?: string | null;
  triggerEventId?: string | null;
  auditType: AuditType;
  context?: Record<string, unknown>;
  coalesceKey?: string | null;
  notBefore?: string;
  maxAttempts?: number;
  producer?: string;
  candidateId?: string | null;
  auditTarget?: string | null;
}

export class SupervisorDatabase {
  private readonly database: DatabaseSync;

  public constructor(public readonly path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA foreign_keys = ON;");
    if (path !== ":memory:") this.database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    this.migrate();
  }

  public close(): void { this.database.close(); }

  public ping(): boolean {
    return asNumber((this.database.prepare("SELECT 1 AS ok").get() as Row | undefined)?.ok) === 1;
  }

  private migrate(): void {
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database.exec(MIGRATION_001);
      const existing = this.database.prepare("SELECT version FROM schema_migrations WHERE version = 1").get();
      if (!existing) {
        this.database.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES(1, ?)").run(now());
      }
      const second = this.database.prepare("SELECT version FROM schema_migrations WHERE version = 2").get();
      if (!second) {
        this.database.exec(MIGRATION_002);
        this.assignMissingProjectSlugs();
        this.database.exec("CREATE UNIQUE INDEX projects_route_slug_unique ON projects(route_slug) WHERE route_slug IS NOT NULL;");
        this.database.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES(2, ?)").run(now());
      }
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  private assignMissingProjectSlugs(): void {
    const rows = this.database.prepare("SELECT id, path, name FROM projects WHERE route_slug IS NULL ORDER BY created_at, rowid").all() as Row[];
    for (const row of rows) {
      const candidate = this.availableProjectSlug(String(row.name), String(row.path), String(row.id));
      this.database.prepare("UPDATE projects SET route_slug = ? WHERE id = ?").run(candidate, String(row.id));
    }
  }

  private availableProjectSlug(name: string, projectPath: string, excludedProjectId: string | null = null): string {
    const base = projectSlug(name);
    const hash = createHash("sha256").update(projectPath).digest("hex").slice(0, 8);
    let suffix = 0;
    let candidate = RESERVED_PROJECT_SLUGS.has(base) ? `${base.slice(0, 55)}-${hash}` : base;
    while (this.database.prepare(`
      SELECT 1 FROM projects WHERE route_slug = ? AND (? IS NULL OR id <> ?)
    `).get(candidate, excludedProjectId, excludedProjectId)) {
      suffix += 1;
      const tail = suffix === 1 ? hash : `${hash}-${suffix}`;
      candidate = `${base.slice(0, Math.max(1, 63 - tail.length))}-${tail}`;
    }
    return candidate;
  }

  public ensureProject(projectPathInput: string): string {
    const projectPath = resolve(projectPathInput);
    const id = projectId(projectPath);
    const timestamp = now();
    const existing = this.database.prepare("SELECT id FROM projects WHERE path = ?").get(projectPath) as Row | undefined;
    if (existing) {
      this.database.prepare("UPDATE projects SET name = ?, updated_at = ? WHERE path = ?")
        .run(basename(projectPath), timestamp, projectPath);
      return String(existing.id);
    }
    const routeSlug = this.availableProjectSlug(basename(projectPath), projectPath);
    this.database.prepare(`
      INSERT INTO projects(id, path, name, route_slug, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?)
    `).run(id, projectPath, basename(projectPath), routeSlug, timestamp, timestamp);
    return id;
  }

  public ensureSession(projectIdValue: string, claudeSessionId: string, startedAt = now()): string {
    const existing = this.database.prepare(
      "SELECT id FROM sessions WHERE project_id = ? AND claude_session_id = ?",
    ).get(projectIdValue, claudeSessionId) as Row | undefined;
    if (existing) return String(existing.id);
    const id = randomUUID();
    this.database.prepare(`
      INSERT INTO sessions(id, project_id, claude_session_id, started_at, last_seen_at, status)
      VALUES(?, ?, ?, ?, ?, 'observed')
    `).run(id, projectIdValue, claudeSessionId, startedAt, startedAt);
    return id;
  }

  public insertEvent(event: NormalizedEvent): { projectId: string; sessionId: string } {
    const id = this.ensureProject(event.project_path);
    const sessionId = this.ensureSession(id, event.claude_session_id, event.timestamp);
    this.database.prepare(`
      INSERT OR IGNORE INTO events(
        id, session_id, project_id, producer, candidate_id, audit_target,
        event_type, agent_type, payload_json, created_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      sessionId,
      id,
      event.producer,
      event.candidate_id,
      event.audit_target,
      event.event_type,
      event.agent_type,
      JSON.stringify(event),
      event.timestamp,
    );
    if (event.event_type === "session.started") {
      this.database.prepare(`
        UPDATE sessions SET started_at = CASE WHEN status = 'active' THEN started_at ELSE ? END,
          last_seen_at = ?, ended_at = NULL, end_reason = NULL, status = 'active'
        WHERE id = ?
      `).run(event.timestamp, event.timestamp, sessionId);
    } else if (event.event_type === "session.ended") {
      const reason = typeof event.metadata.reason === "string" ? event.metadata.reason : "other";
      this.database.prepare(`
        UPDATE sessions SET last_seen_at = ?, ended_at = ?, end_reason = ?, status = 'ended'
        WHERE id = ?
      `).run(event.timestamp, event.timestamp, reason, sessionId);
      this.closeSessionHumanRequests(sessionId, event.timestamp);
    } else {
      this.database.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(event.timestamp, sessionId);
      if (event.event_type === "human.resolved") {
        this.resolveEventHumanRequests(sessionId, ["question", "elicitation"], event.timestamp);
      } else if (event.event_type === "prompt.submitted") {
        this.resolveEventHumanRequests(sessionId, ["permission", "question", "elicitation"], event.timestamp);
      } else if (event.event_type === "tool.completed" || event.event_type === "permission.denied") {
        this.resolveEventHumanRequests(sessionId, ["permission"], event.timestamp);
      }
    }
    return { projectId: id, sessionId };
  }

  public createEventHumanRequest(event: NormalizedEvent, sessionId: string, attention: HumanAttention): { id: string; created: boolean } {
    const existing = this.database.prepare("SELECT id FROM human_requests WHERE trigger_event_id = ?").get(event.id) as Row | undefined;
    if (existing) return { id: String(existing.id), created: false };
    const id = randomUUID();
    this.database.prepare(`
      INSERT INTO human_requests(
        id, project_id, session_id, trigger_event_id, type, message, requested_action,
        safe_to_continue, status, created_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
    `).run(
      id,
      this.ensureProject(event.project_path),
      sessionId,
      event.id,
      attention.type,
      attention.reason,
      attention.requestedAction,
      attention.safeToContinue ? 1 : 0,
      event.timestamp,
    );
    return { id, created: true };
  }

  public setHumanRequestTelegramMessage(id: string, telegramMessageId: string): void {
    this.database.prepare("UPDATE human_requests SET telegram_message_id = ? WHERE id = ?")
      .run(telegramMessageId, id);
  }

  private resolveEventHumanRequests(sessionId: string, types: string[], resolvedAt: string): void {
    if (!types.length) return;
    const placeholders = types.map(() => "?").join(",");
    this.database.prepare(`
      UPDATE human_requests SET status = 'resolved', resolved_at = ?
      WHERE session_id = ? AND status = 'open' AND audit_id IS NULL
        AND type IN (${placeholders})
    `).run(resolvedAt, sessionId, ...types as SQLInputValue[]);
  }

  private closeSessionHumanRequests(sessionId: string, resolvedAt: string): void {
    this.database.prepare(`
      UPDATE human_requests SET status = 'closed', resolved_at = ?
      WHERE session_id = ? AND status = 'open' AND audit_id IS NULL
    `).run(resolvedAt, sessionId);
  }

  public markEventProcessed(eventId: string): void {
    this.database.prepare("UPDATE events SET processed_at = ? WHERE id = ?").run(now(), eventId);
  }

  public enqueueAudit(input: EnqueueAuditInput): AuditRecord {
    const normalizedPath = resolve(input.projectPath);
    const id = this.ensureProject(normalizedPath);
    const sessionId = input.claudeSessionId ? this.ensureSession(id, input.claudeSessionId) : null;
    if (input.coalesceKey) {
      const active = this.database.prepare(`
        SELECT * FROM audits WHERE coalesce_key = ? AND status IN ('pending', 'running') LIMIT 1
      `).get(input.coalesceKey) as Row | undefined;
      if (active) {
        const record = rowToAudit(active);
        const prior = JSON.parse(record.context_json) as Record<string, unknown>;
        const evidence = Array.isArray(prior.coalesced_evidence) ? prior.coalesced_evidence : [];
        evidence.push(input.context ?? {});
        prior.coalesced_evidence = evidence.slice(-20);
        const notBefore = input.notBefore && input.notBefore > record.not_before ? input.notBefore : record.not_before;
        this.database.prepare("UPDATE audits SET context_json = ?, not_before = ?, updated_at = ? WHERE id = ?")
          .run(JSON.stringify(prior), notBefore, now(), record.id);
        return this.getAudit(record.id) as AuditRecord;
      }
    }
    if (input.triggerEventId) {
      const duplicate = this.database.prepare(
        "SELECT * FROM audits WHERE trigger_event_id = ? AND audit_type = ? LIMIT 1",
      ).get(input.triggerEventId, input.auditType) as Row | undefined;
      if (duplicate) return rowToAudit(duplicate);
    }
    const auditId = randomUUID();
    const timestamp = now();
    this.database.prepare(`
      INSERT INTO audits(
        id, project_id, project_path, session_id, trigger_event_id, audit_type,
        status, context_json, producer, candidate_id, audit_target, coalesce_key,
        not_before, max_attempts, created_at, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditId,
      id,
      normalizedPath,
      sessionId,
      input.triggerEventId ?? null,
      input.auditType,
      JSON.stringify(input.context ?? {}),
      input.producer ?? "claude",
      input.candidateId ?? null,
      input.auditTarget ?? null,
      input.coalesceKey ?? null,
      input.notBefore ?? timestamp,
      input.maxAttempts ?? 3,
      timestamp,
      timestamp,
    );
    return this.getAudit(auditId) as AuditRecord;
  }

  public recoverInterruptedAudits(): { recovered: number; failed: number } {
    const timestamp = now();
    const failed = this.database.prepare(`
      UPDATE audits SET status = 'failed', last_error = 'Supervisor restarted after retry budget was exhausted',
        updated_at = ? WHERE status = 'running' AND attempt_count >= max_attempts
    `).run(timestamp).changes;
    const recovered = this.database.prepare(`
      UPDATE audits SET status = 'pending', started_at = NULL,
        last_error = 'Recovered after Supervisor restart', not_before = ?, updated_at = ?
      WHERE status = 'running' AND attempt_count < max_attempts
    `).run(timestamp, timestamp).changes;
    return { recovered: Number(recovered), failed: Number(failed) };
  }

  public claimNextAudit(): AuditRecord | null {
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const row = this.database.prepare(`
        SELECT * FROM audits
        WHERE status = 'pending' AND not_before <= ?
        ORDER BY CASE audit_type
          WHEN 'final' THEN 0 WHEN 'deployment' THEN 1 WHEN 'security' THEN 2 ELSE 3 END,
          created_at ASC
        LIMIT 1
      `).get(now()) as Row | undefined;
      if (!row) {
        this.database.exec("COMMIT;");
        return null;
      }
      const timestamp = now();
      this.database.prepare(`
        UPDATE audits SET status = 'running', attempt_count = attempt_count + 1,
          started_at = ?, updated_at = ?, last_error = NULL
        WHERE id = ? AND status = 'pending'
      `).run(timestamp, timestamp, String(row.id));
      this.database.exec("COMMIT;");
      return this.getAudit(String(row.id));
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  public completeAudit(auditId: string, result: AuditResult, threadId: string | null): string | null {
    const timestamp = now();
    const severity = highestSeverity(result.findings);
    let humanRequestId: string | null = null;
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database.prepare(`
        UPDATE audits SET status = 'completed', decision = ?, severity = ?, summary = ?,
          result_json = ?, codex_thread_id = ?, completed_at = ?, updated_at = ?, last_error = NULL
        WHERE id = ?
      `).run(result.decision, severity, result.summary, JSON.stringify(result), threadId, timestamp, timestamp, auditId);
      this.database.prepare("DELETE FROM audit_findings WHERE audit_id = ?").run(auditId);
      const audit = this.getAudit(auditId);
      if (!audit) throw new Error("Audit disappeared during completion");
      for (const finding of result.findings) this.insertFinding(auditId, finding, timestamp);
      if (result.human_request) {
        humanRequestId = randomUUID();
        this.database.prepare(`
          INSERT INTO human_requests(
            id, project_id, session_id, audit_id, type, message, requested_action,
            safe_to_continue, status, created_at
          ) VALUES(?, ?, ?, ?, 'audit', ?, ?, ?, 'open', ?)
        `).run(
          humanRequestId, audit.project_id, audit.session_id, auditId, result.human_request.reason,
          result.human_request.requested_action,
          result.human_request.safe_to_continue_other_work ? 1 : 0,
          timestamp,
        );
      }
      this.database.exec("COMMIT;");
      return humanRequestId;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  private insertFinding(auditId: string, finding: AuditFinding, timestamp: string): void {
    this.database.prepare(`
      INSERT INTO audit_findings(
        id, audit_id, severity, category, title, description, evidence_json,
        recommended_action, evidence_classification, created_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), auditId, finding.severity, finding.category, finding.title,
      finding.description, JSON.stringify(finding.evidence), finding.recommended_action,
      finding.evidence_classification, timestamp,
    );
  }

  public failAudit(auditId: string, error: string, backoffMs: number): AuditRecord {
    const audit = this.getAudit(auditId);
    if (!audit) throw new Error("Unknown audit");
    const retry = audit.attempt_count < audit.max_attempts;
    const timestamp = now();
    const notBefore = new Date(Date.now() + Math.max(0, backoffMs)).toISOString();
    this.database.prepare(`
      UPDATE audits SET status = ?, last_error = ?, not_before = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(retry ? "pending" : "failed", error, notBefore, retry ? null : timestamp, timestamp, auditId);
    return this.getAudit(auditId) as AuditRecord;
  }

  public recordCodexRun(input: {
    auditId: string;
    threadId: string | null;
    status: "completed" | "failed";
    durationMs: number;
    stdout: string;
    stderr: string;
    error?: string | null;
  }): string {
    const id = randomUUID();
    this.database.prepare(`
      INSERT INTO codex_runs(
        id, audit_id, thread_id, status, duration_ms, stdout_excerpt,
        stderr_excerpt, error, created_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.auditId, input.threadId, input.status, input.durationMs,
      input.stdout.slice(-8_000), input.stderr.slice(-8_000), input.error ?? null, now(),
    );
    return id;
  }

  public getAudit(id: string): AuditRecord | null {
    const row = this.database.prepare("SELECT * FROM audits WHERE id = ?").get(id) as Row | undefined;
    return row ? rowToAudit(row) : null;
  }

  public listAudits(projectPath?: string, limit = 50): AuditRecord[] {
    const bounded = Math.max(1, Math.min(limit, 500));
    const rows = projectPath
      ? this.database.prepare("SELECT * FROM audits WHERE project_path = ? ORDER BY created_at DESC, rowid DESC LIMIT ?")
          .all(resolve(projectPath), bounded)
      : this.database.prepare("SELECT * FROM audits ORDER BY created_at DESC, rowid DESC LIMIT ?").all(bounded);
    return (rows as Row[]).map(rowToAudit);
  }

  public listEvents(projectPath?: string, limit = 50): NormalizedEvent[] {
    const bounded = Math.max(1, Math.min(limit, 500));
    const rows = projectPath
      ? this.database.prepare(`
          SELECT e.payload_json FROM events e JOIN projects p ON p.id = e.project_id
          WHERE p.path = ? ORDER BY e.created_at DESC LIMIT ?
        `).all(resolve(projectPath), bounded)
      : this.database.prepare("SELECT payload_json FROM events ORDER BY created_at DESC LIMIT ?").all(bounded);
    return (rows as Row[]).map((row) => JSON.parse(String(row.payload_json)) as NormalizedEvent);
  }

  public activeProjectBySlug(slug: string, staleMs: number): ActivityProject | null {
    const row = this.database.prepare(`
      SELECT p.id, p.path, p.name, p.route_slug,
        COUNT(s.id) AS active_session_count,
        MIN(s.started_at) AS started_at,
        MAX(s.last_seen_at) AS last_seen_at
      FROM projects p
      JOIN sessions s ON s.project_id = p.id
      WHERE p.route_slug = ? AND s.status = 'active' AND s.last_seen_at >= ?
        AND EXISTS (
          SELECT 1 FROM events e
          WHERE e.session_id = s.id AND e.event_type = 'session.started'
        )
      GROUP BY p.id, p.path, p.name, p.route_slug
    `).get(slug, new Date(Date.now() - staleMs).toISOString()) as Row | undefined;
    return row ? rowToActivityProject(row) : null;
  }

  public activeProjectByPath(projectPath: string, staleMs: number): ActivityProject | null {
    const row = this.database.prepare(`
      SELECT p.id, p.path, p.name, p.route_slug,
        COUNT(s.id) AS active_session_count,
        MIN(s.started_at) AS started_at,
        MAX(s.last_seen_at) AS last_seen_at
      FROM projects p
      JOIN sessions s ON s.project_id = p.id
      WHERE p.path = ? AND s.status = 'active' AND s.last_seen_at >= ?
        AND EXISTS (
          SELECT 1 FROM events e
          WHERE e.session_id = s.id AND e.event_type = 'session.started'
        )
      GROUP BY p.id, p.path, p.name, p.route_slug
    `).get(resolve(projectPath), new Date(Date.now() - staleMs).toISOString()) as Row | undefined;
    return row ? rowToActivityProject(row) : null;
  }

  public listActiveProjects(staleMs: number, limit = 5_000): ActivityProject[] {
    const rows = this.database.prepare(`
      SELECT p.id, p.path, p.name, p.route_slug,
        COUNT(s.id) AS active_session_count,
        MIN(s.started_at) AS started_at,
        MAX(s.last_seen_at) AS last_seen_at
      FROM projects p
      JOIN sessions s ON s.project_id = p.id
      WHERE s.status = 'active' AND s.last_seen_at >= ?
        AND EXISTS (
          SELECT 1 FROM events e
          WHERE e.session_id = s.id AND e.event_type = 'session.started'
        )
      GROUP BY p.id, p.path, p.name, p.route_slug
      ORDER BY last_seen_at DESC
      LIMIT ?
    `).all(new Date(Date.now() - staleMs).toISOString(), Math.max(1, Math.min(limit, 5_000))) as Row[];
    return rows.map(rowToActivityProject);
  }

  public queueCounts(): QueueCounts {
    const result: QueueCounts = { pending: 0, running: 0, completed: 0, failed: 0 };
    const rows = this.database.prepare("SELECT status, COUNT(*) AS count FROM audits GROUP BY status").all() as Row[];
    for (const row of rows) {
      const status = String(row.status) as keyof QueueCounts;
      if (status in result) result[status] = asNumber(row.count);
    }
    return result;
  }

  public projectQueueCounts(projectPath: string): QueueCounts {
    const result: QueueCounts = { pending: 0, running: 0, completed: 0, failed: 0 };
    const rows = this.database.prepare(`
      SELECT status, COUNT(*) AS count FROM audits WHERE project_path = ? GROUP BY status
    `).all(resolve(projectPath)) as Row[];
    for (const row of rows) {
      const status = String(row.status) as keyof QueueCounts;
      if (status in result) result[status] = asNumber(row.count);
    }
    return result;
  }

  public retryAudit(id: string): boolean {
    const changed = this.database.prepare(`
      UPDATE audits SET status = 'pending', attempt_count = 0, completed_at = NULL,
        started_at = NULL, last_error = NULL, not_before = ?, updated_at = ?
      WHERE id = ? AND status = 'failed'
    `).run(now(), now(), id).changes;
    return Number(changed) === 1;
  }

  public resolveHumanRequest(id: string): boolean {
    const changed = this.database.prepare(`
      UPDATE human_requests SET status = 'resolved', resolved_at = ?
      WHERE id = ? AND status = 'open'
    `).run(now(), id).changes;
    return Number(changed) === 1;
  }

  public openHumanRequestCount(projectPath?: string): number {
    const row = projectPath
      ? this.database.prepare(`
          SELECT COUNT(*) AS count FROM human_requests h JOIN projects p ON p.id = h.project_id
          WHERE h.status = 'open' AND p.path = ?
        `).get(resolve(projectPath))
      : this.database.prepare("SELECT COUNT(*) AS count FROM human_requests WHERE status = 'open'").get();
    return asNumber((row as Row | undefined)?.count);
  }

  public listHumanRequests(projectPath?: string, limit = 50): Array<Record<string, unknown>> {
    const bounded = Math.max(1, Math.min(limit, 500));
    const rows = projectPath
      ? this.database.prepare(`
          SELECT h.id, h.audit_id, h.session_id, h.trigger_event_id, h.type,
            h.message, h.requested_action, h.safe_to_continue, h.status,
            h.telegram_message_id, h.created_at, h.resolved_at
          FROM human_requests h JOIN projects p ON p.id = h.project_id
          WHERE p.path = ? ORDER BY h.created_at DESC, h.rowid DESC LIMIT ?
        `).all(resolve(projectPath), bounded)
      : this.database.prepare(`
          SELECT id, audit_id, session_id, trigger_event_id, type, message,
            requested_action, safe_to_continue, status, telegram_message_id,
            created_at, resolved_at
          FROM human_requests ORDER BY created_at DESC, rowid DESC LIMIT ?
        `).all(bounded);
    return (rows as Row[]).map((row) => ({ ...row, safe_to_continue: asNumber(row.safe_to_continue) === 1 }));
  }

  public latestAudit(projectPath: string, types?: AuditType[]): AuditRecord | null {
    const path = resolve(projectPath);
    if (!types?.length) {
      const row = this.database.prepare("SELECT * FROM audits WHERE project_path = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
        .get(path) as Row | undefined;
      return row ? rowToAudit(row) : null;
    }
    const placeholders = types.map(() => "?").join(",");
    const row = this.database.prepare(`
      SELECT * FROM audits WHERE project_path = ? AND audit_type IN (${placeholders})
      ORDER BY created_at DESC, rowid DESC LIMIT 1
    `).get(path, ...types as SQLInputValue[]) as Row | undefined;
    return row ? rowToAudit(row) : null;
  }

  public findActiveAudit(projectPath: string, sessionId: string | null, auditType: AuditType): AuditRecord | null {
    const row = sessionId
      ? this.database.prepare(`
          SELECT * FROM audits WHERE project_path = ? AND session_id = ? AND audit_type = ?
            AND status IN ('pending', 'running') ORDER BY created_at DESC, rowid DESC LIMIT 1
        `).get(resolve(projectPath), sessionId, auditType)
      : this.database.prepare(`
          SELECT * FROM audits WHERE project_path = ? AND audit_type = ?
            AND status IN ('pending', 'running') ORDER BY created_at DESC, rowid DESC LIMIT 1
        `).get(resolve(projectPath), auditType);
    return row ? rowToAudit(row as Row) : null;
  }

  public recentChangedFiles(projectPath: string, limit = 200): string[] {
    const rows = this.database.prepare(`
      SELECT e.payload_json FROM events e JOIN projects p ON p.id = e.project_id
      WHERE p.path = ? AND e.event_type = 'tool.completed'
      ORDER BY e.created_at DESC LIMIT ?
    `).all(resolve(projectPath), Math.max(1, Math.min(limit, 1_000))) as Row[];
    const files = new Set<string>();
    for (const row of rows) {
      const event = JSON.parse(String(row.payload_json)) as NormalizedEvent;
      const changedFile = event.metadata.changed_file;
      if (typeof changedFile === "string") files.add(changedFile);
    }
    return [...files];
  }

  public gate(projectPath: string, phase: string): GateResult {
    const phaseTypes: Record<string, AuditType[]> = {
      research: ["research"],
      architecture: ["architecture", "security"],
      design: ["design_due_diligence"],
      code: ["code", "reviewer_meta", "qa", "visual_ux_audit"],
      slice: ["code", "reviewer_meta", "qa", "visual_ux_audit"],
      deploy: ["deployment", "security"],
      "pre-deploy": ["deployment", "security"],
      final: ["final"],
    };
    const types = phaseTypes[phase];
    if (!types) return { decision: "ERROR", exit_code: 50, summary: `Unknown phase: ${phase}`, audit_id: null };
    const openHumanRequest = this.latestOpenHumanRequest(projectPath, types);
    if (openHumanRequest) return {
      decision: "HUMAN_REQUIRED",
      exit_code: 30,
      summary: String(openHumanRequest.message ?? openHumanRequest.requested_action ?? "Human action remains unresolved"),
      audit_id: asString(openHumanRequest.audit_id),
    };
    const latestByType = new Map<AuditType, AuditRecord>();
    for (const audit of this.listAudits(projectPath, 500)) {
      if (types.includes(audit.audit_type) && !latestByType.has(audit.audit_type)) latestByType.set(audit.audit_type, audit);
    }
    const audits = [...latestByType.values()];
    if (!audits.length) return { decision: "PENDING", exit_code: 40, summary: `No ${phase} audit exists`, audit_id: null };
    const pending = audits.find((audit) => audit.status === "pending" || audit.status === "running");
    if (pending) return { decision: "PENDING", exit_code: 40, summary: `${pending.audit_type} audit is ${pending.status}`, audit_id: pending.id };
    for (const decision of ["HUMAN_REQUIRED", "BLOCK"] as const) {
      const audit = audits.find((entry) => entry.status === "completed" && entry.decision === decision);
      if (audit) return {
        decision,
        exit_code: decision === "BLOCK" ? 20 : 30,
        summary: audit.summary ?? decision,
        audit_id: audit.id,
      };
    }
    const failed = audits.find((audit) => audit.status === "failed" || !audit.decision);
    if (failed) return { decision: "ERROR", exit_code: 50, summary: failed.last_error ?? "Audit failed", audit_id: failed.id };
    const challenged = audits.find((audit) => audit.decision === "CHALLENGE");
    if (challenged) return { decision: "CHALLENGE", exit_code: 10, summary: challenged.summary ?? "CHALLENGE", audit_id: challenged.id };
    const latest = audits[0] as AuditRecord;
    return { decision: "PASS", exit_code: 0, summary: latest.summary ?? "All recorded phase audits passed", audit_id: latest.id };
  }

  public stopGate(projectPath: string): GateResult {
    const openHumanRequest = this.latestOpenHumanRequest(projectPath);
    if (openHumanRequest) return {
      decision: "HUMAN_REQUIRED",
      exit_code: 30,
      summary: String(openHumanRequest.message ?? openHumanRequest.requested_action ?? "Human action remains unresolved"),
      audit_id: asString(openHumanRequest.audit_id),
    };
    const latestByType = new Map<AuditType, AuditRecord>();
    for (const audit of this.listAudits(projectPath, 250)) {
      if (!latestByType.has(audit.audit_type)) latestByType.set(audit.audit_type, audit);
    }
    const audits = [...latestByType.values()];
    const pending = audits.find((audit) => audit.status === "pending" || audit.status === "running");
    if (pending) return {
      decision: "PENDING",
      exit_code: 40,
      summary: `${pending.audit_type} audit is ${pending.status}`,
      audit_id: pending.id,
    };
    const order: AuditDecision[] = ["HUMAN_REQUIRED", "BLOCK", "CHALLENGE"];
    for (const decision of order) {
      const audit = audits.find((entry) => entry.status === "completed" && entry.decision === decision);
      if (audit) return {
        decision,
        exit_code: decision === "CHALLENGE" ? 10 : decision === "BLOCK" ? 20 : 30,
        summary: audit.summary ?? decision,
        audit_id: audit.id,
      };
    }
    const failed = audits.find((audit) => audit.status === "failed");
    if (failed) return { decision: "ERROR", exit_code: 50, summary: failed.last_error ?? "Audit failed", audit_id: failed.id };
    return { decision: "PASS", exit_code: 0, summary: "No unresolved Supervisor gate", audit_id: null };
  }

  private latestOpenHumanRequest(projectPath: string, types?: AuditType[]): Row | null {
    const path = resolve(projectPath);
    const row = types?.length
      ? this.database.prepare(`
          SELECT h.audit_id, h.message, h.requested_action
          FROM human_requests h
          JOIN projects p ON p.id = h.project_id
          JOIN audits a ON a.id = h.audit_id
          WHERE h.status = 'open' AND p.path = ?
            AND a.audit_type IN (${types.map(() => "?").join(",")})
          ORDER BY h.created_at DESC, h.rowid DESC LIMIT 1
        `).get(path, ...types as SQLInputValue[])
      : this.database.prepare(`
          SELECT h.audit_id, h.message, h.requested_action
          FROM human_requests h JOIN projects p ON p.id = h.project_id
          WHERE h.status = 'open' AND p.path = ?
          ORDER BY h.created_at DESC, h.rowid DESC LIMIT 1
        `).get(path);
    return row ? row as Row : null;
  }
}

const SEVERITY_ORDER: Severity[] = ["info", "low", "medium", "high", "critical"];
function highestSeverity(findings: AuditFinding[]): Severity {
  let highest = 0;
  for (const finding of findings) highest = Math.max(highest, SEVERITY_ORDER.indexOf(finding.severity));
  return SEVERITY_ORDER[highest] ?? "info";
}
