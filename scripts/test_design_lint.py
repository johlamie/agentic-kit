"""Offline tests for design-system conformance (agentic design-lint / design-init)."""

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("design_lint", Path(__file__).with_name("design_lint.py"))
lint = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lint)
TEMPLATES = ROOT / "global/templates/design"


def filled_system():
    data = json.loads((TEMPLATES / "system.json").read_text())
    del data["_todo"]
    return data


class DesignLintTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="design-lint-")
        self.addCleanup(temp.cleanup)
        self.project = Path(temp.name).resolve()

    def write(self, relative, text):
        path = self.project / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def deliver_design(self, system=None):
        design = self.project / "design"
        if design.exists():
            shutil.rmtree(design)
        shutil.copytree(TEMPLATES, design)
        for name in lint.SPEC_FILES:
            path = design / name
            path.write_text(path.read_text().replace(lint.PLACEHOLDER, "decided"))
        (design / "system.json").write_text(json.dumps(system or filled_system()))
        self.write("design/refs/app-home.md", "Grid 8, radius 12.\n")
        self.write("design/mocks/core.html", "<!doctype html><title>core</title>\n")

    def loaded(self, system=None):
        self.deliver_design(system)
        return lint.load_system(self.project)

    def rules(self, text, relative="src/app/page.tsx", system=None):
        return [rule for _, rule, _ in lint.lint_text(relative, text, system or self.loaded())]

    def run_main(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            status = lint.main(["--project", str(self.project), *args])
        return status, out.getvalue(), err.getvalue()

    def test_template_deliverable_fails_spec_until_filled(self):
        shutil.copytree(TEMPLATES, self.project / "design")
        problems = lint.check_spec(self.project)
        self.assertTrue(any("DESIGN.md still contains" in p for p in problems), problems)
        self.assertTrue(any("system.json still contains" in p for p in problems), problems)
        self.assertTrue(any("refs/" in p for p in problems), problems)
        self.assertTrue(any("mocks/" in p for p in problems), problems)
        status, _, err = self.run_main("--spec")
        self.assertEqual(status, 2)
        self.assertIn("ERROR", err)

    def test_missing_design_is_an_error_not_a_pass(self):
        self.write("src/app/page.tsx", "export default () => null\n")
        self.assertEqual(self.run_main()[0], 2)

    def test_filled_deliverable_passes_spec(self):
        self.deliver_design()
        self.assertEqual(lint.check_spec(self.project), [])
        self.assertEqual(self.run_main("--spec")[0], 0)

    def test_empty_scan_refuses_vacuous_pass(self):
        self.deliver_design()
        status, _, err = self.run_main()
        self.assertEqual(status, 2)
        self.assertIn("vacuous", err)

    def test_system_rejects_open_or_off_grid_scales(self):
        cases = {
            "off grid": ("scales", "spacing_px", [0, 8, 13]),
            "too many radii": ("scales", "radius", ["xs", "sm", "md", "lg", "xl"]),
            "two icon families": ("icons", "packages", ["lucide-react", "react-icons"]),
            "no anti-pattern": (None, "anti_patterns", []),
            "bad grid": (None, "grid", 5),
            "bad regex": (None, "anti_patterns", [{"id": "x", "pattern": "(", "message": "m"}]),
        }
        for label, (section, key, value) in cases.items():
            with self.subTest(label):
                system = filled_system()
                (system[section] if section else system)[key] = value
                self.deliver_design(system)
                with self.assertRaises(lint.DesignError):
                    lint.load_system(self.project)

    def test_conforming_component_passes(self):
        text = ('import { Check } from "lucide-react";\n'
                'import { Button } from "@/components/ui/button";\n'
                'export const Row = () => <div className="flex gap-4 p-6 rounded-lg bg-surface '
                'text-ink text-base font-semibold"><Check size={20} /><Button>Enregistrer</Button></div>;\n')
        self.assertEqual(self.rules(text), [])

    def test_off_system_classes_fail(self):
        text = ('<div className="p-5 rounded-xl text-lg font-bold bg-violet-600 mt-[13px] '
                'data-[state=open]:bg-surface">\n')
        self.assertEqual(sorted(set(self.rules(text))),
                         ["arbitrary-value", "default-palette", "radius-scale", "spacing-scale", "type-scale"])

    def test_raw_colors_only_in_token_files(self):
        system = self.loaded()
        text = ":root { --primary: #1f6f5c; --shadow: rgb(0 0 0 / 0.1); --ink: hsl(var(--x)); }\n"
        self.assertEqual(self.rules(text, "src/styles/tokens.css", system), [])
        self.assertEqual(self.rules(text, "src/app/page.css", system), ["raw-color", "raw-color"])

    def test_icons_family_and_sizes(self):
        system = self.loaded()
        self.assertEqual(self.rules('import { FaHome } from "react-icons/fa";\n', system=system), ["icon-family"])
        text = 'import { Home } from "lucide-react";\nconst a = <Home size={16} />;\n'
        self.assertEqual(self.rules(text, system=system), ["icon-size"])

    def test_primitives_only_inside_the_kit(self):
        system = self.loaded()
        text = '<button className="p-4">Go</button>\n'
        self.assertEqual(self.rules(text, "src/app/page.tsx", system), ["kit-bypass"])
        self.assertEqual(self.rules(text, "src/components/ui/button.tsx", system), [])

    def test_css_px_values_follow_scales(self):
        text = ".a { padding: 16px 13px; border-radius: 6px; margin: 0 auto; }\n"
        self.assertEqual(self.rules(text, "src/app/page.css"), ["spacing-scale", "radius-scale"])

    def test_anti_patterns_allow_marker_and_comments(self):
        system = self.loaded()
        self.assertEqual(self.rules('<p className="uppercase bg-gradient-to-r">\n', system=system),
                         ["anti-pattern:decorative-gradient", "anti-pattern:caps-eyebrow"])
        self.assertEqual(self.rules('<p className="uppercase"> {/* design-lint-allow */}\n', system=system),
                         ["unjustified-allow"])
        self.assertEqual(self.rules('<p className="uppercase"> {/* design-lint-allow: legal acronym */}\n',
                                    system=system), [])
        self.assertEqual(self.rules("// rounded corners, p-5 and #fff in a comment\n", system=system), [])

    def test_scan_skips_tests_dependencies_and_symlinks(self):
        self.deliver_design()
        self.write("src/app/page.tsx", '<div className="p-5">\n')
        self.write("src/app/page.test.tsx", '<div className="p-5">\n')
        self.write("src/node_modules/lib/index.js", '<div className="p-5">\n')
        (self.project / "src/linked.tsx").symlink_to(self.project / "src/app/page.tsx")
        status, out, _ = self.run_main()
        self.assertEqual(status, 1)
        self.assertEqual(out.strip().splitlines(),
                         ["src/app/page.tsx:1  spacing-scale  p-5 is off the spacing scale (0 px 1 2 3 4 6 8 12)"])
        status, out, _ = self.run_main("--json")
        report = json.loads(out)
        self.assertEqual((status, report["verdict"], report["files"]), (1, "FAIL", 1))

    def test_source_outside_project_is_rejected(self):
        system = filled_system()
        system["sources"] = ["../elsewhere"]
        self.deliver_design(system)
        self.assertEqual(self.run_main()[0], 2)


class AgenticDesignCommandTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="design-cmd-")
        self.addCleanup(temp.cleanup)
        self.project = Path(temp.name).resolve()
        subprocess.run(["git", "init", "-q", str(self.project)], check=True)

    def agentic(self, *args):
        return subprocess.run([sys.executable, str(ROOT / "scripts/agentic.py"), *args,
                               "--project", str(self.project)], capture_output=True, text=True, timeout=20)

    def test_design_init_copies_templates_without_overwriting(self):
        custom = self.project / "design/DESIGN.md"
        custom.parent.mkdir()
        custom.write_text("# Existing design\n")
        result = self.agentic("design-init")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(custom.read_text(), "# Existing design\n")
        for name in (*lint.SPEC_FILES, "system.json", "refs/README.md", "mocks/README.md"):
            self.assertTrue((self.project / "design" / name).is_file(), name)
        self.assertEqual(self.agentic("design-init").returncode, 0)
        self.assertEqual(self.agentic("design-lint", "--spec").returncode, 2)

    def test_design_init_refuses_symlinked_design_directory(self):
        (self.project / "elsewhere").mkdir()
        (self.project / "design").symlink_to(self.project / "elsewhere", target_is_directory=True)
        result = self.agentic("design-init")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(list((self.project / "elsewhere").iterdir()), [])


if __name__ == "__main__":
    unittest.main()
