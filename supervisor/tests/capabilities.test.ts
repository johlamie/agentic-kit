import test from "node:test";
import assert from "node:assert/strict";
import { classifyCodexMcpEntries, type McpEntry } from "../src/capabilities.js";

function result(entries: McpEntry[], capability: string) {
  return classifyCodexMcpEntries(entries).find((entry) => entry.capability === capability);
}

test("reports remote OAuth servers as pending until authenticated", () => {
  const entries: McpEntry[] = [
    { name: "github", enabled: true, auth_status: "not_logged_in", transport: { type: "streamable_http" } },
    { name: "github-actions", enabled: true, auth_status: "not_logged_in", transport: { type: "streamable_http" } },
    { name: "mobbin", enabled: true, auth_status: "not_logged_in", transport: { type: "streamable_http" } },
  ];

  assert.deepEqual(result(entries, "github"), { capability: "github", state: "OPTIONAL", detail: "configured but not authenticated" });
  assert.deepEqual(result(entries, "github_ci"), { capability: "github_ci", state: "OPTIONAL", detail: "configured but not authenticated" });
  assert.deepEqual(result(entries, "design_research"), { capability: "design_research", state: "OPTIONAL", detail: "configured but not authenticated" });
});

test("does not claim success when remote authentication cannot be verified", () => {
  const entries: McpEntry[] = [
    { name: "github", enabled: true, auth_status: "unknown", transport: { type: "streamable_http" } },
  ];

  assert.deepEqual(result(entries, "github"), {
    capability: "github",
    state: "OPTIONAL",
    detail: "configured; remote authentication could not be verified",
  });
});

test("distinguishes authenticated GitHub repositories from GitHub Actions", () => {
  const entries: McpEntry[] = [
    { name: "github", enabled: true, auth_status: "authenticated", transport: { type: "streamable_http" } },
  ];

  assert.deepEqual(result(entries, "github"), { capability: "github", state: "OK", detail: "github" });
  assert.deepEqual(result(entries, "github_ci"), { capability: "github_ci", state: "OPTIONAL", detail: "not configured" });
});
