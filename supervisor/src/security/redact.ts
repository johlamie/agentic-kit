const REDACTED = "[REDACTED]";
const MAX_SAFE_STRING = 8_000;

const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN (?:OPENSSH|RSA|EC|DSA|PGP) PRIVATE KEY-----[\s\S]*?-----END [^-]+-----/giu,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/giu,
  /\b(?:sk|rk|pk|sbp|github_pat|ghp|gho|ghu|ghs|glpat|xox[baprs]|AIza)[_-]?[A-Za-z0-9_-]{12,}\b/gu,
  /\b\d{6,12}:[A-Za-z0-9_-]{24,}\b/gu,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu,
  /((?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|passwd|client[_-]?secret|bot[_-]?token)\s*[:=]\s*)[^\s,;]+/giu,
  /(https:\/\/api\.telegram\.org\/bot)[^/\s]+/giu,
];

export function redactText(input: string, maxLength = MAX_SAFE_STRING): string {
  let value = input;
  for (const pattern of SECRET_PATTERNS) {
    value = value.replace(pattern, (match, prefix: string | undefined) => prefix ? `${prefix}${REDACTED}` : REDACTED);
  }
  value = value.replace(/(^|\n)\s*[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY)[A-Z0-9_]*\s*=.*(?=\n|$)/gu, `$1${REDACTED}`);
  return value.length > maxLength ? `${value.slice(0, maxLength)}…[TRUNCATED]` : value;
}

export function sanitizeUrl(input: unknown, maxLength = 1_000): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  try {
    const parsed = new URL(redactText(input.trim(), 2_000));
    if (!new Set(["http:", "https:", "ws:", "wss:"]).has(parsed.protocol)) return null;
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return redactText(parsed.toString(), maxLength);
  } catch {
    return null;
  }
}

export function redactUnknown(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[MAX_DEPTH]";
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => redactUnknown(entry, depth + 1));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value).slice(0, 100)) {
      if (/(?:password|passwd|secret|token|authorization|cookie|credential|private.?key)/iu.test(key)) {
        result[key] = REDACTED;
      } else {
        result[key] = redactUnknown(entry, depth + 1);
      }
    }
    return result;
  }
  return value;
}

export function safeError(error: unknown): string {
  if (error instanceof Error) return redactText(error.message, 2_000);
  return redactText(String(error), 2_000);
}

export function containsForbiddenSecretPath(value: string): boolean {
  return /(?:^|[\s"'])(?:~\/|\/home\/[^/]+\/)(?:\.ssh|\.aws|\.config\/gcloud|\.config\/agentic-kit\/(?:supervisor\.env|supervisor-hook-token)|\.codex\/(?:auth\.json|config\.toml))(?:\/|[\s"']|$)|(?:^|\/)\.env(?:\.[^/\s]+)?(?:[\s"']|$)/u.test(value);
}
