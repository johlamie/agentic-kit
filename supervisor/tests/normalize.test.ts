import assert from "node:assert/strict";
import test from "node:test";
import { normalizeHookEvent, safeHookPayloadForTransport } from "../src/hooks/normalize.js";

test("normalizes every configured Claude lifecycle event", () => {
  const cases = new Map([
    ["SessionStart", "session.started"],
    ["SessionEnd", "session.ended"],
    ["UserPromptSubmit", "prompt.submitted"],
    ["SubagentStart", "agent.started"],
    ["SubagentStop", "agent.completed"],
    ["PostToolUse", "tool.completed"],
    ["PostToolUseFailure", "tool.completed"],
    ["Notification", "notification.received"],
    ["PermissionRequest", "permission.requested"],
    ["PermissionDenied", "permission.denied"],
    ["Elicitation", "elicitation.requested"],
    ["ElicitationResult", "human.resolved"],
    ["Stop", "claude.stopping"],
  ]);
  for (const [hook, expected] of cases) {
    const event = normalizeHookEvent({ hook_event_name: hook, session_id: "session-1", cwd: "/tmp/product" });
    assert.equal(event.event_type, expected);
    assert.equal(event.producer, "claude");
    assert.equal(event.project_path, "/tmp/product");
  }
});

test("keeps only bounded, redacted PostToolUse metadata", () => {
  const payload = safeHookPayloadForTransport({
    hook_event_name: "PostToolUse",
    session_id: "session-1",
    cwd: "/tmp/product",
    tool_name: "Write",
    tool_input: {
      file_path: "src/app.ts",
      content: "must never be transported",
      command: "echo api_key=super-secret-token-value",
    },
    tool_response: { content: "entire tool response" },
    arbitrary: "drop me",
  });
  const serialized = JSON.stringify(payload);
  assert.match(serialized, /src\/app\.ts/u);
  assert.doesNotMatch(serialized, /must never be transported|entire tool response|drop me/u);
  assert.doesNotMatch(serialized, /super-secret-token-value/u);

  const event = normalizeHookEvent(payload);
  assert.equal(event.metadata.changed_file, "src/app.ts");
  assert.equal("tool_response" in event.metadata, false);
});

test("keeps precise human-interaction details while redacting credentials", () => {
  // Assemble the fixture at runtime so secret scanners do not mistake a
  // deliberately fake credential for a leaked authorization header.
  const headerName = ["Author", "ization"].join("");
  const authorizationScheme = ["Bear", "er"].join("");
  const syntheticCredential = ["unit", "test", "credential", "material"].join("-");
  const permission = normalizeHookEvent({
    hook_event_name: "PermissionRequest",
    session_id: "s",
    cwd: "/tmp/product",
    tool_name: "Bash",
    tool_input: {
      command: `npx prisma generate --auth-token ${syntheticCredential}`,
      description: `${headerName}: ${authorizationScheme} ${syntheticCredential}`,
    },
  });
  const serializedPermission = JSON.stringify(permission);
  assert.doesNotMatch(serializedPermission, new RegExp(syntheticCredential, "u"));
  assert.match(serializedPermission, /\[REDACTED\]/u);
  assert.equal(permission.metadata.command_summary, "npx prisma generate --auth-token [REDACTED]");

  const questionPayload = safeHookPayloadForTransport({
    hook_event_name: "PreToolUse",
    session_id: "s",
    cwd: "/tmp/product",
    tool_name: "AskUserQuestion",
    tool_input: {
      questions: [{
        header: "Design",
        question: "Quelle direction faut-il retenir ?",
        options: [
          { label: "A", description: "Sobre et dense" },
          { label: "B", description: "Aérée et éditoriale" },
        ],
        multiSelect: false,
      }],
      answers: { "Quelle direction faut-il retenir ?": "must not be transported" },
    },
  });
  const question = normalizeHookEvent(questionPayload);
  assert.equal(question.event_type, "human.input.requested");
  assert.equal(question.last_message, "Quelle direction faut-il retenir ?");
  assert.doesNotMatch(JSON.stringify(questionPayload), /must not be transported/u);

  const elicitationPayload = safeHookPayloadForTransport({
    hook_event_name: "Elicitation",
    session_id: "s",
    cwd: "/tmp/product",
    mcp_server_name: "github",
    message: "Autorise la consultation du dépôt privé.",
    mode: "url",
    url: "https://example.test/authorize?code=unit-test-oauth-code&state=unit-test-state#complete",
    requested_schema: { properties: { credential: { type: "string" } } },
  });
  const elicitation = normalizeHookEvent(elicitationPayload);
  assert.equal(elicitation.event_type, "elicitation.requested");
  assert.equal(elicitation.metadata.mcp_server_name, "github");
  assert.equal(elicitation.metadata.url, "https://example.test/authorize");
  assert.doesNotMatch(JSON.stringify(elicitationPayload), /unit-test-oauth-code|unit-test-state/u);
  assert.equal("requested_schema" in elicitationPayload, false);

  const notification = normalizeHookEvent({
    hook_event_name: "Notification",
    session_id: "s",
    cwd: "/tmp/product",
    notification_type: "idle_prompt",
    message: "Claude is waiting for your input",
  });
  assert.equal(notification.event_type, "notification.received");

  const stop = normalizeHookEvent({
    hook_event_name: "Stop",
    session_id: "s",
    cwd: "/tmp/product",
    stop_hook_active: true,
  });
  assert.equal(stop.metadata.stop_hook_active, true);

  const ended = normalizeHookEvent({
    hook_event_name: "SessionEnd",
    session_id: "s",
    cwd: "/tmp/product",
    reason: "prompt_input_exit",
  });
  assert.equal(ended.metadata.reason, "prompt_input_exit");
});

test("rejects malformed and unsupported hook events", () => {
  assert.throws(() => normalizeHookEvent(null), /must be an object/u);
  assert.throws(() => normalizeHookEvent({ hook_event_name: "Unknown", cwd: "/tmp" }), /Unsupported/u);
  assert.throws(() => normalizeHookEvent({ hook_event_name: "PreToolUse", tool_name: "Bash", cwd: "/tmp" }), /Unsupported/u);
});
