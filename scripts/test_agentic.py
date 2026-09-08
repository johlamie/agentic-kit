"""Offline behavior tests: migration safety, handoffs, locking and attribution."""

from concurrent.futures import ThreadPoolExecutor
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import tarfile
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

    def run_log(self):
        return subprocess.run([sys.executable, str(Path(kit.__file__)), "log", "--project",
                               str(self.project)], capture_output=True, text=True, timeout=5)

    def test_log_preserves_sorted_events_and_empty_directories(self):
        result = self.run_log()
        self.assertEqual((result.returncode, result.stdout), (0, ""))
        events = self.project / ".agentic/events"
        events.mkdir(parents=True)
        result = self.run_log()
        self.assertEqual((result.returncode, result.stdout), (0, ""))
        (events / "002.json").write_text('  {"event": 2}\n')
        (events / "001.json").write_text('{"event": 1}\n')
        (events / "ignored.txt").write_text("not an event")
        result = self.run_log()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, '{"event": 1}\n{"event": 2}\n')

    def test_log_rejects_symlinked_event_files(self):
        events = self.project / ".agentic/events"
        events.mkdir(parents=True)
        outside = self.root / "synthetic-private.txt"
        inside = self.project / "synthetic-private.txt"
        for target in (outside, inside):
            target.write_text("SYNTHETIC_EVENT_SECRET_DO_NOT_PRINT")
        link = events / "001.json"
        for target in (outside, inside, events / "missing", link):
            with self.subTest(target=target.name):
                link.symlink_to(target)
                result = self.run_log()
                link.unlink()
                self.assertEqual(result.returncode, 1)
                self.assertIn("ERROR: Cannot safely open event file", result.stderr)
                self.assertNotIn("SYNTHETIC_EVENT_SECRET", result.stdout + result.stderr)

    def test_log_rejects_symlinked_event_directories(self):
        for component in (".agentic", ".agentic/events"):
            with self.subTest(component=component):
                target = self.project / "relocated-events"
                target.mkdir()
                (target / "001.json").write_text("SYNTHETIC_DIRECTORY_SECRET")
                if component == ".agentic":
                    (target / "events").mkdir()
                    (target / "events/001.json").write_text("SYNTHETIC_DIRECTORY_SECRET")
                link = self.project / component
                link.parent.mkdir(exist_ok=True)
                link.symlink_to(target, target_is_directory=True)
                result = self.run_log()
                self.assertEqual(result.returncode, 1)
                self.assertIn("Event path must contain real directories", result.stderr)
                self.assertNotIn("SYNTHETIC_DIRECTORY_SECRET", result.stdout + result.stderr)
                link.unlink()
                for child in sorted(target.rglob("*"), reverse=True):
                    child.rmdir() if child.is_dir() else child.unlink()
                target.rmdir()

    def test_log_rejects_nonregular_entries_without_blocking(self):
        events = self.project / ".agentic/events"
        events.mkdir(parents=True)
        entry = events / "001.json"
        os.mkfifo(entry)
        result = self.run_log()
        self.assertEqual(result.returncode, 1)
        self.assertIn("Event must be a regular file", result.stderr)
        entry.unlink()
        entry.mkdir()
        result = self.run_log()
        self.assertEqual(result.returncode, 1)
        self.assertIn("Event must be a regular file", result.stderr)
        self.assertEqual(result.stdout, "")

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
        self.assertFalse((self.project / ".git/agentic-backups").exists())

    def test_talendici_alias_migrates_and_backup_retains_uncommitted_memory(self):
        old = self.project / ".claude/memory"
        old.mkdir(parents=True)
        (old / "DECISIONS.md").write_text("Decision not committed yet\n")
        agents = self.project / "AGENTS.md"
        agents.write_text("Project-specific rules\n")
        alias = self.project / "CLAUDE.md"
        alias.symlink_to("AGENTS.md")
        result = kit.initialize(self.project)
        self.assertEqual(result["status"], "migrated")
        self.assertEqual(os.readlink(alias), "AGENTS.md")
        self.assertTrue(agents.read_text().startswith("Project-specific rules\n"))
        self.assertEqual(agents.read_text().count(kit.BEGIN), 1)
        self.assertIn("When using Codex", agents.read_text())
        self.assertEqual((old / "DECISIONS.md").read_text(), "Decision not committed yet\n")
        backup = Path(result["backup"])
        self.assertEqual(backup.stat().st_mode & 0o777, 0o700)
        with tarfile.open(backup / "before.tar.gz") as archive:
            self.assertEqual(archive.getmember("CLAUDE.md").linkname, "AGENTS.md")
            self.assertEqual(archive.extractfile("AGENTS.md").read(), b"Project-specific rules\n")
            self.assertEqual(archive.extractfile(".claude/memory/DECISIONS.md").read(),
                             b"Decision not committed yet\n")
        before = {p: p.stat().st_mtime_ns for p in self.project.rglob("*") if p.is_file()}
        again = kit.initialize(self.project)
        self.assertEqual(again, {"status": "unchanged", "backup": None})
        self.assertEqual(before, {p: p.stat().st_mtime_ns for p in self.project.rglob("*") if p.is_file()})

    def test_reverse_instruction_alias_is_preserved(self):
        (self.project / "CLAUDE.md").write_text("Claude project rules\n")
        (self.project / "AGENTS.md").symlink_to("CLAUDE.md")
        kit.initialize(self.project)
        self.assertEqual(os.readlink(self.project / "AGENTS.md"), "CLAUDE.md")
        self.assertIn("Claude project rules", (self.project / "AGENTS.md").read_text())
        self.assertEqual(kit.initialize(self.project)["status"], "unchanged")

    def test_instruction_alias_escapes_and_loops_fail_before_migration(self):
        external = self.root / "outside.md"
        external.write_text("Unrelated rules")
        alias = self.project / "CLAUDE.md"
        alias.symlink_to(external)
        with self.assertRaises(kit.KitError):
            kit.initialize(self.project)
        self.assertEqual(external.read_text(), "Unrelated rules")
        self.assertFalse((self.project / ".agentic").exists())
        alias.unlink()
        alias.symlink_to("AGENTS.md")
        (self.project / "AGENTS.md").symlink_to("CLAUDE.md")
        with self.assertRaises(kit.KitError):
            kit.initialize(self.project)

    def test_already_shared_project_updates_without_rewriting_its_memory(self):
        kit.initialize(self.project)
        (self.project / ".agentic/kit.json").unlink()  # first shared-kit release had no marker
        (self.project / ".agentic/CODEX.md").write_text("Old integration instructions\n")
        memory = self.project / ".agentic/memory/PROJECT_STATE.md"
        memory.write_text("Current work and approvals\n")
        original_mtime = memory.stat().st_mtime_ns
        result = kit.initialize(self.project)
        self.assertEqual(result["status"], "updated")
        self.assertEqual(memory.read_text(), "Current work and approvals\n")
        self.assertEqual(memory.stat().st_mtime_ns, original_mtime)
        self.assertEqual(kit.initialize(self.project)["status"], "unchanged")

    def test_new_project_and_missing_template_repair(self):
        self.assertEqual(kit.initialize(self.project)["status"], "initialized")
        memory = self.project / ".agentic/memory/LESSONS.md"
        memory.unlink()
        self.assertEqual(kit.initialize(self.project)["status"], "updated")
        self.assertTrue(memory.is_file())

    def test_backup_failure_prevents_project_mutation(self):
        old = self.project / ".claude/memory"
        old.mkdir(parents=True)
        (old / "PROJECT_STATE.md").write_text("Do not lose this")
        with patch.object(kit, "backup_initialization", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                kit.initialize(self.project)
        self.assertFalse(old.is_symlink())
        self.assertFalse((self.project / ".agentic").exists())
        self.assertEqual((old / "PROJECT_STATE.md").read_text(), "Do not lose this")

    def test_interrupted_migration_preserves_backup_and_can_be_retried(self):
        old = self.project / ".claude/memory"
        old.mkdir(parents=True)
        (old / "DECISIONS.md").write_text("Durable decision\n")
        original = kit.atomic_write
        def fail_generated(path, content, **kwargs):
            if path == self.project / ".agentic/CONTRACT.md":
                raise OSError("disk full")
            return original(path, content, **kwargs)
        with patch.object(kit, "atomic_write", side_effect=fail_generated):
            with self.assertRaisesRegex(kit.KitError, "Backup preserved"):
                kit.initialize(self.project)
        self.assertTrue(list((self.project / ".git/agentic-backups").glob("*/manifest.json")))
        self.assertEqual((old / "DECISIONS.md").read_text(), "Durable decision\n")
        self.assertEqual(kit.initialize(self.project)["status"], "updated")
        self.assertEqual(kit.initialize(self.project)["status"], "unchanged")

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
