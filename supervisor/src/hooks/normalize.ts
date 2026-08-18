import { createHash, randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";
import { redactText, redactUnknown } from "../security/redact.js";
import type { EventType, NormalizedEvent, RawClaudeHookPayload } from "../types.js";

const HOOK_EVENT_MAP: Record<string, EventType> = {
  SessionStart: "session.started",
  UserPromptSubmit: "prompt.submitted",
  SubagentStart: "agent.started",
  SubagentStop: "agent.completed",
  PostToolUse: "tool.completed",
  Notification: "permission.requested",
  PermissionRequest: "permission.requested",
  Stop: "claude.stopping",
};

function text(value: unknown, maxLength = 4_000): string | null {
  return typeof value === "string" && value.trim() ? redactText(value.trim(), maxLength) : null;
}

function projectIdentifier(path: string): string {
  const name = basename(path).replace(/[^A-Za-z0-9_-]+/gu, "-").slice(0, 40) || "project";
  return `${name}-${createHash("sha256").update(path).digest("hex").slice(0, 12)}`;
}

function safePath(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return redactText(value.trim(), 2_000);
}

function shellOperations(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const subcommandTools = new Set(["git", "npm", "npx", "pnpm", "yarn", "pm2", "supabase", "firebase", "prisma", "python", "python3", "node"]);
  const operations: string[] = [];
  for (const segment of value.split(/(?:&&|\|\||[;|])/u).slice(0, 10)) {
    const words = segment.trim().split(/\s+/u).filter(Boolean);
    while (words[0]?.includes("=") && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(words[0])) words.shift();
    const executable = words[0]?.split("/").at(-1)?.replace(/[^A-Za-z0-9_.-]/gu, "");
    if (!executable) continue;
    const subcommand = words[1]?.replace(/[^A-Za-z0-9_:-]/gu, "");
    operations.push(subcommandTools.has(executable) && subcommand ? `${executable} ${subcommand}` : executable);
  }
  return operations.length ? operations.join(" | ").slice(0, 300) : null;
}

function toolMetadata(payload: RawClaudeHookPayload): Record<string, unknown> {
  const toolName = text(payload.tool_name, 200);
  const input = payload.tool_input && typeof payload.tool_input === "object"
    ? payload.tool_input as Record<string, unknown>
    : {};
  const metadata: Record<string, unknown> = { tool_name: toolName };
  const filePath = safePath(input.file_path ?? input.path ?? input.notebook_path);
  if (filePath) metadata.changed_file = filePath;
  if (toolName === "Bash") metadata.command_summary = shellOperations(input.command);
  if (toolName === "WebFetch" || toolName?.startsWith("mcp__")) metadata.url = text(input.url, 1_000);
  if (toolName === "WebSearch") metadata.query = text(input.query, 1_000);
  return metadata;
}

function metadataFor(payload: RawClaudeHookPayload, hookEvent: string): Record<string, unknown> {
  const common: Record<string, unknown> = {
    permission_mode: text(payload.permission_mode, 100),
    hook_event_name: hookEvent,
  };
  if (hookEvent === "PostToolUse") return { ...common, ...toolMetadata(payload) };
  if (hookEvent === "Notification" || hookEvent === "PermissionRequest") {
    return {
      ...common,
      notification_type: text(payload.notification_type, 200) ?? "permission_prompt",
      title: text(payload.title, 500),
      message: text(payload.message, 2_000),
      tool_name: text(payload.tool_name, 200),
    };
  }
  if (hookEvent === "Stop") return { ...common, stop_hook_active: payload.stop_hook_active === true };
  return common;
}

export function normalizeHookEvent(payloadInput: unknown, timestamp = new Date()): NormalizedEvent {
  if (!payloadInput || typeof payloadInput !== "object" || Array.isArray(payloadInput)) {
    throw new Error("Hook payload must be an object");
  }
  const payload = redactUnknown(payloadInput) as RawClaudeHookPayload;
  const hookEvent = text(payload.hook_event_name, 100);
  if (!hookEvent || !HOOK_EVENT_MAP[hookEvent]) throw new Error("Unsupported Claude hook event");
  const projectPath = resolve(text(payload.cwd, 2_000) ?? process.cwd());
  const sessionId = text(payload.session_id, 500) ?? `unknown-${createHash("sha256").update(projectPath).digest("hex").slice(0, 16)}`;
  const agentId = text(payload.agent_id, 500);
  const lastMessage = hookEvent === "UserPromptSubmit"
    ? text(payload.prompt, 4_000)
    : text(payload.last_assistant_message, 6_000);
  return {
    id: randomUUID(),
    timestamp: timestamp.toISOString(),
    producer: "claude",
    project_id: projectIdentifier(projectPath),
    project_path: projectPath,
    claude_session_id: sessionId,
    event_type: HOOK_EVENT_MAP[hookEvent],
    agent_type: text(payload.agent_type, 200),
    agent_id: agentId,
    candidate_id: agentId,
    audit_target: null,
    transcript_path: safePath(payload.transcript_path),
    agent_transcript_path: safePath(payload.agent_transcript_path),
    last_message: lastMessage,
    metadata: metadataFor(payload, hookEvent),
  };
}

export function safeHookPayloadForTransport(payloadInput: unknown): RawClaudeHookPayload {
  if (!payloadInput || typeof payloadInput !== "object" || Array.isArray(payloadInput)) {
    throw new Error("Hook payload must be an object");
  }
  const payload = payloadInput as RawClaudeHookPayload;
  const allowed: RawClaudeHookPayload = {
    session_id: text(payload.session_id, 500),
    transcript_path: safePath(payload.transcript_path),
    cwd: safePath(payload.cwd),
    permission_mode: text(payload.permission_mode, 100),
    hook_event_name: text(payload.hook_event_name, 100),
    prompt: text(payload.prompt, 4_000),
    agent_id: text(payload.agent_id, 500),
    agent_type: text(payload.agent_type, 200),
    agent_transcript_path: safePath(payload.agent_transcript_path),
    last_assistant_message: text(payload.last_assistant_message, 6_000),
    stop_hook_active: payload.stop_hook_active === true,
    tool_name: text(payload.tool_name, 200),
    message: text(payload.message, 2_000),
    title: text(payload.title, 500),
    notification_type: text(payload.notification_type, 200),
  };
  if (payload.tool_input && typeof payload.tool_input === "object") {
    const input = payload.tool_input as Record<string, unknown>;
    allowed.tool_input = {
      file_path: safePath(input.file_path),
      path: safePath(input.path),
      notebook_path: safePath(input.notebook_path),
      command: payload.tool_name === "Bash" ? shellOperations(input.command) : null,
      url: text(input.url, 1_000),
      query: text(input.query, 1_000),
    };
  }
  return allowed;
}
