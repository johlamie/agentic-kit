#!/usr/bin/env python3
"""Mechanical design-system conformance for agentic projects. Python 3.10+, stdlib only.

`design/system.json` declares the project's closed scales (spacing, radius, type,
colors, icons) and anti-patterns. Two checks read it:

  spec  - the designer's deliverable is complete and has no template placeholders;
  code  - UI sources use only what the system declares.

Exit codes: 0 conform, 1 violations, 2 missing or invalid design system. A project
without a usable system never passes: an empty scan is an error, not a PASS.
"""

import argparse
import json
import os
from pathlib import Path
import re
import sys

SCHEMA_VERSION = 1
PLACEHOLDER = "TODO(designer)"
SPEC_FILES = ("DESIGN.md", "tokens.md", "components.md", "layout.md", "anti-patterns.md")
SOURCE_SUFFIXES = {".tsx", ".jsx", ".ts", ".js", ".mjs", ".vue", ".svelte", ".astro",
                   ".html", ".css", ".scss", ".mdx"}
MARKUP_SUFFIXES = {".tsx", ".jsx", ".vue", ".svelte", ".astro", ".html", ".mdx"}
STYLE_SUFFIXES = {".css", ".scss"}
SKIPPED_DIRS = {"node_modules", ".git", ".next", ".nuxt", ".svelte-kit", ".turbo", ".vercel",
                "dist", "build", "out", "coverage", "e2e", "qa", "__tests__"}
SKIPPED_NAME = re.compile(r"\.(test|spec|stories)\.[a-z]+$")
COMMENT_PREFIXES = ("//", "/*", "*", "<!--", "{/*")
ALLOW_MARKER = re.compile(r"design-lint-allow\b(?::\s*(\S.*))?")

# Limits keep each scale closed and small; the values themselves are per project.
LIMITS = {"font_size": 6, "font_weight": 3, "radius": 4, "icon_sizes": 3}
SIDES = {"t", "r", "b", "l", "tl", "tr", "br", "bl", "s", "e", "ss", "se", "es", "ee"}
SPACING_UTILITY = re.compile(
    r"(?<![\w-])-?(p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|"
    r"space-x|space-y|inset|inset-x|inset-y|top|right|bottom|left|start|end)-(\d+(?:\.\d+)?|px)(?![\w.\[-])")
RADIUS_UTILITY = re.compile(r"(?<![\w-])rounded((?:-[a-z0-9]+)*)(?![\w\[-])")
FONT_SIZE_UTILITY = re.compile(r"(?<![\w-])text-(xs|sm|base|lg|[2-9]?xl)(?![\w-])")
FONT_WEIGHT_UTILITY = re.compile(
    r"(?<![\w-])font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)(?![\w-])")
PALETTE = ("slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|"
           "sky|blue|indigo|violet|purple|fuchsia|pink|rose")
PALETTE_UTILITY = re.compile(
    r"(?<![\w-])(?:bg|text|border(?:-[trblxyse])?|ring|ring-offset|fill|stroke|from|via|to|outline|"
    r"divide|placeholder|accent|caret|decoration|shadow)-(" + PALETTE + r")-(50|[1-9]00|950)(?![\w-])")
# A trailing colon marks a variant such as data-[state=open]:, not a value.
ARBITRARY_UTILITY = re.compile(r"(?<![\w-])([a-z][a-z0-9-]*)-\[([^\]\s]+)\](?!:)")
HEX_COLOR = re.compile(r"(?<![\w&/#-])#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])")
COLOR_FUNCTION = re.compile(r"\b(rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(\s*(?!var\()")
IMPORT_SOURCE = re.compile(r"""(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]""")
ICON_SIZE = re.compile(r"""\bsize=(?:\{\s*['"]?|['"])(\d+)""")
CSS_SPACING = re.compile(r"\b(padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?\s*:\s*([^;}{]+)")
CSS_RADIUS = re.compile(r"\bborder(?:-[a-z]+)*-radius\s*:\s*([^;}{]+)")
PX_VALUE = re.compile(r"(?<![\w.])(-?\d+(?:\.\d+)?)px\b")
ICON_PACKAGES = ("lucide-react", "lucide-vue-next", "lucide-svelte", "@heroicons/react", "@heroicons/vue",
                 "react-icons", "@tabler/icons-react", "@tabler/icons-vue", "@phosphor-icons/react",
                 "phosphor-react", "@radix-ui/react-icons", "@mui/icons-material", "@fortawesome",
                 "react-feather", "@iconify/react", "@expo/vector-icons", "iconoir-react",
                 "@remixicon/react", "react-bootstrap-icons", "@primer/octicons-react")


class DesignError(Exception):
    pass


def _strings(value, name, *, allow_empty=False):
    if not isinstance(value, list) or not all(isinstance(item, str) and item for item in value):
        raise DesignError(f"system.json: {name} must be a list of non-empty strings")
    if not value and not allow_empty:
        raise DesignError(f"system.json: {name} must not be empty")
    return value


def _numbers(value, name):
    if (not isinstance(value, list) or not value
            or not all(isinstance(item, (int, float)) and not isinstance(item, bool) and item >= 0
                       for item in value)):
        raise DesignError(f"system.json: {name} must be a non-empty list of non-negative numbers")
    return value


def load_system(project):
    path = project / "design/system.json"
    if path.is_symlink() or not path.is_file():
        raise DesignError("design/system.json is missing: the designer must deliver the design "
                          "system first (agentic design-init, then the design-system skill).")
    text = path.read_text(encoding="utf-8")
    if PLACEHOLDER in text:
        raise DesignError(f"design/system.json still contains {PLACEHOLDER} placeholders.")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as error:
        raise DesignError(f"design/system.json is not valid JSON: {error}") from error
    if not isinstance(data, dict) or data.get("schema_version") != SCHEMA_VERSION:
        raise DesignError(f"design/system.json: schema_version must be {SCHEMA_VERSION}")
    _strings(data.get("sources"), "sources")
    _strings(data.get("token_files", []), "token_files", allow_empty=True)
    _strings(data.get("ui_kit_dirs"), "ui_kit_dirs")
    _strings(data.get("primitive_elements", []), "primitive_elements", allow_empty=True)
    _strings(data.get("exclude", []), "exclude", allow_empty=True)
    _strings(data.get("color_names"), "color_names")
    grid = data.get("grid")
    if grid not in (4, 8):
        raise DesignError("system.json: grid must be 4 or 8")
    scales = data.get("scales")
    if not isinstance(scales, dict):
        raise DesignError("system.json: scales must be an object")
    for key in ("spacing", "radius", "font_size", "font_weight"):
        _strings(scales.get(key), f"scales.{key}")
    for key in ("spacing_px", "radius_px"):
        _numbers(scales.get(key), f"scales.{key}")
    # 1px is the hairline exception (borders, dividers); every other step sits on the grid.
    off_grid = [v for v in scales["spacing_px"] if v not in (0, 1) and v % grid]
    if off_grid:
        raise DesignError(f"system.json: spacing_px values off the {grid}px grid: {off_grid}")
    radius_steps = [k for k in scales["radius"] if k not in ("none", "full")]
    for key, count in (("font_size", len(scales["font_size"])),
                       ("font_weight", len(scales["font_weight"])), ("radius", len(radius_steps))):
        if count > LIMITS[key]:
            raise DesignError(f"system.json: scales.{key} has {count} steps; the maximum is "
                              f"{LIMITS[key]} (a scale that large is not a system)")
    icons = data.get("icons")
    if not isinstance(icons, dict):
        raise DesignError("system.json: icons must be an object")
    if len(_strings(icons.get("packages"), "icons.packages")) != 1:
        raise DesignError("system.json: icons.packages must name exactly one icon family")
    if len(_numbers(icons.get("sizes"), "icons.sizes")) > LIMITS["icon_sizes"]:
        raise DesignError(f"system.json: icons.sizes allows at most {LIMITS['icon_sizes']} sizes")
    tailwind = data.get("tailwind", {})
    if not isinstance(tailwind, dict):
        raise DesignError("system.json: tailwind must be an object")
    _strings(tailwind.get("allow_arbitrary_prefixes", []), "tailwind.allow_arbitrary_prefixes",
             allow_empty=True)
    patterns = data.get("anti_patterns")
    if not isinstance(patterns, list) or not patterns:
        raise DesignError("system.json: anti_patterns must list at least one forbidden pattern")
    compiled = []
    for entry in patterns:
        if (not isinstance(entry, dict)
                or not all(isinstance(entry.get(k), str) and entry.get(k) for k in ("id", "pattern", "message"))):
            raise DesignError("system.json: each anti_pattern needs non-empty id, pattern and message")
        try:
            compiled.append((entry["id"], re.compile(entry["pattern"]), entry["message"]))
        except re.error as error:
            raise DesignError(f"system.json: anti_pattern {entry['id']} is not a valid regex: {error}") from error
    data["_anti_patterns"] = compiled
    return data


def check_spec(project):
    """Return deliverable problems; an empty list means the design folder is complete."""
    design = project / "design"
    problems = []
    if design.is_symlink() or not design.is_dir():
        return ["design/ is missing"]
    for name in SPEC_FILES:
        path = design / name
        if path.is_symlink() or not path.is_file() or not path.read_text(encoding="utf-8").strip():
            problems.append(f"design/{name} is missing or empty")
        elif PLACEHOLDER in path.read_text(encoding="utf-8"):
            problems.append(f"design/{name} still contains {PLACEHOLDER} placeholders")
    try:
        load_system(project)
    except DesignError as error:
        problems.append(str(error))
    refs = design / "refs"
    breakdowns = [p for p in refs.glob("*.md") if p.name != "README.md"] if refs.is_dir() else []
    if not breakdowns:
        problems.append("design/refs/ has no reference breakdown (one decomposed screen per .md file)")
    mocks = design / "mocks"
    if not (mocks.is_dir() and any(mocks.glob("*.html"))):
        problems.append("design/mocks/ has no rendered HTML mock of the core screen")
    return problems


def _inside(relative, directories):
    return any(relative == d or relative.startswith(d.rstrip("/") + "/") for d in directories)


def source_files(project, system):
    excluded = set(system.get("exclude", []))
    seen = set()
    for source in system["sources"]:
        base = (project / source).resolve()
        if not base.is_relative_to(project):
            raise DesignError(f"system.json: source escapes the project: {source}")
        if base.is_file():
            candidates = [base]
        elif base.is_dir():
            candidates = []
            for root, dirs, files in os.walk(base):
                dirs[:] = sorted(d for d in dirs if d not in SKIPPED_DIRS and d not in excluded
                                 and not (Path(root) / d).is_symlink())
                candidates += [Path(root) / f for f in sorted(files)]
        else:
            continue
        for path in candidates:
            relative = path.relative_to(project).as_posix()
            if (path.suffix in SOURCE_SUFFIXES and not SKIPPED_NAME.search(path.name)
                    and not path.is_symlink() and relative not in seen and not _inside(relative, excluded)):
                seen.add(relative)
                yield relative, path


def _icon_package(source):
    return next((p for p in ICON_PACKAGES if source == p or source.startswith(p + "/")), None)


def lint_text(relative, text, system):
    """Return violations as (line, rule, message) for one file."""
    scales = system["scales"]
    suffix = Path(relative).suffix
    token_file = relative in system.get("token_files", [])
    in_kit = _inside(relative, system["ui_kit_dirs"])
    allowed_colors = set(system["color_names"])
    allowed_prefixes = tuple(system.get("tailwind", {}).get("allow_arbitrary_prefixes", []))
    icon_family = system["icons"]["packages"][0]
    icon_sizes = {float(v) for v in system["icons"]["sizes"]}
    imports_icons = False
    violations = []
    lines = text.splitlines()
    for line in lines:
        for source in IMPORT_SOURCE.findall(line):
            if _icon_package(source) and (source == icon_family or source.startswith(icon_family + "/")):
                imports_icons = True
    primitives = [(tag, re.compile(rf"<{re.escape(tag)}(?=[\s>/]|$)"))
                  for tag in system.get("primitive_elements", [])]

    for number, line in enumerate(lines, 1):
        marker = ALLOW_MARKER.search(line)
        if marker:
            if not marker.group(1):
                violations.append((number, "unjustified-allow",
                                   "design-lint-allow needs a reason: `design-lint-allow: <why>`"))
            continue
        if line.lstrip().startswith(COMMENT_PREFIXES):
            continue
        found = []
        for source in IMPORT_SOURCE.findall(line):
            package = _icon_package(source)
            if package and not (source == icon_family or source.startswith(icon_family + "/")):
                found.append(("icon-family", f"icons come from {icon_family} only, not {source}"))
        if not token_file:
            for match in HEX_COLOR.finditer(line):
                found.append(("raw-color", f"raw color {match.group(0)} outside token files"))
            for match in COLOR_FUNCTION.finditer(line):
                found.append(("raw-color", f"raw color {match.group(1)}() outside token files"))
        for match in ARBITRARY_UTILITY.finditer(line):
            if not (allowed_prefixes and match.group(1).startswith(allowed_prefixes)):
                found.append(("arbitrary-value", f"arbitrary utility {match.group(0)}; use a token"))
        for match in PALETTE_UTILITY.finditer(line):
            if match.group(1) not in allowed_colors:
                found.append(("default-palette", f"framework palette color {match.group(0)}; "
                              f"use a named token ({', '.join(sorted(allowed_colors))})"))
        for match in SPACING_UTILITY.finditer(line):
            if match.group(2) not in scales["spacing"]:
                found.append(("spacing-scale", f"{match.group(0).lstrip('-')} is off the spacing scale "
                              f"({' '.join(scales['spacing'])})"))
        for match in RADIUS_UTILITY.finditer(line):
            parts = [p for p in match.group(1).split("-") if p]
            if parts and parts[0] in SIDES:
                parts = parts[1:]
            key = "-".join(parts) or "DEFAULT"
            if key not in scales["radius"]:
                found.append(("radius-scale", f"{match.group(0)} is off the radius scale "
                              f"({' '.join(scales['radius'])})"))
        for match in FONT_SIZE_UTILITY.finditer(line):
            if match.group(1) not in scales["font_size"]:
                found.append(("type-scale", f"{match.group(0)} is off the type scale "
                              f"({' '.join(scales['font_size'])})"))
        for match in FONT_WEIGHT_UTILITY.finditer(line):
            if match.group(1) not in scales["font_weight"]:
                found.append(("type-scale", f"{match.group(0)} is not an allowed weight "
                              f"({' '.join(scales['font_weight'])})"))
        if imports_icons:
            for match in ICON_SIZE.finditer(line):
                if float(match.group(1)) not in icon_sizes:
                    found.append(("icon-size", f"icon size {match.group(1)} is not allowed "
                                  f"({' '.join(str(v) for v in system['icons']['sizes'])})"))
        if suffix in MARKUP_SUFFIXES and not in_kit:
            for tag, pattern in primitives:
                if pattern.search(line):
                    found.append(("kit-bypass", f"raw <{tag}> element outside the "
                                  "UI kit; compose the kit component or report KIT_GAP"))
        if suffix in STYLE_SUFFIXES and not token_file:
            for match in CSS_SPACING.finditer(line):
                for value in PX_VALUE.findall(match.group(2)):
                    if abs(float(value)) not in {float(v) for v in scales["spacing_px"]}:
                        found.append(("spacing-scale", f"{match.group(1)} {value}px is off the spacing scale"))
            for match in CSS_RADIUS.finditer(line):
                for value in PX_VALUE.findall(match.group(1)):
                    if float(value) not in {float(v) for v in scales["radius_px"]}:
                        found.append(("radius-scale", f"border-radius {value}px is off the radius scale"))
        for rule_id, pattern, message in system["_anti_patterns"]:
            if pattern.search(line):
                found.append((f"anti-pattern:{rule_id}", message))
        violations += [(number, rule, message) for rule, message in found]
    return violations


def lint_project(project):
    system = load_system(project)
    files = list(source_files(project, system))
    if not files:
        raise DesignError("No UI source file found under system.json sources; refusing a vacuous PASS.")
    results = []
    for relative, path in files:
        text = path.read_text(encoding="utf-8", errors="replace")
        results += [(relative, *violation) for violation in lint_text(relative, text, system)]
    return len(files), results


def main(argv=None, project=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--project", default=".", type=Path)
    parser.add_argument("--spec", action="store_true", help="check only the designer's deliverable")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args(argv)
    project = (project or args.project).resolve()
    report = {"project": str(project), "spec": [], "violations": [], "files": 0}
    try:
        report["spec"] = check_spec(project)
        if not args.spec and not report["spec"]:
            report["files"], found = lint_project(project)
            report["violations"] = [{"file": f, "line": n, "rule": r, "message": m} for f, n, r, m in found]
    except (DesignError, OSError, UnicodeDecodeError) as error:
        report["spec"].append(str(error))
    if report["spec"]:
        status = 2
    else:
        status = 1 if report["violations"] else 0
    report["verdict"] = {0: "PASS", 1: "FAIL", 2: "ERROR"}[status]
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        for problem in report["spec"]:
            print(f"SPEC  {problem}", file=sys.stderr)
        for v in report["violations"]:
            print(f"{v['file']}:{v['line']}  {v['rule']}  {v['message']}")
        scope = "design spec" if args.spec else f"design spec + {report['files']} UI file(s)"
        print(f"design-lint {report['verdict']}: {scope}, {len(report['violations'])} violation(s)",
              file=sys.stderr if status else sys.stdout)
    return status


if __name__ == "__main__":
    sys.exit(main())
