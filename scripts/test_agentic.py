"""Offline behavior tests: migration safety, handoffs, locking and attribution."""

from concurrent.futures import ThreadPoolExecutor
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("agentic", Path(__file__).with_name("agentic.py"))
kit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(kit)


class SharedKitTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="agentic-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.project = self.root / "project with spaces"
        self.project.mkdir()
        subprocess.run(["git", "init", "-q", "-b", "feature/test", str(self.project)], check=True)
        kit.git(self.project, "config", "user.name", "Kit Test")
        kit.git(self.project, "config", "user.email", "test@example.invalid")

    def events(self):
        return [json.loads(p.read_text()) for p in sorted((self.project / ".agentic/events").glob("*.json"))]

    def test_legacy_migration_preserves_content_and_is_idempotent(self):
        old = self.project / ".claude/memory"
        old.mkdir(parents=True)
        (old / "DECISIONS.md").write_text("Existing approved architecture\n")
        self.project.joinpath("AGENTS.md").write_text("Existing project constraints\n")
        kit.initialize(self.project)
        kit.initialize(self.project)
        self.assertTrue(old.is_symlink())
        self.assertEqual((old / "DECISIONS.md").read_text(), "Existing approved architecture\n")
        self.assertTrue(self.project.joinpath("AGENTS.md").read_text().startswith("Existing project constraints"))
        self.assertEqual(self.project.joinpath("AGENTS.md").read_text().count(kit.BEGIN), 1)
        (self.project / ".agentic/memory/DECISIONS.md").write_text("Codex update\n")
        self.assertEqual((old / "DECISIONS.md").read_text(), "Codex update\n")

    def test_conflict_preflight_leaves_both_memories_untouched(self):
        for path in (".claude/memory", ".claude/agent-memory", ".agentic/agent-memory"):
            (self.project / path).mkdir(parents=True)
        with self.assertRaises(kit.KitError):
            kit.initialize(self.project)
        self.assertFalse((self.project / ".claude/memory").is_symlink())
        self.assertFalse((self.project / ".agentic/memory").exists())
        self.assertFalse((self.project / "AGENTS.md").exists())

    def test_external_symlinks_cannot_redirect_memory_writes(self):
        external = self.root / "external"
        external.mkdir()
        (self.project / ".agentic").symlink_to(external)
        with self.assertRaises(kit.KitError):
            kit.initialize(self.project)
        self.assertEqual(list(external.iterdir()), [])

    def test_nested_memory_symlink_is_refused_before_migration(self):
        old = self.project / ".claude/memory"
        old.mkdir(parents=True)
        secret = self.root / "private"
        secret.write_text("private")
        (old / "PROJECT_STATE.md").symlink_to(secret)
        with self.assertRaises(kit.KitError):
            kit.initialize(self.project)
        self.assertFalse(old.is_symlink())
        self.assertEqual(secret.read_text(), "private")

    def test_install_preserves_personal_config_and_supports_reinstall(self):
        home = self.root / "user"
        codex = home / ".codex"
        codex.mkdir(parents=True)
        (codex / "config.toml").write_text('model = "personal-model"\n')
        (codex / "AGENTS.md").write_text("Personal instructions\n")
        kit.install(home, codex)
        kit.install(home, codex)
        self.assertEqual((codex / "config.toml").read_text(), 'model = "personal-model"\n')
        self.assertTrue((codex / "AGENTS.md").read_text().startswith("Personal instructions"))
        self.assertEqual(len(list((codex / "agents").glob("*.toml"))), 8)
        self.assertEqual(len(list((home / ".agents/skills").iterdir())), 3)
        self.assertTrue((home / ".local/bin/agentic").is_file())

    def test_install_conflict_has_no_partial_changes(self):
        home = self.root / "user"
        codex = home / ".codex"
        (codex / "agents").mkdir(parents=True)
        (codex / "agents/builder.toml").write_text("my custom builder")
        with self.assertRaises(kit.KitError):
            kit.install(home, codex)
        self.assertFalse((codex / "AGENTS.md").exists())
        self.assertEqual((codex / "agents/builder.toml").read_text(), "my custom builder")

    def test_concurrent_checkpoints_are_separate_complete_events(self):
        kit.initialize(self.project)
        def checkpoint(index):
            return kit.event(self.project, {"tool": "codex", "agent": "builder", "session": "test"},
                             "checkpoint", summary=f"slice {index}")
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(checkpoint, range(40)))
        self.assertEqual(len(self.events()), 40)
        self.assertEqual(len({e["summary"] for e in self.events()}), 40)

    def test_launcher_records_preexisting_changes_and_tool_switch(self):
        kit.initialize(self.project)
        (self.project / "user.txt").write_text("private file content must not be logged")
        tools = self.root / "bin"
        tools.mkdir()
        for tool in ("claude", "codex"):
            executable = tools / tool
            executable.write_text("#!/bin/sh\nprintf '%s' \"$AGENTIC_TOOL\" > tool.txt\nexit 7\n")
            executable.chmod(0o755)
        with patch.dict(os.environ, {"PATH": str(tools) + os.pathsep + os.environ["PATH"]}):
            self.assertEqual(kit.run_session(self.project, "claude", []), 7)
            self.assertEqual(kit.run_session(self.project, "codex", []), 7)
        events = self.events()
        self.assertEqual([e["tool"] for e in events], ["claude", "claude", "codex", "codex"])
        self.assertNotEqual(events[0]["session"], events[2]["session"])
        self.assertIn("?? user.txt", events[0]["observed"]["dirty_paths"])
        self.assertNotIn("private file content", json.dumps(events))
        self.assertEqual(events[-1]["exit_code"], 7)
        self.assertEqual((self.project / "tool.txt").read_text(), "codex")

    def test_nested_launch_does_not_emit_a_session(self):
        kit.initialize(self.project)
        with patch.dict(os.environ, {"AGENTIC_SESSION_ID": "already-active"}):
            with self.assertRaises(kit.KitError):
                kit.run_session(self.project, "codex", [])
        self.assertEqual(self.events(), [])

    def test_lock_prevents_second_writer_and_releases_after_exit(self):
        with kit.project_lock(self.project):
            with self.assertRaises(kit.KitError):
                with kit.project_lock(self.project):
                    pass
        with kit.project_lock(self.project):
            pass

    def test_worktrees_share_the_lock(self):
        (self.project / "first").write_text("first")
        kit.git(self.project, "add", "first")
        kit.git(self.project, "commit", "-qm", "initial")
        worktree = self.root / "worktree"
        kit.git(self.project, "worktree", "add", "-qb", "feature/other", str(worktree))
        with kit.project_lock(self.project):
            with self.assertRaises(kit.KitError):
                with kit.project_lock(worktree):
                    pass

    def test_commit_only_uses_staged_files_and_keeps_human_author(self):
        kit.initialize(self.project)
        (self.project / "intended").write_text("change")
        (self.project / "unrelated").write_text("user change")
        kit.git(self.project, "add", "intended")
        kit.main(["commit", "--project", str(self.project), "--tool", "codex",
                  "--agent", "builder", "-m", "feat: intended change"])
        self.assertEqual(kit.git(self.project, "show", "--format=", "--name-only", "HEAD"), "intended")
        self.assertEqual(kit.git(self.project, "log", "-1", "--format=%an"), "Kit Test")
        self.assertIn("Agentic-Tool: codex", kit.git(self.project, "log", "-1", "--format=%B"))
        self.assertIn("Agentic-Agent: builder", kit.git(self.project, "log", "-1", "--format=%B"))
        self.assertEqual(self.events()[-1]["head"], kit.git(self.project, "rev-parse", "HEAD"))

    def test_manual_checkpoint_requires_explicit_producer(self):
        kit.initialize(self.project)
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(kit.KitError):
                kit.main(["checkpoint", "--project", str(self.project), "--summary", "done", "--next", "QA"])


if __name__ == "__main__":
    unittest.main()
