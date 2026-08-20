import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import test from "node:test";
import { ActivityBus, buildActivitySnapshot } from "../src/activity.js";
import { humanAttentionFromEvent } from "../src/human/attention.js";
import { AuditDispatcher } from "../src/audits/dispatcher.js";
import { SupervisorDatabase } from "../src/db.js";
import { Logger } from "../src/logger.js";
import { SupervisorServer } from "../src/server.js";
import { TelegramClient } from "../src/telegram/client.js";
import type { NormalizedEvent } from "../src/types.js";
import { makeTempProject, testConfig } from "./helpers.js";

function lifecycleEvent(projectPath: string, type: "session.started" | "session.ended", id: string): NormalizedEvent {
  return {
    id,
    timestamp: new Date().toISOString(),
    producer: "claude",
    project_id: "ignored",
    project_path: projectPath,
    claude_session_id: "activity-session",
    event_type: type,
    agent_type: null,
    agent_id: null,
    candidate_id: null,
    audit_target: null,
    transcript_path: null,
    agent_transcript_path: null,
    last_message: null,
    metadata: type === "session.ended" ? { reason: "prompt_input_exit" } : {},
  };
}

test("serves one local activity view and releases its SSE resources at SessionEnd", async () => {
  const project = makeTempProject("activity-view-");
  const config = testConfig({ hookToken: "activity-hook-token" });
  const database = new SupervisorDatabase(config.databasePath);
  database.insertEvent(lifecycleEvent(project, "session.started", "start"));
  const active = database.activeProjectByPath(project, config.activitySessionStaleMs);
  assert.ok(active);
  const activity = new ActivityBus();
  const server = new SupervisorServer(
    config,
    database,
    new AuditDispatcher(database, config),
    new TelegramClient(config),
    new Logger("error"),
    undefined,
    activity,
  );
  await server.listen();
  const origin = `http://127.0.0.1:${server.address().port}`;

  const page = await fetch(`${origin}/${active.slug}`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/u);
  const html = await page.text();
  assert.match(html, /data-supervisor-runtime="true"/u);
  assert.match(html, /Flux local · données sensibles expurgées/u);
  // The breadcrumb is the only route back to the control center.
  assert.match(html, /<li><a href="\/">Projets<\/a><\/li>/u);

  const proxied = await fetch(`${origin}/${active.slug}`, { headers: { "X-Forwarded-For": "203.0.113.10" } });
  assert.equal(proxied.status, 403);

  const snapshotResponse = await fetch(`${origin}/_supervisor/api/projects/${active.slug}/activity`);
  assert.equal(snapshotResponse.status, 200);
  const snapshot = await snapshotResponse.json() as { status?: unknown; items?: unknown[] };
  assert.equal(snapshot.status, "active");
  assert.ok(snapshot.items?.some((item) => (item as { label?: unknown }).label === "DÉMARRAGE"));

  const auditResponse = await fetch(`${origin}/v1/audits`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agentic-Supervisor-Token": "activity-hook-token",
    },
    body: JSON.stringify({
      project,
      type: "visual_ux_audit",
      url: "http://127.0.0.1:4173/preview?code=unit-test-preview-code#complete",
    }),
  });
  assert.equal(auditResponse.status, 202);
  const storedAudit = database.listAudits(project, 1)[0];
  assert.equal(storedAudit?.audit_target, "http://127.0.0.1:4173/preview");
  assert.doesNotMatch(storedAudit?.context_json ?? "", /unit-test-preview-code|complete/u);

  const streamResponse = await fetch(`${origin}/_supervisor/api/projects/${active.slug}/stream`);
  assert.equal(streamResponse.status, 200);
  assert.equal(activity.subscriberCount, 1);
  assert.equal(await healthNumber(origin, "activity_streams"), 1);

  const endResponse = await fetch(`${origin}/v1/hooks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agentic-Supervisor-Token": "activity-hook-token",
    },
    body: JSON.stringify({
      hook_event_name: "SessionEnd",
      session_id: "activity-session",
      cwd: project,
      reason: "prompt_input_exit",
    }),
  });
  assert.equal(endResponse.status, 202);
  await waitFor(async () => activity.subscriberCount === 0 && await healthNumber(origin, "activity_streams") === 0);
  assert.equal((await fetch(`${origin}/${active.slug}`)).status, 404);
  assert.equal((await fetch(`${origin}/_supervisor/api/projects/${active.slug}/activity`)).status, 410);

  await streamResponse.body?.cancel();
  await server.close();
  database.close();
  rmSync(project, { recursive: true, force: true });
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("tracks 1000 active projects without allocating per-project live resources", () => {
  const database = new SupervisorDatabase(":memory:");
  const activity = new ActivityBus();
  for (let index = 0; index < 1_000; index += 1) {
    database.insertEvent({
      ...lifecycleEvent(`/tmp/supervisor-virtual-project-${index}`, "session.started", `start-${index}`),
      claude_session_id: `session-${index}`,
    });
    activity.publish(`/tmp/supervisor-virtual-project-${index}`);
  }
  assert.equal(database.listActiveProjects(60_000, 2_000).length, 1_000);
  assert.equal(activity.subscriberCount, 0);
  database.close();
});

test("renders complete French sentences when hook metadata is missing", () => {
  const project = "/tmp/supervisor-copy-project";
  const database = new SupervisorDatabase(":memory:");
  database.insertEvent(lifecycleEvent(project, "session.started", "copy-start"));
  // A permission hook that carries no tool name, description or command.
  database.insertEvent({
    ...lifecycleEvent(project, "session.started", "copy-permission"),
    event_type: "permission.requested",
    timestamp: new Date().toISOString(),
    metadata: { permission_mode: "ask", hook_event_name: "PermissionRequest" },
  });

  const snapshot = buildActivitySnapshot(database, "supervisor-copy-project", 86_400_000);
  assert.ok(snapshot);
  const permission = snapshot.items.find((item) => item.label === "AUTORISATION");
  assert.ok(permission);
  assert.equal(permission.title, "Autorisation requise");
  assert.equal(permission.summary, "Claude demande une autorisation avant de poursuivre son travail.");
  assert.match(permission.details, /^Outil : non précisé par le hook$/mu);
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /utiliser opération/u, "no dangling article in the fallback sentence");
  assert.doesNotMatch(serialized, /Outil : opération/u);

  // A named tool produces a grammatically complete sentence too.
  const named = humanAttentionFromEvent({
    ...lifecycleEvent(project, "session.started", "copy-named"),
    event_type: "permission.requested",
    metadata: { tool_name: "Bash" },
  });
  assert.equal(named?.reason, "Claude demande l’autorisation d’utiliser l’outil Bash.");

  database.close();
});

test("translates Claude session end reasons instead of leaking raw identifiers", () => {
  const project = "/tmp/supervisor-reason-project";
  const database = new SupervisorDatabase(":memory:");
  database.insertEvent(lifecycleEvent(project, "session.started", "reason-start"));
  database.insertEvent({
    ...lifecycleEvent(project, "session.ended", "reason-end"),
    metadata: { reason: "prompt_input_exit" },
  });
  const ended = database.listEvents(project, 10).find((item) => item.event_type === "session.ended");
  assert.ok(ended);

  database.insertEvent(lifecycleEvent(project, "session.started", "reason-restart"));
  const snapshot = buildActivitySnapshot(database, "supervisor-reason-project", 86_400_000);
  assert.ok(snapshot);
  const stop = snapshot.items.find((item) => item.label === "ARRÊT");
  assert.ok(stop);
  assert.equal(stop.details, "Motif : la saisie a été interrompue");
  assert.doesNotMatch(JSON.stringify(snapshot), /Motif : (?:other|prompt_input_exit)/u);
  database.close();
});

async function healthNumber(origin: string, key: string): Promise<number> {
  const response = await fetch(`${origin}/health`);
  const payload = await response.json() as Record<string, unknown>;
  return Number(payload[key]);
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!await predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for activity resources to close");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
