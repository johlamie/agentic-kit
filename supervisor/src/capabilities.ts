import { spawn } from "node:child_process";
import type { CapabilityStatus } from "./types.js";

interface McpEntry { name?: unknown; enabled?: unknown; transport?: unknown; auth_status?: unknown; disabled_reason?: unknown; }

export async function inspectCodexMcp(codexBinary = "codex", timeoutMs = 10_000): Promise<CapabilityStatus[]> {
  try {
    const output = await capture(codexBinary, ["mcp", "list", "--json"], timeoutMs);
    const entries = JSON.parse(output) as McpEntry[];
    const configured = new Map(entries.filter((entry) => typeof entry.name === "string").map((entry) => [String(entry.name).toLowerCase(), entry]));
    return [
      capability("browser", ["playwright"], configured, true),
      capability("network_inspection", ["chrome-devtools", "chrome_devtools"], configured, false),
      capability("code_docs", ["context7"], configured, false),
      capability("github", ["github"], configured, false),
      capability("design_source", ["figma"], configured, false),
      capability("design_research", ["mobbin"], configured, false),
    ];
  } catch (error) {
    return [{ capability: "codex_mcp", state: "ERROR", detail: error instanceof Error ? error.message : String(error) }];
  }
}

function capability(name: string, aliases: string[], configured: Map<string, McpEntry>, required: boolean): CapabilityStatus {
  const matched = aliases.find((alias) => configured.has(alias));
  if (!matched) return { capability: name, state: required ? "MISSING" : "OPTIONAL", detail: "not configured" };
  const entry = configured.get(matched) as McpEntry;
  if (entry.enabled === false) return { capability: name, state: required ? "ERROR" : "OPTIONAL", detail: `disabled${entry.disabled_reason ? `: ${String(entry.disabled_reason)}` : ""}` };
  if (entry.auth_status === "not_logged_in") return { capability: name, state: required ? "ERROR" : "OPTIONAL", detail: "configured but not authenticated" };
  return { capability: name, state: "OK", detail: matched };
}

export async function capture(command: string, args: string[], timeoutMs = 10_000): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: safeEnvironment() });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finishReject = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finishReject(new Error(`${command} timed out`));
    }, timeoutMs);
    timer.unref();
    const append = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next) > 1_048_576) {
        child.kill("SIGTERM");
        finishReject(new Error(`${command} output exceeded 1 MiB`));
      }
      return next;
    };
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.once("error", (error) => finishReject(error));
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

function safeEnvironment(): NodeJS.ProcessEnv {
  const allowed = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TERM", "TMPDIR", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "CODEX_HOME"];
  const result: NodeJS.ProcessEnv = { NO_COLOR: "1" };
  for (const key of allowed) if (process.env[key] !== undefined) result[key] = process.env[key];
  return result;
}
