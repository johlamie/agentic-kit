import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "../config.js";
import { safeHookPayloadForTransport } from "./normalize.js";
import type { GateResult, RawClaudeHookPayload } from "../types.js";

interface HookResponse {
  accepted?: boolean;
  gate?: GateResult | null;
}

export async function forwardHook(rawInput: string, fetchImplementation: typeof fetch = fetch): Promise<string | null> {
  if (Buffer.byteLength(rawInput, "utf8") > 256 * 1024) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(rawInput); } catch { return null; }
  let payload: RawClaudeHookPayload;
  try { payload = safeHookPayloadForTransport(parsed); } catch { return null; }
  const config = loadConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_500);
  timer.unref();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.hookToken) headers["X-Agentic-Supervisor-Token"] = config.hookToken;
    const response = await fetchImplementation(`http://${config.host}:${config.port}/v1/hooks`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const result = await response.json() as HookResponse;
    if (payload.hook_event_name !== "Stop" || payload.stop_hook_active === true || !result.gate) return null;
    if (["PENDING", "CHALLENGE", "BLOCK", "HUMAN_REQUIRED"].includes(result.gate.decision)) {
      return JSON.stringify({
        decision: "block",
        reason: `CODEX SUPERVISOR — ${result.gate.decision}\n${result.gate.summary}\nAudit: ${result.gate.audit_id ?? "pending"}\nRead .claude/supervisor/LATEST.md and address or re-run the relevant gate.`,
      });
    }
    if (result.gate.decision === "ERROR") {
      return JSON.stringify({ systemMessage: `Codex Supervisor degraded: ${result.gate.summary}. No PASS was recorded.` });
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += String(chunk);
  const output = await forwardHook(input);
  if (output) process.stdout.write(`${output}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main();
}
