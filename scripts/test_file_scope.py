#!/usr/bin/env python3
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('file_scope', Path(__file__).resolve().parents[1] / 'global/hooks/file-scope.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class FileScopeTests(unittest.TestCase):
    def test_role_memory_is_narrow_and_cannot_redirect(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            notes = home / '.claude/agent-memory/builder'
            notes.mkdir(parents=True)
            check = lambda path: module.in_scope('memory', path, home)
            self.assertTrue(check(notes / 'MEMORY.md'))
            self.assertFalse(check(notes / 'config.json'))
            self.assertFalse(check(home / '.claude/settings.json'))
            self.assertFalse(check(home / '.claude/agent-memory/arbitrary/MEMORY.md'))
            (notes / 'escape.md').symlink_to(home / '.claude/CLAUDE.md')
            self.assertFalse(check(notes / 'escape.md'))
            alias_home = home / 'alias'
            (alias_home / '.claude').mkdir(parents=True)
            (alias_home / '.claude/agent-memory').symlink_to(notes.parent, target_is_directory=True)
            self.assertFalse(module.in_scope('memory', alias_home / '.claude/agent-memory/builder/MEMORY.md', alias_home))

    def test_additional_directories_require_user_settings_and_physical_containment(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            (home / '.claude').mkdir()
            project = home / 'other'
            project.mkdir()
            check = lambda path: module.in_scope('additional', path, home)
            self.assertFalse(check(project / 'file.md'))
            (home / '.claude/settings.json').write_text(json.dumps({'permissions': {'additionalDirectories': [str(project)]}}))
            self.assertTrue(check(project / 'file.md'))
            self.assertFalse(check(home / 'other-sibling/file.md'))
            (project / 'escape').symlink_to(home / '.claude', target_is_directory=True)
            self.assertFalse(check(project / 'escape/settings.json'))

if __name__ == '__main__':
    unittest.main()
