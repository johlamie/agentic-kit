/* Control center client. Read-only: it fetches a snapshot, listens to nudges,
   and rebuilds the DOM with createElement only. Every field coming from the
   daemon is re-validated here before it reaches the document. */

const COPY = {
  liveActive: "En direct",
  liveReconnecting: "Reconnexion…",
  liveStopped: "Supervision arrêtée",
  liveLoading: "Connexion en cours",
  noUpdate: "Aucune mise à jour",
  updatedAt: (value) => `Mise à jour ${value}`,
  summary: (projects, attention) =>
    `${projects} ${projects > 1 ? "projets actifs" : "projet actif"}, ${attention} ${attention > 1 ? "interventions attendues" : "intervention attendue"}.`,
  summaryStopped: "La supervision est arrêtée. Cette vue n’utilise plus aucune connexion active.",
  summaryError: "L’état de la supervision n’a pas pu être lu.",
  attentionEmpty: "Aucune intervention attendue.",
  attentionTruncated: (total, shown) =>
    `${total} interventions ouvertes au total ; les ${shown} plus anciennes sont affichées.`,
  activeEmpty: "Aucune session Claude en cours. Le Supervisor reste à l’écoute.",
  recentEmpty: "Aucun projet supervisé sur la période récente.",
  truncated: (limit) => `Liste tronquée aux ${limit} projets les plus récents.`,
  snapshotError: (at, attempts) =>
    `Lecture de l’état impossible à ${at}. Nouvelle tentative automatique en cours (essai ${attempts}).`,
  openThread: "Ouvrir le fil",
  inactiveHint: "Fil disponible pendant une session Claude active",
  // Must stay identical to MASKED_PROJECT_NAME in src/security/redact.ts.
  maskedName: "Projet expurgé",
  maskedHint: "Nom de projet expurgé par la rédaction des secrets : aucun lien n’est proposé",
  sessions: (count) => `${count} ${count > 1 ? "sessions actives" : "session active"}`,
  queue: (running, pending) => `file ${running} en cours / ${pending} en attente`,
  failed: (count) => `${count} ${count > 1 ? "contrôles indisponibles" : "contrôle indisponible"}`,
  requests: (count) => `${count} ${count > 1 ? "interventions ouvertes" : "intervention ouverte"}`,
  noAudit: "Aucun audit enregistré",
  noAuditLabel: "AUCUN AUDIT",
  safeToContinue: "Les autres travaux indépendants peuvent continuer.",
  blocking: "Cette demande bloque la suite du travail concerné.",
  now: "à l’instant",
  minutes: (value) => `il y a ${value} min`,
  hours: (value) => `il y a ${value} h`,
  days: (value) => `il y a ${value} j`,
  unknownTime: "date inconnue",
  telegram: { configured: "Configuré", not_configured: "Non configuré" },
  database: { ok: "base ok", error: "base en erreur" },
};

const TONES = new Set(["info", "pass", "challenge", "block", "human", "error"]);
const SOURCES = new Set(["permission", "question", "elicitation", "audit"]);
const POLL_INTERVAL_MS = 5_000;

const dom = {
  liveDot: document.querySelector("[data-live-dot]"),
  liveLabel: document.querySelector("[data-live-label]"),
  lastUpdate: document.querySelector("[data-last-update]"),
  summary: document.querySelector("[data-live-summary]"),
  error: document.querySelector("[data-snapshot-error]"),
  attentionList: document.querySelector("[data-attention-list]"),
  attentionCount: document.querySelector("[data-attention-count]"),
  attentionNote: document.querySelector("[data-attention-note]"),
  activeList: document.querySelector("[data-active-list]"),
  activeCount: document.querySelector("[data-active-count]"),
  recentList: document.querySelector("[data-recent-list]"),
  recentCount: document.querySelector("[data-recent-count]"),
  welcome: document.querySelector("[data-welcome]"),
  truncation: document.querySelector("[data-truncation]"),
  panels: [...document.querySelectorAll(".panel")],
  daemon: {
    version: document.querySelector("[data-daemon-version]"),
    level: document.querySelector("[data-daemon-level]"),
    queue: document.querySelector("[data-daemon-queue]"),
    streams: document.querySelector("[data-daemon-streams]"),
    telegram: document.querySelector("[data-daemon-telegram]"),
  },
};

let eventStream;
let pollTimer;
let failedAttempts = 0;
let stopped = false;
let streamHealthy = false;
let firstRefreshHandled = false;

function text(value, fallback, maxLength = 400) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function safeSlug(value) {
  const cleaned = typeof value === "string" ? value.replace(/[^a-z0-9_-]/g, "").slice(0, 64) : "";
  return cleaned || null;
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function timestamp(value) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function relativeTime(value) {
  const date = timestamp(value);
  if (!date) return COPY.unknownTime;
  const elapsed = Date.now() - date.getTime();
  if (elapsed < 60_000) return COPY.now;
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return COPY.minutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return COPY.hours(hours);
  return COPY.days(Math.floor(hours / 24));
}

function clockTime(date) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date);
}

function safeQueue(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    pending: count(source.pending),
    running: count(source.running),
    completed: count(source.completed),
    failed: count(source.failed),
  };
}

function safeDaemonQueue(value) {
  const source = value && typeof value === "object" ? value : {};
  return { pending: count(source.pending), running: count(source.running), failed: count(source.failed) };
}

function safeAudit(value) {
  if (!value || typeof value !== "object") return null;
  return {
    tone: TONES.has(value.tone) ? value.tone : "info",
    label: text(value.label, "INFO", 40),
    typeLabel: text(value.typeLabel, "Contrôle", 60),
    at: text(value.at, "", 40),
    summary: text(value.summary, "", 600),
  };
}

function safeProject(value) {
  if (!value || typeof value !== "object") return null;
  const slug = safeSlug(value.slug);
  return {
    name: text(value.name, slug ?? COPY.maskedName, 80),
    slug,
    active: value.active === true,
    activeSessionCount: count(value.activeSessionCount),
    lastSeenAt: text(value.lastSeenAt, "", 40),
    openHumanRequests: count(value.openHumanRequests),
    queue: safeQueue(value.queue),
    latestAudit: safeAudit(value.latestAudit),
  };
}

function safeAttention(value) {
  if (!value || typeof value !== "object") return null;
  const slug = safeSlug(value.projectSlug);
  return {
    projectName: text(value.projectName, slug ?? COPY.maskedName, 80),
    projectSlug: slug,
    source: SOURCES.has(value.source) ? value.source : "question",
    title: text(value.title, "Intervention requise", 120),
    reason: text(value.reason, "Le Supervisor attend une réponse humaine.", 600),
    requestedAction: text(value.requestedAction, "Ouvre la session Claude concernée.", 300),
    createdAt: text(value.createdAt, "", 40),
    safeToContinue: value.safeToContinue === true,
  };
}

function safeSnapshot(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const daemon = source.daemon && typeof source.daemon === "object" ? source.daemon : {};
  const projects = (Array.isArray(source.projects) ? source.projects : [])
    .map(safeProject)
    .filter(Boolean);
  return {
    generatedAt: text(source.generatedAt, "", 40),
    daemon: {
      version: text(daemon.version, "—", 20),
      level: text(daemon.level, "—", 20),
      database: daemon.database === "error" ? "error" : "ok",
      queue: safeDaemonQueue(daemon.queue),
      telegram: daemon.telegram === "configured" ? "configured" : "not_configured",
      activeStreams: count(daemon.activeStreams),
    },
    attention: (Array.isArray(source.attention) ? source.attention : []).map(safeAttention).filter(Boolean),
    attentionTotal: count(source.attentionTotal),
    attentionLimit: count(source.attentionLimit),
    projects,
    projectLimit: count(source.projectLimit),
    projectsTruncated: source.projectsTruncated === true,
  };
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function emptyRow(list, message) {
  const item = element("li", "row-empty", message);
  list.replaceChildren(item);
}

function badge(tone, label) {
  const node = element("span", `status-badge tone--${tone}`, label);
  return node;
}

function attentionRow(item) {
  const listItem = document.createElement("li");
  const row = document.createElement(item.projectSlug ? "a" : "div");
  row.className = "row tone--human";
  if (item.projectSlug) row.href = `/${item.projectSlug}`;
  else row.title = COPY.maskedHint;

  const head = element("div", "row__head");
  head.append(
    badge("human", item.source === "permission" ? "AUTORISATION" : "HUMAN_REQUIRED"),
    element("span", "row__name", item.projectName),
    element("span", "row__time", relativeTime(item.createdAt)),
  );

  row.append(
    head,
    element("p", "row__title", item.title),
    element("p", "row__reason", item.reason),
    element("p", "row__action", `Action attendue : ${item.requestedAction}`),
    // Distinct meaning, distinct class: this line states the blocking impact,
    // not the action, and must never be mistaken for a repeat of it.
    element("p", "row__impact", item.safeToContinue ? COPY.safeToContinue : COPY.blocking),
  );
  listItem.append(row);
  return listItem;
}

function projectMeta(project) {
  const meta = element("p", "row__meta");
  const parts = [];
  if (project.active) parts.push(COPY.sessions(project.activeSessionCount));
  parts.push(COPY.queue(project.queue.running, project.queue.pending));
  if (project.openHumanRequests > 0) parts.push(COPY.requests(project.openHumanRequests));
  meta.append(document.createTextNode(parts.join(" · ")));
  if (project.queue.failed > 0) {
    meta.append(document.createTextNode(" · "), element("b", null, COPY.failed(project.queue.failed)));
  }
  return meta;
}

function projectRow(project) {
  const listItem = document.createElement("li");
  const audit = project.latestAudit;
  const tone = audit ? audit.tone : "info";
  const linked = project.active && project.slug !== null;
  const row = document.createElement(linked ? "a" : "div");
  row.className = `row tone--${tone}`;
  if (linked) row.href = `/${project.slug}`;
  else row.title = project.slug === null ? COPY.maskedHint : COPY.inactiveHint;

  const head = element("div", "row__head");
  const dot = element("span", "row__dot");
  dot.setAttribute("aria-hidden", "true");
  head.append(dot, element("span", "row__name", project.name));
  head.append(badge(tone, audit ? audit.label : COPY.noAuditLabel));
  head.append(element("span", "row__audit", audit ? audit.typeLabel : COPY.noAudit));
  head.append(element("span", "row__time", relativeTime(project.lastSeenAt)));

  row.append(head, projectMeta(project));
  if (linked) row.append(element("p", "row__open", `${COPY.openThread} →`));
  listItem.append(row);
  return listItem;
}

function renderDaemon(daemon) {
  const unhealthy = daemon.database === "error";
  dom.daemon.version.textContent = unhealthy
    ? `v${daemon.version} · ${COPY.database.error}`
    : `v${daemon.version} · ${COPY.database.ok}`;
  dom.daemon.version.classList.toggle("is-alert", unhealthy);
  dom.daemon.level.textContent = daemon.level;
  dom.daemon.queue.textContent = `${daemon.queue.running}/${daemon.queue.pending}/${daemon.queue.failed}`;
  dom.daemon.queue.classList.toggle("is-alert", daemon.queue.failed > 0);
  dom.daemon.streams.textContent = String(daemon.activeStreams);
  dom.daemon.telegram.textContent = COPY.telegram[daemon.telegram];
}

function renderSnapshot(snapshot) {
  renderDaemon(snapshot.daemon);

  const active = snapshot.projects.filter((project) => project.active);
  const recent = snapshot.projects.filter((project) => !project.active);

  // The counter states the real total, never the truncated page length.
  const attentionTotal = Math.max(snapshot.attentionTotal, snapshot.attention.length);
  dom.attentionCount.textContent = String(attentionTotal);
  dom.activeCount.textContent = String(active.length);
  dom.recentCount.textContent = String(recent.length);

  if (snapshot.attention.length === 0) emptyRow(dom.attentionList, COPY.attentionEmpty);
  else dom.attentionList.replaceChildren(...snapshot.attention.map(attentionRow));

  const attentionTruncated = attentionTotal > snapshot.attention.length;
  dom.attentionNote.hidden = !attentionTruncated;
  if (attentionTruncated) {
    dom.attentionNote.textContent = COPY.attentionTruncated(attentionTotal, snapshot.attention.length);
  }

  if (active.length === 0) emptyRow(dom.activeList, COPY.activeEmpty);
  else dom.activeList.replaceChildren(...active.map(projectRow));

  if (recent.length === 0) emptyRow(dom.recentList, COPY.recentEmpty);
  else dom.recentList.replaceChildren(...recent.map(projectRow));

  const empty = snapshot.projects.length === 0 && snapshot.attention.length === 0;
  dom.welcome.hidden = !empty;
  for (const panel of dom.panels) panel.hidden = empty;

  const truncated = snapshot.projectsTruncated && snapshot.projectLimit > 0;
  dom.truncation.hidden = !truncated;
  if (truncated) dom.truncation.textContent = COPY.truncated(snapshot.projectLimit);

  dom.summary.textContent = COPY.summary(active.length, attentionTotal);
  const generated = timestamp(snapshot.generatedAt);
  dom.lastUpdate.textContent = generated ? COPY.updatedAt(clockTime(generated)) : COPY.noUpdate;
}

function setLiveState(label, modifier) {
  dom.liveLabel.textContent = label;
  dom.liveDot.className = modifier ? `live-dot ${modifier}` : "live-dot";
}

function showError() {
  dom.error.hidden = false;
  dom.error.textContent = COPY.snapshotError(clockTime(new Date()), failedAttempts);
  dom.summary.textContent = COPY.summaryError;
  setLiveState(COPY.liveReconnecting, "live-dot--waiting");
}

function stopView() {
  if (stopped) return;
  stopped = true;
  eventStream?.close();
  eventStream = undefined;
  window.clearInterval(pollTimer);
  pollTimer = undefined;
  setLiveState(COPY.liveStopped, "live-dot--stopped");
  dom.summary.textContent = COPY.summaryStopped;
  dom.error.hidden = true;
}

async function loadSnapshot() {
  if (stopped) return;
  try {
    const response = await fetch("/_supervisor/api/control/summary", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderSnapshot(safeSnapshot(await response.json()));
    failedAttempts = 0;
    dom.error.hidden = true;
    if (streamHealthy || !("EventSource" in window)) setLiveState(COPY.liveActive, null);
  } catch {
    failedAttempts += 1;
    showError();
    startPolling();
  }
}

function startPolling() {
  if (pollTimer || stopped) return;
  pollTimer = window.setInterval(() => { void loadSnapshot(); }, POLL_INTERVAL_MS);
}

function stopPolling() {
  window.clearInterval(pollTimer);
  pollTimer = undefined;
}

function connectStream() {
  if (stopped) return;
  if (!("EventSource" in window)) {
    startPolling();
    return;
  }
  eventStream = new EventSource("/_supervisor/api/control/stream");
  eventStream.addEventListener("open", () => {
    if (stopped) return;
    streamHealthy = true;
    stopPolling();
    if (failedAttempts === 0) setLiveState(COPY.liveActive, null);
  });
  eventStream.addEventListener("refresh", () => {
    // The daemon always nudges once on connect; the first snapshot is already loaded.
    if (!firstRefreshHandled) {
      firstRefreshHandled = true;
      return;
    }
    void loadSnapshot();
  });
  eventStream.addEventListener("closed", stopView);
  eventStream.addEventListener("error", () => {
    if (stopped) return;
    streamHealthy = false;
    setLiveState(COPY.liveReconnecting, "live-dot--waiting");
    startPolling();
  });
}

setLiveState(COPY.liveLoading, "live-dot--waiting");
void loadSnapshot().then(connectStream);
