import assert from "node:assert/strict";
import test from "node:test";
import { AuditInfrastructureError, AuditOutputError, AuditResultParser } from "../src/codex/parser.js";
import { auditResult } from "./helpers.js";

const parser = new AuditResultParser({ uiScorePass: 85, uiScoreChallenge: 70 });

test("parses every Supervisor decision", () => {
  for (const decision of ["PASS", "CHALLENGE", "BLOCK"] as const) {
    assert.equal(parser.parse(JSON.stringify(auditResult({ decision }))).decision, decision);
  }
  const human = auditResult({
    decision: "HUMAN_REQUIRED",
    human_request: { reason: "Paid provider", requested_action: "Choose whether to subscribe", safe_to_continue_other_work: true },
  });
  assert.equal(parser.parse(JSON.stringify(human)).decision, "HUMAN_REQUIRED");
});

test("rejects malformed JSON and schema violations", () => {
  assert.throws(() => parser.parse("not json"), AuditOutputError);
  const invalid = auditResult() as unknown as Record<string, unknown>;
  delete invalid.summary;
  assert.throws(() => parser.parse(JSON.stringify(invalid)), /schema/u);
  assert.throws(
    () => parser.parse(JSON.stringify(auditResult({ decision: "HUMAN_REQUIRED", human_request: null }))),
    /requires human_request/u,
  );
});

test("enforces security and design decision floors", () => {
  const security = auditResult({
    decision: "PASS",
    findings: [{
      severity: "high",
      category: "authorization",
      title: "Missing ownership check",
      description: "A caller can mutate another tenant's record.",
      evidence: ["src/api.ts:42"],
      recommended_action: "Derive ownership from the authenticated principal.",
      evidence_classification: "VERIFIED",
    }],
  });
  assert.equal(parser.parse(JSON.stringify(security)).decision, "BLOCK");
  assert.equal(parser.parse(JSON.stringify(auditResult({ decision: "PASS", design_score: 78 }))).decision, "CHALLENGE");
  assert.equal(parser.parse(JSON.stringify(auditResult({ decision: "CHALLENGE", design_score: 58 }))).decision, "BLOCK");
  assert.equal(parser.parse(JSON.stringify(auditResult({ decision: "PASS", design_score: 90 }))).decision, "PASS");
});

test("promotes any human request and separates infrastructure errors", () => {
  const withRequest = auditResult({
    decision: "PASS",
    human_request: { reason: "Login required", requested_action: "Provide a demo session", safe_to_continue_other_work: true },
  });
  assert.equal(parser.parse(JSON.stringify(withRequest)).decision, "HUMAN_REQUIRED");
  assert.throws(
    () => parser.parse(JSON.stringify(auditResult({ infrastructure_error: { code: "BROWSER_MISSING", message: "No browser" } }))),
    AuditInfrastructureError,
  );
});
