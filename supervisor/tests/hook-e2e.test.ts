import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import test from "node:test";
import { ArtifactStore } from "../src/artifacts.js";
import { AuditDispatcher } from "../src/audits/dispatcher.js";
import { PromptBuilder } from "../src/codex/prompt-builder.js";
import { SupervisorDatabase } from "../src/db.js";
import { Logger } from "../src/logger.js";
import { AuditQueue } from "../src/queue.js";
import { SupervisorServer } from "../src/server.js";
import { TelegramClient } from "../src/telegram/client.js";
import type { AuditRecord, CodexRunner } from "../src/types.js";
import { auditResult, makeTempProject, testConfig } from "./helpers.js";

test("mocked Claude hook flows through persistence, Codex queue, gate, and Stop feedback", async () => {
  const project = makeTempProject("supervisor-hook-e2e-");
  const config = testConfig({ hookToken: "e2e-token" });
  const database = new SupervisorDatabase(config.databasePath);
  const dispatcher = new AuditDispatcher(database, config);
  const telegram = new TelegramClient(config);
  const logger = new Logger("error");
  let receivedPrompt = "";
  const runner: CodexRunner = {
    async run(_audit: AuditRecord, prompt: string) {
      receivedPrompt = prompt;
      return {
        result: auditResult({ decision: "BLOCK", summary: "Authorization ownership check is missing." }),
        threadId: "mock-thread",
        stdout: "",
        stderr: "",
        durationMs: 2,
      };
    },
  };
  const queue = new AuditQueue(database, config, runner, new PromptBuilder(config), new ArtifactStore(config), telegram, logger);
  const server = new SupervisorServer(config, database, dispatcher, telegram, logger);
  await server.listen();
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const headers = { "Content-Type": "application/json", "X-Agentic-Supervisor-Token": "e2e-token" };

  const hookResponse = await fetch(`${endpoint}/v1/hooks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      hook_event_name: "SubagentStop",
      session_id: "claude-e2e-session",
      cwd: project,
      agent_id: "builder-1",
      agent_type: "builder",
      last_assistant_message: "Implemented the slice; reviewer said PASS.",
    }),
  });
  assert.equal(hookResponse.status, 202);
  const accepted = await hookResponse.json() as { scheduled_audits: string[] };
  assert.equal(accepted.scheduled_audits.length, 1);
  assert.equal(await queue.drainOnce(), true);
  assert.match(receivedPrompt, /independent adversarial technical auditor/iu);

  const gateResponse = await fetch(`${endpoint}/v1/gate?project=${encodeURIComponent(project)}&phase=code`, { headers });
  const gate = await gateResponse.json() as { decision: string; exit_code: number };
  assert.equal(gate.decision, "BLOCK");
  assert.equal(gate.exit_code, 20);

  const stopResponse = await fetch(`${endpoint}/v1/hooks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      hook_event_name: "Stop",
      session_id: "claude-e2e-session",
      cwd: project,
      stop_hook_active: false,
      last_assistant_message: "Waiting after slice review.",
    }),
  });
  const stop = await stopResponse.json() as { gate: { decision: string; summary: string } };
  assert.equal(stop.gate.decision, "BLOCK");
  assert.match(stop.gate.summary, /ownership check/u);

  await server.close();
  database.close();
  rmSync(project, { recursive: true, force: true });
  rmSync(config.dataDir, { recursive: true, force: true });
});
