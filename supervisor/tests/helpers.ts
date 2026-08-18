import { chmodSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SupervisorConfig } from "../src/config.js";
import type { AuditResult } from "../src/types.js";

export function syntheticTelegramToken(): string {
  const botId = ["123", "456", "789"].join("");
  const credential = ["unit", "test", "telegram", "credential", "material"].join("");
  return `${botId}:${credential}`;
}

export function syntheticGitHubToken(): string {
  const prefix = ["github", "pat"].join("_");
  const credential = ["unit", "test", "github", "credential", "material"].join("");
  return `${prefix}_${credential}`;
}

export function testConfig(overrides: Partial<SupervisorConfig> = {}): SupervisorConfig {
  const root = mkdtempSync(join(tmpdir(), "agentic-supervisor-test-config-"));
  return {
    host: "127.0.0.1",
    port: 0,
    level: "standard",
    dataDir: root,
    databasePath: join(root, "supervisor.sqlite3"),
    envFile: join(root, "supervisor.env"),
    hookTokenFile: join(root, "hook-token"),
    hookToken: null,
    auditConcurrency: 1,
    auditTimeoutMs: 2_000,
    auditDebounceMs: 0,
    maxRetries: 0,
    codexBinary: "codex",
    maxProcessOutputBytes: 128 * 1024,
    uiAudit: true,
    uiScorePass: 85,
    uiScoreChallenge: 70,
    uiAllowProposals: true,
    uiProposalMode: "isolated",
    uiViewports: ["390x844", "768x1024", "1440x900", "1920x1080"],
    browserAllowedHosts: ["localhost", "127.0.0.1", "::1"],
    notifyPass: false,
    githubPatToken: null,
    telegramBotToken: null,
    telegramChatId: null,
    logLevel: "error",
    ...overrides,
  };
}

export function auditResult(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    decision: "PASS",
    confidence: 0.95,
    summary: "The audited milestone satisfies the supplied evidence.",
    findings: [],
    human_request: null,
    design_score: null,
    design_dimensions: [],
    redesign_recommended: false,
    proposal_mode: "none",
    infrastructure_error: null,
    ...overrides,
  };
}

export function makeTempProject(prefix = "agentic-supervisor-project-"): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, "src"), { recursive: true });
  return root;
}

export interface FakeCodexOptions {
  result?: AuditResult;
  malformed?: string;
  delayMs?: number;
  exitCode?: number;
  capturePath?: string;
  mcpList?: unknown[];
}

export function makeFakeCodex(directory: string, options: FakeCodexOptions = {}): string {
  mkdirSync(directory, { recursive: true });
  const executable = join(directory, "fake-codex");
  const result = options.result ?? auditResult();
  const source = `#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
if (args[0] === "mcp" && args[1] === "list") {
  writeFileSync(1, JSON.stringify(${JSON.stringify(options.mcpList ?? [])}));
} else {
  let prompt = "";
  try { prompt = readFileSync(0, "utf8"); } catch {}
  const outputFlag = args.indexOf("--output-last-message");
  const outputPath = outputFlag >= 0 ? args[outputFlag + 1] : undefined;
  ${options.capturePath ? `writeFileSync(${JSON.stringify(options.capturePath)}, JSON.stringify({ args, prompt, env: process.env }, null, 2));` : ""}
  const finish = () => {
    if (outputPath) writeFileSync(outputPath, ${JSON.stringify(options.malformed ?? JSON.stringify(result))});
    writeFileSync(1, JSON.stringify({ type: "thread.started", thread_id: "fake-thread" }) + "\\n");
    process.exitCode = ${options.exitCode ?? 0};
  };
  ${options.delayMs ? `setTimeout(finish, ${options.delayMs});` : "finish();"}
}
`;
  writeFileSync(executable, source, { encoding: "utf8", mode: 0o700 });
  chmodSync(executable, 0o700);
  return executable;
}
