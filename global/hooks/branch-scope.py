#!/usr/bin/env python3
"""Decide whether one git push/merge segment changes a production project.

Usage: branch-scope.py SEGMENT CWD GRANTS_FILE
Prints a reason when the user must confirm, nothing when the operation only
touches a work branch. Never runs the segment; it only reads the current branch.

Pushing a work branch changes nothing that users see. What matters is the
branch that receives the change: the default and release branches (plus any
`deploy-branch` the user declared) are protected. A merge rewrites the files of
the checkout, so it also needs approval when that checkout is what production
serves, unless the user recorded `checkout-not-served` for the project.
"""
from pathlib import Path
import shlex
import subprocess
import sys

PROTECTED = {"main", "master", "production", "prod", "live", "deploy", "gh-pages"}
PUSH_VALUE_OPTIONS = {"--repo", "-o", "--push-option", "--receive-pack", "--exec"}
PUSH_WIDE_OPTIONS = {"--all", "--mirror", "--tags", "--branches"}


def read_grants(path):
    try:
        lines = Path(path).read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError):
        return set()
    return {" ".join(line.split("#", 1)[0].split()) for line in lines} - {""}


def current_branch(cwd):
    try:
        result = subprocess.run(["git", "-C", cwd, "symbolic-ref", "--quiet", "--short", "HEAD"],
                                capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.SubprocessError):
        return None
    return result.stdout.strip() or None if result.returncode == 0 else None


def protected(branch, grants, action):
    if branch is None:
        return True
    if f"{action} {branch}" in grants:
        return False
    deploy = {grant.split(" ", 1)[1] for grant in grants if grant.startswith("deploy-branch ")}
    return (branch in PROTECTED or branch in deploy
            or branch.startswith(("release", "deploy/", "prod/", "production/")))


def push_reason(args, cwd, grants):
    positional, delete = [], False
    i = 0
    while i < len(args):
        arg = args[i]
        if arg in PUSH_WIDE_OPTIONS:
            return f"`git push {arg}` publishes more than one work branch."
        if arg in ("-d", "--delete"):
            delete = True
        elif arg in PUSH_VALUE_OPTIONS:
            i += 1
        elif not arg.startswith("-"):
            positional.append(arg)
        i += 1
    refspecs = positional[1:]
    targets = []
    if not refspecs:
        if delete:
            return "A branch deletion without a named branch needs confirmation."
        targets.append(current_branch(cwd))
    for spec in refspecs:
        spec = spec.lstrip("+")
        target = spec.split(":", 1)[1] if ":" in spec else spec
        if target in ("", "HEAD"):
            target = current_branch(cwd)
        elif target.startswith("refs/heads/"):
            target = target[len("refs/heads/"):]
        elif target.startswith("refs/"):
            return f"Pushing `{target}` (a tag or another ref) can trigger a release."
        targets.append(target)
    for target in targets:
        if protected(target, grants, "push"):
            name = target or "an unknown branch"
            return (f"This push changes `{name}`, a protected branch of a production project. "
                    f"Confirm, or record `agentic grant <project> push {name}` to allow it.")
    return ""


def merge_reason(args, cwd, grants):
    if any(arg in ("--abort", "--quit") for arg in args):
        return ""
    branch = current_branch(cwd)
    if protected(branch, grants, "merge"):
        name = branch or "an unknown branch"
        return (f"This merge changes `{name}`, a protected branch of a production project. "
                f"Confirm, or record `agentic grant <project> merge {name}` to allow it.")
    if "checkout-not-served" not in grants:
        return ("This merge rewrites files in a production checkout that may be served live. "
                "Confirm, or record `agentic grant <project> checkout-not-served` if production runs elsewhere.")
    return ""


def reason(segment, cwd, grants_file):
    try:
        tokens = shlex.split(segment)
    except ValueError:
        tokens = segment.split()
    if "git" not in tokens:
        return "This git operation could not be read; confirm it."
    tokens = tokens[tokens.index("git") + 1:]
    if not tokens or tokens[0].startswith("-"):
        # `git -C other push` or global options: the target repository is unclear.
        return "A git push or merge with global options needs confirmation in a production project."
    grants = read_grants(grants_file)
    if tokens[0] == "push":
        return push_reason(tokens[1:], cwd, grants)
    if tokens[0] == "merge":
        return merge_reason(tokens[1:], cwd, grants)
    return ""


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Branch scope could not be verified; confirmation is required.")
    else:
        print(reason(*sys.argv[1:]))
