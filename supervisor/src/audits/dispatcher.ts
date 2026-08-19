import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { SupervisorConfig } from "../config.js";
import { SupervisorDatabase } from "../db.js";
import { sanitizeUrl } from "../security/redact.js";
import type { AuditRecord, AuditType, NormalizedEvent } from "../types.js";

const UI_EXTENSIONS = new Set([".css", ".html", ".jsx", ".tsx", ".vue", ".svelte", ".swift"]);

export class AuditDispatcher {
  public constructor(
    private readonly database: SupervisorDatabase,
    private readonly config: SupervisorConfig,
  ) {}

  public dispatch(event: NormalizedEvent, sessionId: string): AuditRecord[] {
    if (this.config.level === "off") return [];
    const scheduled: AuditRecord[] = [];
    if (event.event_type === "agent.completed") {
      const type = event.agent_type?.toLowerCase() ?? "";
      const context = this.contextFor(event);
      if (type === "researcher" && this.enabled("research")) scheduled.push(this.enqueue(event, sessionId, "research", context));
      else if (type === "architect" && this.enabled("architecture")) scheduled.push(this.enqueue(event, sessionId, "architecture", context));
      else if (type === "designer" && this.enabled("design_due_diligence")) {
        scheduled.push(this.enqueue(event, sessionId, "design_due_diligence", context));
      }
      else if (type === "builder" && this.enabled("code")) {
        scheduled.push(this.enqueue(event, sessionId, "code", context, `${sessionId}:code:${event.agent_id ?? event.id}`));
      } else if (type === "reviewer" && this.enabled("reviewer_meta")) {
        scheduled.push(this.attachOrEnqueue(event, sessionId, "reviewer_meta", context));
      } else if (type === "qa" && this.enabled("qa")) {
        scheduled.push(this.attachOrEnqueue(event, sessionId, "qa", context));
        if (this.config.uiAudit && this.uiAffected(event.project_path)) {
          const url = extractLocalUrl(event.last_message);
          scheduled.push(this.enqueue(event, sessionId, "visual_ux_audit", { ...context, target_url: url, viewports: this.config.uiViewports }, `${sessionId}:visual_ux_audit`));
        }
      } else if (type === "devops" && this.enabled("deployment")) {
        scheduled.push(this.enqueue(event, sessionId, "deployment", context));
      }
    } else if (event.event_type === "claude.stopping" && this.enabled("final") && isMeaningfulFinalStop(event)) {
      scheduled.push(this.enqueue(event, sessionId, "final", this.contextFor(event), `${sessionId}:final`));
    }
    this.database.markEventProcessed(event.id);
    return scheduled;
  }

  public enqueueManual(projectPath: string, auditType: AuditType, context: Record<string, unknown>): AuditRecord {
    const timestamp = new Date(Date.now() + this.config.auditDebounceMs).toISOString();
    const targetUrl = sanitizeUrl(context.url);
    const safeContext = { ...context };
    if ("url" in safeContext) {
      if (targetUrl) safeContext.url = targetUrl;
      else delete safeContext.url;
    }
    return this.database.enqueueAudit({
      projectPath,
      auditType,
      context: { ...safeContext, manual: true },
      coalesceKey: `manual:${resolve(projectPath)}:${auditType}`,
      notBefore: timestamp,
      maxAttempts: this.config.maxRetries + 1,
      auditTarget: targetUrl,
    });
  }

  private attachOrEnqueue(
    event: NormalizedEvent,
    sessionId: string,
    fallbackType: AuditType,
    context: Record<string, unknown>,
  ): AuditRecord {
    const active = this.database.findActiveAudit(event.project_path, sessionId, "code");
    if (active?.coalesce_key) {
      return this.database.enqueueAudit({
        projectPath: event.project_path,
        claudeSessionId: event.claude_session_id,
        triggerEventId: event.id,
        auditType: "code",
        context: { ...context, evidence_role: fallbackType },
        coalesceKey: active.coalesce_key,
        notBefore: new Date(Date.now() + this.config.auditDebounceMs).toISOString(),
        maxAttempts: this.config.maxRetries + 1,
      });
    }
    return this.enqueue(event, sessionId, fallbackType, context, `${sessionId}:${fallbackType}`);
  }

  private enqueue(
    event: NormalizedEvent,
    _sessionId: string,
    auditType: AuditType,
    context: Record<string, unknown>,
    coalesceKey: string | null = null,
  ): AuditRecord {
    return this.database.enqueueAudit({
      projectPath: event.project_path,
      claudeSessionId: event.claude_session_id,
      triggerEventId: event.id,
      auditType,
      context,
      coalesceKey,
      notBefore: new Date(Date.now() + this.config.auditDebounceMs).toISOString(),
      maxAttempts: this.config.maxRetries + 1,
      producer: event.producer,
      candidateId: event.candidate_id,
      auditTarget: event.audit_target,
    });
  }

  private contextFor(event: NormalizedEvent): Record<string, unknown> {
    return {
      event_id: event.id,
      event_type: event.event_type,
      agent_type: event.agent_type,
      agent_id: event.agent_id,
      claude_session_id: event.claude_session_id,
      last_message: event.last_message,
      producer: event.producer,
      candidate_id: event.candidate_id,
      audit_target: event.audit_target,
    };
  }

  private enabled(type: AuditType): boolean {
    if (this.config.level === "strict" || this.config.level === "standard") return true;
    if (this.config.level === "light") return ["architecture", "deployment", "final", "security"].includes(type);
    return false;
  }

  private uiAffected(projectPath: string): boolean {
    const files = this.database.recentChangedFiles(projectPath);
    if (files.some((file) => UI_EXTENSIONS.has(extname(file).toLowerCase()))) return true;
    return existsSync(resolve(projectPath, "src/app")) || existsSync(resolve(projectPath, "app"));
  }
}

function isMeaningfulFinalStop(event: NormalizedEvent): boolean {
  if (event.metadata.stop_hook_active === true) return false;
  return /SUPERVISOR_FINAL|phase\s*9|handoff|shipped|ready for (?:final|handoff)|definition of done/iu.test(event.last_message ?? "");
}

function extractLocalUrl(message: string | null): string | null {
  const match = message?.match(/https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?(?:\/[^\s]*)?/iu);
  return sanitizeUrl(match?.[0]);
}
