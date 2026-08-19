#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inspectCodexMcp, capture } from "../capabilities.js";
import { loadConfig, PACKAGE_ROOT, SUPERVISOR_VERSION } from "../config.js";
import { SupervisorDatabase } from "../db.js";
import { safeError } from "../security/redact.js";
import { TelegramClient } from "../telegram/client.js";
import { AUDIT_TYPES, type AuditType } from "../types.js";

const AUDIT_ALIASES: Record<string, AuditType> = {
  research: "research",
  architecture: "architecture",
  code: "code",
  reviewer: "reviewer_meta",
  qa: "qa",
  deploy: "deployment",
  deployment: "deployment",
  final: "final",
  design: "design_due_diligence",
  design_due_diligence: "design_due_diligence",
  visual: "visual_ux_audit",
  visual_ux_audit: "visual_ux_audit",
  security: "security",
};

export async function runCli(argv: string[]): Promise<number> {
  const [command = "help", ...args] = argv;
  const config = loadConfig();
  try {
    switch (command) {
      case "status": return await status(config);
      case "doctor": return await doctor(config);
      case "events": return withDatabase(config.databasePath, (database) => listEvents(database, option(args, "--project")));
      case "audits": return withDatabase(config.databasePath, (database) => listAudits(database, option(args, "--project")));
      case "requests": return withDatabase(config.databasePath, (database) => listRequests(database, option(args, "--project")));
      case "projects": return withDatabase(config.databasePath, (database) => listProjects(database, config.activitySessionStaleMs));
      case "ui": return withDatabase(config.databasePath, (database) => activityUrl(database, config, requiredOption(args, "--project")));
      case "gate": return withDatabase(config.databasePath, (database) => gate(database, requiredOption(args, "--project"), requiredOption(args, "--phase")));
      case "wait": return await waitGate(config.databasePath, requiredOption(args, "--project"), requiredOption(args, "--phase"), integerOption(args, "--timeout", 900));
      case "retry": return withDatabase(config.databasePath, (database) => retry(database, requiredPositional(args, 0, "audit id")));
      case "resolve": return withDatabase(config.databasePath, (database) => resolveHuman(database, requiredPositional(args, 0, "human request id")));
      case "audit": return await requestAudit(config, args);
      case "tail": return withDatabase(config.databasePath, (database) => listAudits(database, option(args, "--project"), 20));
      case "telegram-test": return await telegramTest(config);
      case "codex-test": return await codexTest(config);
      case "browser-test":
      case "mcp-status": return await printCapabilities(config);
      case "skills": return listSkills();
      case "design-score": return withDatabase(config.databasePath, (database) => designScore(database, requiredOption(args, "--project")));
      case "--version":
      case "version": process.stdout.write(`${SUPERVISOR_VERSION}\n`); return 0;
      case "help":
      case "--help":
      case "-h": printHelp(); return 0;
      default: throw new UsageError(`Unknown command: ${command}`);
    }
  } catch (error) {
    process.stderr.write(`ERROR  ${safeError(error)}\n`);
    if (error instanceof UsageError) printHelp(process.stderr);
    return 50;
  }
}

async function status(config: ReturnType<typeof loadConfig>): Promise<number> {
  try {
    const health = await api(config, "/health") as Record<string, unknown>;
    let codex = "ERROR";
    try { codex = `OK (${(await capture(config.codexBinary, ["--version"], 3_000)).trim()})`; } catch {}
    const capabilities = await inspectCodexMcp(config.codexBinary, 3_000, config.githubPatToken);
    const browser = capabilities.find((item) => item.capability === "browser")
      ?? capabilities.find((item) => item.capability === "codex_mcp");
    process.stdout.write(`Supervisor: RUNNING\nVersion: ${health.version}\nDatabase: ${String(health.database).toUpperCase()}\n`);
    process.stdout.write(`Codex: ${codex}\nPlaywright MCP: ${browser?.state ?? "ERROR"} (${browser?.detail ?? "unknown"})\n`);
    process.stdout.write(`Telegram: ${String(health.telegram).toUpperCase()}\nHook auth: ${String(health.hook_auth).toUpperCase()}\n`);
    process.stdout.write(`Activity UI: ${String(health.activity_ui).toUpperCase()} active_projects=${health.active_projects ?? "?"} streams=${health.activity_streams ?? "?"}\n`);
    const queue = health.queue as Record<string, unknown> | undefined;
    process.stdout.write(`Queue: pending=${queue?.pending ?? "?"} running=${queue?.running ?? "?"} completed=${queue?.completed ?? "?"} failed=${queue?.failed ?? "?"}\n`);
    if (existsSync(config.databasePath)) {
      const database = new SupervisorDatabase(config.databasePath);
      try {
        const latest = database.listAudits(undefined, 1)[0];
        if (latest) process.stdout.write(`Latest audit: ${latest.audit_type} ${latest.status} ${latest.decision ?? "-"} ${latest.id}\n`);
      } finally { database.close(); }
    }
    return 0;
  } catch (error) {
    process.stdout.write(`Supervisor: STOPPED OR UNREACHABLE\nDetail: ${safeError(error)}\n`);
    return 1;
  }
}

async function doctor(config: ReturnType<typeof loadConfig>): Promise<number> {
  let failures = 0;
  const check = async (label: string, fn: () => Promise<string>, required: boolean): Promise<void> => {
    try { process.stdout.write(`[OK] ${label}: ${await fn()}\n`); }
    catch (error) {
      process.stdout.write(`[${required ? "FAIL" : "WARN"}] ${label}: ${safeError(error)}\n`);
      if (required) failures += 1;
    }
  };
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (nodeMajor >= 22) process.stdout.write(`[OK] Node: ${process.version}\n`);
  else { process.stdout.write(`[FAIL] Node: ${process.version} (22+ required)\n`); failures += 1; }
  await check("Claude Code", async () => (await capture("claude", ["--version"])).trim(), false);
  await check("Codex", async () => (await capture(config.codexBinary, ["--version"])).trim(), true);
  await check("Codex auth", async () => (await capture(config.codexBinary, ["login", "status"])).trim(), true);
  if (!existsSync(config.databasePath)) {
    process.stdout.write(`[FAIL] Supervisor DB: missing at ${config.databasePath}\n`);
    failures += 1;
  } else {
    try {
      const database = new SupervisorDatabase(config.databasePath);
      process.stdout.write(`[OK] Supervisor DB: ${database.ping() ? "healthy" : "unhealthy"}\n`);
      database.close();
    } catch (error) {
      process.stdout.write(`[FAIL] Supervisor DB: ${safeError(error)}\n`);
      failures += 1;
    }
  }
  await check("Supervisor daemon", async () => {
    const health = await api(config, "/health") as { status?: unknown };
    return String(health.status ?? "unknown");
  }, true);
  await check("Activity UI", async () => {
    const health = await api(config, "/health") as { activity_ui?: unknown; active_projects?: unknown; activity_streams?: unknown };
    if (health.activity_ui !== "ready") throw new Error(`state=${String(health.activity_ui ?? "unknown")}`);
    return `ready, active_projects=${String(health.active_projects ?? "?")}, streams=${String(health.activity_streams ?? "?")}`;
  }, config.activityUi);
  process.stdout.write(`[${config.hookToken ? "OK" : "WARN"}] Hook token: ${config.hookToken ? "configured" : "missing (loopback endpoint has no request authentication)"}\n`);
  if (config.hookToken && existsSync(config.hookTokenFile)) {
    const tokenMode = statSync(config.hookTokenFile).mode & 0o777;
    process.stdout.write(`[${tokenMode === 0o600 ? "OK" : "FAIL"}] Hook token permissions: ${tokenMode.toString(8)}\n`);
    if (tokenMode !== 0o600) failures += 1;
  }
  if (existsSync(config.envFile)) {
    const envMode = statSync(config.envFile).mode & 0o777;
    process.stdout.write(`[${envMode === 0o600 ? "OK" : "FAIL"}] Supervisor env permissions: ${envMode.toString(8)}\n`);
    if (envMode !== 0o600) failures += 1;
  }
  process.stdout.write(`[${config.telegramBotToken && config.telegramChatId ? "OK" : "WARN"}] Telegram: ${config.telegramBotToken && config.telegramChatId ? "configured" : "not configured"}\n`);
  const capabilities = await inspectCodexMcp(config.codexBinary, 10_000, config.githubPatToken);
  for (const item of capabilities) process.stdout.write(`[${item.state === "OPTIONAL" ? "WARN" : item.state}] Codex MCP ${item.capability}: ${item.detail}\n`);
  const hook = resolve(PACKAGE_ROOT, "../global/hooks/supervisor-hook.sh");
  process.stdout.write(`[${existsSync(hook) ? "OK" : "FAIL"}] Claude hooks: ${existsSync(hook) ? "forwarder present" : "forwarder missing"}\n`);
  if (!existsSync(hook)) failures += 1;
  const settingsPath = resolve(homedir(), ".claude/settings.json");
  const requiredEvents = [
    "SessionStart", "UserPromptSubmit", "SubagentStart", "SubagentStop", "PostToolUse",
    "PostToolUseFailure", "PermissionRequest", "PermissionDenied", "Elicitation",
    "ElicitationResult", "Stop", "SessionEnd",
  ];
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      hooks?: Record<string, Array<{ matcher?: string; hooks?: Array<{ command?: string }> }>>;
    };
    const missing = requiredEvents.filter((event) => !(settings.hooks?.[event] ?? []).some((entry) =>
      (entry.hooks ?? []).some((registered) => registered.command === "~/.claude/hooks/supervisor-hook.sh"),
    ));
    process.stdout.write(`[${missing.length ? "FAIL" : "OK"}] Claude hook lifecycle: ${missing.length ? `missing ${missing.join(", ")}` : "registered"}\n`);
    if (missing.length) failures += 1;
    const structuredHumanInput = (settings.hooks?.PreToolUse ?? []).some((entry) =>
      entry.matcher === "AskUserQuestion|ExitPlanMode"
      && (entry.hooks ?? []).some((hookEntry) => hookEntry.command === "~/.claude/hooks/supervisor-hook.sh"),
    );
    const genericNotifications = (settings.hooks?.Notification ?? []).some((entry) =>
      (entry.hooks ?? []).some((hookEntry) => hookEntry.command === "~/.claude/hooks/supervisor-hook.sh"),
    );
    const attentionHealthy = structuredHumanInput && !genericNotifications;
    process.stdout.write(`[${attentionHealthy ? "OK" : "FAIL"}] Human attention hooks: ${attentionHealthy ? "structured and immediate" : "generic or incomplete"}\n`);
    if (!attentionHealthy) failures += 1;
  } catch (error) {
    process.stdout.write(`[FAIL] Claude hook lifecycle: ${safeError(error)}\n`);
    failures += 1;
  }
  const invalidSkills = skillDirectories().filter((directory) => !existsSync(resolve(directory, "SKILL.md")));
  process.stdout.write(`[${invalidSkills.length ? "FAIL" : "OK"}] Supervisor skills: ${skillDirectories().length} available\n`);
  failures += invalidSkills.length;
  return failures === 0 ? 0 : 1;
}

function listEvents(database: SupervisorDatabase, project?: string, limit = 50): number {
  for (const event of database.listEvents(project, limit)) {
    process.stdout.write(`${event.timestamp}\t${event.event_type}\t${event.agent_type ?? "-"}\t${event.id}\n`);
  }
  return 0;
}

function listAudits(database: SupervisorDatabase, project?: string, limit = 50): number {
  for (const audit of database.listAudits(project, limit)) {
    process.stdout.write(`${audit.created_at}\t${audit.audit_type}\t${audit.status}\t${audit.decision ?? "-"}\t${audit.id}\t${audit.summary ?? ""}\n`);
  }
  return 0;
}

function listRequests(database: SupervisorDatabase, project?: string, limit = 50): number {
  for (const request of database.listHumanRequests(project, limit)) {
    process.stdout.write(`${String(request.created_at)}\t${String(request.status)}\t${String(request.id)}\t${String(request.requested_action)}\n`);
  }
  return 0;
}

function listProjects(database: SupervisorDatabase, staleMs: number): number {
  const projects = database.listActiveProjects(staleMs);
  if (!projects.length) {
    process.stdout.write("No active supervised project.\n");
    return 0;
  }
  for (const project of projects) {
    process.stdout.write(`${project.slug}\t${project.activeSessionCount}\t${project.lastSeenAt}\t${project.path}\n`);
  }
  return 0;
}

function activityUrl(database: SupervisorDatabase, config: ReturnType<typeof loadConfig>, projectPath: string): number {
  if (!config.activityUi) {
    process.stdout.write("Activity UI is disabled (SUPERVISOR_ACTIVITY_UI=false).\n");
    return 40;
  }
  const project = database.activeProjectByPath(projectPath, config.activitySessionStaleMs);
  if (!project) {
    process.stdout.write("INACTIVE\tNo live Claude session is supervising this project.\n");
    return 40;
  }
  const host = config.host === "::1" ? "[::1]" : config.host;
  process.stdout.write(`http://${host}:${config.port}/${project.slug}\n`);
  return 0;
}

function gate(database: SupervisorDatabase, project: string, phase: string): number {
  const result = database.gate(project, phase);
  process.stdout.write(`${result.decision}\t${result.summary}\t${result.audit_id ?? "-"}\n`);
  return result.exit_code;
}

async function waitGate(path: string, project: string, phase: string, timeoutSeconds: number): Promise<number> {
  if (!existsSync(path)) throw new Error(`Supervisor database does not exist: ${path}`);
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 3600) {
    throw new UsageError("--timeout must be an integer from 1 to 3600 seconds");
  }
  const database = new SupervisorDatabase(path);
  const deadline = Date.now() + timeoutSeconds * 1_000;
  try {
    while (true) {
      const result = database.gate(project, phase);
      if (result.decision !== "PENDING") {
        process.stdout.write(`${result.decision}\t${result.summary}\t${result.audit_id ?? "-"}\n`);
        return result.exit_code;
      }
      if (Date.now() >= deadline) {
        process.stdout.write(`PENDING\tTimed out waiting for ${phase} audit\t${result.audit_id ?? "-"}\n`);
        return 40;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    }
  } finally {
    database.close();
  }
}

function retry(database: SupervisorDatabase, id: string): number {
  const changed = database.retryAudit(id);
  process.stdout.write(`${changed ? "RETRY_QUEUED" : "NOT_RETRYABLE"}\t${id}\n`);
  return changed ? 0 : 50;
}

function resolveHuman(database: SupervisorDatabase, id: string): number {
  const changed = database.resolveHumanRequest(id);
  process.stdout.write(`${changed ? "RESOLVED" : "NOT_OPEN"}\t${id}\n`);
  return changed ? 0 : 50;
}

async function requestAudit(config: ReturnType<typeof loadConfig>, args: string[]): Promise<number> {
  const project = requiredOption(args, "--project");
  const requestedType = requiredOption(args, "--type");
  const type = AUDIT_ALIASES[requestedType];
  if (!type || !AUDIT_TYPES.includes(type)) throw new UsageError(`Invalid audit type: ${requestedType}`);
  const body: Record<string, unknown> = { project, type };
  const url = option(args, "--url");
  if (url) body.url = url;
  const result = await api(config, "/v1/audits", { method: "POST", body: JSON.stringify(body) });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return 0;
}

async function telegramTest(config: ReturnType<typeof loadConfig>): Promise<number> {
  const client = new TelegramClient(config);
  if (!client.configured) { process.stdout.write("Telegram: NOT_CONFIGURED\n"); return 1; }
  const id = await client.send("🩺 Kriton Supervisor — Test Telegram\n\nLa configuration et le chemin d’expurgation sont opérationnels.");
  process.stdout.write(`Telegram: SENT${id ? ` (${id})` : ""}\n`);
  return 0;
}

async function codexTest(config: ReturnType<typeof loadConfig>): Promise<number> {
  const version = (await capture(config.codexBinary, ["--version"])).trim();
  const auth = (await capture(config.codexBinary, ["login", "status"])).trim();
  process.stdout.write(`Codex: OK\n${version}\n${auth}\n`);
  return 0;
}

async function printCapabilities(config: ReturnType<typeof loadConfig>): Promise<number> {
  const capabilities = await inspectCodexMcp(config.codexBinary, 10_000, config.githubPatToken);
  for (const item of capabilities) process.stdout.write(`${item.state}\t${item.capability}\t${item.detail}\n`);
  return capabilities.some((item) => item.capability === "browser" && item.state !== "OK") ? 1 : 0;
}

function listSkills(): number {
  for (const directory of skillDirectories()) {
    const file = resolve(directory, "SKILL.md");
    const contents = existsSync(file) ? readFileSync(file, "utf8") : "";
    const description = contents.match(/^description:\s*(.+)$/mu)?.[1] ?? "missing description";
    process.stdout.write(`${directory.split("/").at(-1)}\t${description}\n`);
  }
  return 0;
}

function designScore(database: SupervisorDatabase, project: string): number {
  const audit = database.latestAudit(project, ["visual_ux_audit", "design_due_diligence"]);
  if (!audit?.result_json) { process.stdout.write("No design audit result.\n"); return 40; }
  const result = JSON.parse(audit.result_json) as { design_score?: unknown; design_dimensions?: unknown; decision?: unknown };
  process.stdout.write(`${JSON.stringify({ audit_id: audit.id, decision: result.decision, design_score: result.design_score, dimensions: result.design_dimensions }, null, 2)}\n`);
  return 0;
}

async function api(config: ReturnType<typeof loadConfig>, path: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  timer.unref();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (config.hookToken) headers.set("X-Agentic-Supervisor-Token", config.hookToken);
  try {
    const response = await fetch(`http://${config.host}:${config.port}${path}`, { ...init, headers, signal: controller.signal });
    const body = await response.json() as unknown;
    if (!response.ok) throw new Error(`Supervisor HTTP ${response.status}`);
    return body;
  } finally { clearTimeout(timer); }
}

function withDatabase(path: string, fn: (database: SupervisorDatabase) => number): number {
  if (!existsSync(path)) throw new Error(`Supervisor database does not exist: ${path}`);
  const database = new SupervisorDatabase(path);
  try { return fn(database); } finally { database.close(); }
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function requiredOption(args: string[], name: string): string {
  const value = option(args, name);
  if (!value || value.startsWith("--")) throw new UsageError(`${name} is required`);
  return value;
}

function integerOption(args: string[], name: string, fallback: number): number {
  const value = option(args, name);
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || String(parsed) !== value) throw new UsageError(`${name} must be an integer`);
  return parsed;
}

function requiredPositional(args: string[], index: number, label: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new UsageError(`${label} is required`);
  return value;
}

function skillDirectories(): string[] {
  const root = resolve(PACKAGE_ROOT, "skills");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => resolve(root, entry.name)).sort();
}

function printHelp(stream: NodeJS.WritableStream = process.stdout): void {
  stream.write(`Agentic Codex Supervisor ${SUPERVISOR_VERSION}

Usage: agentic-supervisor <command> [options]

Commands:
  status
  doctor
  events [--project <path>]
  audits [--project <path>]
  requests [--project <path>]
  projects
  ui --project <path>
  gate --project <path> --phase <research|architecture|design|code|deploy|final>
  wait --project <path> --phase <phase> [--timeout <seconds>]
  audit --project <path> --type <research|architecture|code|qa|deploy|final|design|visual|security> [--url <url>]
  retry <audit-id>
  resolve <human-request-id>
  tail [--project <path>]
  telegram-test
  codex-test
  browser-test
  mcp-status
  skills
  design-score --project <path>

Gate exit codes: 0 PASS, 10 CHALLENGE, 20 BLOCK, 30 HUMAN_REQUIRED,
40 PENDING, 50 Supervisor error.
`);
}

class UsageError extends Error {}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  void runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
