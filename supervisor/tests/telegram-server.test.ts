import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import test from "node:test";
import { AuditDispatcher } from "../src/audits/dispatcher.js";
import { SupervisorDatabase } from "../src/db.js";
import { forwardHook } from "../src/hooks/forwarder.js";
import { humanAttentionFromEvent } from "../src/human/attention.js";
import { Logger } from "../src/logger.js";
import { SupervisorServer } from "../src/server.js";
import { TelegramClient } from "../src/telegram/client.js";
import { formatHumanAttentionNotification } from "../src/telegram/formatter.js";
import type { NormalizedEvent } from "../src/types.js";
import { makeTempProject, syntheticTelegramToken, testConfig } from "./helpers.js";

test("Telegram sends only a redacted bounded body and never puts the bot token in headers", async () => {
  const token = syntheticTelegramToken();
  const passwordKey = ["pass", "word"].join("");
  const passwordValue = ["unit", "test", "password"].join("-");
  const providerPrefix = ["s", "k"].join("");
  const providerToken = `${providerPrefix}-${["unit", "test", "provider", "credential"].join("")}`;
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const mockFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 });
  };
  const client = new TelegramClient({ telegramBotToken: token, telegramChatId: "1234" }, mockFetch);
  const id = await client.send(`${passwordKey}=${passwordValue} ${providerToken}`);
  assert.equal(id, "42");
  assert.equal(capturedUrl, `https://api.telegram.org/bot${token}/sendMessage`);
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.has("X-Telegram-Bot-Api-Secret-Token"), false);
  const body = String(capturedInit?.body);
  assert.doesNotMatch(body, new RegExp(`${passwordValue}|${providerToken}`, "u"));
  assert.match(body, /\[REDACTED\]/u);
  assert.doesNotMatch(body, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
});

test("Telegram errors redact bot URLs", async () => {
  const token = syntheticTelegramToken();
  const failingFetch: typeof fetch = async (input) => { throw new Error(`network failure for ${String(input)}`); };
  const client = new TelegramClient({ telegramBotToken: token, telegramChatId: "1234" }, failingFetch);
  await assert.rejects(
    client.send("test"),
    (error: unknown) => error instanceof Error && !error.message.includes(token) && error.message.includes("[REDACTED]"),
  );
});

test("detailed permission events are persisted and sent by the Supervisor while generic notifications stay silent", async () => {
  const project = makeTempProject();
  const permissionSecret = ["unit", "test", "permission", "secret"].join("-");
  const config = testConfig({ hookToken: "local-hook-token", telegramBotToken: syntheticTelegramToken(), telegramChatId: "1234" });
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
    hook_event_name: "PermissionRequest",
    session_id: "session-permission",
    cwd: project,
    tool_name: "Bash",
    tool_input: {
      command: `npx prisma generate --auth-token ${permissionSecret}`,
      description: `Installer le client Prisma; ${["pass", "word"].join("")}=${permissionSecret}`,
    },
  };
  const unauthorized = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  assert.equal(unauthorized.status, 401);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agentic-Supervisor-Token": "local-hook-token" },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 202);
  await waitFor(() => sentBodies.length === 1);
  assert.equal(database.listEvents(project).length, 1);
  assert.equal(database.listEvents(project)[0]?.event_type, "permission.requested");
  assert.equal(sentBodies.length, 1);
  assert.doesNotMatch(sentBodies[0] ?? "", new RegExp(permissionSecret, "u"));
  const telegramText = String((JSON.parse(sentBodies[0] ?? "{}") as { text?: unknown }).text ?? "");
  assert.match(telegramText, /Kriton Supervisor/u);
  assert.match(telegramText, /PermissionRequest|Autorisation requise/u);
  assert.match(telegramText, /npx prisma generate/u);
  assert.match(telegramText, /Action attendue/u);
  assert.equal(database.listHumanRequests(project)[0]?.telegram_message_id, "7");

  const idleResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agentic-Supervisor-Token": "local-hook-token" },
    body: JSON.stringify({
      hook_event_name: "Notification",
      notification_type: "idle_prompt",
      session_id: "session-permission",
      cwd: project,
      message: "Claude is waiting for your input",
    }),
  });
  assert.equal(idleResponse.status, 202);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(sentBodies.length, 1);
  assert.equal(database.listEvents(project)[0]?.event_type, "notification.received");
  await server.close();
  database.close();
  rmSync(project, { recursive: true, force: true });
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("human-attention notification carries structured detail and no remote command channel", () => {
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
    metadata: {
      hook_event_name: "PermissionRequest",
      tool_name: "Bash",
      description: "Installer Prisma pour générer le client local.",
      command_summary: "npx prisma generate",
    },
  };
  const attention = humanAttentionFromEvent(event);
  assert.ok(attention);
  const message = formatHumanAttentionNotification(event, attention);
  assert.match(message, /Kriton Supervisor/u);
  assert.match(message, /Installer Prisma/u);
  assert.match(message, /npx prisma generate/u);
  assert.match(message, /Ouvre la session Claude/u);
  assert.doesNotMatch(message, /\/approve|execute|shell/u);
});

test("AskUserQuestion notification includes the actual question and choices", () => {
  const event: NormalizedEvent = {
    id: "question-1",
    timestamp: new Date().toISOString(),
    producer: "claude",
    project_id: "project",
    project_path: "/tmp/project",
    claude_session_id: "session",
    event_type: "human.input.requested",
    agent_type: null,
    agent_id: null,
    candidate_id: null,
    audit_target: null,
    transcript_path: null,
    agent_transcript_path: null,
    last_message: null,
    metadata: {
      hook_event_name: "PreToolUse",
      tool_name: "AskUserQuestion",
      questions: [{
        question: "Quelle direction visuelle veux-tu retenir ?",
        options: [{ label: "Direction A" }, { label: "Direction B" }],
      }],
    },
  };
  const attention = humanAttentionFromEvent(event);
  assert.ok(attention);
  const message = formatHumanAttentionNotification(event, attention);
  assert.match(message, /Quelle direction visuelle/u);
  assert.match(message, /Direction A · Direction B/u);
  assert.match(message, /Action attendue/u);
});

test("AskUserQuestion and MCP elicitation reach Telegram through Supervisor-owned structured events", async () => {
  const project = makeTempProject("supervisor-human-events-");
  const config = testConfig({ hookToken: "human-hook-token", telegramBotToken: syntheticTelegramToken(), telegramChatId: "1234" });
  const texts: string[] = [];
  const mockFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { text?: unknown };
    texts.push(String(body.text ?? ""));
    return new Response(JSON.stringify({ ok: true, result: { message_id: texts.length } }), { status: 200 });
  };
  const database = new SupervisorDatabase(config.databasePath);
  const server = new SupervisorServer(
    config,
    database,
    new AuditDispatcher(database, config),
    new TelegramClient(config, mockFetch),
    new Logger("error"),
  );
  await server.listen();
  const endpoint = `http://127.0.0.1:${server.address().port}/v1/hooks`;
  const headers = { "Content-Type": "application/json", "X-Agentic-Supervisor-Token": "human-hook-token" };

  const question = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      hook_event_name: "PreToolUse",
      session_id: "human-session",
      cwd: project,
      tool_name: "AskUserQuestion",
      tool_input: {
        questions: [{
          header: "Arbitrage",
          question: "Faut-il conserver la direction A ou choisir B ?",
          options: [{ label: "Direction A" }, { label: "Direction B" }],
          multiSelect: false,
        }],
      },
    }),
  });
  assert.equal(question.status, 202);

  const elicitation = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      hook_event_name: "Elicitation",
      session_id: "human-session",
      cwd: project,
      mcp_server_name: "github",
      message: "Une authentification GitHub doit être terminée dans le navigateur.",
      mode: "url",
      url: "https://github.com/login/device?code=unit-test-device-code&state=unit-test-state",
    }),
  });
  assert.equal(elicitation.status, 202);
  await waitFor(() => texts.length === 2);
  assert.match(texts.join("\n"), /Kriton Supervisor/u);
  assert.match(texts.join("\n"), /Faut-il conserver la direction A/u);
  assert.match(texts.join("\n"), /Direction A · Direction B/u);
  assert.match(texts.join("\n"), /Intégration : github/u);
  assert.match(texts.join("\n"), /authentification GitHub/u);
  assert.match(texts.join("\n"), /https:\/\/github\.com\/login\/device/u);
  assert.doesNotMatch(texts.join("\n"), /unit-test-device-code|unit-test-state/u);
  assert.doesNotMatch(texts.join("\n"), /TELEGRAM_BOT_TOKEN|chat ID|bot token/iu);
  assert.equal(database.listHumanRequests(project).filter((request) => request.status === "open").length, 2);

  await server.close();
  database.close();
  rmSync(project, { recursive: true, force: true });
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("graceful shutdown waits for an in-flight Supervisor notification", async () => {
  const project = makeTempProject("supervisor-notification-shutdown-");
  const config = testConfig({ hookToken: "shutdown-hook-token", telegramBotToken: syntheticTelegramToken(), telegramChatId: "1234" });
  let delivered = false;
  const mockFetch: typeof fetch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    delivered = true;
    return new Response(JSON.stringify({ ok: true, result: { message_id: 19 } }), { status: 200 });
  };
  const database = new SupervisorDatabase(config.databasePath);
  const server = new SupervisorServer(
    config,
    database,
    new AuditDispatcher(database, config),
    new TelegramClient(config, mockFetch),
    new Logger("error"),
  );
  await server.listen();
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/hooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agentic-Supervisor-Token": "shutdown-hook-token" },
    body: JSON.stringify({
      hook_event_name: "PermissionRequest",
      session_id: "shutdown-session",
      cwd: project,
      tool_name: "Bash",
      tool_input: { command: "npm install", description: "Installer les dépendances locales." },
    }),
  });
  assert.equal(response.status, 202);
  await server.close();
  assert.equal(delivered, true);
  assert.equal(database.listHumanRequests(project)[0]?.telegram_message_id, "19");

  database.close();
  rmSync(project, { recursive: true, force: true });
  rmSync(config.dataDir, { recursive: true, force: true });
});

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for asynchronous notification");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

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
