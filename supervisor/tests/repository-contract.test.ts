import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PACKAGE_ROOT } from "../src/config.js";

const repositoryRoot = resolve(PACKAGE_ROOT, "..");

test("preserves Claude G1-G4 and the original permission tiers", () => {
  const contract = readFileSync(resolve(repositoryRoot, "global/CLAUDE.md"), "utf8");
  const pipeline = readFileSync(resolve(repositoryRoot, "global/skills/delivery-pipeline/SKILL.md"), "utf8");
  for (const gate of ["G1", "G2", "G3", "G4"]) {
    assert.match(contract, new RegExp(`\\b${gate}\\b`, "u"));
    assert.match(pipeline, new RegExp(`\\b${gate}\\b`, "u"));
  }
  assert.match(contract, /existing G1-G4 waits always remain in force/iu);
  assert.match(pipeline, /GATE G4.*remains human/isu);

  const settings = JSON.parse(readFileSync(resolve(repositoryRoot, "global/settings.json"), "utf8")) as {
    permissions: { defaultMode: string; allow: string[]; ask: string[]; deny: string[] };
    hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>;
  };
  assert.equal(settings.permissions.defaultMode, "auto");
  assert.ok(settings.permissions.deny.includes("Read(~/.ssh/**)"));
  assert.ok(settings.permissions.deny.includes("Bash(sudo rm:*)"));
  assert.ok(settings.permissions.ask.includes("Bash(npx prisma migrate deploy:*)"));
  assert.ok(settings.permissions.allow.includes("Bash(git push:*)"));
  const guard = settings.hooks.PreToolUse?.find((entry) => entry.hooks.some((hook) => hook.command.endsWith("agent-guard.sh")));
  assert.match(guard?.matcher ?? "", /Bash.*Edit.*Write/u);
  const notificationMatchers = new Set((settings.hooks.Notification ?? []).map((entry) => entry.matcher));
  for (const matcher of ["permission_prompt", "idle_prompt", "elicitation_dialog", "agent_needs_input"]) {
    assert.equal(notificationMatchers.has(matcher), true, `missing Notification matcher: ${matcher}`);
  }
  const supervisorLauncher = readFileSync(resolve(repositoryRoot, "global/hooks/supervisor-hook.sh"), "utf8");
  assert.match(supervisorLauncher, /readlink -f "\$\{BASH_SOURCE\[0\]\}"/u);
});

test("all schemas, prompts, protocols, and skill references are complete", () => {
  for (const schema of ["audit-result.schema.json", "hook-event.schema.json"]) {
    const value = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, "schemas", schema), "utf8")) as { $schema?: string };
    assert.match(value.$schema ?? "", /2020-12/u);
  }
  const skillRoot = resolve(PACKAGE_ROOT, "skills");
  const skills = readdirSync(skillRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  assert.equal(skills.length, 7);
  for (const skill of skills) {
    const markdown = readFileSync(resolve(skillRoot, skill.name, "SKILL.md"), "utf8");
    const openai = readFileSync(resolve(skillRoot, skill.name, "agents/openai.yaml"), "utf8");
    assert.match(markdown, new RegExp(`^---\\nname: ${skill.name}\\ndescription: .+`, "u"));
    assert.doesNotMatch(markdown, /TODO/u);
    assert.match(openai, new RegExp(`\\$${skill.name}\\b`, "u"));
    for (const reference of markdown.matchAll(/`(\.\.\/\.\.\/\.\.\/shared\/protocols\/[A-Za-z0-9._-]+\.md)`/gu)) {
      assert.equal(existsSync(resolve(skillRoot, skill.name, reference[1] as string)), true);
    }
  }
  const systemPrompt = readFileSync(resolve(PACKAGE_ROOT, "prompts/SYSTEM.md"), "utf8");
  assert.match(systemPrompt, /human-facing prose field in French/u);
  assert.match(systemPrompt, /Keep enum\s+values.*unchanged/su);
});

test("operator documentation covers human setup and both project entry paths", () => {
  const humanActions = readFileSync(resolve(repositoryRoot, "docs/HUMAN_ACTIONS_AND_CONFIGURATION.md"), "utf8");
  const workflow = readFileSync(resolve(repositoryRoot, "docs/PROJECT_WORKFLOW_GUIDE.md"), "utf8");
  for (const topic of ["GitGuardian", "GitHub Actions", "Telegram", "G1", "G2", "G3", "G4", "Désinstallation"]) {
    assert.match(humanActions, new RegExp(topic, "u"));
  }
  assert.match(workflow, /Créer un nouveau projet/u);
  assert.match(workflow, /Adopter un projet existant/u);
  assert.match(workflow, /Reprendre un projet interrompu/u);
  assert.match(workflow, /PASS \| CHALLENGE \| BLOCK \| HUMAN_REQUIRED/u);
});

test("executable Supervisor core has no Kimi or Grok integration", () => {
  const sourceRoot = resolve(PACKAGE_ROOT, "src");
  const stack = [sourceRoot];
  let source = "";
  while (stack.length) {
    const directory = stack.pop() as string;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.name.endsWith(".ts")) source += readFileSync(path, "utf8");
    }
  }
  assert.doesNotMatch(source, /\b(?:kimi|grok)\b/iu);
});
