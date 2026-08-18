import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupervisorLevel } from "./types.js";

export const SUPERVISOR_VERSION = "1.0.0";
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface SupervisorConfig {
  host: "127.0.0.1" | "::1";
  port: number;
  level: SupervisorLevel;
  dataDir: string;
  databasePath: string;
  envFile: string;
  hookTokenFile: string;
  hookToken: string | null;
  auditConcurrency: number;
  auditTimeoutMs: number;
  auditDebounceMs: number;
  maxRetries: number;
  codexBinary: string;
  maxProcessOutputBytes: number;
  uiAudit: boolean;
  uiScorePass: number;
  uiScoreChallenge: number;
  uiAllowProposals: boolean;
  uiProposalMode: "isolated";
  uiViewports: string[];
  browserAllowedHosts: string[];
  notifyPass: boolean;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  logLevel: "debug" | "info" | "warn" | "error";
}

function expandHome(value: string): string {
  if (value === "~") return homedir();
  return value.startsWith("~/") ? resolve(homedir(), value.slice(2)) : resolve(value);
}

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const values: Record<string, string> = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function integer(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid numeric Supervisor configuration value (${min}-${max})`);
  }
  return parsed;
}

function boolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  throw new Error("Invalid boolean Supervisor configuration value");
}

function optional(value: string | undefined): string | null {
  return value && value.trim() ? value.trim() : null;
}

export function loadConfig(overrides: NodeJS.ProcessEnv = process.env): SupervisorConfig {
  const requestedEnvFile = overrides.SUPERVISOR_ENV_FILE ?? "~/.config/agentic-kit/supervisor.env";
  const envFile = expandHome(requestedEnvFile);
  const fileValues = parseEnvFile(envFile);
  const env = { ...fileValues, ...overrides };
  const host = env.SUPERVISOR_HOST ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "::1") {
    throw new Error("SUPERVISOR_HOST must be a loopback address");
  }
  const level = env.SUPERVISOR_LEVEL ?? "standard";
  if (!(["off", "light", "standard", "strict"] as const).includes(level as SupervisorLevel)) {
    throw new Error("SUPERVISOR_LEVEL must be off, light, standard, or strict");
  }
  const dataDir = expandHome(env.SUPERVISOR_DATA_DIR ?? "~/.local/state/agentic-kit/supervisor");
  const hookTokenFile = expandHome(env.SUPERVISOR_HOOK_TOKEN_FILE ?? "~/.config/agentic-kit/supervisor-hook-token");
  const hookToken = existsSync(hookTokenFile) ? optional(readFileSync(hookTokenFile, "utf8")) : null;
  const logLevel = env.SUPERVISOR_LOG_LEVEL ?? "info";
  if (!(["debug", "info", "warn", "error"] as const).includes(logLevel as SupervisorConfig["logLevel"])) {
    throw new Error("SUPERVISOR_LOG_LEVEL is invalid");
  }
  const uiScorePass = integer(env.SUPERVISOR_UI_SCORE_PASS, 85, 0, 100);
  const uiScoreChallenge = integer(env.SUPERVISOR_UI_SCORE_CHALLENGE, 70, 0, 100);
  if (uiScoreChallenge > uiScorePass) {
    throw new Error("SUPERVISOR_UI_SCORE_CHALLENGE cannot exceed SUPERVISOR_UI_SCORE_PASS");
  }
  if (env.SUPERVISOR_UI_PROPOSAL_MODE && env.SUPERVISOR_UI_PROPOSAL_MODE !== "isolated") {
    throw new Error("SUPERVISOR_UI_PROPOSAL_MODE must be isolated");
  }
  const uiViewports = (env.SUPERVISOR_UI_VIEWPORTS ?? "390x844,768x1024,1440x900,1920x1080")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^\d{2,5}x\d{2,5}$/u.test(item));
  if (uiViewports.length === 0) throw new Error("SUPERVISOR_UI_VIEWPORTS must contain at least one valid viewport");
  const browserAllowedHosts = (env.SUPERVISOR_BROWSER_ALLOWED_HOSTS ?? "localhost,127.0.0.1,::1")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (browserAllowedHosts.length === 0) throw new Error("SUPERVISOR_BROWSER_ALLOWED_HOSTS cannot be empty");
  return {
    host,
    port: integer(env.SUPERVISOR_PORT, 8787, 1, 65535),
    level: level as SupervisorLevel,
    dataDir,
    databasePath: expandHome(env.SUPERVISOR_DB_PATH ?? resolve(dataDir, "supervisor.sqlite3")),
    envFile,
    hookTokenFile,
    hookToken,
    auditConcurrency: integer(env.SUPERVISOR_AUDIT_CONCURRENCY, 1, 1, 4),
    auditTimeoutMs: integer(env.SUPERVISOR_AUDIT_TIMEOUT_MS, 900_000, 1_000, 3_600_000),
    auditDebounceMs: integer(env.SUPERVISOR_AUDIT_DEBOUNCE_MS, 1_500, 0, 60_000),
    maxRetries: integer(env.SUPERVISOR_MAX_RETRIES, 2, 0, 10),
    codexBinary: env.SUPERVISOR_CODEX_BINARY ?? "codex",
    maxProcessOutputBytes: integer(env.SUPERVISOR_MAX_PROCESS_OUTPUT_BYTES, 1_048_576, 16_384, 10_485_760),
    uiAudit: boolean(env.SUPERVISOR_UI_AUDIT, true),
    uiScorePass,
    uiScoreChallenge,
    uiAllowProposals: boolean(env.SUPERVISOR_UI_ALLOW_PROPOSALS, true),
    uiProposalMode: "isolated",
    uiViewports,
    browserAllowedHosts,
    notifyPass: boolean(env.SUPERVISOR_NOTIFY_PASS, false),
    telegramBotToken: optional(env.TELEGRAM_BOT_TOKEN),
    telegramChatId: optional(env.TELEGRAM_CHAT_ID),
    logLevel: logLevel as SupervisorConfig["logLevel"],
  };
}
