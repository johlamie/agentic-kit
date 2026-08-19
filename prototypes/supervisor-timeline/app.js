const PROJECT_FALLBACK = "factures_platform";

const initialEvents = [
  {
    id: "evt-071",
    type: "info",
    label: "DÉMARRAGE",
    category: "Session",
    time: "09:41",
    title: "La session de travail a démarré",
    summary: "Le Supervisor a reconnu le projet et ouvert un nouveau cycle de suivi en lecture seule.",
    details: "Source simulée : hook SessionStart. Aucun audit coûteux n’est déclenché à ce stade.",
  },
  {
    id: "evt-072",
    type: "pass",
    label: "PASS",
    category: "Recherche",
    time: "09:47",
    title: "Les sources principales sont vérifiables",
    summary: "Les références proposées sont officielles, documentées et suffisamment stables pour poursuivre l’architecture.",
    details: "La décision permet de continuer. Elle reste visible ici mais ne génère aucune notification Telegram.",
  },
  {
    id: "evt-073",
    type: "challenge",
    label: "CHALLENGE",
    category: "Architecture",
    time: "09:55",
    title: "Le plan de reprise doit être plus précis",
    summary: "Le flux nominal est cohérent, mais la stratégie de rollback des migrations reste trop implicite pour valider le jalon.",
    details: "Recommandation : documenter la compatibilité descendante et ajouter un exercice de restauration reproductible.",
  },
  {
    id: "evt-074",
    type: "block",
    label: "BLOCK",
    category: "Sécurité",
    time: "10:08",
    title: "Une frontière d’autorisation reste incomplète",
    summary: "Un scénario de test montre qu’une opération sensible n’est pas encore protégée sur tous les chemins d’exécution.",
    details: "Claude reçoit le rapport détaillé et doit corriger ce point avant de représenter la tranche au Supervisor.",
  },
  {
    id: "evt-075",
    type: "info",
    label: "CORRECTION",
    category: "Implémentation",
    time: "10:16",
    title: "Claude a soumis une correction ciblée",
    summary: "La règle d’autorisation et ses tests de non-régression ont été ajoutés sans modifier le périmètre fonctionnel.",
    details: "Le prochain audit sera regroupé avec les changements liés afin d’éviter un contrôle après chaque outil.",
  },
  {
    id: "evt-076",
    type: "pass",
    label: "PASS",
    category: "Code",
    time: "10:24",
    title: "La correction de sécurité est validée",
    summary: "Les tests ciblés, le contrôle des permissions et l’inspection indépendante ne reproduisent plus le défaut.",
    details: "Ce verdict clôt la tranche technique. Le fil conserve l’historique BLOCK → correction → PASS.",
  },
  {
    id: "evt-077",
    type: "challenge",
    label: "CHALLENGE",
    category: "UI/UX",
    time: "10:31",
    title: "Le mobile manque encore de hiérarchie",
    summary: "Le parcours fonctionne, mais l’action principale concurrence deux actions secondaires sur les écrans étroits.",
    details: "Recommandation : isoler l’action primaire et réduire la densité au viewport 390 × 844 avant le nouvel audit visuel.",
  },
  {
    id: "evt-078",
    type: "human",
    label: "HUMAN_REQUIRED",
    category: "Décision",
    time: "10:38",
    title: "Ton arbitrage est requis sur la Preview",
    summary: "Deux directions visuelles sont techniquement valides. Le Supervisor attend ton choix avant de figer la direction de la V1.",
    details: "Les autres travaux indépendants peuvent continuer. Cette demande est également transmise sur Telegram.",
  },
];

const simulatedEvents = [
  {
    type: "info",
    label: "REPRISE",
    category: "Workflow",
    title: "Le travail indépendant continue",
    summary: "Les tâches sans dépendance humaine avancent pendant que la décision visuelle reste ouverte.",
    details: "Le flux principal n’est pas paralysé : seules les opérations dépendantes de la décision sont suspendues.",
  },
  {
    type: "block",
    label: "BLOCK",
    category: "QA",
    title: "Un scénario critique échoue encore",
    summary: "Le cas de reprise après une erreur réseau ne restaure pas l’état attendu et doit être réparé.",
    details: "Ce signal reste dans l’interface et retourne automatiquement vers Claude. Aucun spam Telegram n’est envoyé.",
  },
  {
    type: "pass",
    label: "PASS",
    category: "Responsive",
    title: "Les quatre viewports sont validés",
    summary: "La navigation, la lisibilité et les actions principales restent utilisables du mobile au grand écran.",
    details: "Viewports simulés : 390 × 844, 768 × 1024, 1440 × 900 et 1920 × 1080.",
  },
  {
    type: "challenge",
    label: "CHALLENGE",
    category: "Accessibilité",
    title: "Le focus clavier doit être renforcé",
    summary: "L’ordre de navigation est correct, mais un contrôle secondaire manque de contraste lorsqu’il reçoit le focus.",
    details: "Recommandation : appliquer le token de focus global et vérifier le contraste sur le thème sombre.",
  },
];

const state = {
  events: [...initialEvents],
  filter: "all",
  simulationIndex: 0,
};

const timeline = document.querySelector("#timeline");
const feed = document.querySelector("#activity-feed");
const simulateButton = document.querySelector("#simulate-event");
const jumpButton = document.querySelector("#jump-to-latest");
const toast = document.querySelector("#toast");
const filterButtons = [...document.querySelectorAll("[data-filter]")];
let followLatest = true;

function isFeedAtBottom() {
  return Math.abs(feed.scrollHeight - feed.clientHeight - feed.scrollTop) <= 8;
}

function scrollFeedToBottom(behavior = "auto") {
  followLatest = true;
  feed.scrollTo({ top: feed.scrollHeight, behavior });
}

function safeProjectSlug() {
  const firstSegment = window.location.pathname.split("/").filter(Boolean)[0] ?? PROJECT_FALLBACK;
  let decoded = PROJECT_FALLBACK;
  try {
    decoded = decodeURIComponent(firstSegment);
  } catch {
    decoded = PROJECT_FALLBACK;
  }
  const cleaned = decoded.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return cleaned || PROJECT_FALLBACK;
}

function humanizeProject(slug) {
  return slug
    .replace(/[_-]+/g, " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function matchesFilter(event) {
  if (state.filter === "all") return true;
  if (state.filter === "attention") return event.type === "block" || event.type === "challenge";
  if (state.filter === "pass") return event.type === "pass";
  if (state.filter === "human") return event.type === "human";
  return true;
}

function eventNode(event, index, entering = false) {
  const item = document.createElement("li");
  item.className = `event event--${event.type}${entering ? " is-entering" : ""}`;
  item.dataset.type = event.type;

  const time = document.createElement("time");
  time.className = "event__time";
  time.dateTime = `2026-08-18T${event.time}:00Z`;
  time.textContent = event.time;

  const marker = document.createElement("span");
  marker.className = "event__marker";
  marker.setAttribute("aria-hidden", "true");

  const article = document.createElement("article");
  article.className = "event-card";
  article.setAttribute("aria-labelledby", `${event.id}-title`);

  const meta = document.createElement("div");
  meta.className = "event-card__meta";

  const badge = document.createElement("span");
  badge.className = "status-badge";
  badge.textContent = event.label;

  const category = document.createElement("span");
  category.className = "event-card__category";
  category.textContent = event.category;

  const sequence = document.createElement("span");
  sequence.className = "event-card__sequence";
  sequence.textContent = `#${String(index + 1).padStart(3, "0")}`;

  meta.append(badge, category, sequence);

  const title = document.createElement("h2");
  title.id = `${event.id}-title`;
  title.textContent = event.title;

  const summary = document.createElement("p");
  summary.className = "event-card__summary";
  summary.textContent = event.summary;

  const details = document.createElement("details");
  const detailsSummary = document.createElement("summary");
  detailsSummary.textContent = "Voir le contexte et la suite";
  const detailsText = document.createElement("p");
  detailsText.textContent = event.details;
  details.append(detailsSummary, detailsText);

  article.append(meta, title, summary, details);
  item.append(time, marker, article);
  return item;
}

function render(options = {}) {
  const { scrollToBottom = false, enteringId = null } = options;
  const filtered = state.events.filter(matchesFilter);
  timeline.replaceChildren();

  if (filtered.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "Aucun événement dans ce filtre";
    const copy = document.createElement("p");
    copy.textContent = "Choisis un autre statut pour retrouver l’historique.";
    content.append(title, copy);
    empty.append(content);
    timeline.append(empty);
  } else {
    const divider = document.createElement("li");
    divider.className = "date-divider";
    const dividerLabel = document.createElement("span");
    dividerLabel.textContent = "Aujourd’hui · cycle V1";
    divider.append(dividerLabel);
    timeline.append(divider);

    for (const event of filtered) {
      timeline.append(eventNode(event, state.events.indexOf(event), event.id === enteringId));
    }
  }

  updateCounts(filtered.length);
  if (scrollToBottom) {
    followLatest = true;
    requestAnimationFrame(() => {
      scrollFeedToBottom(enteringId ? "smooth" : "auto");
    });
  }
}

function updateCounts(visible) {
  const attention = state.events.filter((event) => event.type === "block" || event.type === "challenge").length;
  const passed = state.events.filter((event) => event.type === "pass").length;
  const human = state.events.filter((event) => event.type === "human").length;
  document.querySelector("#count-all").textContent = String(state.events.length);
  document.querySelector("#count-attention").textContent = String(attention);
  document.querySelector("#count-pass").textContent = String(passed);
  document.querySelector("#count-human").textContent = String(human);
  for (const count of document.querySelectorAll("[data-human-count]")) {
    count.textContent = human === 1 ? "1 requise" : `${human} requises`;
  }
  document.querySelector("#visible-count").textContent = `${visible} événement${visible > 1 ? "s" : ""} affiché${visible > 1 ? "s" : ""}`;
}

function currentTime() {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function simulateEvent() {
  const source = simulatedEvents[state.simulationIndex % simulatedEvents.length];
  state.simulationIndex += 1;
  const event = {
    ...source,
    id: `evt-sim-${Date.now()}`,
    time: currentTime(),
  };
  state.events.push(event);

  if (!matchesFilter(event)) {
    state.filter = "all";
    for (const button of filterButtons) {
      const active = button.dataset.filter === "all";
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  render({ scrollToBottom: true, enteringId: event.id });
  for (const signal of document.querySelectorAll("[data-latest-signal]")) {
    signal.textContent = "À l’instant";
  }
  showToast(`${event.label} ajouté en bas du fil`);
}

for (const button of filterButtons) {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter ?? "all";
    for (const candidate of filterButtons) {
      const active = candidate === button;
      candidate.classList.toggle("is-active", active);
      candidate.setAttribute("aria-pressed", String(active));
    }
    render({ scrollToBottom: true });
  });
}

simulateButton.addEventListener("click", simulateEvent);
jumpButton.addEventListener("click", () => {
  scrollFeedToBottom("smooth");
  showToast("Dernier événement affiché");
});

feed.addEventListener(
  "scroll",
  () => {
    followLatest = isFeedAtBottom();
  },
  { passive: true },
);

feed.addEventListener(
  "toggle",
  (event) => {
    if (!(event.target instanceof HTMLDetailsElement) || !event.target.open || !followLatest) return;
    requestAnimationFrame(() => {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      event.target.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion ? "auto" : "smooth" });
    });
  },
  true,
);

window.addEventListener("resize", () => {
  if (!followLatest) return;
  requestAnimationFrame(() => scrollFeedToBottom("auto"));
});

const projectSlug = safeProjectSlug();
document.querySelector("#project-breadcrumb").textContent = projectSlug;
document.querySelector(".brand").setAttribute("href", `/${projectSlug}`);
document.title = `${humanizeProject(projectSlug)} · Kriton Supervisor`;

render({ scrollToBottom: true });
