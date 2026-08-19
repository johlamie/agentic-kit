import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { SupervisorDatabase } from "../src/db.js";
import type { AuditDecision, NormalizedEvent } from "../src/types.js";
import { auditResult, makeTempProject } from "./helpers.js";

function event(projectPath: string, id = "event-1"): NormalizedEvent {
  return {
    id,
    timestamp: new Date().toISOString(),
    producer: "claude",
    project_id: "ignored-at-ingest",
    project_path: projectPath,
    claude_session_id: "claude-session-1",
    event_type: "agent.completed",
    agent_type: "builder",
    agent_id: "builder-1",
    candidate_id: "builder-1",
    audit_target: "slice-1",
    transcript_path: null,
    agent_transcript_path: null,
    last_message: "Build completed",
    metadata: {},
  };
}

function lifecycleEvent(
  projectPath: string,
  eventType: NormalizedEvent["event_type"],
  id: string,
  sessionId = "claude-session-1",
  timestamp = new Date().toISOString(),
): NormalizedEvent {
  return {
    ...event(projectPath, id),
    timestamp,
    claude_session_id: sessionId,
    event_type: eventType,
    agent_type: null,
    agent_id: null,
    candidate_id: null,
    metadata: eventType === "session.ended" ? { reason: "prompt_input_exit" } : {},
  };
}

test("persists events and audits across database restart", () => {
  const state = mkdtempSync(join(tmpdir(), "supervisor-db-restart-"));
  const project = makeTempProject();
  const path = join(state, "supervisor.sqlite3");
  let database = new SupervisorDatabase(path);
  const ids = database.insertEvent(event(project));
  const audit = database.enqueueAudit({
    projectPath: project,
    claudeSessionId: "claude-session-1",
    triggerEventId: "event-1",
    auditType: "code",
  });
  database.close();

  database = new SupervisorDatabase(path);
  assert.equal(database.listEvents(project).length, 1);
  assert.equal(database.getAudit(audit.id)?.status, "pending");
  assert.equal(database.ping(), true);
  assert.equal(ids.projectId, database.getAudit(audit.id)?.project_id);
  database.close();
  rmSync(state, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

test("migrates a version-1 database in place without reviving old stopping sessions", () => {
  const state = mkdtempSync(join(tmpdir(), "supervisor-db-migration-"));
  const path = join(state, "supervisor.sqlite3");
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      claude_session_id TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT,
      status TEXT NOT NULL, UNIQUE(project_id, claude_session_id)
    );
    CREATE TABLE human_requests (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      audit_id TEXT, type TEXT NOT NULL, message TEXT NOT NULL, requested_action TEXT NOT NULL,
      safe_to_continue INTEGER NOT NULL, status TEXT NOT NULL, telegram_message_id TEXT,
      created_at TEXT NOT NULL, resolved_at TEXT
    );
    INSERT INTO schema_migrations VALUES(1, '2026-08-18T00:00:00.000Z');
    INSERT INTO projects VALUES('legacy-project', '/tmp/legacy-project', 'legacy-project', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z');
    INSERT INTO sessions VALUES('legacy-session', 'legacy-project', 'legacy-claude', '2026-08-18T00:00:00.000Z', '2026-08-18T01:00:00.000Z', 'stopping');
  `);
  legacy.close();

  const database = new SupervisorDatabase(path);
  assert.equal(database.ping(), true);
  assert.equal(database.activeProjectByPath("/tmp/legacy-project", 86_400_000), null);
  database.close();

  const verified = new DatabaseSync(path, { readOnly: true });
  const migration = verified.prepare("SELECT version FROM schema_migrations WHERE version = 2").get() as { version?: unknown } | undefined;
  const session = verified.prepare("SELECT status, end_reason FROM sessions WHERE id = 'legacy-session'").get() as { status?: unknown; end_reason?: unknown } | undefined;
  const project = verified.prepare("SELECT route_slug FROM projects WHERE id = 'legacy-project'").get() as { route_slug?: unknown } | undefined;
  assert.equal(migration?.version, 2);
  assert.equal(session?.status, "ended");
  assert.equal(session?.end_reason, null);
  assert.equal(project?.route_slug, "legacy-project");
  verified.close();
  rmSync(state, { recursive: true, force: true });
});

test("activates one virtual project route per SessionStart and removes it after the final SessionEnd", () => {
  const state = mkdtempSync(join(tmpdir(), "supervisor-activity-lifecycle-"));
  const project = makeTempProject("supervisor-activity-project-");
  const path = join(state, "supervisor.sqlite3");
  let database = new SupervisorDatabase(path);

  database.insertEvent(lifecycleEvent(project, "agent.completed", "observed-only"));
  assert.equal(database.activeProjectByPath(project, 60_000), null);

  database.insertEvent(lifecycleEvent(project, "session.started", "start-1", "session-a"));
  const active = database.activeProjectByPath(project, 60_000);
  assert.ok(active);
  assert.equal(active.activeSessionCount, 1);
  assert.match(active.slug, /^[a-z0-9_-]+$/u);

  database.insertEvent(lifecycleEvent(project, "session.started", "start-2", "session-b"));
  assert.equal(database.activeProjectByPath(project, 60_000)?.activeSessionCount, 2);
  database.insertEvent(lifecycleEvent(project, "claude.stopping", "turn-stop", "session-a"));
  assert.equal(database.activeProjectByPath(project, 60_000)?.activeSessionCount, 2, "Stop ends a turn, not a session");

  database.insertEvent(lifecycleEvent(project, "session.ended", "end-1", "session-a"));
  assert.equal(database.activeProjectByPath(project, 60_000)?.activeSessionCount, 1);
  database.close();

  database = new SupervisorDatabase(path);
  assert.equal(database.activeProjectByPath(project, 60_000)?.activeSessionCount, 1, "activity survives a daemon restart");
  database.insertEvent(lifecycleEvent(project, "session.ended", "end-2", "session-b"));
  assert.equal(database.activeProjectByPath(project, 60_000), null);

  database.close();
  rmSync(state, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

test("uses stable collision-safe project slugs and expires abandoned sessions", () => {
  const database = new SupervisorDatabase(":memory:");
  const rootA = mkdtempSync(join(tmpdir(), "supervisor-slug-a-"));
  const rootB = mkdtempSync(join(tmpdir(), "supervisor-slug-b-"));
  const first = join(rootA, "shared-name");
  const second = join(rootB, "shared-name");
  const reserved = join(rootA, "health");
  mkdirSync(first);
  mkdirSync(second);
  mkdirSync(reserved);
  database.insertEvent(lifecycleEvent(first, "session.started", "start-first"));
  database.insertEvent(lifecycleEvent(second, "session.started", "start-second", "session-2"));
  database.insertEvent(lifecycleEvent(reserved, "session.started", "start-reserved", "session-3"));

  const firstProject = database.activeProjectByPath(first, 60_000);
  const secondProject = database.activeProjectByPath(second, 60_000);
  const reservedProject = database.activeProjectByPath(reserved, 60_000);
  assert.ok(firstProject);
  assert.ok(secondProject);
  assert.ok(reservedProject);
  assert.notEqual(firstProject.slug, secondProject.slug);
  assert.notEqual(reservedProject.slug, "health");
  assert.equal(database.activeProjectBySlug(firstProject.slug, 60_000)?.path, first);

  const stale = join(rootB, "stale");
  mkdirSync(stale);
  database.insertEvent(lifecycleEvent(stale, "session.started", "start-stale", "session-stale", "2020-01-01T00:00:00.000Z"));
  assert.equal(database.activeProjectByPath(stale, 60_000), null);

  database.close();
  rmSync(rootA, { recursive: true, force: true });
  rmSync(rootB, { recursive: true, force: true });
});

test("deduplicates event audits and coalesces related evidence", () => {
  const database = new SupervisorDatabase(":memory:");
  const project = makeTempProject();
  database.insertEvent(event(project));
  const first = database.enqueueAudit({
    projectPath: project,
    triggerEventId: "event-1",
    auditType: "code",
    coalesceKey: "session:code:slice",
    context: { source: "builder" },
  });
  const duplicate = database.enqueueAudit({ projectPath: project, triggerEventId: "event-1", auditType: "code" });
  assert.equal(duplicate.id, first.id);

  const coalesced = database.enqueueAudit({
    projectPath: project,
    triggerEventId: "event-2",
    auditType: "code",
    coalesceKey: "session:code:slice",
    context: { source: "reviewer" },
  });
  assert.equal(coalesced.id, first.id);
  const context = JSON.parse(coalesced.context_json) as { coalesced_evidence?: unknown[] };
  assert.equal(context.coalesced_evidence?.length, 1);
  assert.equal(database.listAudits(project).length, 1);
  database.close();
  rmSync(project, { recursive: true, force: true });
});

test("recovers interrupted queue jobs after restart and fails exhausted jobs", () => {
  const state = mkdtempSync(join(tmpdir(), "supervisor-queue-recovery-"));
  const path = join(state, "supervisor.sqlite3");
  const project = makeTempProject();
  let database = new SupervisorDatabase(path);
  const retryable = database.enqueueAudit({ projectPath: project, auditType: "research", maxAttempts: 2 });
  assert.equal(database.claimNextAudit()?.id, retryable.id);
  const exhausted = database.enqueueAudit({ projectPath: project, auditType: "architecture", maxAttempts: 1 });
  assert.equal(database.claimNextAudit()?.id, exhausted.id);
  database.close();

  database = new SupervisorDatabase(path);
  const recovery = database.recoverInterruptedAudits();
  assert.deepEqual(recovery, { recovered: 1, failed: 1 });
  assert.equal(database.getAudit(retryable.id)?.status, "pending");
  assert.equal(database.getAudit(exhausted.id)?.status, "failed");
  database.close();
  rmSync(state, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

test("maps gate decisions to stable exit codes", () => {
  const expected = new Map<AuditDecision, number>([
    ["PASS", 0],
    ["CHALLENGE", 10],
    ["BLOCK", 20],
    ["HUMAN_REQUIRED", 30],
  ]);
  for (const [decision, exitCode] of expected) {
    const database = new SupervisorDatabase(":memory:");
    const project = makeTempProject(`supervisor-gate-${decision.toLowerCase()}-`);
    const audit = database.enqueueAudit({ projectPath: project, auditType: "architecture" });
    database.claimNextAudit();
    database.completeAudit(audit.id, auditResult({
      decision,
      human_request: decision === "HUMAN_REQUIRED"
        ? { reason: "Human choice", requested_action: "Choose", safe_to_continue_other_work: true }
        : null,
    }), null);
    const gate = database.gate(project, "architecture");
    assert.equal(gate.decision, decision);
    assert.equal(gate.exit_code, exitCode);
    database.close();
    rmSync(project, { recursive: true, force: true });
  }

  const database = new SupervisorDatabase(":memory:");
  const project = makeTempProject();
  assert.equal(database.gate(project, "code").exit_code, 40);
  assert.equal(database.gate(project, "unknown").exit_code, 50);
  const failed = database.enqueueAudit({ projectPath: project, auditType: "code", maxAttempts: 1 });
  database.claimNextAudit();
  database.failAudit(failed.id, "model unavailable", 0);
  assert.equal(database.gate(project, "code").exit_code, 50);
  database.close();
  rmSync(project, { recursive: true, force: true });
});

test("phase gate cannot hide an unresolved audit behind a newer PASS of another type", () => {
  const database = new SupervisorDatabase(":memory:");
  const project = makeTempProject();
  const code = database.enqueueAudit({ projectPath: project, auditType: "code" });
  database.claimNextAudit();
  database.completeAudit(code.id, auditResult({ decision: "PASS", summary: "Code checks pass." }), null);
  const visual = database.enqueueAudit({ projectPath: project, auditType: "visual_ux_audit" });
  database.claimNextAudit();
  database.completeAudit(visual.id, auditResult({ decision: "BLOCK", summary: "Primary mobile flow is unusable." }), null);
  const qa = database.enqueueAudit({ projectPath: project, auditType: "qa" });
  database.claimNextAudit();
  database.completeAudit(qa.id, auditResult({ decision: "PASS", summary: "QA suite passes." }), null);
  assert.equal(database.gate(project, "code").decision, "BLOCK");
  assert.match(database.gate(project, "code").summary, /mobile flow/u);
  database.close();
  rmSync(project, { recursive: true, force: true });
});

test("an open human request survives a newer PASS until explicitly resolved", () => {
  const database = new SupervisorDatabase(":memory:");
  const project = makeTempProject();
  const humanAudit = database.enqueueAudit({ projectPath: project, auditType: "research" });
  database.claimNextAudit();
  database.completeAudit(humanAudit.id, auditResult({
    decision: "HUMAN_REQUIRED",
    summary: "A data license must be confirmed by the owner.",
    human_request: {
      reason: "The data license is unresolved.",
      requested_action: "Confirm the permitted use in writing.",
      safe_to_continue_other_work: true,
    },
  }), null);
  const reassessment = database.enqueueAudit({ projectPath: project, auditType: "research" });
  database.claimNextAudit();
  database.completeAudit(reassessment.id, auditResult({ decision: "PASS", summary: "Technical checks pass." }), null);

  assert.equal(database.gate(project, "research").decision, "HUMAN_REQUIRED");
  assert.equal(database.stopGate(project).decision, "HUMAN_REQUIRED");
  const request = database.listHumanRequests(project)[0];
  assert.equal(database.resolveHumanRequest(String(request?.id)), true);
  assert.equal(database.gate(project, "research").decision, "PASS");
  database.close();
  rmSync(project, { recursive: true, force: true });
});
