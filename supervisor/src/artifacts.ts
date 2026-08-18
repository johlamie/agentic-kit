import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve, sep } from "node:path";
import type { SupervisorConfig } from "./config.js";
import type { AuditRecord, AuditResult, QueueCounts } from "./types.js";
import { redactText } from "./security/redact.js";

export class ArtifactStore {
  public constructor(private readonly config: SupervisorConfig) {}

  public writeAudit(audit: AuditRecord, result: AuditResult, queue: QueueCounts): { reportPath: string; proposalPath: string | null } {
    const root = this.ensureRoot(audit.project_path);
    const auditDirectory = this.ensureDirectory(root, "audits");
    const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
    const reportPath = this.inside(auditDirectory, `${stamp}-${audit.audit_type}-${audit.id}.md`);
    const report = renderAudit(audit, result);
    atomicWrite(reportPath, report);
    atomicWrite(this.inside(root, "LATEST.md"), report);
    atomicWrite(this.inside(root, "STATE.json"), `${JSON.stringify({
      version: 1,
      updated_at: new Date().toISOString(),
      latest_audit_id: audit.id,
      latest_audit_type: audit.audit_type,
      decision: result.decision,
      queue,
      attribution: { producer: audit.producer, auditor: "codex" },
    }, null, 2)}\n`);
    let proposalPath: string | null = null;
    if (result.redesign_recommended && this.config.uiAllowProposals && result.proposal_mode !== "none") {
      proposalPath = this.writeProposal(root, audit, result);
    }
    return { reportPath, proposalPath };
  }

  private ensureRoot(projectPath: string): string {
    const projectRoot = realpathSync(resolve(projectPath));
    const claudeRoot = this.ensureDirectory(projectRoot, ".claude");
    const root = this.ensureDirectory(claudeRoot, "supervisor");
    atomicWrite(this.inside(root, ".gitignore"), [
      "evidence/",
      "browser-profiles/",
      "*.tmp",
      "*.trace",
      "*.har",
      "",
    ].join("\n"));
    return root;
  }

  private writeProposal(root: string, audit: AuditRecord, result: AuditResult): string {
    const proposalsRoot = this.ensureDirectory(root, "proposals");
    const proposalRoot = this.ensureDirectory(proposalsRoot, audit.id);
    const metadata = {
      audit_id: audit.id,
      source: "codex-supervisor",
      proposal_mode: result.proposal_mode,
      created_at: new Date().toISOString(),
      isolated: true,
      automatically_merged: false,
    };
    atomicWrite(this.inside(proposalRoot, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    const dimensions = result.design_dimensions
      .map((dimension) => `- ${dimension.name}: ${dimension.score}/100 — ${dimension.recommended_action}`)
      .join("\n");
    const findings = result.findings
      .map((finding, index) => `${index + 1}. ${finding.title}: ${finding.recommended_action}`)
      .join("\n");
    atomicWrite(this.inside(proposalRoot, "PROPOSAL.md"), redactText(`# Isolated Codex design proposal

Source audit: ${audit.id}
Mode: ${result.proposal_mode}
Status: proposal only; no application file was changed or merged.

## Direction

${result.summary}

## Dimension improvements

${dimensions || "No dimension details were returned."}

## Recommended changes

${findings || "No concrete changes were returned."}

Claude Designer/Builder must evaluate and integrate accepted changes explicitly.
`, 30_000));
    return proposalRoot;
  }

  private inside(root: string, relative: string): string {
    const target = resolve(root, relative);
    if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("Artifact path escapes its root");
    return target;
  }

  private ensureDirectory(parent: string, name: string): string {
    const target = this.inside(parent, name);
    if (existsSync(target)) {
      const stat = lstatSync(target);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`Refusing unsafe Supervisor artifact directory: ${target}`);
      }
      return target;
    }
    mkdirSync(target, { mode: 0o700 });
    return target;
  }
}

function renderAudit(audit: AuditRecord, result: AuditResult): string {
  const findings = result.findings.length
    ? result.findings.map((finding, index) => `### ${index + 1}. ${finding.title}

- Severity: ${finding.severity}
- Category: ${finding.category}
- Evidence: ${finding.evidence_classification}
- Description: ${finding.description}
- Required action: ${finding.recommended_action}
- References: ${finding.evidence.join(" · ") || "none"}
`).join("\n")
    : "No material findings.\n";
  const dimensions = result.design_dimensions.length
    ? `\n## Design score\n\n${result.design_score ?? "n/a"}/100\n\n${result.design_dimensions.map((item) => `- ${item.name}: ${item.score}/100 — ${item.rationale}`).join("\n")}\n`
    : "";
  return redactText(`# Codex Supervisor audit

- Audit: ${audit.id}
- Type: ${audit.audit_type}
- Decision: ${result.decision}
- Confidence: ${result.confidence}
- Producer: ${displayIdentity(audit.producer)}
- Auditor: Codex
- Project: ${basename(audit.project_path)}

## Summary

${result.summary}

## Findings

${findings}${dimensions}
## Human action

${result.human_request ? `${result.human_request.reason}\n\nRequested: ${result.human_request.requested_action}` : "None."}
`, 60_000);
}

function atomicWrite(path: string, content: string): void {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let created = false;
  try {
    writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    created = true;
    renameSync(temporary, path);
  } catch (error) {
    if (created) rmSync(temporary, { force: true });
    throw error;
  }
}

function displayIdentity(value: string): string {
  return value === "claude" ? "Claude" : value;
}
