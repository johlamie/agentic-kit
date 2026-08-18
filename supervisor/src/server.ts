import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import type { SupervisorConfig } from "./config.js";
import { SUPERVISOR_VERSION } from "./config.js";
import { AuditDispatcher } from "./audits/dispatcher.js";
import { SupervisorDatabase } from "./db.js";
import { ClaudeHookAdapter, type EventAdapter } from "./hooks/adapter.js";
import { Logger } from "./logger.js";
import { safeError } from "./security/redact.js";
import { TelegramClient } from "./telegram/client.js";
import { formatPermissionNotification } from "./telegram/formatter.js";
import { AUDIT_TYPES, type AuditType } from "./types.js";

const MAX_BODY_BYTES = 256 * 1024;

export class SupervisorServer {
  private readonly server: Server;
  private readonly adapters: Map<string, EventAdapter>;

  public constructor(
    private readonly config: SupervisorConfig,
    private readonly database: SupervisorDatabase,
    private readonly dispatcher: AuditDispatcher,
    private readonly telegram: TelegramClient,
    private readonly logger: Logger,
    adapters: EventAdapter[] = [new ClaudeHookAdapter()],
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.producer, adapter]));
    this.server = createServer((request, response) => { void this.route(request, response); });
    this.server.requestTimeout = 5_000;
    this.server.headersTimeout = 5_000;
    this.server.keepAliveTimeout = 1_000;
  }

  public async listen(): Promise<void> {
    await new Promise<void>((resolvePromise, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.config.port, this.config.host, () => {
        this.server.off("error", reject);
        resolvePromise();
      });
    });
  }

  public async close(): Promise<void> {
    if (!this.server.listening) return;
    await new Promise<void>((resolvePromise, reject) => {
      this.server.close((error) => error ? reject(error) : resolvePromise());
    });
  }

  public address(): { host: string; port: number } {
    const address = this.server.address();
    if (!address || typeof address === "string") return { host: this.config.host, port: this.config.port };
    return { host: address.address, port: address.port };
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (!isLoopback(request.socket.remoteAddress)) return json(response, 403, { error: "loopback_only" });
      const url = new URL(request.url ?? "/", `http://${this.config.host}:${this.config.port}`);
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        return json(response, 200, {
          status: "ok",
          version: SUPERVISOR_VERSION,
          database: this.database.ping() ? "ok" : "error",
          queue: this.database.queueCounts(),
          telegram: this.telegram.configured ? "configured" : "not_configured",
          hook_auth: this.config.hookToken ? "enabled" : "disabled",
        });
      }
      if (!this.authorized(request)) return json(response, 401, { error: "unauthorized" });
      const eventAdapter = this.eventAdapter(url.pathname);
      if (request.method === "POST" && eventAdapter) {
        const payload = await readJsonBody(request);
        const event = eventAdapter.normalize(payload);
        if (event.producer !== eventAdapter.producer) throw new Error("Event adapter producer mismatch");
        const ids = this.database.insertEvent(event);
        const audits = this.dispatcher.dispatch(event, ids.sessionId);
        if (event.event_type === "permission.requested") {
          void this.telegram.send(formatPermissionNotification(event)).catch((error) => {
            this.logger.warn("telegram.permission.failed", { error: safeError(error) });
          });
        }
        return json(response, 202, {
          accepted: true,
          event_id: event.id,
          scheduled_audits: audits.map((audit) => audit.id),
          gate: event.event_type === "claude.stopping" ? this.database.stopGate(event.project_path) : null,
        });
      }
      if (request.method === "POST" && url.pathname === "/v1/audits") {
        const body = await readJsonBody(request) as Record<string, unknown>;
        if (typeof body.project !== "string" || !body.project.trim()) return json(response, 400, { error: "project_required" });
        if (typeof body.type !== "string" || !AUDIT_TYPES.includes(body.type as AuditType)) return json(response, 400, { error: "invalid_audit_type" });
        const context: Record<string, unknown> = {};
        if (typeof body.url === "string") context.url = body.url;
        if (typeof body.reason === "string") context.reason = body.reason;
        const audit = this.dispatcher.enqueueManual(resolve(body.project), body.type as AuditType, context);
        return json(response, 202, { audit_id: audit.id, status: audit.status });
      }
      if (request.method === "GET" && url.pathname === "/v1/gate") {
        const project = url.searchParams.get("project");
        const phase = url.searchParams.get("phase");
        if (!project || !phase) return json(response, 400, { error: "project_and_phase_required" });
        return json(response, 200, this.database.gate(project, phase));
      }
      return json(response, 404, { error: "not_found" });
    } catch (error) {
      this.logger.warn("http.request.failed", { error: safeError(error) });
      return json(response, error instanceof BodyError ? error.status : 500, { error: safeError(error) });
    }
  }

  private authorized(request: IncomingMessage): boolean {
    if (!this.config.hookToken) return true;
    const value = request.headers["x-agentic-supervisor-token"];
    if (typeof value !== "string") return false;
    const expected = Buffer.from(this.config.hookToken);
    const supplied = Buffer.from(value);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  }

  private eventAdapter(pathname: string): EventAdapter | null {
    if (pathname === "/v1/hooks") return this.adapters.get("claude") ?? null;
    const match = pathname.match(/^\/v1\/events\/([A-Za-z0-9_-]{1,100})$/u);
    return match?.[1] ? this.adapters.get(match[1]) ?? null : null;
  }
}

class BodyError extends Error {
  public constructor(public readonly status: number, message: string) { super(message); }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunkInput of request) {
    const chunk = Buffer.isBuffer(chunkInput) ? chunkInput : Buffer.from(chunkInput);
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new BodyError(413, "request_too_large");
    chunks.push(chunk);
  }
  if (length === 0) throw new BodyError(400, "empty_body");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BodyError(400, "invalid_json");
  }
}

function json(response: ServerResponse, status: number, payload: unknown): void {
  if (response.headersSent) return;
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function isLoopback(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
