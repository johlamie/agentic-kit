export const DECISIONS = ["PASS", "CHALLENGE", "BLOCK", "HUMAN_REQUIRED"] as const;
export type AuditDecision = (typeof DECISIONS)[number];

export const AUDIT_TYPES = [
  "research",
  "architecture",
  "code",
  "reviewer_meta",
  "qa",
  "deployment",
  "final",
  "design_due_diligence",
  "visual_ux_audit",
  "security",
] as const;
export type AuditType = (typeof AUDIT_TYPES)[number];

export const EVENT_TYPES = [
  "session.started",
  "prompt.submitted",
  "agent.started",
  "agent.completed",
  "tool.completed",
  "permission.requested",
  "claude.stopping",
  "phase.completed",
  "audit.requested",
  "human.resolved",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type SupervisorLevel = "off" | "light" | "standard" | "strict";
export type AuditJobStatus = "pending" | "running" | "completed" | "failed";
export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type EvidenceClassification = "VERIFIED" | "PROBABLE" | "UNVERIFIED" | "INCORRECT" | "BLOCKED";
export type ProposalMode = "none" | "targeted_changes" | "design_system_revision" | "screen_redesign" | "full_direction_alternative";

export interface DesignDimension {
  name: string;
  score: number;
  rationale: string;
  key_issue: string;
  recommended_action: string;
}

export interface AuditFinding {
  severity: Severity;
  category: string;
  title: string;
  description: string;
  evidence: string[];
  recommended_action: string;
  evidence_classification: EvidenceClassification;
}

export interface HumanRequestPayload {
  reason: string;
  requested_action: string;
  safe_to_continue_other_work: boolean;
}

export interface InfrastructureError {
  code: string;
  message: string;
}

export interface AuditResult {
  decision: AuditDecision;
  confidence: number;
  summary: string;
  findings: AuditFinding[];
  human_request: HumanRequestPayload | null;
  design_score: number | null;
  design_dimensions: DesignDimension[];
  redesign_recommended: boolean;
  proposal_mode: ProposalMode;
  infrastructure_error: InfrastructureError | null;
}

export interface NormalizedEvent {
  id: string;
  timestamp: string;
  producer: string;
  project_id: string;
  project_path: string;
  claude_session_id: string;
  event_type: EventType;
  agent_type: string | null;
  agent_id: string | null;
  candidate_id: string | null;
  audit_target: string | null;
  transcript_path: string | null;
  agent_transcript_path: string | null;
  last_message: string | null;
  metadata: Record<string, unknown>;
}

export interface RawClaudeHookPayload {
  session_id?: unknown;
  transcript_path?: unknown;
  cwd?: unknown;
  permission_mode?: unknown;
  hook_event_name?: unknown;
  prompt?: unknown;
  agent_id?: unknown;
  agent_type?: unknown;
  agent_transcript_path?: unknown;
  last_assistant_message?: unknown;
  stop_hook_active?: unknown;
  tool_name?: unknown;
  tool_input?: unknown;
  tool_response?: unknown;
  message?: unknown;
  title?: unknown;
  notification_type?: unknown;
  [key: string]: unknown;
}

export interface AuditRecord {
  id: string;
  project_id: string;
  project_path: string;
  session_id: string | null;
  trigger_event_id: string | null;
  audit_type: AuditType;
  status: AuditJobStatus;
  decision: AuditDecision | null;
  severity: Severity | null;
  summary: string | null;
  result_json: string | null;
  context_json: string;
  producer: string;
  candidate_id: string | null;
  audit_target: string | null;
  coalesce_key: string | null;
  not_before: string;
  attempt_count: number;
  max_attempts: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  last_error: string | null;
}

export interface QueueCounts {
  pending: number;
  running: number;
  completed: number;
  failed: number;
}

export interface GateResult {
  decision: AuditDecision | "PENDING" | "ERROR";
  exit_code: 0 | 10 | 20 | 30 | 40 | 50;
  summary: string;
  audit_id: string | null;
}

export interface CodexRunResult {
  result: AuditResult;
  threadId: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface CodexRunner {
  run(audit: AuditRecord, prompt: string): Promise<CodexRunResult>;
}

export interface CapabilityStatus {
  capability: string;
  state: "OK" | "MISSING" | "ERROR" | "OPTIONAL";
  detail: string;
}
