import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PACKAGE_ROOT } from "../src/config.js";
import type { ControlProjectView, MissionControl } from "../src/mission-control.js";
import type { ControlSnapshot } from "../src/types.js";

/**
 * Minimal DOM stub: enough surface for control.js, which builds every node with
 * createElement/createElementNS and never parses markup. textContent rejects
 * anything but strings, so a regression to markup strings fails loudly. Each
 * test file runs in its own process: replacing the globals cannot leak.
 */
class StubElement {
  public className = "";
  public href = "";
  public hidden = false;
  public children: StubElement[] = [];
  public parentNode: StubElement | null = null;
  public readonly attributes = new Map<string, string>();
  public readonly listeners = new Map<string, Array<() => void>>();
  private own = "";

  public constructor(public readonly tagName: string) {}

  public readonly classList = {
    toggle: (name: string, on: boolean): void => {
      const classes = new Set(this.className.split(" ").filter(Boolean));
      if (on) classes.add(name);
      else classes.delete(name);
      this.className = [...classes].join(" ");
    },
  };

  public set textContent(value: string) {
    assert.equal(typeof value, "string", `textContent must be a string on <${this.tagName}>`);
    this.own = value;
    this.children = [];
  }

  public get textContent(): string {
    return this.own + this.children.map((child) => child.textContent).join("");
  }

  public get firstChild(): StubElement | null { return this.children[0] ?? null; }

  public appendChild(node: StubElement): StubElement {
    assert.ok(node instanceof StubElement, `appendChild received a non-node on <${this.tagName}>`);
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  public removeChild(node: StubElement): void {
    this.children = this.children.filter((child) => child !== node);
  }

  public setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  public getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  public removeAttribute(name: string): void { this.attributes.delete(name); }
  public addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  public descendants(): StubElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }

  public byClass(name: string): StubElement[] {
    return this.descendants().filter((node) => (node.className || node.attributes.get("class") || "").split(" ").includes(name));
  }
}

interface ClientApi {
  render(): void;
  state: { snapshot: ControlSnapshot | null; filter: string };
}

function loadClient(): { api: ClientApi; registry: Map<string, StubElement>; location: { hash: string } } {
  const registry = new Map<string, StubElement>();
  const lookup = (selector: string): StubElement => {
    const existing = registry.get(selector);
    if (existing) return existing;
    const created = new StubElement(selector);
    registry.set(selector, created);
    return created;
  };
  const location = { hash: "#/" };
  const globals = globalThis as Record<string, unknown>;
  const window: Record<string, unknown> = { KRITON_CONTROL_NO_BOOT: true, addEventListener: (): void => undefined };
  globals.window = window;
  globals.location = location;
  globals.document = {
    readyState: "complete",
    body: new StubElement("body"),
    createElement: (tag: string): StubElement => new StubElement(tag),
    createElementNS: (_ns: string, tag: string): StubElement => new StubElement(tag),
    createTextNode: (value: string): StubElement => { const node = new StubElement("#text"); node.textContent = value; return node; },
    querySelector: lookup,
    querySelectorAll: (): StubElement[] => [],
    addEventListener: (): void => undefined,
  };
  const source = readFileSync(resolve(PACKAGE_ROOT, "ui/static/control.js"), "utf8");
  const run = eval;
  run(source);
  return { api: window.KritonControl as ClientApi, registry, location };
}

const minutesAgo = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

function project(overrides: Partial<ControlProjectView>): ControlProjectView {
  return {
    key: "k-talendici", name: "talendici", slug: "talendici", displayPath: "~/projects/talendici",
    state: "running", active: true, production: true, lastActivityAt: minutesAgo(1), openRequests: 0, latestAudit: null,
    mission: {
      idea: "Plateforme d’emploi", requestedProfile: "supervised", effectiveProfile: "supervised",
      phase: "6 · Build", nextStep: "QA de « Formation »",
      gates: ["G1", "G2", "G3", "G4"].map((id) => ({ id, label: id, status: "done" as const, date: null, decision: null })),
      waiting: [], definitionOfDone: ["Livré, G4 passé"], journal: ["mission créée"],
    },
    slices: [
      { name: "0 · UI kit", role: "builder", status: "terminée", reviewer: "PASS", qa: "PASS", visual: "PASS", notes: null },
      { name: "1 · Formation", role: "qa", status: "QA en cours", reviewer: "PASS", qa: null, visual: null, notes: null },
    ],
    slicesDeclared: true, repairLoops: [{ approach: "source ReliefWeb", attempts: 2, lastFailure: "timeout", next: null }],
    pendingApprovals: 1, decisions: ["Scraper hébergé sur la VPS"], grants: ["checkout-not-served"],
    ...overrides,
  };
}

function missionControl(overrides: Partial<MissionControl> = {}): MissionControl {
  const sceau = project({
    key: "k-sceau", name: "sceau", slug: null, displayPath: "~/projects/sceau", state: "waiting", active: false, production: false,
    mission: { idea: "Vérification de diplômes", requestedProfile: "supervised", effectiveProfile: "supervised", phase: "1 · Cadrage",
      nextStep: "Valider SPEC.md", gates: [{ id: "G1", label: "G1", status: "waiting", date: null, decision: null }],
      waiting: [], definitionOfDone: [], journal: [] },
    slices: [], slicesDeclared: false, repairLoops: [], pendingApprovals: 0, decisions: [], grants: [],
  });
  const empty = project({ key: "k-factures", name: "factures", state: "none", mission: null, slices: [], slicesDeclared: false, repairLoops: [], active: false });
  return {
    projects: [project({}), sceau, empty],
    waiting: [
      { id: "gate-1", kind: "gate", priority: 1, projectKey: "k-sceau", projectName: "sceau", title: "Valider la porte G1 de sceau",
        unblocks: "débloque toute la mission", why: "Prochaine étape : Valider SPEC.md", command: "cd ~/projects/sceau && agentic run claude", since: minutesAgo(120) },
      { id: "queued-1", kind: "queued", priority: 2, projectKey: "k-talendici", projectName: "talendici", title: "Push vers main",
        unblocks: "mis en file pendant un run sans surveillance", why: "git push origin main", command: "agentic grant talendici push main", since: minutesAgo(47) },
      { id: "mission-1", kind: "mission", priority: 2, projectKey: "k-talendici", projectName: "talendici", title: "Choisir le fournisseur SMS",
        unblocks: null, why: null, command: null, since: minutesAgo(10) },
      { id: "grant-1", kind: "grant", priority: 3, projectKey: "k-sceau", projectName: "sceau", title: "Profil lab demandé",
        unblocks: null, why: null, command: "agentic grant sceau profile lab", since: minutesAgo(5) },
    ],
    blocked: [{ projectKey: "k-sceau", projectName: "sceau", text: "porte G1 à valider", meta: "1 · Cadrage", tone: "human" }],
    watch: [{ projectKey: "k-talendici", projectName: "talendici", text: "source ReliefWeb", meta: "réparation 2/3", tone: "challenge" }],
    runs: [{ id: "run-1", projectKey: "k-talendici", projectName: "talendici", tool: "Claude", unattended: true,
      startedAt: minutesAgo(72), lastSignalAt: minutesAgo(1), silent: false, agents: [{ role: "qa", since: minutesAgo(6) }] }],
    activity: [{ id: "a1", at: minutesAgo(3), tone: "pass", label: "PASS", projectName: "talendici", title: "Reviewer PASS" }],
    audits: [],
    counts: { waiting: 4, blocked: 1, runs: 1, missions: 2, gates: 1, audits: 0 },
    projectsRoot: "~/projects",
    ...overrides,
  };
}

function snapshot(mc: MissionControl = missionControl()): ControlSnapshot {
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    daemon: { version: "1.2.0", level: "standard", database: "ok", queue: { pending: 0, running: 1, failed: 0 }, telegram: "configured", activeStreams: 1 },
    attention: [], attentionTotal: 0, attentionLimit: 50,
    projects: [], projectLimit: 200, projectsTruncated: false,
    missionControl: mc,
  };
}

function render(hash: string, mc?: MissionControl): StubElement {
  const { api, registry, location } = loadClient();
  location.hash = hash;
  api.state.snapshot = snapshot(mc);
  api.render();
  const page = registry.get("[data-page]");
  assert.ok(page);
  return page;
}

test("the overview ranks the three most urgent actions, each with its reason and command", () => {
  const page = render("#/");
  const now = page.byClass("card--now")[0];
  assert.ok(now, "the Maintenant card is rendered");
  const actions = now.byClass("action");
  assert.equal(actions.length, 3, "only the top three actions are on the overview");
  assert.match(actions[0]?.textContent ?? "", /^!Porte · Valider la porte G1 de sceau/u);
  assert.ok(actions[0]?.className.includes("is-first"));
  assert.match(actions[0]?.textContent ?? "", /débloque toute la mission · Prochaine étape : Valider SPEC\.md/u);
  const code = actions[0]?.descendants().find((node) => node.tagName === "code");
  assert.equal(code?.textContent, "cd ~/projects/sceau && agentic run claude");
  const copy = actions[0]?.byClass("copy")[0];
  assert.equal(copy?.getAttribute("aria-label"), "Copier la commande cd ~/projects/sceau && agentic run claude");
  assert.equal(actions[2]?.descendants().some((node) => node.tagName === "code"), false, "no command row without a command");
  assert.ok(now.descendants().some((node) => node.tagName === "a" && node.href === "#/attente"), "a link leads to the full list");
});

test("blocked and watch banners only render when something is blocked or worth watching", () => {
  const busy = render("#/");
  assert.equal(busy.byClass("banner--block").length, 1);
  assert.equal(busy.byClass("banner--watch").length, 1);
  assert.match(busy.byClass("banner--block")[0]?.textContent ?? "", /Bloqué : 1 mission n’avance plus sans toi\./u);
  const calm = render("#/", missionControl({ blocked: [], watch: [], waiting: [] }));
  assert.equal(calm.byClass("banner").length, 0);
  assert.match(calm.textContent, /Rien n’attend ta décision/u);
});

test("the waiting page lists every item in the daemon's priority order", () => {
  const page = render("#/attente");
  const titles = page.byClass("action__title").map((node) => node.textContent);
  assert.deepEqual(titles, [
    "Porte · Valider la porte G1 de sceau",
    "En file · Push vers main",
    "Mission · Choisir le fournisseur SMS",
    "Autorisation · Profil lab demandé",
  ]);
});

test("a project page shows its mission, slices with verdicts and repair loops", () => {
  const page = render("#/projet/k-talendici");
  assert.match(page.textContent, /talendici/u);
  const rows = page.descendants().filter((node) => node.tagName === "tr");
  assert.equal(rows.length, 3, "header plus two slices");
  assert.match(rows[1]?.textContent ?? "", /0 · UI kitbuilderterminéePASSPASSPASS/u);
  assert.match(page.textContent, /2\/3 source ReliefWeb — timeout/u);
  assert.match(page.textContent, /checkout-not-served/u);
  const sceau = render("#/projet/k-sceau");
  assert.match(sceau.textContent, /Slices non renseignées dans ORCHESTRATOR\.md\./u);
  const missing = render("#/projet/unknown");
  assert.match(missing.textContent, /Projet introuvable/u);
});

test("the portfolio filters projects by state and counts each filter", () => {
  const { api, registry, location } = loadClient();
  location.hash = "#/projets";
  api.state.snapshot = snapshot();
  api.render();
  const page = registry.get("[data-page]") as StubElement;
  const filters = page.byClass("filter");
  assert.deepEqual(filters.map((node) => node.textContent), ["Tous3", "En attente1", "En cours1", "Bloqués0", "Terminés0", "Sans mission1"]);
  assert.equal(page.descendants().filter((node) => node.tagName === "tr").length, 4);
  api.state.filter = "none";
  api.render();
  const rows = (registry.get("[data-page]") as StubElement).descendants().filter((node) => node.tagName === "tr");
  assert.equal(rows.length, 2, "header plus the project without a mission");
  assert.match(rows[1]?.textContent ?? "", /facturesaucune missionSans mission/u);
});

test("runs show their mode and active subagents; the live region states the totals", () => {
  const { api, registry, location } = loadClient();
  location.hash = "#/runs";
  api.state.snapshot = snapshot();
  api.render();
  const page = registry.get("[data-page]") as StubElement;
  assert.match(page.textContent, /sans surveillance/u);
  assert.match(page.textContent, /qadepuis 6 min/u);
  assert.equal(registry.get("[data-live-summary]")?.textContent, "4 éléments t’attendent, 1 mission bloquée, 1 run en cours.");
});

test("before the first snapshot the page states it is loading, never a blank screen", () => {
  const { api, registry } = loadClient();
  api.render();
  assert.match(registry.get("[data-page]")?.textContent ?? "", /Lecture de l’état de la supervision/u);
});
