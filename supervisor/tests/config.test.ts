import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { syntheticGitHubToken, syntheticTelegramToken } from "./helpers.js";

test("loads a private env file while environment overrides remain authoritative", () => {
  const root = mkdtempSync(join(tmpdir(), "supervisor-config-"));
  const envFile = join(root, "supervisor.env");
  const tokenFile = join(root, "hook-token");
  writeFileSync(tokenFile, "local-shared-token\n", { mode: 0o600 });
  writeFileSync(envFile, [
    "SUPERVISOR_PORT=9000",
    `SUPERVISOR_DATA_DIR=${root}/state`,
    `SUPERVISOR_HOOK_TOKEN_FILE=${tokenFile}`,
    "SUPERVISOR_LEVEL=light",
    "SUPERVISOR_BROWSER_ALLOWED_HOSTS=localhost,staging.example.test",
    "SUPERVISOR_ACTIVITY_SESSION_STALE_MS=120000",
    "SUPERVISOR_ACTIVITY_MAX_STREAMS=12",
    `GITHUB_PAT_TOKEN=${syntheticGitHubToken()}`,
    `TELEGRAM_BOT_TOKEN=${syntheticTelegramToken()}`,
    "TELEGRAM_CHAT_ID=42",
  ].join("\n"), { mode: 0o600 });
  const config = loadConfig({ SUPERVISOR_ENV_FILE: envFile, SUPERVISOR_PORT: "9001" });
  assert.equal(config.port, 9001);
  assert.equal(config.level, "light");
  assert.equal(config.hookToken, "local-shared-token");
  assert.deepEqual(config.browserAllowedHosts, ["localhost", "staging.example.test"]);
  assert.equal(config.activityUi, true);
  assert.equal(config.activitySessionStaleMs, 120_000);
  assert.equal(config.activityMaxStreams, 12);
  assert.equal(config.githubPatToken, syntheticGitHubToken());
  assert.equal(config.telegramChatId, "42");
  rmSync(root, { recursive: true, force: true });
});

test("refuses non-loopback binding and unsafe UI configuration", () => {
  assert.throws(() => loadConfig({ SUPERVISOR_HOST: "0.0.0.0", SUPERVISOR_ENV_FILE: "/tmp/missing-a" }), /loopback/u);
  assert.throws(() => loadConfig({
    SUPERVISOR_ENV_FILE: "/tmp/missing-b",
    SUPERVISOR_UI_SCORE_PASS: "60",
    SUPERVISOR_UI_SCORE_CHALLENGE: "70",
  }), /cannot exceed/u);
  assert.throws(() => loadConfig({
    SUPERVISOR_ENV_FILE: "/tmp/missing-c",
    SUPERVISOR_UI_PROPOSAL_MODE: "overwrite",
  }), /must be isolated/u);
  assert.throws(() => loadConfig({
    SUPERVISOR_ENV_FILE: "/tmp/missing-d",
    SUPERVISOR_UI_VIEWPORTS: "invalid",
  }), /at least one/u);
  assert.throws(() => loadConfig({
    SUPERVISOR_ENV_FILE: "/tmp/missing-e",
    SUPERVISOR_ACTIVITY_SESSION_STALE_MS: "1000",
  }), /Invalid numeric/u);
  assert.throws(() => loadConfig({
    SUPERVISOR_ENV_FILE: "/tmp/missing-f",
    SUPERVISOR_ACTIVITY_MAX_STREAMS: "0",
  }), /Invalid numeric/u);
});
