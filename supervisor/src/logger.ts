import { redactUnknown, safeError } from "./security/redact.js";

type LogLevel = "debug" | "info" | "warn" | "error";
const PRIORITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export class Logger {
  public constructor(private readonly minimum: LogLevel = "info") {}

  public debug(message: string, fields: Record<string, unknown> = {}): void { this.write("debug", message, fields); }
  public info(message: string, fields: Record<string, unknown> = {}): void { this.write("info", message, fields); }
  public warn(message: string, fields: Record<string, unknown> = {}): void { this.write("warn", message, fields); }
  public error(message: string, fields: Record<string, unknown> = {}): void { this.write("error", message, fields); }

  private write(level: LogLevel, message: string, fields: Record<string, unknown>): void {
    if (PRIORITY[level] < PRIORITY[this.minimum]) return;
    const safeFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      safeFields[key] = value instanceof Error ? safeError(value) : redactUnknown(value);
    }
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...safeFields });
    (level === "error" || level === "warn" ? process.stderr : process.stdout).write(`${line}\n`);
  }
}
