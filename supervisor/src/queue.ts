import type { SupervisorConfig } from "./config.js";
import { SupervisorDatabase } from "./db.js";
import { Logger } from "./logger.js";
import { ArtifactStore } from "./artifacts.js";
import { inspectCodexMcp } from "./capabilities.js";
import { PromptBuilder } from "./codex/prompt-builder.js";
import { AuditInfrastructureError } from "./codex/parser.js";
import { CodexProcessError } from "./codex/runner.js";
import { safeError } from "./security/redact.js";
import { TelegramClient } from "./telegram/client.js";
import { formatAuditNotification, formatFailureNotification } from "./telegram/formatter.js";
import type { AuditRecord, CodexRunner } from "./types.js";

export class AuditQueue {
  private timer: NodeJS.Timeout | null = null;
  private readonly active = new Set<Promise<void>>();
  private stopping = false;

  public constructor(
    private readonly database: SupervisorDatabase,
    private readonly config: SupervisorConfig,
    private readonly runner: CodexRunner,
    private readonly promptBuilder: PromptBuilder,
    private readonly artifacts: ArtifactStore,
    private readonly telegram: TelegramClient,
    private readonly logger: Logger,
  ) {}

  public start(): { recovered: number; failed: number } {
    const recovery = this.database.recoverInterruptedAudits();
    this.stopping = false;
    this.timer = setInterval(() => { void this.tick(); }, 500);
    this.timer.unref();
    void this.tick();
    return recovery;
  }

  public async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await Promise.allSettled([...this.active]);
  }

  public async drainOnce(): Promise<boolean> {
    if (this.active.size >= this.config.auditConcurrency) return false;
    const audit = this.database.claimNextAudit();
    if (!audit) return false;
    await this.process(audit);
    return true;
  }

  private async tick(): Promise<void> {
    if (this.stopping) return;
    while (this.active.size < this.config.auditConcurrency) {
      const audit = this.database.claimNextAudit();
      if (!audit) break;
      const task = this.process(audit).finally(() => { this.active.delete(task); });
      this.active.add(task);
    }
  }

  private async process(audit: AuditRecord): Promise<void> {
    this.logger.info("audit.started", identifiers(audit));
    const startedAt = Date.now();
    try {
      await this.assertInfrastructure(audit);
      const prompt = this.promptBuilder.build(audit);
      const run = await this.runner.run(audit, prompt);
      const codexRunId = this.database.recordCodexRun({
        auditId: audit.id,
        threadId: run.threadId,
        status: "completed",
        durationMs: run.durationMs,
        stdout: run.stdout,
        stderr: run.stderr,
      });
      this.database.completeAudit(audit.id, run.result, run.threadId);
      const completed = this.database.getAudit(audit.id) as AuditRecord;
      const artifacts = this.artifacts.writeAudit(completed, run.result, this.database.queueCounts());
      this.logger.info("audit.completed", { ...identifiers(completed), codex_run_id: codexRunId, decision: run.result.decision, report: artifacts.reportPath, proposal: artifacts.proposalPath });
      // Telegram is a human-escalation channel, not an audit activity feed.
      // Claude consumes CHALLENGE/BLOCK from the project artifacts and repairs
      // autonomously; notify the owner only when a human decision is required.
      if (run.result.decision === "HUMAN_REQUIRED" || (run.result.decision === "PASS" && this.config.notifyPass)) {
        await this.notifySafely(formatAuditNotification(completed, run.result));
      }
    } catch (error) {
      const message = safeError(error);
      const processError = error instanceof CodexProcessError ? error : null;
      const codexRunId = this.database.recordCodexRun({
        auditId: audit.id,
        threadId: null,
        status: "failed",
        durationMs: Date.now() - startedAt,
        stdout: processError?.stdout ?? "",
        stderr: processError?.stderr ?? "",
        error: message,
      });
      const failed = this.database.failAudit(audit.id, message, retryBackoff(audit.attempt_count));
      this.logger.error("audit.failed", { ...identifiers(failed), codex_run_id: codexRunId, retrying: failed.status === "pending", error: message });
      if (failed.status === "failed" || processError?.code === "CODEX_UNAVAILABLE") {
        await this.notifySafely(formatFailureNotification(audit.project_path, audit.audit_type, message));
      }
    }
  }

  private async assertInfrastructure(audit: AuditRecord): Promise<void> {
    if (audit.audit_type !== "visual_ux_audit") return;
    const context = JSON.parse(audit.context_json) as Record<string, unknown>;
    const url = context.url ?? context.target_url;
    if (typeof url !== "string" || !url) throw new AuditInfrastructureError("TARGET_URL_MISSING", "Visual audit target URL is missing");
    let target: URL;
    try { target = new URL(url); }
    catch { throw new AuditInfrastructureError("TARGET_URL_INVALID", "Visual audit target URL is invalid"); }
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) {
      throw new AuditInfrastructureError("TARGET_URL_INVALID", "Visual audit target must be an HTTP(S) URL without embedded credentials");
    }
    if (!this.config.browserAllowedHosts.includes(target.hostname.toLowerCase())) {
      throw new AuditInfrastructureError("TARGET_NOT_ALLOWED", `Visual audit host is not allowlisted: ${target.hostname}`);
    }
    const capabilities = await inspectCodexMcp(this.config.codexBinary, 10_000, this.config.githubPatToken);
    const browser = capabilities.find((entry) => entry.capability === "browser");
    if (browser?.state !== "OK") throw new AuditInfrastructureError("PLAYWRIGHT_MISSING", "Codex Playwright MCP is not configured");
  }

  private async notifySafely(message: string): Promise<void> {
    try {
      await this.telegram.send(message);
    } catch (error) {
      this.logger.warn("telegram.failed", { error: safeError(error) });
    }
  }
}

function identifiers(audit: AuditRecord): Record<string, unknown> {
  const context = JSON.parse(audit.context_json) as Record<string, unknown>;
  return {
    project: audit.project_path,
    claude_session_id: context.claude_session_id ?? audit.session_id,
    agent_type: context.agent_type ?? null,
    producer: audit.producer,
    candidate_id: audit.candidate_id,
    audit_target: audit.audit_target,
    event_id: audit.trigger_event_id,
    audit_id: audit.id,
    audit_type: audit.audit_type,
  };
}

function retryBackoff(attempt: number): number {
  return Math.min(60_000, 1_000 * (2 ** Math.max(0, attempt - 1)));
}
