import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PACKAGE_ROOT, type SupervisorConfig } from "../config.js";
import { safeError } from "../security/redact.js";
import type { AuditRecord, CodexRunResult, CodexRunner } from "../types.js";
import { AuditResultParser } from "./parser.js";

export class CodexProcessError extends Error {
  public constructor(message: string, public readonly code: string, public readonly stdout = "", public readonly stderr = "") {
    super(message);
    this.name = "CodexProcessError";
  }
}

export class CliCodexRunner implements CodexRunner {
  private readonly parser: AuditResultParser;

  public constructor(private readonly config: SupervisorConfig) {
    this.parser = new AuditResultParser(config);
  }

  public async run(audit: AuditRecord, prompt: string): Promise<CodexRunResult> {
    const workDir = mkdtempSync(join(tmpdir(), "agentic-supervisor-"));
    const outputPath = join(workDir, "audit-result.json");
    const schemaPath = resolve(PACKAGE_ROOT, "schemas/audit-result.schema.json");
    const args = [
      ...(usesWeb(audit.audit_type) ? ["--search"] : []),
      "-c", "allow_login_shell=false",
      "--sandbox", "read-only",
      "--ask-for-approval", "never",
      "-C", audit.project_path,
      "exec",
      "--ephemeral",
      "--json",
      "--output-schema", schemaPath,
      "--output-last-message", outputPath,
      "-",
    ];
    const startedAt = Date.now();
    try {
      const processResult = await runBoundedProcess(
        this.config.codexBinary,
        args,
        prompt,
        audit.project_path,
        this.config.auditTimeoutMs,
        this.config.maxProcessOutputBytes,
      );
      if (processResult.exitCode !== 0) {
        throw new CodexProcessError(
          `Codex exited with code ${processResult.exitCode}`,
          "CODEX_EXIT",
          processResult.stdout,
          processResult.stderr,
        );
      }
      let raw: string;
      try {
        raw = readFileSync(outputPath, "utf8");
      } catch {
        throw new CodexProcessError("Codex did not produce an output file", "CODEX_NO_OUTPUT", processResult.stdout, processResult.stderr);
      }
      return {
        result: this.parser.parse(raw),
        threadId: extractThreadId(processResult.stdout),
        stdout: processResult.stdout,
        stderr: processResult.stderr,
        durationMs: Date.now() - startedAt,
      };
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }
}

interface ProcessResult { exitCode: number; stdout: string; stderr: string; }

async function runBoundedProcess(
  command: string,
  args: string[],
  stdin: string,
  cwd: string,
  timeoutMs: number,
  maxBytes: number,
): Promise<ProcessResult> {
  const child = spawn(command, args, {
    cwd,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    env: restrictedEnvironment(),
  });
  return await new Promise<ProcessResult>((resolvePromise, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
      finishReject(new CodexProcessError("Codex audit timed out", "CODEX_TIMEOUT", stdout, stderr));
    }, timeoutMs);
    timer.unref();

    const append = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") > maxBytes) {
        child.kill("SIGTERM");
        finishReject(new CodexProcessError("Codex process output exceeded the configured limit", "CODEX_OUTPUT_LIMIT", stdout, stderr));
      }
      return next;
    };
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.once("error", (error) => finishReject(new CodexProcessError(safeError(error), "CODEX_UNAVAILABLE", stdout, stderr)));
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ exitCode: code ?? 1, stdout, stderr });
    });
    child.stdin.end(stdin);

    function finishReject(error: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
  });
}

function restrictedEnvironment(): NodeJS.ProcessEnv {
  const allowed = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TERM", "TMPDIR", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "CODEX_HOME"];
  const result: NodeJS.ProcessEnv = {};
  for (const key of allowed) if (process.env[key] !== undefined) result[key] = process.env[key];
  result.NO_COLOR = "1";
  return result;
}

function usesWeb(type: AuditRecord["audit_type"]): boolean {
  return ["research", "architecture", "design_due_diligence", "visual_ux_audit", "deployment", "final"].includes(type);
}

function extractThreadId(stdout: string): string | null {
  for (const line of stdout.split(/\r?\n/u)) {
    try {
      const event = JSON.parse(line) as { type?: unknown; thread_id?: unknown };
      if (event.type === "thread.started" && typeof event.thread_id === "string") return event.thread_id;
    } catch {
      // Ignore non-JSON diagnostic lines; the final result is read from its file.
    }
  }
  return null;
}
