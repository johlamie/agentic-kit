import { lstatSync, readdirSync, readFileSync, realpathSync, type Stats } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { redactText } from "./security/redact.js";

/**
 * Read-only view of the mission files an agentic project keeps under
 * `.agentic/`. Files are read on demand (only while a control-center tab asks
 * for a snapshot), never watched, never written. Every path is confined to the
 * project directory, symlinks are refused, sizes are bounded and every string
 * leaving this module is redacted.
 */

export type GateStatus = "done" | "waiting" | "blocked" | "pending" | "na";
export type MissionState = "waiting" | "blocked" | "running" | "done" | "paused";

export interface MissionGate { id: string; label: string; status: GateStatus; date: string | null; decision: string | null }
export interface MissionSlice {
  name: string; role: string; status: string;
  reviewer: string | null; qa: string | null; visual: string | null; notes: string | null;
}
export interface RepairLoop { approach: string; attempts: number; lastFailure: string | null; next: string | null }
export interface PendingApproval { file: string; requestedAt: string | null; tool: string | null; detail: string | null; reason: string }

export interface MissionView {
  idea: string;
  requestedProfile: string;
  effectiveProfile: string;
  phase: string;
  nextStep: string | null;
  gates: MissionGate[];
  waiting: string[];
  definitionOfDone: string[];
  journal: string[];
  done: boolean;
  updatedAt: string | null;
}

export interface ProjectFiles {
  name: string;
  path: string;
  mission: MissionView | null;
  slices: MissionSlice[];
  slicesDeclared: boolean;
  repairLoops: RepairLoop[];
  approvals: PendingApproval[];
  decisions: string[];
  production: boolean;
  grants: string[];
  lastActivityAt: string | null;
}

const MAX_FILE_BYTES = 256 * 1024;
const MAX_APPROVALS = 50;
const PROJECT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const GATE_IDS = ["G1", "G2", "G3", "G4"];

function clean(value: string, max = 400): string {
  return redactText(value.replace(/\s+/gu, " ").trim(), max);
}

function isInside(child: string, parent: string): boolean {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

function lstat(path: string): Stats | null {
  try { return lstatSync(path); } catch { return null; }
}

/** Read a regular file inside `root`, refusing symlinks anywhere below the root. */
export function readConfined(root: string, relative: string): { text: string; mtime: Date } | null {
  let realRoot: string;
  try { realRoot = realpathSync(root); } catch { return null; }
  let current = realRoot;
  for (const part of relative.split("/")) {
    current = join(current, part);
    const info = lstat(current);
    if (!info || info.isSymbolicLink()) return null;
  }
  const info = lstat(current);
  if (!info?.isFile() || info.size > MAX_FILE_BYTES || !isInside(current, realRoot)) return null;
  try { return { text: readFileSync(current, "utf8"), mtime: info.mtime }; } catch { return null; }
}

function listConfined(root: string, relative: string): string[] {
  let realRoot: string;
  try { realRoot = realpathSync(root); } catch { return []; }
  let current = realRoot;
  for (const part of relative.split("/")) {
    current = join(current, part);
    const info = lstat(current);
    if (!info || info.isSymbolicLink()) return [];
  }
  if (!lstat(current)?.isDirectory()) return [];
  try { return readdirSync(current).sort(); } catch { return []; }
}

function section(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && /^##\s/u.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

function bullets(text: string, limit: number): string[] {
  return text.split(/\r?\n/u)
    .map((line) => line.match(/^\s*[-*]\s+(.*)$/u)?.[1] ?? null)
    .filter((line): line is string => Boolean(line && line.trim() && !/^\(rien\)$|^\(none\)$|^\(selon le profil\)$/iu.test(line.trim())))
    .slice(0, limit)
    .map((line) => clean(line, 500));
}

function field(markdown: string, label: string): string | null {
  const match = markdown.match(new RegExp(`^\\s*-\\s*${label}\\s*:\\s*(.+)$`, "imu"));
  return match?.[1] ? clean(match[1], 300) : null;
}

/** Markdown table → rows keyed by lower-cased header. */
export function parseTable(text: string): Array<Record<string, string>> {
  const rows = text.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.startsWith("|"));
  if (rows.length < 2) return [];
  const cells = (line: string): string[] => line.replace(/^\|/u, "").replace(/\|$/u, "").split("|").map((cell) => cell.trim());
  const header = cells(rows[0] ?? "").map((cell) => cell.toLowerCase());
  return rows.slice(1)
    .filter((line) => !/^\|?\s*:?-{2,}/u.test(line))
    .map((line) => {
      const values = cells(line);
      return Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""]));
    })
    .filter((row) => Object.values(row).some((value) => value !== ""));
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const found = Object.entries(row).find(([header]) => header === key || header.startsWith(`${key} `) || header.startsWith(`${key}/`));
    if (found?.[1]) return found[1];
  }
  return "";
}

export function gateStatus(text: string): GateStatus {
  const value = text.toLowerCase();
  if (/bloqu|block/u.test(value)) return "blocked";
  if (/hors profil|n\/a|sans objet/u.test(value)) return "na";
  if (/à toi|a toi|présentée|presentee|attend ta|en attente de toi|waiting for/u.test(value)) return "waiting";
  if (/valid|approuv|passée|passee|accept|défaut lab|defaut lab|en prod|done|✓/u.test(value)) return "done";
  return "pending";
}

export function parseMission(markdown: string, mtime: Date | null): MissionView | null {
  const ideaBlock = section(markdown, "Idée").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).join(" ");
  if (!ideaBlock || /^\(aucune mission\)$/iu.test(ideaBlock)) return null;
  const requested = (field(markdown, "Demandé") ?? "supervised").split(/\s/u)[0] ?? "supervised";
  const effective = (field(markdown, "Effectif") ?? requested).split(/\s/u)[0] ?? requested;
  const gates: MissionGate[] = parseTable(section(markdown, "Portes")).slice(0, 8).map((row, index) => {
    const label = pick(row, "porte", "gate") || GATE_IDS[index] || `G${index + 1}`;
    return {
      id: label.match(/G\d/iu)?.[0]?.toUpperCase() ?? GATE_IDS[index] ?? `G${index + 1}`,
      label: clean(label, 80),
      status: gateStatus(pick(row, "statut", "status")),
      date: clean(pick(row, "date"), 40) || null,
      decision: clean(pick(row, "décision", "decision"), 300) || null,
    };
  });
  const phase = field(markdown, "Actuelle") ?? "—";
  return {
    idea: clean(ideaBlock, 300),
    requestedProfile: clean(requested, 30),
    effectiveProfile: clean(effective, 30),
    phase,
    nextStep: field(markdown, "Prochaine étape"),
    gates,
    waiting: bullets(section(markdown, "En attente de toi"), 20),
    definitionOfDone: bullets(section(markdown, "Definition of Done"), 10),
    journal: bullets(section(markdown, "Journal"), 200).slice(-5),
    done: /termin|livr|shipped|\bdone\b/iu.test(phase),
    updatedAt: mtime ? mtime.toISOString() : null,
  };
}

export function parseOrchestrator(markdown: string): { slices: MissionSlice[]; declared: boolean; repairLoops: RepairLoop[] } {
  const slices = parseTable(section(markdown, "Routing")).slice(0, 60).map((row) => ({
    name: clean(pick(row, "slice", "slice / task", "task"), 120),
    role: clean(pick(row, "role", "rôle"), 40),
    status: clean(pick(row, "status", "statut"), 80),
    reviewer: clean(pick(row, "reviewer"), 30) || null,
    qa: clean(pick(row, "qa"), 30) || null,
    visual: clean(pick(row, "visual", "visuel"), 30) || null,
    notes: clean(pick(row, "notes"), 200) || null,
  })).filter((slice) => slice.name);
  const repairLoops = parseTable(section(markdown, "Repair loops (stop at 3 on the same approach)") || section(markdown, "Repair loops"))
    .slice(0, 30)
    .map((row) => ({
      approach: clean(pick(row, "approach", "approche"), 160),
      attempts: Number.parseInt(pick(row, "attempts", "tentatives"), 10) || 0,
      lastFailure: clean(pick(row, "last failure", "dernier échec"), 200) || null,
      next: clean(pick(row, "next alternative", "next", "alternative"), 200) || null,
    }))
    .filter((loop) => loop.approach);
  return { slices, declared: slices.length > 0, repairLoops };
}

function readApprovals(projectPath: string): PendingApproval[] {
  const names = listConfined(projectPath, ".agentic/approvals").filter((name) => name.endsWith(".json"));
  const approvals: PendingApproval[] = [];
  for (const name of names) {
    if (approvals.length >= MAX_APPROVALS) break;
    const file = readConfined(projectPath, `.agentic/approvals/${name}`);
    if (!file) continue;
    try {
      const data = JSON.parse(file.text) as Record<string, unknown>;
      if (data.status !== "pending") continue;
      approvals.push({
        file: clean(name, 120),
        requestedAt: typeof data.requested_at === "string" ? clean(data.requested_at, 40) : null,
        tool: typeof data.tool === "string" ? clean(data.tool, 40) : null,
        detail: typeof data.detail === "string" ? clean(data.detail, 300) : null,
        reason: typeof data.reason === "string" ? clean(data.reason, 600) : "Confirmation demandée",
      });
    } catch { /* not a record */ }
  }
  return approvals;
}

function lastDecisions(markdown: string): string[] {
  return markdown.split(/\r?\n/u)
    .filter((line) => /^\s*-\s+\S|^#{2,3}\s+\S/u.test(line))
    .slice(-6)
    .map((line) => clean(line.replace(/^\s*-\s+|^#{2,3}\s+/u, ""), 300));
}

function listedLines(path: string): Set<string> {
  try {
    return new Set(readFileSync(path, "utf8").split(/\r?\n/u)
      .map((line) => line.replace(/#.*/u, "").trim()).filter(Boolean));
  } catch { return new Set(); }
}

function grantsFor(grantsDir: string, name: string): string[] {
  if (!PROJECT_NAME.test(name)) return [];
  const file = readConfined(grantsDir, name);
  if (!file) return [];
  return file.text.split(/\r?\n/u).map((line) => line.replace(/#.*/u, "").replace(/\s+/gu, " ").trim()).filter(Boolean).slice(0, 40);
}

export interface MissionSources {
  productionList: string;
  grantsDir: string;
}

export function readProjectFiles(projectPath: string, sources: MissionSources, production = listedLines(sources.productionList)): ProjectFiles {
  const path = resolve(projectPath);
  const name = basename(path);
  const missionFile = readConfined(path, ".agentic/memory/MISSION.md");
  const mission = missionFile ? parseMission(missionFile.text, missionFile.mtime) : null;
  const grants = grantsFor(sources.grantsDir, name);
  if (mission && mission.requestedProfile === "lab") {
    mission.effectiveProfile = grants.includes("profile lab") ? "lab" : "supervised";
  }
  const orchestratorFile = readConfined(path, ".agentic/memory/ORCHESTRATOR.md");
  const orchestrator = orchestratorFile ? parseOrchestrator(orchestratorFile.text) : { slices: [], declared: false, repairLoops: [] };
  const decisionsFile = readConfined(path, ".agentic/memory/DECISIONS.md");
  const stateFile = readConfined(path, ".agentic/memory/PROJECT_STATE.md");
  const times = [missionFile?.mtime, orchestratorFile?.mtime, stateFile?.mtime, decisionsFile?.mtime]
    .filter((time): time is Date => Boolean(time)).map((time) => time.getTime());
  return {
    name,
    path,
    mission,
    slices: orchestrator.slices,
    slicesDeclared: orchestrator.declared,
    repairLoops: orchestrator.repairLoops,
    approvals: readApprovals(path),
    decisions: decisionsFile ? lastDecisions(decisionsFile.text) : [],
    production: production.has(name),
    grants,
    lastActivityAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
  };
}

/** Projects directly under the projects root: real directories carrying a Git or kit marker. */
export function listPortfolio(projectsRoot: string, limit = 200): string[] {
  let realRoot: string;
  try { realRoot = realpathSync(projectsRoot); } catch { return []; }
  let names: string[];
  try { names = readdirSync(realRoot).sort(); } catch { return []; }
  const found: string[] = [];
  for (const name of names) {
    if (found.length >= limit) break;
    if (!PROJECT_NAME.test(name)) continue;
    const dir = join(realRoot, name);
    const info = lstat(dir);
    if (!info?.isDirectory() || info.isSymbolicLink()) continue;
    if (lstat(join(dir, ".agentic"))?.isDirectory() || lstat(join(dir, ".git"))) found.push(dir);
  }
  return found;
}

export function productionSet(productionList: string): Set<string> {
  return listedLines(productionList);
}
