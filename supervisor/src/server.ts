import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { ActivityBus, buildActivitySnapshot, buildControlSnapshot } from "./activity.js";
import type { SupervisorConfig } from "./config.js";
import { SUPERVISOR_VERSION } from "./config.js";
import { AuditDispatcher } from "./audits/dispatcher.js";
import { SupervisorDatabase } from "./db.js";
import { ClaudeHookAdapter, type EventAdapter } from "./hooks/adapter.js";
import { humanAttentionFromEvent } from "./human/attention.js";
import { Logger } from "./logger.js";
import { redactText, safeError, sanitizeUrl } from "./security/redact.js";
import { TelegramClient } from "./telegram/client.js";
import { formatHumanAttentionNotification } from "./telegram/formatter.js";
import { AUDIT_TYPES, type AuditType } from "./types.js";
import { ActivityUiAssets, ControlUiAssets, type ActivityAsset } from "./ui/assets.js";

const MAX_BODY_BYTES = 256 * 1024;
const CONTROL_STREAM_DEBOUNCE_MS = 1_000;

export class SupervisorServer {
  private readonly server: Server;
  private readonly adapters: Map<string, EventAdapter>;
  private readonly uiAssets: ActivityUiAssets | null;
  private readonly controlAssets: ControlUiAssets | null;
  private readonly activityStreams = new Set<ServerResponse>();
  private readonly pendingNotifications = new Set<Promise<void>>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  public constructor(
    private readonly config: SupervisorConfig,
    private readonly database: SupervisorDatabase,
    private readonly dispatcher: AuditDispatcher,
    private readonly telegram: TelegramClient,
    private readonly logger: Logger,
    adapters: EventAdapter[] = [new ClaudeHookAdapter()],
    private readonly activity: ActivityBus = new ActivityBus(),
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.producer, adapter]));
    this.server = createServer((request, response) => { void this.route(request, response); });
    this.server.requestTimeout = 5_000;
    this.server.headersTimeout = 5_000;
    this.server.keepAliveTimeout = 1_000;
    let assets: ActivityUiAssets | null = null;
    if (config.activityUi) {
      try { assets = new ActivityUiAssets(); }
      catch (error) { this.logger.warn("activity.ui.unavailable", { error: safeError(error) }); }
    }
    this.uiAssets = assets;
    let control: ControlUiAssets | null = null;
    if (config.controlUi) {
      try { control = new ControlUiAssets(); }
      catch (error) { this.logger.warn("control.ui.unavailable", { error: safeError(error) }); }
    }
    this.controlAssets = control;
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
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    for (const stream of this.activityStreams) {
      if (!stream.destroyed) {
        writeSse(stream, "closed", { reason: "supervisor_stopped" });
        stream.end();
      }
    }
    this.activityStreams.clear();
    if (this.server.listening) {
      await new Promise<void>((resolvePromise, reject) => {
        this.server.close((error) => error ? reject(error) : resolvePromise());
      });
    }
    await Promise.allSettled([...this.pendingNotifications]);
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
      if (request.method === "GET" && url.pathname === "/") {
        const control = this.config.controlUi ? this.controlAssets : null;
        // Browsers asking for a document get the control center; tooling keeps the health JSON.
        if (control && acceptsHtml(request) && isDirectUiRequest(request, this.address().port)) {
          return sendAsset(request, response, control.indexHtml());
        }
        return json(response, 200, this.health());
      }
      if (request.method === "GET" && url.pathname === "/health") return json(response, 200, this.health());
      if (await this.uiRoute(request, response, url)) return;
      if (!this.authorized(request)) return json(response, 401, { error: "unauthorized" });
      const eventAdapter = this.eventAdapter(url.pathname);
      if (request.method === "POST" && eventAdapter) {
        const payload = await readJsonBody(request);
        const event = eventAdapter.normalize(payload);
        if (event.producer !== eventAdapter.producer) throw new Error("Event adapter producer mismatch");
        const ids = this.database.insertEvent(event);
        const attention = humanAttentionFromEvent(event);
        if (attention) {
          const humanRequest = this.database.createEventHumanRequest(event, ids.sessionId, attention);
          if (humanRequest.created) {
            const notification = this.telegram.send(formatHumanAttentionNotification(event, attention)).then((messageId) => {
              if (messageId) this.database.setHumanRequestTelegramMessage(humanRequest.id, messageId);
            }).catch((error) => {
              this.logger.warn("telegram.human_attention.failed", { error: safeError(error) });
            });
            this.pendingNotifications.add(notification);
            void notification.finally(() => { this.pendingNotifications.delete(notification); });
          }
        }
        const audits = this.dispatcher.dispatch(event, ids.sessionId);
        this.activity.publish(event.project_path);
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
        if (typeof body.url === "string") {
          const targetUrl = sanitizeUrl(body.url);
          if (!targetUrl) return json(response, 400, { error: "invalid_audit_url" });
          context.url = targetUrl;
        }
        if (typeof body.reason === "string") context.reason = redactText(body.reason, 2_000);
        const audit = this.dispatcher.enqueueManual(resolve(body.project), body.type as AuditType, context);
        this.activity.publish(audit.project_path);
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

  private health(): Record<string, unknown> {
    return {
      status: "ok",
      version: SUPERVISOR_VERSION,
      database: this.database.ping() ? "ok" : "error",
      queue: this.database.queueCounts(),
      telegram: this.telegram.configured ? "configured" : "not_configured",
      hook_auth: this.config.hookToken ? "enabled" : "disabled",
      activity_ui: !this.config.activityUi ? "disabled" : this.uiAssets ? "ready" : "error",
      control_ui: !this.config.controlUi ? "disabled" : this.controlAssets ? "ready" : "error",
      active_projects: this.config.activityUi
        ? this.database.listActiveProjects(this.config.activitySessionStaleMs).length
        : 0,
      activity_streams: this.activityStreams.size,
    };
  }

  private async uiRoute(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
    const activityAssets = this.config.activityUi ? this.uiAssets : null;
    const controlAssets = this.config.controlUi ? this.controlAssets : null;
    if (!activityAssets && !controlAssets) return false;
    if (request.method !== "GET" && request.method !== "HEAD") return false;

    const assetMatch = url.pathname.match(/^\/_supervisor\/assets\/([a-z0-9.-]{1,80})$/u);
    const controlMatch = url.pathname === "/_supervisor/api/control/summary"
      || url.pathname === "/_supervisor/api/control/stream";
    const activityMatch = activityAssets
      ? url.pathname.match(/^\/_supervisor\/api\/projects\/([a-z0-9_-]{1,64})\/activity$/u)
      : null;
    const streamMatch = activityAssets
      ? url.pathname.match(/^\/_supervisor\/api\/projects\/([a-z0-9_-]{1,64})\/stream$/u)
      : null;
    const pageMatch = activityAssets ? url.pathname.match(/^\/([a-z0-9_-]{1,64})\/?$/u) : null;
    // The origin guard covers UI paths only: every other GET route keeps its own
    // authentication and must stay reachable when a UI is disabled.
    if (!assetMatch && !controlMatch && !activityMatch && !streamMatch && !pageMatch) return false;
    if (!isDirectUiRequest(request, this.address().port)) {
      json(response, 403, { error: "activity_ui_local_only" });
      return true;
    }

    if (assetMatch?.[1]) {
      const asset = controlAssets?.asset(assetMatch[1]) ?? activityAssets?.asset(assetMatch[1]) ?? null;
      if (!asset) json(response, 404, { error: "not_found" });
      else sendAsset(request, response, asset);
      return true;
    }

    if (url.pathname === "/_supervisor/api/control/summary") {
      if (!controlAssets) json(response, 404, { error: "not_found" });
      else json(response, 200, buildControlSnapshot(this.database, this.config, {
        telegramConfigured: this.telegram.configured,
        activeStreams: this.activityStreams.size,
      }));
      return true;
    }

    if (url.pathname === "/_supervisor/api/control/stream") {
      if (!controlAssets) json(response, 404, { error: "not_found" });
      else if (request.method === "HEAD") {
        response.writeHead(405, { Allow: "GET", "Cache-Control": "no-store" });
        response.end();
      } else this.openControlStream(request, response);
      return true;
    }

    if (!activityAssets) return false;

    if (activityMatch?.[1]) {
      const snapshot = buildActivitySnapshot(this.database, activityMatch[1], this.config.activitySessionStaleMs);
      json(response, snapshot ? 200 : 410, snapshot ?? { error: "supervision_inactive" });
      return true;
    }

    if (streamMatch?.[1]) {
      if (request.method === "HEAD") {
        response.writeHead(405, { Allow: "GET", "Cache-Control": "no-store" });
        response.end();
        return true;
      }
      this.openActivityStream(request, response, streamMatch[1]);
      return true;
    }

    if (pageMatch?.[1]) {
      const project = this.database.activeProjectBySlug(pageMatch[1], this.config.activitySessionStaleMs);
      if (!project) json(response, 404, { error: "supervision_inactive" });
      else sendAsset(request, response, activityAssets.indexHtml());
      return true;
    }
    return false;
  }

  private openActivityStream(request: IncomingMessage, response: ServerResponse, slug: string): void {
    const project = this.database.activeProjectBySlug(slug, this.config.activitySessionStaleMs);
    if (!project) return json(response, 410, { error: "supervision_inactive" });
    if (this.activityStreams.size >= this.config.activityMaxStreams) {
      return json(response, 503, { error: "activity_stream_limit" });
    }
    response.writeHead(200, {
      ...activitySecurityHeaders(),
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    this.activityStreams.add(response);
    this.ensureHeartbeat();
    let closed = false;
    let unsubscribe = (): void => {};
    const close = (): void => {
      if (closed) return;
      closed = true;
      unsubscribe();
      this.activityStreams.delete(response);
      this.stopHeartbeatWhenIdle();
    };
    const refresh = (): void => {
      if (closed || response.destroyed) return close();
      const active = this.database.activeProjectBySlug(slug, this.config.activitySessionStaleMs);
      if (!active) {
        writeSse(response, "closed", { reason: "session_ended" });
        close();
        response.end();
        return;
      }
      writeSse(response, "refresh", { at: new Date().toISOString() });
    };
    unsubscribe = this.activity.subscribe(project.path, refresh);
    request.once("close", close);
    response.once("close", close);
    writeSse(response, "refresh", { at: new Date().toISOString() });
  }

  /**
   * Global nudge stream. It survives individual project closures and only ends
   * with the daemon, so it emits `closed` from close() and never from a listener.
   */
  private openControlStream(request: IncomingMessage, response: ServerResponse): void {
    if (this.activityStreams.size >= this.config.activityMaxStreams) {
      return json(response, 503, { error: "activity_stream_limit" });
    }
    response.writeHead(200, {
      ...activitySecurityHeaders(),
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    this.activityStreams.add(response);
    this.ensureHeartbeat();
    let closed = false;
    let debounce: NodeJS.Timeout | null = null;
    let unsubscribe = (): void => {};
    const close = (): void => {
      if (closed) return;
      closed = true;
      if (debounce) clearTimeout(debounce);
      debounce = null;
      unsubscribe();
      this.activityStreams.delete(response);
      this.stopHeartbeatWhenIdle();
    };
    const schedule = (): void => {
      if (closed || debounce) return;
      if (response.destroyed) return close();
      debounce = setTimeout(() => {
        debounce = null;
        if (closed || response.destroyed) return close();
        writeSse(response, "refresh", { at: new Date().toISOString() });
      }, CONTROL_STREAM_DEBOUNCE_MS);
      debounce.unref();
    };
    unsubscribe = this.activity.subscribeAll(schedule);
    request.once("close", close);
    response.once("close", close);
    writeSse(response, "refresh", { at: new Date().toISOString() });
  }

  private ensureHeartbeat(): void {
    if (this.heartbeatTimer || this.activityStreams.size === 0) return;
    this.heartbeatTimer = setInterval(() => {
      for (const stream of this.activityStreams) {
        if (!stream.destroyed) stream.write(": keepalive\n\n");
      }
    }, 15_000);
    this.heartbeatTimer.unref();
  }

  private stopHeartbeatWhenIdle(): void {
    if (this.activityStreams.size > 0 || !this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
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

function activitySecurityHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
}

function sendAsset(request: IncomingMessage, response: ServerResponse, asset: ActivityAsset): void {
  response.writeHead(200, {
    ...activitySecurityHeaders(),
    "Content-Type": asset.contentType,
    "Content-Length": asset.body.length,
  });
  response.end(request.method === "HEAD" ? undefined : asset.body);
}

function writeSse(response: ServerResponse, event: string, payload: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function acceptsHtml(request: IncomingMessage): boolean {
  const accept = request.headers.accept;
  return typeof accept === "string" && accept.toLowerCase().includes("text/html");
}

function isDirectUiRequest(request: IncomingMessage, configuredPort: number): boolean {
  if (request.headers.forwarded || request.headers["x-forwarded-for"] || request.headers["x-real-ip"]) return false;
  const fetchSite = request.headers["sec-fetch-site"];
  if (typeof fetchSite === "string" && !["none", "same-origin", "same-site"].includes(fetchSite)) return false;
  const host = request.headers.host;
  if (!host) return false;
  try {
    const parsed = new URL(`http://${host}`);
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
    const port = parsed.port ? Number.parseInt(parsed.port, 10) : 80;
    return ["localhost", "127.0.0.1", "::1"].includes(hostname) && port === configuredPort;
  } catch {
    return false;
  }
}

function isLoopback(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
