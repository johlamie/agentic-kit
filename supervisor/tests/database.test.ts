import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
