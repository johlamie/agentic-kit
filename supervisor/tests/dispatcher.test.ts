import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import test from "node:test";
import { AuditDispatcher } from "../src/audits/dispatcher.js";
import { SupervisorDatabase } from "../src/db.js";
import type { EventType, NormalizedEvent } from "../src/types.js";
import { makeTempProject, testConfig } from "./helpers.js";

let sequence = 0;
function milestone(project: string, agentType: string | null, message = "milestone complete", type: EventType = "agent.completed"): NormalizedEvent {
  sequence += 1;
  return {
    id: `dispatch-event-${sequence}`,
    timestamp: new Date(Date.now() + sequence).toISOString(),
    producer: "claude",
    project_id: "ignored",
    project_path: project,
    claude_session_id: "claude-session",
    event_type: type,
    agent_type: agentType,
    agent_id: agentType ? `${agentType}-${sequence}` : null,
    candidate_id: agentType ? `${agentType}-${sequence}` : null,
    audit_target: null,
    transcript_path: null,
    agent_transcript_path: null,
    last_message: message,
    metadata: {},
  };
}

function ingestAndDispatch(database: SupervisorDatabase, dispatcher: AuditDispatcher, event: NormalizedEvent) {
  const ids = database.insertEvent(event);
  return dispatcher.dispatch(event, ids.sessionId);
}

test("routes meaningful subagent milestones without auditing each tool call", () => {
  const project = makeTempProject();
  const database = new SupervisorDatabase(":memory:");
  const dispatcher = new AuditDispatcher(database, testConfig());

  const tool = milestone(project, null, "write done", "tool.completed");
  tool.metadata.changed_file = "src/page.tsx";
  assert.deepEqual(ingestAndDispatch(database, dispatcher, tool), []);

  const researcherEvent = milestone(project, "researcher");
  researcherEvent.transcript_path = "/home/test/.claude/transcript.jsonl";
  researcherEvent.agent_transcript_path = "/home/test/.claude/agent-transcript.jsonl";
  const researcher = ingestAndDispatch(database, dispatcher, researcherEvent);
  assert.equal(researcher[0]?.audit_type, "research");
  assert.doesNotMatch(researcher[0]?.context_json ?? "", /transcript\.jsonl/u);
  const architect = ingestAndDispatch(database, dispatcher, milestone(project, "architect"));
  assert.equal(architect[0]?.audit_type, "architecture");
  const designer = ingestAndDispatch(database, dispatcher, milestone(project, "designer"));
  assert.equal(designer[0]?.audit_type, "design_due_diligence");

  database.close();
  rmSync(project, { recursive: true, force: true });
});

test("coalesces reviewer/QA evidence into a slice audit and schedules one rendered UI audit", () => {
  const project = makeTempProject();
  const database = new SupervisorDatabase(":memory:");
  const dispatcher = new AuditDispatcher(database, testConfig());

  const change = milestone(project, null, "frontend changed", "tool.completed");
  change.metadata.changed_file = "src/screen.tsx";
  ingestAndDispatch(database, dispatcher, change);

  const builderAudit = ingestAndDispatch(database, dispatcher, milestone(project, "builder"))[0];
  assert.equal(builderAudit?.audit_type, "code");
  const reviewerAudit = ingestAndDispatch(database, dispatcher, milestone(project, "reviewer"))[0];
  assert.equal(reviewerAudit?.id, builderAudit?.id);
  const qaAudits = ingestAndDispatch(
    database,
    dispatcher,
    milestone(project, "qa", "QA passed at http://127.0.0.1:3100/products"),
  );
  assert.equal(qaAudits[0]?.id, builderAudit?.id);
  assert.equal(qaAudits[1]?.audit_type, "visual_ux_audit");
  const context = JSON.parse(qaAudits[1]?.context_json ?? "{}") as { target_url?: unknown; viewports?: unknown[] };
  assert.equal(context.target_url, "http://127.0.0.1:3100/products");
  assert.equal(context.viewports?.length, 4);

  database.close();
  rmSync(project, { recursive: true, force: true });
});

test("schedules final audit only for a meaningful non-recursive Stop", () => {
  const project = makeTempProject();
  const database = new SupervisorDatabase(":memory:");
  const dispatcher = new AuditDispatcher(database, testConfig());
  const ordinary = milestone(project, null, "I paused to explain", "claude.stopping");
  assert.equal(ingestAndDispatch(database, dispatcher, ordinary).length, 0);

  const recursive = milestone(project, null, "Ready for final handoff", "claude.stopping");
  recursive.metadata.stop_hook_active = true;
  assert.equal(ingestAndDispatch(database, dispatcher, recursive).length, 0);

  const final = milestone(project, null, "Definition of Done complete; ready for handoff", "claude.stopping");
  assert.equal(ingestAndDispatch(database, dispatcher, final)[0]?.audit_type, "final");
  database.close();
  rmSync(project, { recursive: true, force: true });
});

test("off and light levels enforce cost-control routing", () => {
  const project = makeTempProject();
  const database = new SupervisorDatabase(":memory:");
  const off = new AuditDispatcher(database, testConfig({ level: "off" }));
  assert.equal(ingestAndDispatch(database, off, milestone(project, "architect")).length, 0);
  const light = new AuditDispatcher(database, testConfig({ level: "light" }));
  assert.equal(ingestAndDispatch(database, light, milestone(project, "designer")).length, 0);
  assert.equal(ingestAndDispatch(database, light, milestone(project, "architect"))[0]?.audit_type, "architecture");
  database.close();
  rmSync(project, { recursive: true, force: true });
});
