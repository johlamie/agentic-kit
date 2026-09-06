#!/usr/bin/env python3
"""Classify selected local mutations without running commands or granting permission.

Usage: local-operations.py COMMAND CWD
An empty response defers to Claude's native approval classifier. A nonempty
response explains why these operations still need manual approval.
Supabase resets additionally require supabase/.agentic-disposable-local: a
nonempty, project-contained record of user authorization for disposable data.
The marker is evidence for the native classifier, never an authorization grant.
"""
from pathlib import Path
import os
import re
import shlex
import sys

PACKAGE = re.compile(r"(?:@[a-zA-Z0-9_.-]+/)?[a-zA-Z0-9][a-zA-Z0-9_.-]*\Z")
PIP_PACKAGE = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9_.-]*\Z")
SEPARATORS = {";", "&&", "||", "|", "&", "(", ")", "<", ">", ">>", "<<"}


def is_package(value):
    return bool(PACKAGE.fullmatch(value))


def project_file(cwd, relative):
    try:
        root = Path(cwd).resolve()
        file = root / relative
        return file.is_file() and file.resolve().is_relative_to(root)
    except (OSError, RuntimeError):
        return False


def verified_venv_executable(executable, cwd):
    """Require an explicit executable in a venv physically inside this project."""
    if "/" not in executable:
        return False
    try:
        root = Path(cwd).resolve()
        candidate = Path(executable)
        if not candidate.is_absolute():
            candidate = root / candidate
        directory = candidate.parent.resolve()
        venv = directory.parent
        return (directory.name == "bin" and venv.is_relative_to(root)
                and (venv / "pyvenv.cfg").is_file()
                and (venv / "pyvenv.cfg").resolve().is_relative_to(root)
                and candidate.is_file() and os.access(candidate, os.X_OK)
                and (not candidate.name.startswith("pip") or candidate.resolve().is_relative_to(venv)))
    except (OSError, RuntimeError):
        return False


def classify_tokens(tokens, cwd):
    if not tokens:
        return None
    command, args = tokens[0], tokens[1:]
    name = Path(command).name
    if name == "npx":
        supported = {"supabase", "ncu", "npm-check-updates"}
        if args and args[0] in supported:
            return classify_tokens(args, cwd)
        if args and (args[0].startswith("-") or any(args[0].startswith(tool + "@") for tool in supported)) and any(arg in supported or any(arg.startswith(tool + "@") for tool in supported) for arg in args):
            return "Package runner flags or version-qualified mutation tools need approval to verify their scope."
        return None
    # Explicit executable paths to package managers must not bypass this check.
    if name in {"npm", "yarn", "pnpm"}:
        operations = {"uninstall", "remove", "rm", "update"} if name == "npm" else {"remove"}
        operation = next((arg for arg in args if arg in operations), None)
        if operation is None:
            return None
        # Only a real subcommand (possibly preceded by flags) counts, not text
        # passed to npm run or another unrelated command.
        before = args[:args.index(operation)]
        if before and not before[0].startswith("-"):
            return None
        reason = "Dependency changes require named packages in this project; global, broad or ambiguous targeting needs approval."
        if before or not project_file(cwd, "package.json"):
            return reason
        rest = args[1:]
        flags = {"--save", "--save-dev", "--save-optional", "--save-prod", "--no-save", "-D", "-O", "-P"}
        if operation == "update":
            flags = set()
        packages = [arg for arg in rest if arg not in flags]
        if not packages or not all(is_package(arg) for arg in packages):
            return reason
        return ""
    if name in {"pip", "pip3"} or re.fullmatch(r"pip3\.\d+", name):
        pip_args = args
    elif re.fullmatch(r"python(?:3(?:\.\d+)?)?", name) and args[:2] == ["-m", "pip"]:
        pip_args = args[2:]
    else:
        pip_args = None
    if pip_args is not None:
        if "uninstall" not in pip_args:
            return None
        index = pip_args.index("uninstall")
        if index and not pip_args[0].startswith("-"):
            return None
        packages = [arg for arg in pip_args[index + 1:] if arg not in {"-y", "--yes"}]
        if (index != 0 or not verified_venv_executable(command, cwd)
                or not packages or not all(PIP_PACKAGE.fullmatch(arg) for arg in packages)):
            return "Python removals need approval unless they name packages and explicitly use an existing project-local virtual environment."
        return ""
    if name in {"ncu", "npm-check-updates"}:
        # A read-only inspection does not need this extra approval rule.
        if not any(arg in {"-u", "--upgrade", "--upgrade=true", "-i", "--interactive"} or (arg.startswith("-") and not arg.startswith("--") and any(flag in arg[1:] for flag in "ui")) for arg in args):
            return None
        reason = "Dependency manifest updates need approval unless limited to named packages and patch or minor versions in this project."
        if not project_file(cwd, "package.json"):
            return reason
        target = None
        packages = []
        i = 0
        while i < len(args):
            arg = args[i]
            if arg in {"-u", "--upgrade", "--upgrade=true"}:
                pass
            elif arg in {"-t", "--target", "-f", "--filter"}:
                i += 1
                if i >= len(args):
                    return reason
                if arg in {"-t", "--target"}:
                    if target is not None:
                        return reason
                    target = args[i]
                else:
                    packages.extend(args[i].split(","))
            elif arg.startswith("--target="):
                if target is not None:
                    return reason
                target = arg.split("=", 1)[1]
            elif arg.startswith("--filter="):
                packages.extend(arg.split("=", 1)[1].split(","))
            elif is_package(arg):
                packages.append(arg)
            else:
                return reason
            i += 1
        return "" if target in {"patch", "minor"} and packages and all(is_package(p) for p in packages) else reason
    if name == "supabase" and any(args[i:i + 2] == ["db", "reset"] for i in range(len(args) - 1)):
        if args[:2] != ["db", "reset"]:
            return "Database reset with a custom or ambiguous project target needs approval."
        rest = args[2:]
        if not (rest.count("--local") == 1 and all(arg in {"--local", "--yes", "-y"} for arg in rest)
                and project_file(cwd, "supabase/config.toml")):
            return "Database reset needs approval unless it explicitly targets --local in a configured Supabase project."
        marker = "supabase/.agentic-disposable-local"
        try:
            if not project_file(cwd, marker) or not (Path(cwd) / marker).read_text(encoding="utf-8").strip():
                return "Local database reset needs a project record of user-authorized disposable data in supabase/.agentic-disposable-local."
        except (OSError, UnicodeError):
            return "The disposable local database authorization record could not be verified; approval is required."
        return ""
    return None


def approval_reason(command, cwd):
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|()<>")
        lexer.whitespace_split = True
        lexer.commenters = ""
        tokens = list(lexer)
    except ValueError:
        return "Malformed shell command needs approval before dependency or database mutations can be assessed."
    segments = [[]]
    composed = "\n" in command
    for token in tokens:
        if token in SEPARATORS or (token and all(char in ";&|()<>" for char in token)):
            composed = True
            segments.append([])
        else:
            segments[-1].append(token)
    results = [classify_tokens(segment, cwd) for segment in segments]
    reasons = [result for result in results if result]
    if reasons:
        return reasons[0]
    if composed and any(result is not None for result in results):
        return "Composed shell commands containing dependency or database mutations need approval; run the local operation separately."
    return ""


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Local operation scope could not be verified; manual approval is required.")
    else:
        reason = approval_reason(sys.argv[1], sys.argv[2])
        if reason:
            print(reason)
