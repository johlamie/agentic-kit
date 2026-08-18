import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AuditOutputError } from "../src/codex/parser.js";
import { CliCodexRunner, CodexProcessError } from "../src/codex/runner.js";
import { SupervisorDatabase } from "../src/db.js";
import type { AuditRecord, AuditType } from "../src/types.js";
import { auditResult, makeFakeCodex, makeTempProject, testConfig } from "./helpers.js";

function claimedAudit(database: SupervisorDatabase, project: string, auditType: AuditType): AuditRecord {
  const queued = database.enqueueAudit({ projectPath: project, auditType });
  const claimed = database.claimNextAudit();
  assert.equal(claimed?.id, queued.id);
  return claimed as AuditRecord;
}

test("invokes Codex with read-only ephemeral arguments and a restricted environment", async () => {
  const root = mkdtempSync(join(tmpdir(), "supervisor-runner-success-"));
  const project = makeTempProject();
  const capturePath = join(root, "capture.json");
  const binary = makeFakeCodex(root, { result: auditResult({ decision: "CHALLENGE" }), capturePath });
  const config = testConfig({ codexBinary: binary });
  const database = new SupervisorDatabase(":memory:");
  const audit = claimedAudit(database, project, "research");
  const priorSecret = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "123456789:telegram-secret-value-should-not-leak";
  try {
    const run = await new CliCodexRunner(config).run(audit, "audit this milestone");
    assert.equal(run.result.decision, "CHALLENGE");
    assert.equal(run.threadId, "fake-thread");
    const capture = JSON.parse(readFileSync(capturePath, "utf8")) as { args: string[]; prompt: string; env: Record<string, string> };
    assert.equal(capture.prompt, "audit this milestone");
    assert.ok(capture.args.includes("--search"));
    assert.deepEqual(capture.args.slice(capture.args.indexOf("-c"), capture.args.indexOf("-c") + 2), ["-c", "allow_login_shell=false"]);
    assert.ok(capture.args.includes("--ephemeral"));
    assert.deepEqual(capture.args.slice(capture.args.indexOf("--sandbox"), capture.args.indexOf("--sandbox") + 2), ["--sandbox", "read-only"]);
    assert.deepEqual(capture.args.slice(capture.args.indexOf("--ask-for-approval"), capture.args.indexOf("--ask-for-approval") + 2), ["--ask-for-approval", "never"]);
    assert.ok(capture.args.indexOf("--ask-for-approval") < capture.args.indexOf("exec"));
    assert.ok(capture.args.indexOf("--sandbox") < capture.args.indexOf("exec"));
    assert.equal(capture.args[capture.args.indexOf("-C") + 1], project);
    assert.equal(capture.env.TELEGRAM_BOT_TOKEN, undefined);
  } finally {
    if (priorSecret === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = priorSecret;
    database.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test("reports malformed Codex output", async () => {
  const root = mkdtempSync(join(tmpdir(), "supervisor-runner-malformed-"));
  const project = makeTempProject();
  const binary = makeFakeCodex(root, { malformed: "{not-json" });
  const database = new SupervisorDatabase(":memory:");
  const audit = claimedAudit(database, project, "code");
  await assert.rejects(new CliCodexRunner(testConfig({ codexBinary: binary })).run(audit, "audit"), AuditOutputError);
  database.close();
  rmSync(root, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

test("reports Codex timeout without returning PASS", async () => {
  const root = mkdtempSync(join(tmpdir(), "supervisor-runner-timeout-"));
  const project = makeTempProject();
  const binary = makeFakeCodex(root, { delayMs: 2_000 });
  const database = new SupervisorDatabase(":memory:");
  const audit = claimedAudit(database, project, "code");
  await assert.rejects(
    new CliCodexRunner(testConfig({ codexBinary: binary, auditTimeoutMs: 50 })).run(audit, "audit"),
    (error: unknown) => error instanceof CodexProcessError && error.code === "CODEX_TIMEOUT",
  );
  database.close();
  rmSync(root, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

test("reports unavailable and failing Codex executables", async () => {
  const project = makeTempProject();
  const database = new SupervisorDatabase(":memory:");
  const unavailableAudit = claimedAudit(database, project, "security");
  await assert.rejects(
    new CliCodexRunner(testConfig({ codexBinary: "/definitely/missing/codex" })).run(unavailableAudit, "audit"),
    (error: unknown) => error instanceof CodexProcessError && error.code === "CODEX_UNAVAILABLE",
  );
  database.completeAudit(unavailableAudit.id, auditResult({ decision: "CHALLENGE", summary: "Codex unavailable in fixture" }), null);

  const root = mkdtempSync(join(tmpdir(), "supervisor-runner-exit-"));
  const binary = makeFakeCodex(root, { exitCode: 7 });
  const failedAudit = claimedAudit(database, project, "qa");
  await assert.rejects(
    new CliCodexRunner(testConfig({ codexBinary: binary })).run(failedAudit, "audit"),
    (error: unknown) => error instanceof CodexProcessError && error.code === "CODEX_EXIT",
  );
  database.close();
  rmSync(root, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});
