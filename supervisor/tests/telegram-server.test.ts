import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import test from "node:test";
import { AuditDispatcher } from "../src/audits/dispatcher.js";
import { SupervisorDatabase } from "../src/db.js";
import { forwardHook } from "../src/hooks/forwarder.js";
import { Logger } from "../src/logger.js";
import { SupervisorServer } from "../src/server.js";
import { TelegramClient } from "../src/telegram/client.js";
import { formatPermissionNotification } from "../src/telegram/formatter.js";
import type { NormalizedEvent } from "../src/types.js";
import { makeTempProject, testConfig } from "./helpers.js";

test("Telegram sends only a redacted bounded body and never puts the bot token in headers", async () => {
  const token = "123456789:abcdefghijklmnopqrstuvwxyzABCDEFG";
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const mockFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 });
  };
  const client = new TelegramClient({ telegramBotToken: token, telegramChatId: "1234" }, mockFetch);
  const id = await client.send("password=hunter2 sk-abcdefghijklmnopqrstuvwxyz123456");
  assert.equal(id, "42");
  assert.equal(capturedUrl, `https://api.telegram.org/bot${token}/sendMessage`);
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.has("X-Telegram-Bot-Api-Secret-Token"), false);
  const body = String(capturedInit?.body);
  assert.doesNotMatch(body, /hunter2|sk-abcdefghijklmnopqrstuvwxyz123456/u);
  assert.doesNotMatch(body, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
});

test("Telegram errors redact bot URLs", async () => {
  const token = "123456789:abcdefghijklmnopqrstuvwxyzABCDEFG";
  const failingFetch: typeof fetch = async (input) => { throw new Error(`network failure for ${String(input)}`); };
  const client = new TelegramClient({ telegramBotToken: token, telegramChatId: "1234" }, failingFetch);
  await assert.rejects(
    client.send("test"),
    (error: unknown) => error instanceof Error && !error.message.includes(token) && error.message.includes("[REDACTED]"),
  );
});

test("permission events are persisted and forwarded through the authenticated loopback receiver", async () => {
  const project = makeTempProject();
  const config = testConfig({ hookToken: "local-hook-token", telegramBotToken: "123456789:abcdefghijklmnopqrstuvwxyzABCDEFG", telegramChatId: "1234" });
  const sentBodies: string[] = [];
  const mockFetch: typeof fetch = async (_input, init) => {
    sentBodies.push(String(init?.body ?? ""));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 });
  };
  const database = new SupervisorDatabase(config.databasePath);
  const telegram = new TelegramClient(config, mockFetch);
  const server = new SupervisorServer(config, database, new AuditDispatcher(database, config), telegram, new Logger("error"));
  await server.listen();
  const address = server.address();
  const endpoint = `http://127.0.0.1:${address.port}/v1/hooks`;
  const payload = {
    hook_event_name: "Notification",
    notification_type: "permission_prompt",
    session_id: "session-permission",
    cwd: project,
    message: "Approval needed; password=should-never-leak",
  };
  const unauthorized = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  assert.equal(unauthorized.status, 401);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agentic-Supervisor-Token": "local-hook-token" },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 202);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(database.listEvents(project).length, 1);
  assert.equal(database.listEvents(project)[0]?.event_type, "permission.requested");
  assert.equal(sentBodies.length, 1);
  assert.doesNotMatch(sentBodies[0] ?? "", /should-never-leak/u);
  await server.close();
  database.close();
  rmSync(project, { recursive: true, force: true });
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("permission notification gives no remote command channel", () => {
  const event: NormalizedEvent = {
    id: "permission-1",
    timestamp: new Date().toISOString(),
    producer: "claude",
    project_id: "project",
    project_path: "/tmp/project",
    claude_session_id: "session",
    event_type: "permission.requested",
    agent_type: "devops",
    agent_id: "devops-1",
    candidate_id: "devops-1",
    audit_target: null,
    transcript_path: null,
    agent_transcript_path: null,
    last_message: null,
    metadata: { message: "Deploy permission required" },
  };
  const message = formatPermissionNotification(event);
  assert.match(message, /Open the Claude session to approve or reject/u);
  assert.doesNotMatch(message, /\/approve|execute|shell/u);
});

test("Stop hook blocks on unresolved audit outcomes and honors recursion protection", async () => {
  const previous = {
    envFile: process.env.SUPERVISOR_ENV_FILE,
    tokenFile: process.env.SUPERVISOR_HOOK_TOKEN_FILE,
  };
  process.env.SUPERVISOR_ENV_FILE = "/tmp/nonexistent-supervisor-forwarder.env";
  process.env.SUPERVISOR_HOOK_TOKEN_FILE = "/tmp/nonexistent-supervisor-forwarder-token";
  const mockFetch: typeof fetch = async () => new Response(JSON.stringify({
    accepted: true,
    gate: { decision: "BLOCK", exit_code: 20, summary: "Authorization defect", audit_id: "audit-1" },
  }), { status: 202 });
  const raw = JSON.stringify({ hook_event_name: "Stop", cwd: "/tmp/project", session_id: "s", stop_hook_active: false });
  const output = await forwardHook(raw, mockFetch);
  assert.match(output ?? "", /"decision":"block"/u);
  assert.match(output ?? "", /Authorization defect/u);
  const recursive = await forwardHook(JSON.stringify({ hook_event_name: "Stop", cwd: "/tmp/project", session_id: "s", stop_hook_active: true }), mockFetch);
  assert.equal(recursive, null);
  if (previous.envFile === undefined) delete process.env.SUPERVISOR_ENV_FILE;
  else process.env.SUPERVISOR_ENV_FILE = previous.envFile;
  if (previous.tokenFile === undefined) delete process.env.SUPERVISOR_HOOK_TOKEN_FILE;
  else process.env.SUPERVISOR_HOOK_TOKEN_FILE = previous.tokenFile;
});
