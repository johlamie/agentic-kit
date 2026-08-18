import assert from "node:assert/strict";
import test from "node:test";
import { normalizeHookEvent, safeHookPayloadForTransport } from "../src/hooks/normalize.js";

test("normalizes every configured Claude lifecycle event", () => {
  const cases = new Map([
    ["SessionStart", "session.started"],
    ["UserPromptSubmit", "prompt.submitted"],
    ["SubagentStart", "agent.started"],
    ["SubagentStop", "agent.completed"],
    ["PostToolUse", "tool.completed"],
    ["Notification", "permission.requested"],
    ["PermissionRequest", "permission.requested"],
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

test("redacts permission text and preserves Stop recursion state", () => {
  // Assemble the fixture at runtime so secret scanners do not mistake a
  // deliberately fake credential for a leaked authorization header.
  const headerName = ["Author", "ization"].join("");
  const authorizationScheme = ["Bear", "er"].join("");
  const syntheticCredential = ["unit", "test", "credential", "material"].join("-");
  const permission = normalizeHookEvent({
    hook_event_name: "Notification",
    session_id: "s",
    cwd: "/tmp/product",
    notification_type: "permission_prompt",
    message: `${headerName}: ${authorizationScheme} ${syntheticCredential}`,
  });
  const serializedPermission = JSON.stringify(permission);
  assert.doesNotMatch(serializedPermission, new RegExp(syntheticCredential, "u"));
  assert.match(serializedPermission, /\[REDACTED\]/u);

  const stop = normalizeHookEvent({
    hook_event_name: "Stop",
    session_id: "s",
    cwd: "/tmp/product",
    stop_hook_active: true,
  });
  assert.equal(stop.metadata.stop_hook_active, true);
});

test("rejects malformed and unsupported hook events", () => {
  assert.throws(() => normalizeHookEvent(null), /must be an object/u);
  assert.throws(() => normalizeHookEvent({ hook_event_name: "Unknown", cwd: "/tmp" }), /Unsupported/u);
});
