import { spawn } from "node:child_process";
import type { CapabilityStatus } from "./types.js";

export interface McpEntry { name?: unknown; enabled?: unknown; transport?: unknown; auth_status?: unknown; disabled_reason?: unknown; }

export async function inspectCodexMcp(codexBinary = "codex", timeoutMs = 10_000, githubPatToken: string | null = null): Promise<CapabilityStatus[]> {
  try {
    const output = await capture(codexBinary, ["mcp", "list", "--json"], timeoutMs, githubPatToken);
    const entries = JSON.parse(output) as McpEntry[];
    return classifyCodexMcpEntries(entries, githubPatToken ? new Set(["GITHUB_PAT_TOKEN"]) : new Set());
  } catch (error) {
    return [{ capability: "codex_mcp", state: "ERROR", detail: error instanceof Error ? error.message : String(error) }];
  }
}

export function classifyCodexMcpEntries(entries: McpEntry[], availableBearerTokens = new Set<string>()): CapabilityStatus[] {
  const configured = new Map(entries.filter((entry) => typeof entry.name === "string").map((entry) => [String(entry.name).toLowerCase(), entry]));
  return [
    capability("browser", ["playwright"], configured, true, availableBearerTokens),
    capability("network_inspection", ["chrome-devtools", "chrome_devtools"], configured, false, availableBearerTokens),
    capability("code_docs", ["context7"], configured, false, availableBearerTokens),
    capability("github", ["github", "github-repos"], configured, false, availableBearerTokens),
    capability("github_ci", ["github-actions", "github_actions"], configured, false, availableBearerTokens),
    capability("design_source", ["figma"], configured, false, availableBearerTokens),
    capability("design_research", ["mobbin"], configured, false, availableBearerTokens),
  ];
}

function capability(name: string, aliases: string[], configured: Map<string, McpEntry>, isRequired: boolean, availableBearerTokens: Set<string>): CapabilityStatus {
  const matched = aliases.find((alias) => configured.has(alias));
  if (!matched) return { capability: name, state: isRequired ? "MISSING" : "OPTIONAL", detail: "not configured" };
  const entry = configured.get(matched) as McpEntry;
  if (entry.enabled === false) return { capability: name, state: isRequired ? "ERROR" : "OPTIONAL", detail: `disabled${entry.disabled_reason ? `: ${String(entry.disabled_reason)}` : ""}` };
  const bearerTokenEnv = bearerTokenEnvironment(entry.transport);
  if (bearerTokenEnv && !availableBearerTokens.has(bearerTokenEnv)) {
    return { capability: name, state: isRequired ? "ERROR" : "OPTIONAL", detail: `configured; ${bearerTokenEnv} is not available` };
  }
  if (entry.auth_status === "not_logged_in") return { capability: name, state: isRequired ? "ERROR" : "OPTIONAL", detail: "configured but not authenticated" };
  if (entry.auth_status === "unknown" && isRemoteTransport(entry.transport)) {
    if (bearerTokenEnv) return { capability: name, state: "OK", detail: `${matched} (bearer credential present; remote validity not probed)` };
    return { capability: name, state: isRequired ? "ERROR" : "OPTIONAL", detail: "configured; remote authentication could not be verified" };
  }
  return { capability: name, state: "OK", detail: matched };
}

function bearerTokenEnvironment(transport: unknown): string | null {
  if (!transport || typeof transport !== "object") return null;
  const value = (transport as { bearer_token_env_var?: unknown }).bearer_token_env_var;
  return typeof value === "string" && value ? value : null;
}

function isRemoteTransport(transport: unknown): boolean {
  if (!transport || typeof transport !== "object") return false;
  const type = (transport as { type?: unknown }).type;
  return type === "streamable_http" || type === "http" || type === "sse";
}

export async function capture(command: string, args: string[], timeoutMs = 10_000, githubPatToken: string | null = null): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: safeEnvironment(githubPatToken) });
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

function safeEnvironment(githubPatToken: string | null): NodeJS.ProcessEnv {
  const allowed = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TERM", "TMPDIR", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "CODEX_HOME"];
  const result: NodeJS.ProcessEnv = { NO_COLOR: "1" };
  for (const key of allowed) if (process.env[key] !== undefined) result[key] = process.env[key];
  if (githubPatToken) result.GITHUB_PAT_TOKEN = githubPatToken;
  return result;
}
