#!/usr/bin/env python3
"""Scope and nonexecution regression tests for the local operation hook helper."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HELPER = Path(__file__).resolve().parents[1] / "global/hooks/local-operations.py"
SPEC = importlib.util.spec_from_file_location("local_operations", HELPER)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class LocalOperationsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "package.json").write_text('{}')

    def reason(self, command):
        return MODULE.approval_reason(command, str(self.root))

    def test_named_project_dependency_changes_defer(self):
        for command in ['npm uninstall lodash', 'npm remove @scope/package -D',
                        'npm rm lodash', 'npm update lodash @scope/package',
                        'yarn remove lodash', 'pnpm remove lodash']:
            with self.subTest(command=command):
                self.assertEqual(self.reason(command), '')

    def test_global_broad_and_escaping_changes_ask(self):
        for command in ['npm update', 'npm uninstall -g lodash',
                        'npm -g uninstall lodash', 'npm --prefix /tmp uninstall lodash',
                        'npm uninstall lodash --prefix ../other',
                        'npm update lodash --workspace other',
                        'pnpm remove --global lodash', 'yarn remove lodash --cwd /tmp',
                        'npm uninstall ../other', 'npm uninstall lodash --unknown',
                        'npm update "*"', 'npm update lodash@latest']:
            with self.subTest(command=command):
                self.assertTrue(self.reason(command))

    def test_missing_manifest_and_external_manifest_ask(self):
        (self.root / 'package.json').unlink()
        self.assertTrue(self.reason('npm remove lodash'))
        with tempfile.TemporaryDirectory() as other:
            external = Path(other) / 'package.json'
            external.write_text('{}')
            (self.root / 'package.json').symlink_to(external)
            self.assertTrue(self.reason('npm remove lodash'))

    def test_ncu_requires_explicit_scope_and_patch_minor(self):
        for command in ['ncu -u --target patch --filter lodash',
                        'npm-check-updates --upgrade --target=minor --filter=lodash,@scope/pkg',
                        'ncu -u -t minor lodash']:
            self.assertEqual(self.reason(command), '')
        for command in ['ncu -u', 'ncu -u -t latest lodash',
                        'ncu -u -t minor', 'ncu -u -t minor --filter "*"',
                        'ncu -u -t minor lodash --cwd ../other',
                        'ncu -u -t minor lodash --target latest',
                        'ncu -u --target minor --filter /react/', 'ncu -ui', 'ncu --interactive', 'ncu -i']:
            self.assertTrue(self.reason(command), command)
        self.assertEqual(self.reason('ncu --target latest'), '')

    def test_pip_requires_explicit_existing_local_venv(self):
        for command in ['pip uninstall requests', 'pip3 uninstall -y requests',
                        'python -m pip uninstall requests',
                        './.venv/bin/pip uninstall requests']:
            self.assertTrue(self.reason(command), command)
        venv = self.root / '.venv'
        (venv / 'bin').mkdir(parents=True)
        (venv / 'pyvenv.cfg').write_text('home = /usr/bin\n')
        for executable in ['pip', 'python']:
            (venv / 'bin' / executable).write_text('')
            (venv / 'bin' / executable).chmod(0o700)
        for command in ['./.venv/bin/pip uninstall -y requests',
                        './.venv/bin/python -m pip uninstall requests',
                        str(venv / 'bin/pip') + ' uninstall requests']:
            self.assertEqual(self.reason(command), '')
        for command in ['./.venv/bin/pip uninstall -r requirements.txt',
                        './.venv/bin/pip --python /usr/bin/python uninstall requests',
                        './.venv/bin/python -m pip uninstall requests --break-system-packages']:
            self.assertTrue(self.reason(command), command)
        (venv / 'pyvenv.cfg').unlink()
        self.assertTrue(self.reason('./.venv/bin/pip uninstall requests'))

    def test_symlink_to_external_venv_is_not_local(self):
        with tempfile.TemporaryDirectory() as other:
            venv = Path(other)
            (venv / 'bin').mkdir()
            (venv / 'bin/pip').write_text('')
            (venv / 'bin/pip').chmod(0o700)
            (venv / 'pyvenv.cfg').write_text('home = /usr/bin\n')
            (self.root / '.venv').symlink_to(venv)
            self.assertTrue(self.reason('./.venv/bin/pip uninstall requests'))

    def test_supabase_requires_local_and_project_config(self):
        self.assertTrue(self.reason('supabase db reset --local'))
        (self.root / 'supabase').mkdir()
        (self.root / 'supabase/config.toml').write_text('project_id = "test"\n')
        self.assertTrue(self.reason('supabase db reset --local'))
        (self.root / 'supabase/.agentic-disposable-local').write_text('User authorized disposable local development data.\n')
        self.assertEqual(self.reason('supabase db reset --local'), '')
        self.assertEqual(self.reason('supabase db reset --local --yes'), '')
        for command in ['supabase db reset', 'supabase db reset --linked',
                        'supabase db reset --local --linked',
                        'supabase db reset --local --db-url postgres://example/db',
                        'supabase --workdir /tmp db reset --local',
                        'supabase db reset --local --workdir /tmp']:
            self.assertTrue(self.reason(command), command)

    def test_supabase_marker_must_be_nonempty_and_contained(self):
        (self.root / 'supabase').mkdir()
        (self.root / 'supabase/config.toml').write_text('project_id = "test"\n')
        marker = self.root / 'supabase/.agentic-disposable-local'
        marker.write_text('  \n')
        self.assertTrue(self.reason('supabase db reset --local'))
        marker.unlink()
        with tempfile.TemporaryDirectory() as other:
            external = Path(other) / 'authorization'
            external.write_text('Disposable local data authorized')
            marker.symlink_to(external)
            self.assertTrue(self.reason('supabase db reset --local'))

    def test_exact_npx_tools_share_scope_checks(self):
        self.assertEqual(self.reason('npx npm-check-updates -u -t patch lodash'), '')
        self.assertEqual(self.reason('npx ncu -u -t minor lodash'), '')
        for command in ['npx ncu -u', 'npx npm-check-updates -u',
                        'npx --yes ncu -u -t minor lodash',
                        'npx ncu@latest -u -t patch lodash',
                        'npx supabase db reset --local']:
            self.assertTrue(self.reason(command), command)
        (self.root / 'supabase').mkdir()
        (self.root / 'supabase/config.toml').write_text('project_id = "test"\n')
        (self.root / 'supabase/.agentic-disposable-local').write_text('User authorized disposable local data')
        self.assertEqual(self.reason('npx supabase db reset --local'), '')
        self.assertTrue(self.reason('npx supabase db reset --local --linked'))

    def test_compositions_need_review(self):
        for command in ['cd /tmp && npm remove lodash',
                        'npm update lodash; npm update react',
                        'npm remove lodash > /tmp/output',
                        'npm remove lodash\npwd']:
            self.assertTrue(self.reason(command), command)

    def test_unrelated_commands_and_messages_defer(self):
        for command in ['git commit -m "npm uninstall lodash; supabase db reset"',
                        'echo "pip uninstall requests"', 'npm run remove',
                        'npm run test -- update', 'python script.py', 'npx jest ncu',
                        'env npm remove lodash', 'sudo pip uninstall requests',
                        'prisma migrate reset', 'dropdb example']:
            self.assertEqual(self.reason(command), '', command)

    def test_cli_never_executes_supplied_shell(self):
        marker = self.root / 'must-not-exist'
        result = subprocess.run([sys.executable, str(HELPER),
                                 f'npm uninstall lodash; touch {marker}', str(self.root)],
                                capture_output=True, text=True, check=True)
        self.assertFalse(marker.exists())
        self.assertIn('approval', result.stdout)
        result = subprocess.run([sys.executable, str(HELPER), 'npm remove lodash', str(self.root)],
                                capture_output=True, text=True, check=True)
        self.assertEqual(result.stdout, '')
        self.assertEqual(result.stderr, '')


if __name__ == '__main__':
    unittest.main()
