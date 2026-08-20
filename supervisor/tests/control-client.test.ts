import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PACKAGE_ROOT } from "../src/config.js";
import type { ControlSnapshot } from "../src/types.js";

/**
 * Minimal DOM stub: enough surface for control.js, which builds every node with
 * createElement and never assigns innerHTML. Each test file runs in its own
 * process, so replacing the globals here cannot leak into another suite.
 */
class StubElement {
  public className = "";
  public title = "";
  public href = "";
  public hidden = false;
  public children: StubElement[] = [];
  public readonly attributes = new Map<string, string>();
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

  public append(...nodes: StubElement[]): void {
    for (const node of nodes) {
      assert.ok(node instanceof StubElement, `append received a non-node on <${this.tagName}>`);
      this.children.push(node);
    }
  }

  public replaceChildren(...nodes: StubElement[]): void {
    this.own = "";
    this.children = [];
    this.append(...nodes);
  }

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  public descendants(): StubElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
}

function textNode(value: string): StubElement {
  const node = new StubElement("#text");
  node.textContent = value;
  return node;
}

function snapshot(): ControlSnapshot {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    daemon: {
      version: "1.1.0",
      level: "standard",
      database: "ok",
      queue: { pending: 0, running: 1, failed: 0 },
      telegram: "not_configured",
      activeStreams: 1,
    },
    attention: [
      {
        id: "req-1",
        projectName: "factures_platform",
        projectSlug: "factures-platform",
        source: "permission",
        title: "Autorisation requise",
        reason: "Claude demande l’autorisation d’utiliser Bash.",
        requestedAction: "Ouvre la session Claude pour autoriser ou refuser cette opération.",
        createdAt: new Date(Date.now() - 720_000).toISOString(),
        safeToContinue: false,
      },
    ],
    projects: [
      {
        name: "factures_platform",
        slug: "factures-platform",
        active: true,
        activeSessionCount: 2,
        startedAt: new Date(Date.now() - 3_600_000).toISOString(),
        lastSeenAt: new Date(Date.now() - 240_000).toISOString(),
        openHumanRequests: 1,
        queue: { pending: 0, running: 1, completed: 12, failed: 0 },
        latestAudit: {
          type: "code",
          typeLabel: "Code",
          tone: "challenge",
          label: "CHALLENGE",
          decision: "CHALLENGE",
          status: "completed",
          at: new Date(Date.now() - 240_000).toISOString(),
          summary: "Le plan de reprise reste implicite.",
        },
      },
    ],
    attentionTotal: 1,
    attentionLimit: 50,
    projectLimit: 200,
    projectsTruncated: true,
  };
}

async function renderControlClient(payload: ControlSnapshot): Promise<Map<string, StubElement>> {
  const registry = new Map<string, StubElement>();
  const lookup = (selector: string): StubElement => {
    const existing = registry.get(selector);
    if (existing) return existing;
    const created = new StubElement(selector);
    registry.set(selector, created);
    return created;
  };
  const globals = globalThis as Record<string, unknown>;
  globals.document = {
    createElement: (tag: string): StubElement => new StubElement(tag),
    createTextNode: textNode,
    querySelector: lookup,
    querySelectorAll: (selector: string): StubElement[] =>
      selector === ".panel" ? [new StubElement("section"), new StubElement("section"), new StubElement("section")] : [],
  };
  globals.window = { setInterval: (): number => 1, clearInterval: (): void => undefined };
  globals.fetch = async (): Promise<unknown> => ({ ok: true, status: 200, json: async (): Promise<unknown> => payload });

  const source = readFileSync(resolve(PACKAGE_ROOT, "ui/static/control.js"), "utf8");
  const run = eval;
  run(source);
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  return registry;
}

test("an attention row states its action once and keeps the blocking impact separate", async () => {
  const registry = await renderControlClient(snapshot());
  const list = registry.get("[data-attention-list]");
  assert.ok(list);
  assert.equal(list.children.length, 1);

  const row = list.children[0]?.children[0];
  assert.ok(row);
  assert.equal(row.tagName, "a", "an attention row links to its project thread");
  assert.equal(row.href, "/factures-platform");

  const paragraphs = row.descendants().filter((node) => node.className === "row__action");
  assert.equal(paragraphs.length, 1, "the requested action must render exactly once");
  assert.match(paragraphs[0]?.textContent ?? "", /^Action attendue : Ouvre la session Claude/u);

  const impact = row.descendants().filter((node) => node.className === "row__impact");
  assert.equal(impact.length, 1, "the blocking impact is a distinct, single line");
  assert.equal(impact[0]?.textContent, "Cette demande bloque la suite du travail concerné.");
  assert.notEqual(impact[0]?.textContent, paragraphs[0]?.textContent);

  const titles = row.descendants().filter((node) => node.className === "row__title");
  assert.equal(titles.length, 1);
  assert.equal(titles[0]?.textContent, "Autorisation requise");
});

test("states the real open request total when the attention page is capped", async () => {
  const capped = await renderControlClient({ ...snapshot(), attentionTotal: 60 });
  const note = capped.get("[data-attention-note]");
  assert.ok(note);
  assert.equal(note.hidden, false);
  assert.equal(note.textContent, "60 interventions ouvertes au total ; les 1 plus anciennes sont affichées.");
  assert.equal(capped.get("[data-attention-count]")?.textContent, "60", "the counter shows the total, not the page");
  assert.equal(
    capped.get("[data-live-summary]")?.textContent,
    "1 projet actif, 60 interventions attendues.",
    "the polite live region announces the true total",
  );

  const complete = await renderControlClient(snapshot());
  assert.equal(complete.get("[data-attention-note]")?.hidden, true);
  assert.equal(complete.get("[data-attention-count]")?.textContent, "1");
  assert.equal(complete.get("[data-live-summary]")?.textContent, "1 projet actif, 1 intervention attendue.");
});

test("the client renders the truncation note only when the daemon declares one", async () => {
  const truncated = await renderControlClient(snapshot());
  const note = truncated.get("[data-truncation]");
  assert.ok(note);
  assert.equal(note.hidden, false);
  assert.equal(note.textContent, "Liste tronquée aux 200 projets les plus récents.");

  const complete = await renderControlClient({ ...snapshot(), projectsTruncated: false });
  assert.equal(complete.get("[data-truncation]")?.hidden, true);
});
