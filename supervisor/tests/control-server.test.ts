import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ActivityBus, buildControlSnapshot } from "../src/activity.js";
import { AuditDispatcher } from "../src/audits/dispatcher.js";
import {
  SupervisorDatabase,
  activeQueueCountsSql,
  latestAuditsBatchSql,
  openHumanRequestCountsBatchSql,
  openHumanRequestPageSql,
  openHumanRequestTotalSql,
  queueCountsBatchSql,
} from "../src/db.js";
import { humanAttentionFromEvent } from "../src/human/attention.js";
import { Logger } from "../src/logger.js";
import { MASKED_PROJECT_NAME } from "../src/security/redact.js";
import { SupervisorServer } from "../src/server.js";
import { TelegramClient } from "../src/telegram/client.js";
import type { ControlSnapshot, EventType, NormalizedEvent } from "../src/types.js";
import { auditResult, makeTempProject, syntheticGitHubToken, testConfig } from "./helpers.js";

const BROWSER_HEADERS = { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };

function event(
  projectPath: string,
  type: EventType,
  id: string,
  overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
  return {
    id,
    timestamp: new Date().toISOString(),
    producer: "claude",
    project_id: "ignored",
    project_path: projectPath,
    claude_session_id: `session-${id}`,
    event_type: type,
    agent_type: null,
    agent_id: null,
    candidate_id: null,
    audit_target: null,
    transcript_path: null,
    agent_transcript_path: null,
    last_message: null,
    metadata: type === "session.ended" ? { reason: "prompt_input_exit" } : {},
    ...overrides,
  };
}

function openRequest(database: SupervisorDatabase, projectPath: string, id: string, timestamp: string): void {
  const permission = event(projectPath, "permission.requested", id, {
    claude_session_id: "control-active-session",
    timestamp,
    metadata: { tool_name: "Bash", description: `Autorisation ${id}`, command_summary: "npm run deploy" },
  });
  const ids = database.insertEvent(permission);
  const attention = humanAttentionFromEvent(permission);
  assert.ok(attention);
  database.createEventHumanRequest(permission, ids.sessionId, attention);
}

interface SseCollector {
  events: string[];
  stop: () => Promise<void>;
}

function collectSse(body: ReadableStream<Uint8Array>): SseCollector {
  const events: string[] = [];
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const pump = (async () => {
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) return;
        buffer += decoder.decode(chunk.value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const name = /^event: ([a-z]+)$/mu.exec(frame)?.[1];
          if (name) events.push(name);
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch {
      // The reader was cancelled by the test; nothing else to drain.
    }
  })();
  return { events, stop: async (): Promise<void> => { await reader.cancel(); await pump; } };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/** Exact SQL cost of one control snapshot: 2 project lists, 3 batch aggregates,
 *  the attention page, the global open request total, the queue totals, the ping. */
const CONTROL_SNAPSHOT_QUERY_BUDGET = 9;

interface CountableStatement {
  all(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

interface CountableConnection {
  prepare(sql: string): CountableStatement;
  exec(sql: string): void;
}

/**
 * Counts SQL operations spent by one buildControlSnapshot call. The wrapper is
 * installed after seeding and lives only in this test: production code carries
 * no instrumentation.
 */
function countSnapshotQueries(projectCount: number): number {
  const database = new SupervisorDatabase(":memory:");
  for (let index = 0; index < projectCount; index += 1) {
    const projectPath = `/tmp/supervisor-budget-${index}`;
    const at = new Date(Date.now() - (index + 2) * 60_000).toISOString();
    database.insertEvent(event(projectPath, "session.started", `budget-start-${index}`, {
      claude_session_id: `budget-session-${index}`,
      timestamp: at,
    }));
    if (index % 3 === 0) {
      database.insertEvent(event(projectPath, "session.ended", `budget-end-${index}`, {
        claude_session_id: `budget-session-${index}`,
        timestamp: at,
      }));
    }
    if (index % 10 === 0) database.enqueueAudit({ projectPath, auditType: "code" });
  }

  const connection = (database as unknown as { database: CountableConnection }).database;
  const originalPrepare = connection.prepare.bind(connection);
  const originalExec = connection.exec.bind(connection);
  let operations = 0;
  connection.prepare = (sql: string): CountableStatement => {
    const statement = originalPrepare(sql);
    for (const method of ["all", "get", "run"] as const) {
      const original = statement[method].bind(statement);
      statement[method] = (...params: unknown[]): unknown => {
        operations += 1;
        return original(...params);
      };
    }
    return statement;
  };
  connection.exec = (sql: string): void => {
    operations += 1;
    originalExec(sql);
  };

  buildControlSnapshot(database, testConfig(), { telegramConfigured: false, activeStreams: 0 });

  connection.prepare = originalPrepare;
  connection.exec = originalExec;
  database.close();
  return operations;
}

function indexNames(raw: DatabaseSync): string[] {
  const rows = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>;
  return rows.map((row) => String(row.name));
}

test("serves the control center to a browser and keeps the health JSON for tooling", async () => {
  const activeProject = makeTempProject("control-active-");
  const inactiveProject = makeTempProject("control-inactive-");
  const config = testConfig();
  const database = new SupervisorDatabase(config.databasePath);
  const activity = new ActivityBus();

  database.insertEvent(event(activeProject, "session.started", "active-start", {
    claude_session_id: "control-active-session",
  }));
  openRequest(database, activeProject, "permission-old", new Date(Date.now() - 900_000).toISOString());
  openRequest(database, activeProject, "permission-new", new Date(Date.now() - 60_000).toISOString());

  database.insertEvent(event(inactiveProject, "session.started", "inactive-start", {
    claude_session_id: "control-inactive-session",
  }));
  database.insertEvent(event(inactiveProject, "session.ended", "inactive-end", {
    claude_session_id: "control-inactive-session",
  }));
  const inactiveAudit = database.enqueueAudit({ projectPath: inactiveProject, auditType: "code" });
  database.completeAudit(inactiveAudit.id, auditResult({ decision: "CHALLENGE", summary: "Le plan de reprise reste implicite." }), null);

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

  const page = await fetch(`${origin}/`, { headers: BROWSER_HEADERS });
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /text\/html/u);
  assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/u);
  assert.equal(page.headers.get("cache-control"), "no-store");
  const html = await page.text();
  assert.match(html, /Centre de contrôle/u);
  assert.match(html, /Intervention attendue/u);
  assert.doesNotMatch(html, /Simuler un événement/u);
  // frame-ancestors is only meaningful in the header; in <meta> browsers log an error.
  assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/u);
  const metaCsp = /http-equiv="Content-Security-Policy"\s*content="([^"]+)"/u.exec(html.replace(/\n\s*/gu, " "));
  assert.ok(metaCsp?.[1], "the page ships a meta CSP");
  assert.doesNotMatch(metaCsp[1], /frame-ancestors/u, "meta CSP must not declare frame-ancestors");

  const rootJson = await fetch(`${origin}/`);
  assert.match(rootJson.headers.get("content-type") ?? "", /application\/json/u);
  assert.equal((await rootJson.json() as { status?: unknown }).status, "ok");

  const health = await fetch(`${origin}/health`, { headers: BROWSER_HEADERS });
  assert.match(health.headers.get("content-type") ?? "", /application\/json/u);
  assert.equal((await health.json() as { control_ui?: unknown }).control_ui, "ready");

  const proxied = await fetch(`${origin}/_supervisor/api/control/summary`, {
    headers: { "X-Forwarded-For": "203.0.113.10" },
  });
  assert.equal(proxied.status, 403);

  const summaryResponse = await fetch(`${origin}/_supervisor/api/control/summary`);
  assert.equal(summaryResponse.status, 200);
  const rawSummary = await summaryResponse.text();
  const summary = JSON.parse(rawSummary) as ControlSnapshot;

  assert.equal(summary.daemon.database, "ok");
  assert.equal(summary.daemon.telegram, "not_configured");
  assert.equal(summary.daemon.activeStreams, 0);

  assert.equal(summary.attention.length, 2);
  assert.equal(summary.attention[0]?.id !== undefined, true);
  assert.ok((summary.attention[0]?.createdAt ?? "") < (summary.attention[1]?.createdAt ?? ""));
  assert.equal(summary.attention[0]?.title, "Autorisation requise");
  assert.equal(summary.attention[0]?.source, "permission");

  const active = summary.projects.find((project) => project.active);
  const inactive = summary.projects.find((project) => !project.active);
  assert.ok(active);
  assert.ok(inactive);
  assert.equal(summary.projects[0], active, "active projects come first");
  assert.equal(active.openHumanRequests, 2);
  assert.equal(active.activeSessionCount, 1);
  assert.equal(active.latestAudit, null);
  assert.equal(inactive.activeSessionCount, 0);
  assert.equal(inactive.latestAudit?.decision, "CHALLENGE");
  assert.equal(inactive.latestAudit?.typeLabel, "Code");
  assert.equal(inactive.latestAudit?.tone, "challenge");
  assert.equal(inactive.queue.completed, 1);

  assert.equal(rawSummary.includes(activeProject), false, "the snapshot must not leak absolute paths");
  assert.equal(rawSummary.includes(inactiveProject), false, "the snapshot must not leak absolute paths");
  assert.doesNotMatch(rawSummary, /"[^"]*\/tmp\//u);

  // Reading the snapshot must not allocate any live resource.
  assert.equal(activity.subscriberCount, 0);
  assert.equal(await healthNumber(origin, "activity_streams"), 0);

  await server.close();
  database.close();
  rmSync(activeProject, { recursive: true, force: true });
  rmSync(inactiveProject, { recursive: true, force: true });
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("debounces global nudges, shares the stream budget, and releases the subscription", async () => {
  const project = makeTempProject("control-stream-");
  const config = testConfig({ activityMaxStreams: 1 });
  const database = new SupervisorDatabase(config.databasePath);
  const activity = new ActivityBus();
  database.insertEvent(event(project, "session.started", "stream-start"));

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

  const head = await fetch(`${origin}/_supervisor/api/control/stream`, { method: "HEAD" });
  assert.equal(head.status, 405);

  const streamResponse = await fetch(`${origin}/_supervisor/api/control/stream`);
  assert.equal(streamResponse.status, 200);
  assert.match(streamResponse.headers.get("content-type") ?? "", /text\/event-stream/u);
  const body = streamResponse.body;
  assert.ok(body);
  const stream = collectSse(body);
  await waitFor(async () => stream.events.length === 1);
  assert.equal(activity.subscriberCount, 1);
  assert.equal(await healthNumber(origin, "activity_streams"), 1);

  const saturated = await fetch(`${origin}/_supervisor/api/control/stream`);
  assert.equal(saturated.status, 503);

  for (let index = 0; index < 5; index += 1) activity.publish(project);
  await sleep(1_800);
  assert.deepEqual(stream.events, ["refresh", "refresh"], "a burst of publications yields a single nudge");

  await stream.stop();
  await waitFor(async () => activity.subscriberCount === 0 && await healthNumber(origin, "activity_streams") === 0);

  await server.close();
  database.close();
  rmSync(project, { recursive: true, force: true });
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("disables the whole control center when SUPERVISOR_CONTROL_UI is off", async () => {
  const config = testConfig({ controlUi: false });
  const database = new SupervisorDatabase(config.databasePath);
  const server = new SupervisorServer(
    config,
    database,
    new AuditDispatcher(database, config),
    new TelegramClient(config),
    new Logger("error"),
  );
  await server.listen();
  const origin = `http://127.0.0.1:${server.address().port}`;

  const root = await fetch(`${origin}/`, { headers: BROWSER_HEADERS });
  assert.equal(root.status, 200);
  assert.match(root.headers.get("content-type") ?? "", /application\/json/u);
  const payload = await root.json() as { status?: unknown; control_ui?: unknown };
  assert.equal(payload.status, "ok");
  assert.equal(payload.control_ui, "disabled");

  assert.equal((await fetch(`${origin}/_supervisor/api/control/summary`)).status, 404);
  assert.equal((await fetch(`${origin}/_supervisor/api/control/stream`)).status, 404);
  assert.equal((await fetch(`${origin}/_supervisor/assets/control.js`)).status, 404);

  await server.close();
  database.close();
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("bounds the snapshot and aggregates per-project values when a thousand projects exist", async () => {
  const config = testConfig();
  const database = new SupervisorDatabase(":memory:");
  const total = 1_200;
  for (let index = 0; index < total; index += 1) {
    const projectPath = `/tmp/supervisor-control-scale-${index}`;
    const at = new Date(Date.now() - (index + 3) * 60_000).toISOString();
    const session = `scale-session-${index}`;
    database.insertEvent(event(projectPath, "session.started", `scale-start-${index}`, {
      claude_session_id: session,
      timestamp: at,
    }));
    // One project in three is closed, so both lists have candidates.
    if (index % 3 === 0) {
      database.insertEvent(event(projectPath, "session.ended", `scale-end-${index}`, {
        claude_session_id: session,
        timestamp: at,
      }));
    }
    // Realistic audit volume: two rows per project, half of them with a verdict,
    // so a table scan would have thousands of rows to walk.
    const audit = database.enqueueAudit({ projectPath, auditType: "code" });
    database.enqueueAudit({ projectPath, auditType: "qa" });
    if (index % 2 === 0) {
      database.completeAudit(audit.id, auditResult({ summary: "Jalon conforme aux preuves fournies." }), null);
    }
    if (index % 4 === 0) openRequest(database, projectPath, `scale-permission-${index}`, at);
  }
  const seeded = database.queueCounts();
  assert.equal(seeded.pending + seeded.running + seeded.completed + seeded.failed, total * 2, "the load test carries a real audit volume");
  assert.equal(database.openHumanRequestCount(), total / 4, "and a real human request volume");

  // A project with no audit at all still has to report zeroed counters.
  const bare = "/tmp/supervisor-control-scale-bare";
  database.insertEvent(event(bare, "session.started", "bare-start", {
    claude_session_id: "bare-session",
    timestamp: new Date(Date.now() - 60_000).toISOString(),
  }));

  // The most recent project carries every per-project value the snapshot reports.
  const featured = "/tmp/supervisor-control-scale-featured";
  database.insertEvent(event(featured, "session.started", "featured-start", {
    claude_session_id: "featured-session",
  }));
  const featuredAudit = database.enqueueAudit({ projectPath: featured, auditType: "qa" });
  database.completeAudit(featuredAudit.id, auditResult({ decision: "BLOCK", summary: "Un scénario critique échoue." }), null);
  openRequest(database, featured, "featured-permission", new Date().toISOString());

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

  const startedAt = Date.now();
  const response = await fetch(`${origin}/_supervisor/api/control/summary`);
  const elapsed = Date.now() - startedAt;
  assert.equal(response.status, 200);
  const summary = await response.json() as ControlSnapshot;

  assert.equal(summary.projectLimit, 200);
  assert.equal(summary.projects.length, 200, "the snapshot never grows with the project count");
  assert.equal(summary.projectsTruncated, true, "truncation is declared, never silent");
  assert.equal(summary.projects.every((project) => project.active), true, "active projects fill the page first");
  assert.ok(elapsed < 3_000, `a bounded snapshot must stay fast, took ${elapsed}ms`);

  const first = summary.projects[0];
  assert.ok(first);
  assert.equal(first.name, "supervisor-control-scale-featured");
  assert.equal(first.openHumanRequests, 1);
  assert.equal(first.queue.completed, 1);
  assert.equal(first.latestAudit?.decision, "BLOCK");
  assert.equal(first.latestAudit?.typeLabel, "QA");
  assert.equal(summary.attention.length, 50, "the attention list keeps its own cap under load");

  // Projects without audits or requests still report zeroed counters.
  const bareRow = summary.projects[1];
  assert.ok(bareRow);
  assert.equal(bareRow.name, "supervisor-control-scale-bare");
  assert.equal(bareRow.latestAudit, null);
  assert.equal(bareRow.openHumanRequests, 0);
  assert.deepEqual(bareRow.queue, { pending: 0, running: 0, completed: 0, failed: 0 });

  // A project from the seeded bulk reports its own two audits, not a neighbour's.
  const bulk = summary.projects[2];
  assert.ok(bulk);
  assert.match(bulk.name, /^supervisor-control-scale-\d+$/u);
  assert.equal(bulk.queue.pending + bulk.queue.completed, 2);
  assert.ok(bulk.latestAudit);

  assert.equal(activity.subscriberCount, 0, "reading a large snapshot allocates no live resource");

  await server.close();
  database.close();
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("declares the true open request total when the attention list is capped", async () => {
  const project = makeTempProject("control-attention-");
  const config = testConfig();
  const database = new SupervisorDatabase(config.databasePath);
  database.insertEvent(event(project, "session.started", "attention-start", {
    claude_session_id: "control-active-session",
  }));
  const open = 60;
  for (let index = 0; index < open; index += 1) {
    openRequest(database, project, `attention-permission-${index}`, new Date(Date.now() - (open - index) * 60_000).toISOString());
  }
  assert.equal(database.openHumanRequestCount(), open);

  const server = new SupervisorServer(
    config,
    database,
    new AuditDispatcher(database, config),
    new TelegramClient(config),
    new Logger("error"),
  );
  await server.listen();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const summary = await (await fetch(`${origin}/_supervisor/api/control/summary`)).json() as ControlSnapshot;

  assert.equal(summary.attentionLimit, 50);
  assert.equal(summary.attention.length, 50, "the page stays bounded");
  assert.equal(summary.attentionTotal, open, "but the real total is never hidden");
  assert.ok(summary.attentionTotal > summary.attention.length, "the UI can detect the truncation");

  const oldest = summary.attention[0]?.createdAt ?? "";
  const newest = summary.attention[summary.attention.length - 1]?.createdAt ?? "";
  assert.ok(oldest < newest, "the oldest requests are the ones kept");
  assert.equal(summary.projects[0]?.openHumanRequests, open);

  await server.close();
  database.close();
  rmSync(project, { recursive: true, force: true });
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("keeps a flat SQL budget per control snapshot whatever the project count", () => {
  const budgets = [10, 200, 1_200].map((size) => countSnapshotQueries(size));
  assert.deepEqual(
    budgets,
    [CONTROL_SNAPSHOT_QUERY_BUDGET, CONTROL_SNAPSHOT_QUERY_BUDGET, CONTROL_SNAPSHOT_QUERY_BUDGET],
    `a control snapshot must cost exactly ${CONTROL_SNAPSHOT_QUERY_BUDGET} SQL operations; a reintroduced N+1 grows with the project count`,
  );
});

test("serves every control batch aggregate from an index instead of a table scan", () => {
  const config = testConfig();
  const database = new SupervisorDatabase(config.databasePath);
  for (let index = 0; index < 60; index += 1) {
    const projectPath = `/tmp/supervisor-plan-${index}`;
    database.insertEvent(event(projectPath, "session.started", `plan-start-${index}`, {
      claude_session_id: `plan-session-${index}`,
    }));
    database.enqueueAudit({ projectPath, auditType: "code" });
    database.enqueueAudit({ projectPath, auditType: "qa" });
    if (index % 5 === 0) openRequest(database, projectPath, `plan-permission-${index}`, new Date().toISOString());
  }
  database.close();

  const raw = new DatabaseSync(config.databasePath);
  const ids = (raw.prepare("SELECT id FROM projects LIMIT 25").all() as Array<{ id: string }>).map((row) => row.id);
  assert.equal(ids.length, 25);
  const marks = ids.map(() => "?").join(",");
  const statements: Array<[string, string, Array<string | number>]> = [
    ["projectQueueCountsBatch", queueCountsBatchSql(marks), ids],
    ["openHumanRequestCountsBatch", openHumanRequestCountsBatchSql(marks), ids],
    ["latestAuditsBatch", latestAuditsBatchSql(marks), ids],
    // Global reads: these must not grow with total table history either.
    ["openHumanRequestTotal", openHumanRequestTotalSql(), []],
    ["openHumanRequestPage", openHumanRequestPageSql(), [50]],
    ["activeQueueCounts", activeQueueCountsSql(), []],
  ];

  for (const [label, sql, params] of statements) {
    const plan = raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as Array<{ detail: string }>;
    const details = plan.map((row) => String(row.detail));
    assert.ok(
      details.some((detail) => /USING (?:COVERING )?INDEX/u.test(detail)),
      `${label} must be served by an index, plan was:\n${details.join("\n")}`,
    );
    for (const detail of details) {
      // Aliases a/h stand for audits/human_requests; SCAN (subquery-n) is the
      // window co-routine reading rows the index already narrowed down.
      assert.doesNotMatch(
        detail,
        /\bSCAN (?:audits|human_requests|a|h)\b/u,
        `${label} must not scan a base table, plan was:\n${details.join("\n")}`,
      );
    }
  }
  raw.close();
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("adds the human request index to a database created before the migration", () => {
  const config = testConfig();
  const first = new SupervisorDatabase(config.databasePath);
  first.close();

  // Simulate a database provisioned before migration 3 shipped.
  const raw = new DatabaseSync(config.databasePath);
  raw.exec("DROP INDEX human_requests_project_status_idx;");
  raw.exec("DROP INDEX human_requests_status_created_idx;");
  raw.exec("DELETE FROM schema_migrations WHERE version IN (3, 4);");
  assert.equal(indexNames(raw).includes("human_requests_project_status_idx"), false);
  assert.equal(indexNames(raw).includes("human_requests_status_created_idx"), false);
  raw.close();

  const upgraded = new SupervisorDatabase(config.databasePath);
  upgraded.close();

  const verify = new DatabaseSync(config.databasePath);
  assert.equal(indexNames(verify).includes("human_requests_project_status_idx"), true);
  assert.equal(indexNames(verify).includes("human_requests_status_created_idx"), true);
  const versions = (verify.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }>)
    .map((row) => row.version);
  assert.deepEqual(versions, [1, 2, 3, 4]);
  verify.close();
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("resolves queue, request and audit aggregates for a batch of projects in one pass", () => {
  const database = new SupervisorDatabase(":memory:");
  const paths = ["/tmp/supervisor-batch-a", "/tmp/supervisor-batch-b", "/tmp/supervisor-batch-c"];
  for (const [index, projectPath] of paths.entries()) {
    database.insertEvent(event(projectPath, "session.started", `batch-start-${index}`, {
      claude_session_id: `batch-session-${index}`,
    }));
  }
  const [first, second] = paths as [string, string, string];
  // The batches key on project_id so they ride the existing audits_project_idx.
  const projectIds = paths.map((projectPath) => database.ensureProject(projectPath));
  const [firstId, secondId, thirdId] = projectIds as [string, string, string];

  const older = database.enqueueAudit({ projectPath: first, auditType: "code" });
  database.completeAudit(older.id, auditResult({ decision: "PASS", summary: "Ancien verdict." }), null);
  const newer = database.enqueueAudit({ projectPath: first, auditType: "security" });
  database.completeAudit(newer.id, auditResult({ decision: "CHALLENGE", summary: "Verdict récent." }), null);
  database.enqueueAudit({ projectPath: second, auditType: "qa" });
  openRequest(database, second, "batch-permission", new Date().toISOString());

  const queues = database.projectQueueCountsBatch(projectIds);
  assert.deepEqual(queues.get(firstId), { pending: 0, running: 0, completed: 2, failed: 0 });
  assert.deepEqual(queues.get(secondId), { pending: 1, running: 0, completed: 0, failed: 0 });
  assert.equal(queues.has(thirdId), false, "a project without audits yields no row");

  const requests = database.openHumanRequestCountsBatch(projectIds);
  assert.equal(requests.get(secondId), 1);
  assert.equal(requests.get(firstId), undefined);

  const audits = database.latestAuditsBatch(projectIds);
  assert.equal(audits.get(firstId)?.id, newer.id, "the newest audit wins per project");
  assert.equal(audits.get(firstId)?.decision, "CHALLENGE");
  assert.equal(audits.get(secondId)?.audit_type, "qa");
  assert.equal(audits.has(thirdId), false);
  assert.deepEqual(database.latestAuditsBatch([]).size, 0);

  database.close();
});

test("masks project names carrying a secret in either case form and drops their links", async () => {
  // Three shapes: a lowercase provider prefix, an all-lowercase key shape that only
  // a case-insensitive pattern catches, and the vendor's own mixed-case spelling.
  const secrets = [
    syntheticGitHubToken(),
    `aizasy${["d1234567890", "abcdefghijkl"].join("")}`,
    `AIzaSy${["D1234567890", "abcdefghijkl"].join("")}`,
  ];
  const leakyProjects = secrets.map((secret) => makeTempProject(`${secret}-`));
  const plainProject = makeTempProject("control-plain-");
  const config = testConfig();
  const database = new SupervisorDatabase(config.databasePath);

  leakyProjects.forEach((projectPath, index) => {
    database.insertEvent(event(projectPath, "session.started", `leaky-start-${index}`, {
      claude_session_id: `control-leaky-session-${index}`,
    }));
  });
  openRequest(database, leakyProjects[0] as string, "leaky-permission", new Date(Date.now() - 120_000).toISOString());
  database.insertEvent(event(plainProject, "session.started", "plain-start"));

  const server = new SupervisorServer(
    config,
    database,
    new AuditDispatcher(database, config),
    new TelegramClient(config),
    new Logger("error"),
  );
  await server.listen();
  const origin = `http://127.0.0.1:${server.address().port}`;

  const raw = await (await fetch(`${origin}/_supervisor/api/control/summary`)).text();
  const lowered = raw.toLowerCase();
  for (const secret of secrets) {
    assert.equal(raw.includes(secret), false, `${secret} must not appear verbatim`);
    assert.equal(lowered.includes(secret.toLowerCase()), false, `${secret} must not appear as a slug`);
  }

  const summary = JSON.parse(raw) as ControlSnapshot;
  const masked = summary.projects.filter((project) => project.name === MASKED_PROJECT_NAME);
  assert.equal(masked.length, secrets.length, "every leaky project is still listed, under a French masked name");
  assert.doesNotMatch(raw, /\[REDACTED\]/u, "the masked label reaching the UI stays French");
  for (const project of masked) {
    assert.equal(project.slug, null, "no route slug is offered for a masked project");
    assert.equal(project.active, true);
  }
  // Masked projects are indistinguishable by name, so match on the counter itself.
  assert.equal(masked.filter((project) => project.openHumanRequests === 1).length, 1);
  assert.equal(summary.attention.length, 1);
  assert.equal(summary.attention[0]?.projectSlug, null);
  assert.equal(summary.attention[0]?.projectName, MASKED_PROJECT_NAME);

  // The rest of the snapshot keeps rendering normally.
  const plain = summary.projects.find((project) => project.slug !== null);
  assert.ok(plain);
  assert.equal(plain.active, true);
  assert.match(plain.name, /^control-plain-/u);

  await server.close();
  database.close();
  for (const projectPath of [...leakyProjects, plainProject]) rmSync(projectPath, { recursive: true, force: true });
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("scopes the origin guard to UI paths so other routes stay reachable", async () => {
  const project = makeTempProject("control-guard-");
  const config = testConfig({ activityUi: false, controlUi: true });
  const database = new SupervisorDatabase(config.databasePath);
  const server = new SupervisorServer(
    config,
    database,
    new AuditDispatcher(database, config),
    new TelegramClient(config),
    new Logger("error"),
  );
  await server.listen();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const gateUrl = `${origin}/v1/gate?project=${encodeURIComponent(project)}&phase=code`;

  const proxiedGate = await fetch(gateUrl, { headers: { "X-Forwarded-For": "203.0.113.10" } });
  assert.equal(proxiedGate.status, 200);
  const gatePayload = await proxiedGate.json() as { decision?: unknown; error?: unknown };
  assert.notEqual(gatePayload.error, "activity_ui_local_only");
  assert.equal(gatePayload.decision, "PENDING");
  assert.equal((await fetch(gateUrl)).status, 200);

  for (const path of ["/_supervisor/api/control/summary", "/_supervisor/api/control/stream", "/_supervisor/assets/control.css"]) {
    const proxied = await fetch(`${origin}${path}`, { headers: { "X-Forwarded-For": "203.0.113.10" } });
    assert.equal(proxied.status, 403, `${path} must refuse a proxied request`);
    assert.equal((await proxied.json() as { error?: unknown }).error, "activity_ui_local_only");
  }

  await server.close();
  database.close();
  rmSync(project, { recursive: true, force: true });
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("serves the control assets without touching the prototype activity assets", async () => {
  const config = testConfig();
  const database = new SupervisorDatabase(config.databasePath);
  const server = new SupervisorServer(
    config,
    database,
    new AuditDispatcher(database, config),
    new TelegramClient(config),
    new Logger("error"),
  );
  await server.listen();
  const origin = `http://127.0.0.1:${server.address().port}`;

  for (const [name, contentType] of [["control.css", /text\/css/u], ["shared.css", /text\/css/u], ["control.js", /javascript/u]] as const) {
    const asset = await fetch(`${origin}/_supervisor/assets/${name}`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type") ?? "", contentType);
    const source = await asset.text();
    assert.doesNotMatch(source, /innerHTML/u);
  }

  const activityCss = await fetch(`${origin}/_supervisor/assets/activity.css`);
  assert.equal(activityCss.status, 200);

  const markup = await (await fetch(`${origin}/`, { headers: BROWSER_HEADERS })).text();
  const script = await (await fetch(`${origin}/_supervisor/assets/control.js`)).text();
  const hooks = [...script.matchAll(/querySelector(?:All)?\("\[(data-[a-z-]+)\]"\)/gu)].map((match) => match[1]);
  assert.ok(hooks.length >= 10);
  for (const hook of hooks) assert.ok(markup.includes(`${hook}`), `control.html is missing ${hook}`);
  assert.match(markup, /<a class="skip-link"/u);
  assert.match(markup, /aria-live="polite"/u);

  await server.close();
  database.close();
  rmSync(config.dataDir, { recursive: true, force: true });
});

async function healthNumber(origin: string, key: string): Promise<number> {
  const response = await fetch(`${origin}/health`);
  const payload = await response.json() as Record<string, unknown>;
  return Number(payload[key]);
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!await predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for the control stream to settle");
    await sleep(10);
  }
}
