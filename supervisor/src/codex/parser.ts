import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { PACKAGE_ROOT, type SupervisorConfig } from "../config.js";
import type { AuditResult } from "../types.js";

export class AuditOutputError extends Error {
  public constructor(message: string, public readonly validationErrors: ErrorObject[] = []) {
    super(message);
    this.name = "AuditOutputError";
  }
}

export class AuditInfrastructureError extends Error {
  public constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "AuditInfrastructureError";
  }
}

export class AuditResultParser {
  private readonly validate: ValidateFunction<AuditResult>;

  public constructor(private readonly config: Pick<SupervisorConfig, "uiScorePass" | "uiScoreChallenge">) {
    const schema = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, "schemas/audit-result.schema.json"), "utf8")) as object;
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    this.validate = ajv.compile<AuditResult>(schema);
  }

  public parse(raw: string): AuditResult {
    let value: unknown;
    try {
      value = JSON.parse(raw.trim());
    } catch {
      throw new AuditOutputError("Codex returned malformed JSON");
    }
    if (!this.validate(value)) {
      throw new AuditOutputError("Codex output does not match the audit schema", this.validate.errors ?? []);
    }
    const result = structuredClone(value);
    if (result.infrastructure_error) {
      throw new AuditInfrastructureError(result.infrastructure_error.code, result.infrastructure_error.message);
    }
    if (result.decision === "HUMAN_REQUIRED" && result.human_request === null) {
      throw new AuditOutputError("HUMAN_REQUIRED requires human_request details");
    }
    if (result.human_request !== null) result.decision = "HUMAN_REQUIRED";

    const securityCritical = result.findings.some((finding) =>
      finding.severity === "critical" ||
      (finding.severity === "high" && /security|authorization|authentication|secret|data-loss|injection/iu.test(finding.category)),
    );
    if (securityCritical && result.decision !== "HUMAN_REQUIRED") result.decision = "BLOCK";

    if (result.design_score !== null && result.decision !== "HUMAN_REQUIRED") {
      if (result.design_score < this.config.uiScoreChallenge) result.decision = "BLOCK";
      else if (result.design_score < this.config.uiScorePass && result.decision === "PASS") result.decision = "CHALLENGE";
    }
    return result;
  }
}
