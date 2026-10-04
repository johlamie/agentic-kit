"""Offline tests for missions, user grants and queued approvals. No LLM is called."""

import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import agentic_mission as mission  # noqa: E402

AGENTIC = ROOT / "scripts/agentic.py"


class MissionTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="mission-test-")
        self.addCleanup(temp.cleanup)
        self.base = Path(temp.name).resolve()
        self.env = dict(os.environ, AGENTIC_GRANTS_DIR=str(self.base / "grants"),
                        GIT_AUTHOR_NAME="Kit Test", GIT_AUTHOR_EMAIL="test@example.invalid",
                        GIT_COMMITTER_NAME="Kit Test", GIT_COMMITTER_EMAIL="test@example.invalid")
        self.env.pop("AGENTIC_SESSION_ID", None)
        os.environ["AGENTIC_GRANTS_DIR"] = self.env["AGENTIC_GRANTS_DIR"]
        self.addCleanup(os.environ.pop, "AGENTIC_GRANTS_DIR", None)

    def agentic(self, *args, env=None):
        return subprocess.run([sys.executable, str(AGENTIC), *args], capture_output=True, text=True,
                              timeout=30, env=env or self.env)

    def start(self, *extra):
        return self.agentic("mission", "start", "--root", str(self.base / "projects"), *extra)

    def test_slugify_folds_accents_and_punctuation(self):
        self.assertEqual(mission.slugify("Vérification de diplômes — Côte d'Ivoire !"),
                         "verification-de-diplomes-cote-d-ivoire")
        self.assertEqual(mission.slugify("¿¿"), "mission")
        self.assertLessEqual(len(mission.slugify("a" * 200)), 48)

    def test_start_creates_project_memory_and_mission(self):
        result = self.start("--idea", "App de vérification de diplômes", "--profile", "local-only")
        self.assertEqual(result.returncode, 0, result.stderr)
        project = self.base / "projects/app-de-verification-de-diplomes"
        mission_text = (project / ".agentic/memory/MISSION.md").read_text()
        self.assertIn("App de vérification de diplômes", mission_text)
        self.assertIn("- Effectif : local-only", mission_text)
        self.assertIn("Interdit : déploiement", mission_text)
        for name in ("ORCHESTRATOR.md", "PROJECT_STATE.md", "DECISIONS.md"):
            self.assertTrue((project / ".agentic/memory" / name).is_file(), name)
        self.assertIn("Mission (", (project / ".agentic/memory/PROJECT_STATE.md").read_text())
        self.assertIn("/.agentic/approvals/", (project / ".gitignore").read_text())
        self.assertEqual(subprocess.run(["git", "-C", str(project), "branch", "--show-current"],
                                        capture_output=True, text=True).stdout.strip(), "main")
        status = json.loads(self.agentic("mission", "status", "--project", str(project)).stdout)
        self.assertEqual((status["effective_profile"], status["pending_approvals"]), ("local-only", 0))

    def test_empty_idea_and_existing_mission_are_refused(self):
        self.assertNotEqual(self.start("--idea", "   ").returncode, 0)
        self.assertEqual(self.start("--idea", "Idée", "--name", "demo").returncode, 0)
        again = self.start("--idea", "Autre idée", "--name", "demo")
        self.assertNotEqual(again.returncode, 0)
        self.assertIn("existe déjà", again.stderr)

    def test_lab_profile_needs_a_user_grant(self):
        result = self.start("--idea", "Jouet", "--name", "jouet", "--profile", "lab")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("agentic grant jouet profile lab", result.stdout)
        project = self.base / "projects/jouet"
        self.assertEqual(mission.status(project)["effective_profile"], "supervised")
        self.assertIn("pas accordé", (project / ".agentic/memory/MISSION.md").read_text())
        self.assertEqual(self.agentic("grant", "jouet", "profile", "lab").returncode, 0)
        self.assertEqual(mission.status(project)["effective_profile"], "lab")
        self.assertEqual(self.agentic("revoke", "jouet", "profile", "lab").returncode, 0)
        self.assertEqual(mission.status(project)["effective_profile"], "supervised")

    def test_grants_are_validated_and_private(self):
        self.assertEqual(self.agentic("grant", "talendici", "checkout-not-served").returncode, 0)
        self.assertEqual(self.agentic("grant", "talendici", "push", "main").returncode, 0)
        self.assertEqual(self.agentic("grant", "talendici", "push", "main").returncode, 0)  # idempotent
        self.assertEqual(mission.read_grants("talendici"), ["checkout-not-served", "push main"])
        path = self.base / "grants/talendici"
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(path.parent.stat().st_mode), 0o700)
        for words in (["sudo"], ["push"], ["push", "-f"], ["profile", "supervised"], ["merge", "a", "b"]):
            with self.subTest(words=words):
                self.assertNotEqual(self.agentic("grant", "talendici", *words).returncode, 0)
        self.assertNotEqual(self.agentic("grant", "../etc", "checkout-not-served").returncode, 0)
        listing = self.agentic("grants").stdout
        self.assertIn("talendici: checkout-not-served, push main", listing)

    def test_symlinked_grants_are_refused(self):
        (self.base / "elsewhere").mkdir()
        (self.base / "grants").symlink_to(self.base / "elsewhere", target_is_directory=True)
        self.assertNotEqual(self.agentic("grant", "demo", "checkout-not-served").returncode, 0)
        self.assertEqual(list((self.base / "elsewhere").iterdir()), [])

    def test_guard_reads_the_grants_written_here(self):
        self.agentic("grant", "live-app", "push", "main")
        payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": "git push origin main"},
                              "cwd": str(self.base / "projects/live-app")})
        listing = self.base / "production-projects"
        listing.write_text("live-app\n")
        env = dict(self.env, CLAUDE_PROJECTS_ROOT=str(self.base / "projects"),
                   CLAUDE_PRODUCTION_PROJECTS=str(listing))
        guard = ROOT / "global/hooks/agent-guard.sh"
        allowed = subprocess.run([str(guard)], input=payload, capture_output=True, text=True, env=env)
        self.assertEqual(allowed.stdout.strip(), "")
        self.agentic("revoke", "live-app", "push", "main")
        asked = subprocess.run([str(guard)], input=payload, capture_output=True, text=True, env=env)
        self.assertEqual(json.loads(asked.stdout)["hookSpecificOutput"]["permissionDecision"], "ask")

    def test_approvals_list_only_pending_regular_records(self):
        self.start("--idea", "Idée", "--name", "queue")
        project = self.base / "projects/queue"
        approvals = project / ".agentic/approvals"
        approvals.mkdir()
        (approvals / "1.json").write_text(json.dumps({"status": "pending", "tool": "Bash",
                                                       "detail": "firebase deploy", "reason": "prod"}))
        (approvals / "2.json").write_text(json.dumps({"status": "resolved"}))
        (approvals / "3.json").write_text("not json")
        (approvals / "4.json").symlink_to(approvals / "1.json")
        self.assertEqual([item["file"] for item in mission.approvals(project)], ["1.json"])
        self.assertIn("firebase deploy", self.agentic("approvals", "--project", str(project)).stdout)
        self.assertEqual(mission.status(project)["pending_approvals"], 1)

    def test_prompt_and_unattended_run_use_a_headless_session(self):
        self.start("--idea", "Idée", "--name", "headless")
        project = self.base / "projects/headless"
        prompt = self.agentic("mission", "prompt", "--project", str(project)).stdout
        self.assertIn("skill `mission`", prompt)
        self.assertIn("supervised", prompt)
        fake_bin = self.base / "bin"
        fake_bin.mkdir()
        fake = fake_bin / "claude"
        fake.write_text("#!/bin/sh\nprintf '%s|%s|%s' \"$AGENTIC_UNATTENDED\" \"$AGENTIC_PROJECT\" \"$1\" > \"$PWD/.run\"\n")
        fake.chmod(0o755)
        env = dict(self.env, PATH=f"{fake_bin}{os.pathsep}{self.env['PATH']}")
        result = self.agentic("mission", "run", "--project", str(project), env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        unattended, recorded_project, first_arg = (project / ".run").read_text().split("|")
        self.assertEqual((unattended, recorded_project, first_arg), ("1", str(project), "-p"))
        # An orchestrator inside another project's session may launch this mission,
        # but never a second session on its own project.
        nested = dict(env, AGENTIC_SESSION_ID="parent", AGENTIC_PROJECT=str(self.base / "projects/other"))
        self.assertEqual(self.agentic("mission", "run", "--project", str(project), env=nested).returncode, 0)
        same = dict(env, AGENTIC_SESSION_ID="parent", AGENTIC_PROJECT=str(project))
        self.assertNotEqual(self.agentic("mission", "run", "--project", str(project), env=same).returncode, 0)

    def test_outside_a_git_project_explains_what_to_do(self):
        (self.base / "projects").mkdir()
        result = subprocess.run([sys.executable, str(AGENTIC), "run", "claude"], capture_output=True,
                                text=True, timeout=30, env=self.env, cwd=self.base / "projects")
        self.assertEqual(result.returncode, 1)
        self.assertIn("n'est pas un projet Git", result.stderr)
        self.assertIn("/mission", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_interactive_run_is_not_marked_unattended(self):
        self.start("--idea", "Idée", "--name", "interactive")
        project = self.base / "projects/interactive"
        fake_bin = self.base / "bin"
        fake_bin.mkdir()
        (fake_bin / "claude").write_text("#!/bin/sh\nprintf '%s' \"${AGENTIC_UNATTENDED:-no}\" > \"$PWD/.run\"\n")
        (fake_bin / "claude").chmod(0o755)
        env = dict(self.env, PATH=f"{fake_bin}{os.pathsep}{self.env['PATH']}", AGENTIC_UNATTENDED="1")
        self.assertEqual(self.agentic("run", "--project", str(project), "claude", env=env).returncode, 0)
        self.assertEqual((project / ".run").read_text(), "no")


if __name__ == "__main__":
    unittest.main()
