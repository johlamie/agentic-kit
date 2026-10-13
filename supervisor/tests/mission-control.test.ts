import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildControlSnapshot } from "../src/activity.js";
import { SupervisorDatabase } from "../src/db.js";
import { commandIn, queuedTitle } from "../src/mission-control.js";
import { gateStatus, parseMission, parseOrchestrator, readConfined } from "../src/missions.js";
import type { EventType, NormalizedEvent } from "../src/types.js";
import { testConfig } from "./helpers.js";

const MISSION = `# MISSION
> Owner: orchestrator (sole writer).

## Idée
App de vérification de diplômes

## Profil
- Demandé : lab
- Effectif : supervised (vérifier avec \`agentic mission status\`)

## Phase
- Actuelle : 1 — cadrage (product-manager → SPEC.md)
- Prochaine étape : produire SPEC.md puis présenter G1

## Portes
| Porte | Statut | Date | Décision |
|---|---|---|---|
| G1 périmètre | présentée, à toi | 2026-10-12 | SPEC.md prêt |
| G2 stack et budget | en attente | | |
| G3 design | en attente | | |
| G4 mise en ligne | en attente (toujours humaine) | | |

## En attente de toi
- Le profil lab est demandé mais pas accordé : tape \`agentic grant <projet> profile lab\`.
- Choisir entre SMS et e-mail pour l'envoi des codes

## Definition of Done
- G1 à G4 décidés par l'utilisateur.

## Journal
- 2026-10-12 10:00 UTC — mission créée.
`;

const ORCHESTRATOR = `# ORCHESTRATOR

## Routing
| Slice | Role | Status | Reviewer | QA | Visual | Notes |
|---|---|---|---|---|---|---|
| 0 · UI kit | builder | terminée | PASS | PASS | PASS | |
| 1 · Vérification | builder | en cours | | | | |

## Repair loops (stop at 3 on the same approach)
| Approach | Attempts | Last failure | Next alternative |
|---|---|---|---|
| Lecture QR native | 2 | caméra refusée sur Android 10 | lib zxing |
`;

function event(projectPath: string, type: EventType, id: string, overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id, timestamp: new Date().toISOString(), producer: "claude", project_id: "ignored", project_path: projectPath,
    claude_session_id: "mission-session", event_type: type, agent_type: null, agent_id: null, candidate_id: null,
    audit_target: null, transcript_path: null, agent_transcript_path: null, last_message: null, metadata: {}, ...overrides,
  };
}

function missionProject(root: string, name: string, approvals: Array<Record<string, unknown>> = []): string {
  const project = join(root, name);
  mkdirSync(join(project, ".agentic/memory"), { recursive: true });
  mkdirSync(join(project, ".agentic/approvals"), { recursive: true });
  writeFileSync(join(project, ".agentic/memory/MISSION.md"), MISSION);
  writeFileSync(join(project, ".agentic/memory/ORCHESTRATOR.md"), ORCHESTRATOR);
  writeFileSync(join(project, ".agentic/memory/DECISIONS.md"), "# DECISIONS\n- 2026-10-12 Next.js + Supabase retenus\n");
  approvals.forEach((record, index) => writeFileSync(join(project, `.agentic/approvals/${index}.json`), JSON.stringify(record)));
  return project;
}

test("parses the mission file the kit writes: gates, waiting lines, profile and journal", () => {
  const mission = parseMission(MISSION, new Date());
  assert.ok(mission);
  assert.equal(mission.idea, "App de vérification de diplômes");
  assert.equal(mission.requestedProfile, "lab");
  assert.equal(mission.effectiveProfile, "supervised");
  assert.equal(mission.phase, "1 — cadrage (product-manager → SPEC.md)");
  assert.deepEqual(mission.gates.map((gate) => [gate.id, gate.status]), [["G1", "waiting"], ["G2", "pending"], ["G3", "pending"], ["G4", "pending"]]);
  assert.equal(mission.gates[0]?.decision, "SPEC.md prêt");
  assert.equal(mission.waiting.length, 2);
  assert.deepEqual(mission.journal, ["2026-10-12 10:00 UTC — mission créée."]);
  assert.equal(parseMission(MISSION.replace("App de vérification de diplômes", "(aucune mission)"), null), null, "the empty template is no mission");
  for (const [text, status] of [["validée", "done"], ["défaut lab", "done"], ["bloquée", "blocked"], ["hors profil", "na"], ["à toi", "waiting"], ["en attente", "pending"]] as const) {
    assert.equal(gateStatus(text), status, text);
  }
});

test("parses slices with verdicts and repair loops from ORCHESTRATOR.md", () => {
  const parsed = parseOrchestrator(ORCHESTRATOR);
  assert.equal(parsed.declared, true);
  assert.deepEqual(parsed.slices[0], { name: "0 · UI kit", role: "builder", status: "terminée", reviewer: "PASS", qa: "PASS", visual: "PASS", notes: null });
  assert.deepEqual(parsed.repairLoops, [{ approach: "Lecture QR native", attempts: 2, lastFailure: "caméra refusée sur Android 10", next: "lib zxing" }]);
  assert.equal(parseOrchestrator("# ORCHESTRATOR\n\n## Routing\n| Slice | Role |\n|---|---|\n").declared, false);
});

test("refuses symlinked mission files and anything outside the project", () => {
  const root = mkdtempSync(join(tmpdir(), "mission-confined-"));
  const project = join(root, "demo");
  mkdirSync(join(project, ".agentic"), { recursive: true });
  writeFileSync(join(root, "secret.md"), "SECRET");
  symlinkSync(join(root, "secret.md"), join(project, ".agentic/linked.md"));
  mkdirSync(join(root, "elsewhere"));
  writeFileSync(join(root, "elsewhere/MISSION.md"), MISSION);
  symlinkSync(join(root, "elsewhere"), join(project, ".agentic/memory"));
  assert.equal(readConfined(project, ".agentic/linked.md"), null);
  assert.equal(readConfined(project, ".agentic/memory/MISSION.md"), null);
  assert.equal(readConfined(project, "../secret.md"), null);
  rmSync(root, { recursive: true, force: true });
});

test("extracts a pasteable command and fills the project placeholder", () => {
  assert.equal(commandIn("Confirm, or record `agentic grant <project> push main` to allow it.", "talendici"), "agentic grant talendici push main");
  assert.equal(commandIn("Tape `! agentic grant <projet> profile lab`.", "sceau"), "agentic grant sceau profile lab");
  assert.equal(commandIn("La branche `main` est protégée.", "sceau"), null, "code that is not a command is not offered");
});

test("the snapshot ranks what waits for the user and never leaks absolute paths", () => {
  const config = testConfig();
  mkdirSync(config.projectsRoot, { recursive: true });
  const project = missionProject(config.projectsRoot, "sceau", [
    { status: "pending", requested_at: "2026-10-12T09:00:00Z", tool: "Bash", detail: "git push origin main",
      reason: "'sceau' is in production: This push changes `main`, a protected branch of a production project. Confirm, or record `agentic grant <project> push main` to allow it." },
    { status: "resolved", reason: "old" },
  ]);
  mkdirSync(join(config.projectsRoot, "plain/.git"), { recursive: true });
  writeFileSync(config.productionList, "sceau\n");
  const database = new SupervisorDatabase(config.databasePath);
  const raw = JSON.stringify(buildControlSnapshot(database, config, { telegramConfigured: false, activeStreams: 0 }));
  const mc = (JSON.parse(raw) as { missionControl: import("../src/mission-control.js").MissionControl }).missionControl;

  assert.equal(raw.includes(config.projectsRoot), false, "no absolute path in the snapshot");
  assert.equal(raw.includes(project), false);
  assert.doesNotMatch(raw, /"[^"]*\/tmp\//u);

  const sceau = mc.projects.find((item) => item.name === "sceau");
  assert.ok(sceau);
  assert.equal(sceau.state, "waiting");
  assert.equal(sceau.production, true);
  assert.equal(sceau.mission?.effectiveProfile, "supervised", "lab without a grant stays supervised");
  assert.equal(sceau.pendingApprovals, 1, "resolved approvals are not pending");
  assert.equal(sceau.slices.length, 2);
  assert.deepEqual(sceau.decisions, ["2026-10-12 Next.js + Supabase retenus"]);
  assert.equal(mc.projects.find((item) => item.name === "plain")?.state, "none");

  assert.deepEqual(mc.waiting.map((item) => [item.kind, item.priority]), [["gate", 1], ["queued", 2], ["mission", 2], ["grant", 3]]);
  assert.equal(mc.waiting.find((item) => item.kind === "queued")?.command, "agentic grant sceau push main");
  assert.equal(mc.waiting.find((item) => item.kind === "queued")?.title, "Autoriser le push sur main de sceau ?", "the guard's English reason is not shown as the title");
  assert.equal(queuedTitle(null, "Bash", "sceau"), "Action protégée en attente de ton accord sur sceau (Bash)");
  assert.equal(mc.waiting.find((item) => item.kind === "grant")?.command, "agentic grant sceau profile lab");
  assert.equal(mc.waiting.filter((item) => item.kind === "mission").length, 1, "the lab line is not repeated as a mission item");
  assert.deepEqual(mc.blocked.map((flag) => flag.text), ["porte G1 à valider"]);
  assert.deepEqual(mc.watch.map((flag) => flag.meta), ["réparation 2/3"]);

  mkdirSync(config.grantsDir, { recursive: true });
  writeFileSync(join(config.grantsDir, "sceau"), "profile lab\n");
  const granted = buildControlSnapshot(database, config, { telegramConfigured: false, activeStreams: 0 }).missionControl;
  assert.equal(granted.projects.find((item) => item.name === "sceau")?.mission?.effectiveProfile, "lab");
  assert.equal(granted.waiting.some((item) => item.kind === "grant"), false);

  database.close();
  rmSync(config.dataDir, { recursive: true, force: true });
});

test("runs carry their mode, active subagents and a silence flag", () => {
  const config = testConfig();
  mkdirSync(config.projectsRoot, { recursive: true });
  const project = missionProject(config.projectsRoot, "talendici");
  const database = new SupervisorDatabase(config.databasePath);
  const old = new Date(Date.now() - 30 * 60_000).toISOString();
  database.insertEvent(event(project, "session.started", "s1", { timestamp: old, metadata: { unattended: true } }));
  database.insertEvent(event(project, "agent.started", "a1", { timestamp: old, agent_type: "builder", agent_id: "b-1" }));
  database.insertEvent(event(project, "agent.started", "a2", { timestamp: old, agent_type: "qa", agent_id: "q-1" }));
  database.insertEvent(event(project, "agent.completed", "a3", { timestamp: old, agent_type: "builder", agent_id: "b-1" }));
  const mc = buildControlSnapshot(database, config, { telegramConfigured: false, activeStreams: 0 }).missionControl;
  assert.equal(mc.runs.length, 1);
  const run = mc.runs[0];
  assert.equal(run?.unattended, true);
  assert.deepEqual(run?.agents.map((agent) => agent.role), ["qa"]);
  assert.equal(run?.silent, true, "no event for 30 minutes marks the run silent");
  assert.equal(run?.projectKey, mc.projects.find((item) => item.name === "talendici")?.key, "the run links to its project view");
  assert.ok(mc.watch.some((flag) => flag.text === "Claude sans signal"));
  database.close();
  rmSync(config.dataDir, { recursive: true, force: true });
});
