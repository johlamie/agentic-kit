import { createHash, randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";
import { redactText, redactUnknown, sanitizeUrl } from "../security/redact.js";
import type { EventType, NormalizedEvent, RawClaudeHookPayload } from "../types.js";

const HOOK_EVENT_MAP: Record<string, EventType> = {
  SessionStart: "session.started",
  SessionEnd: "session.ended",
  UserPromptSubmit: "prompt.submitted",
  SubagentStart: "agent.started",
  SubagentStop: "agent.completed",
  PostToolUse: "tool.completed",
  PostToolUseFailure: "tool.completed",
  PermissionRequest: "permission.requested",
  PermissionDenied: "permission.denied",
  Elicitation: "elicitation.requested",
  ElicitationResult: "human.resolved",
  Notification: "notification.received",
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
    const safeWords: string[] = [executable];
    let skipNext = false;
    for (const word of words.slice(1, 5)) {
      if (skipNext) { skipNext = false; continue; }
      if (/^--?(?:.*(?:token|secret|password|passwd|authorization|cookie|key))$/iu.test(word)) {
        safeWords.push(word.includes("=") ? word.replace(/=.*/u, "=[REDACTED]") : word, ...(word.includes("=") ? [] : ["[REDACTED]"]));
        skipNext = !word.includes("=");
        continue;
      }
      if (/^[A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY)[A-Za-z0-9_]*=/u.test(word)) continue;
      if (word.length > 100 || /^(?:https?|wss?):\/\//iu.test(word)) continue;
      const cleaned = redactText(word.replace(/[^A-Za-z0-9_./:@=+-]/gu, ""), 120);
      if (cleaned) safeWords.push(cleaned);
    }
    const subcommand = safeWords[1]?.replace(/[^A-Za-z0-9_:-]/gu, "");
    operations.push(subcommandTools.has(executable) && subcommand ? safeWords.join(" ") : executable);
  }
  return operations.length ? operations.join(" | ").slice(0, 300) : null;
}

function safeQuestions(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const question = text(record.question, 1_000);
    if (!question) return [];
    const options = Array.isArray(record.options)
      ? record.options.slice(0, 8).flatMap((option) => {
          if (!option || typeof option !== "object" || Array.isArray(option)) return [];
          const optionRecord = option as Record<string, unknown>;
          const label = text(optionRecord.label, 200);
          if (!label) return [];
          return [{ label, description: text(optionRecord.description, 500) }];
        })
      : [];
    return [{
      question,
      header: text(record.header, 100),
      options,
      multiSelect: record.multiSelect === true,
    }];
  });
}

function safeToolInput(toolName: string | null, value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  if (toolName === "AskUserQuestion") return { questions: safeQuestions(input.questions) };
  if (toolName === "ExitPlanMode") {
    const allowedPrompts = input.allowedPrompts ?? input.allowed_prompts;
    return {
      plan_file: safePath(input.plan_file ?? input.planFile),
      allowed_prompts_count: Array.isArray(allowedPrompts) ? allowedPrompts.length : 0,
    };
  }
  return {
    file_path: safePath(input.file_path),
    path: safePath(input.path),
    notebook_path: safePath(input.notebook_path),
    command: toolName === "Bash" ? shellOperations(input.command) : null,
    description: text(input.description, 800),
    url: sanitizeUrl(input.url),
    query: text(input.query, 1_000),
  };
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
  if (toolName === "WebFetch" || toolName?.startsWith("mcp__")) metadata.url = sanitizeUrl(input.url);
  if (toolName === "WebSearch") metadata.query = text(input.query, 1_000);
  return metadata;
}

function metadataFor(payload: RawClaudeHookPayload, hookEvent: string): Record<string, unknown> {
  const common: Record<string, unknown> = {
    permission_mode: text(payload.permission_mode, 100),
    hook_event_name: hookEvent,
  };
  if (hookEvent === "PostToolUse" || hookEvent === "PostToolUseFailure" || hookEvent === "PermissionDenied") {
    return {
      ...common,
      ...toolMetadata(payload),
      reason: hookEvent === "PermissionDenied" ? text(payload.reason, 1_000) : null,
      failed: hookEvent === "PostToolUseFailure",
    };
  }
  if (hookEvent === "PreToolUse" || hookEvent === "PermissionRequest") {
    const input = payload.tool_input && typeof payload.tool_input === "object"
      ? payload.tool_input as Record<string, unknown>
      : {};
    return {
      ...common,
      ...toolMetadata(payload),
      description: text(input.description, 800),
      questions: safeQuestions(input.questions),
      plan_file: safePath(input.plan_file ?? input.planFile),
      allowed_prompts_count: typeof input.allowed_prompts_count === "number" ? input.allowed_prompts_count : 0,
      permission_suggestions_count: Array.isArray(payload.permission_suggestions) ? payload.permission_suggestions.length : 0,
    };
  }
  if (hookEvent === "Elicitation" || hookEvent === "ElicitationResult") {
    return {
      ...common,
      mcp_server_name: text(payload.mcp_server_name, 200),
      message: text(payload.message, 2_000),
      mode: text(payload.mode, 100),
      url: sanitizeUrl(payload.url),
      elicitation_id: text(payload.elicitation_id, 500),
      action: text(payload.action, 100),
    };
  }
  if (hookEvent === "Notification") {
    return {
      ...common,
      notification_type: text(payload.notification_type, 200) ?? "unknown",
      title: text(payload.title, 500),
      message: text(payload.message, 2_000),
      tool_name: text(payload.tool_name, 200),
    };
  }
  if (hookEvent === "Stop") return { ...common, stop_hook_active: payload.stop_hook_active === true };
  if (hookEvent === "SessionEnd") return { ...common, reason: text(payload.reason, 100) ?? "other" };
  return common;
}

function eventTypeFor(payload: RawClaudeHookPayload, hookEvent: string): EventType | null {
  if (hookEvent === "PreToolUse") {
    const toolName = text(payload.tool_name, 200);
    return toolName === "AskUserQuestion" || toolName === "ExitPlanMode" ? "human.input.requested" : null;
  }
  if ((hookEvent === "PostToolUse" || hookEvent === "PostToolUseFailure")
      && ["AskUserQuestion", "ExitPlanMode"].includes(text(payload.tool_name, 200) ?? "")) {
    return "human.resolved";
  }
  return HOOK_EVENT_MAP[hookEvent] ?? null;
}

export function normalizeHookEvent(payloadInput: unknown, timestamp = new Date()): NormalizedEvent {
  if (!payloadInput || typeof payloadInput !== "object" || Array.isArray(payloadInput)) {
    throw new Error("Hook payload must be an object");
  }
  const payload = redactUnknown(payloadInput) as RawClaudeHookPayload;
  const hookEvent = text(payload.hook_event_name, 100);
  const eventType = hookEvent ? eventTypeFor(payload, hookEvent) : null;
  if (!hookEvent || !eventType) throw new Error("Unsupported Claude hook event");
  const projectPath = resolve(text(payload.cwd, 2_000) ?? process.cwd());
  const sessionId = text(payload.session_id, 500) ?? `unknown-${createHash("sha256").update(projectPath).digest("hex").slice(0, 16)}`;
  const agentId = text(payload.agent_id, 500);
  const metadata = metadataFor(payload, hookEvent);
  const lastMessage = hookEvent === "UserPromptSubmit"
    ? text(payload.prompt, 4_000)
    : text(payload.last_assistant_message, 6_000)
      ?? (typeof metadata.message === "string" ? metadata.message : null)
      ?? (Array.isArray(metadata.questions) && typeof (metadata.questions[0] as Record<string, unknown> | undefined)?.question === "string"
        ? String((metadata.questions[0] as Record<string, unknown>).question)
        : null);
  return {
    id: randomUUID(),
    timestamp: timestamp.toISOString(),
    producer: "claude",
    project_id: projectIdentifier(projectPath),
    project_path: projectPath,
    claude_session_id: sessionId,
    event_type: eventType,
    agent_type: text(payload.agent_type, 200),
    agent_id: agentId,
    candidate_id: agentId,
    audit_target: null,
    transcript_path: safePath(payload.transcript_path),
    agent_transcript_path: safePath(payload.agent_transcript_path),
    last_message: lastMessage,
    metadata,
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
    reason: text(payload.reason, 100),
    permission_suggestions: Array.isArray(payload.permission_suggestions)
      ? payload.permission_suggestions.slice(0, 20).map(() => ({ redacted: true }))
      : undefined,
    mcp_server_name: text(payload.mcp_server_name, 200),
    mode: text(payload.mode, 100),
    url: sanitizeUrl(payload.url),
    elicitation_id: text(payload.elicitation_id, 500),
    action: text(payload.action, 100),
  };
  allowed.tool_input = safeToolInput(text(payload.tool_name, 200), payload.tool_input);
  return allowed;
}
