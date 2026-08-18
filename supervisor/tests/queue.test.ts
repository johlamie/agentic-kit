import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ArtifactStore } from "../src/artifacts.js";
import { PromptBuilder } from "../src/codex/prompt-builder.js";
import { CodexProcessError } from "../src/codex/runner.js";
import { SupervisorDatabase } from "../src/db.js";
import { Logger } from "../src/logger.js";
import { AuditQueue } from "../src/queue.js";
import { TelegramClient } from "../src/telegram/client.js";
import type { AuditRecord, AuditResult, CodexRunner } from "../src/types.js";
import { auditResult, makeFakeCodex, makeTempProject, syntheticTelegramToken, testConfig } from "./helpers.js";

class StaticRunner implements CodexRunner {
  public constructor(private readonly value: AuditResult | Error) {}
  public async run(): Promise<{ result: AuditResult; threadId: string; stdout: string; stderr: string; durationMs: number }> {
    if (this.value instanceof Error) throw this.value;
    return { result: this.value, threadId: "fixture-thread", stdout: "", stderr: "", durationMs: 3 };
  }
}

function queueFor(
  database: SupervisorDatabase,
  config: ReturnType<typeof testConfig>,
  runner: CodexRunner,
  telegram = new TelegramClient(config),
): AuditQueue {
  return new AuditQueue(
    database,
    config,
    runner,
    new PromptBuilder(config),
    new ArtifactStore(config),
    telegram,
    new Logger("error"),
  );
}

test("keeps routine audit decisions internal and notifies only human escalation", async () => {
  const project = makeTempProject("supervisor-human-only-telegram-");
  const config = testConfig({
    telegramBotToken: syntheticTelegramToken(),
    telegramChatId: "1234",
    notifyPass: false,
  });
  const sentBodies: string[] = [];
  const mockFetch: typeof fetch = async (_input, init) => {
    sentBodies.push(String(init?.body ?? ""));
    return new Response(JSON.stringify({ ok: true, result: { message_id: sentBodies.length } }), { status: 200 });
  };
  const telegram = new TelegramClient(config, mockFetch);
  const database = new SupervisorDatabase(config.databasePath);

  for (const decision of ["PASS", "CHALLENGE", "BLOCK"] as const) {
    database.enqueueAudit({ projectPath: project, auditType: "code", maxAttempts: 1 });
    await queueFor(database, config, new StaticRunner(auditResult({ decision })), telegram).drainOnce();
  }
  assert.equal(sentBodies.length, 0);

  database.enqueueAudit({ projectPath: project, auditType: "research", maxAttempts: 1 });
  await queueFor(database, config, new StaticRunner(auditResult({
    decision: "HUMAN_REQUIRED",
    human_request: {
      reason: "A human choice is required.",
      requested_action: "Choose the approved data source.",
      safe_to_continue_other_work: true,
    },
  })), telegram).drainOnce();
  assert.equal(sentBodies.length, 1);
  assert.match(sentBodies[0] ?? "", /HUMAN_REQUIRED/u);

  database.close();
  rmSync(project, { recursive: true, force: true });
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("processes an audit asynchronously and writes concise project artifacts", async () => {
  const project = makeTempProject();
  const config = testConfig();
  const database = new SupervisorDatabase(config.databasePath);
  const queued = database.enqueueAudit({ projectPath: project, auditType: "architecture", maxAttempts: 1 });
  const queue = queueFor(database, config, new StaticRunner(auditResult({ decision: "CHALLENGE", summary: "Repair the recovery plan." })));
  assert.equal(await queue.drainOnce(), true);
  const completed = database.getAudit(queued.id) as AuditRecord;
  assert.equal(completed.status, "completed");
  assert.equal(completed.decision, "CHALLENGE");
  assert.equal(database.gate(project, "architecture").exit_code, 10);
  assert.equal(existsSync(join(project, ".claude/supervisor/LATEST.md")), true);
  assert.equal(existsSync(join(project, ".claude/supervisor/STATE.json")), true);
  database.close();
  rmSync(project, { recursive: true, force: true });
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("bounded queue failure becomes ERROR and never PASS", async () => {
  const project = makeTempProject();
  const config = testConfig();
  const database = new SupervisorDatabase(config.databasePath);
  const queued = database.enqueueAudit({ projectPath: project, auditType: "code", maxAttempts: 1 });
  const failure = new CodexProcessError("Codex audit timed out", "CODEX_TIMEOUT");
  assert.equal(await queueFor(database, config, new StaticRunner(failure)).drainOnce(), true);
  assert.equal(database.getAudit(queued.id)?.status, "failed");
  assert.equal(database.getAudit(queued.id)?.decision, null);
  assert.equal(database.gate(project, "code").exit_code, 50);
  database.close();
  rmSync(project, { recursive: true, force: true });
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("visual audit distinguishes missing Playwright from product quality", async () => {
  const root = mkdtempSync(join(tmpdir(), "supervisor-visual-mcp-"));
  const project = makeTempProject();
  const binary = makeFakeCodex(root, { mcpList: [] });
  const config = testConfig({ codexBinary: binary });
  const database = new SupervisorDatabase(config.databasePath);
  const queued = database.enqueueAudit({
    projectPath: project,
    auditType: "visual_ux_audit",
    context: { target_url: "http://127.0.0.1:3000" },
    maxAttempts: 1,
  });
  await queueFor(database, config, new StaticRunner(auditResult({ design_score: 100 }))).drainOnce();
  const failed = database.getAudit(queued.id);
  assert.equal(failed?.status, "failed");
  assert.match(failed?.last_error ?? "", /Playwright MCP/u);
  assert.equal(failed?.decision, null);
  database.close();
  rmSync(project, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("visual audit runs when target and browser capability are available", async () => {
  const root = mkdtempSync(join(tmpdir(), "supervisor-visual-ready-"));
  const project = makeTempProject();
  const binary = makeFakeCodex(root, { mcpList: [{ name: "playwright", enabled: true }] });
  const config = testConfig({ codexBinary: binary });
  const database = new SupervisorDatabase(config.databasePath);
  const queued = database.enqueueAudit({
    projectPath: project,
    auditType: "visual_ux_audit",
    context: { target_url: "http://localhost:3000" },
    maxAttempts: 1,
  });
  const result = auditResult({ decision: "CHALLENGE", design_score: 78, summary: "Mobile overflow requires repair." });
  await queueFor(database, config, new StaticRunner(result)).drainOnce();
  assert.equal(database.getAudit(queued.id)?.decision, "CHALLENGE");
  database.close();
  rmSync(project, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("visual audit refuses non-allowlisted hosts and embedded credentials", async () => {
  for (const target of ["https://unapproved.example/app", "http://user:secret@localhost:3000"]) {
    const project = makeTempProject();
    const config = testConfig();
    const database = new SupervisorDatabase(config.databasePath);
    const queued = database.enqueueAudit({
      projectPath: project,
      auditType: "visual_ux_audit",
      context: { target_url: target },
      maxAttempts: 1,
    });
    await queueFor(database, config, new StaticRunner(auditResult())).drainOnce();
    assert.equal(database.getAudit(queued.id)?.status, "failed");
    assert.match(database.getAudit(queued.id)?.last_error ?? "", /not allowlisted|without embedded credentials/u);
    database.close();
    rmSync(project, { recursive: true, force: true });
    rmSync(config.dataDir, { recursive: true, force: true });
  }
});
