#!/usr/bin/env python3
"""Shared project memory and explicit Claude/Codex handoffs. Python 3.10+, POSIX."""

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parent.parent
ROLES = ("architect", "builder", "designer", "devops", "product-manager", "qa",
         "researcher", "reviewer")
BEGIN = "<!-- agentic-kit:begin -->"
END = "<!-- agentic-kit:end -->"


class KitError(Exception):
    pass


def git(project, *args, check=True):
    return subprocess.run(["git", "-C", str(project), *args], check=check,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.decode(
                              "utf-8", errors="surrogateescape").rstrip("\n")


def project_root(path):
    return Path(git(path, "rev-parse", "--show-toplevel")).resolve()


def exists(path):
    return os.path.lexists(path)


def atomic_write(path, content, *, replace=True):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".agentic-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        if replace:
            os.replace(name, path)
        else:
            # Publish a complete immutable event without overwriting an existing file.
            os.link(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def managed_text(path, body):
    if path.is_symlink():
        raise KitError(f"Refusing to replace an instruction symlink: {path}")
    previous = path.read_text() if path.exists() else ""
    if previous.count(BEGIN) != previous.count(END) or previous.count(BEGIN) > 1:
        raise KitError(f"Malformed managed block: {path}")
    block = f"{BEGIN}\n{body.rstrip()}\n{END}"
    if BEGIN in previous:
        if previous.index(END) < previous.index(BEGIN):
            raise KitError(f"Malformed managed block: {path}")
        return previous[:previous.index(BEGIN)] + block + previous[previous.index(END) + len(END):]
    return previous.rstrip() + ("\n\n" if previous.strip() else "") + block + "\n"


def ensure_local(project, relative):
    """Reject symlink escapes before any project migration or generated write."""
    target = project / relative
    if not target.resolve().is_relative_to(project):
        raise KitError(f"Path escapes project: {target}")
    return target


@contextmanager
def project_lock(project):
    # Common Git directory serializes linked worktrees as well as this checkout.
    common = Path(git(project, "rev-parse", "--git-common-dir"))
    common = (project / common).resolve()
    lock = common / "agentic-session.lock"
    with lock.open("a+") as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise KitError("Another agentic session owns this repository; exit it before switching tools.") from exc
        yield


def migration_plan(project, name):
    old = ensure_local(project, f".claude/{name}")
    new = ensure_local(project, f".agentic/{name}")
    if new.is_symlink():
        raise KitError(f"Canonical memory must be a real directory: {new}")
    if old.is_symlink():
        if old.resolve() != new.resolve():
            raise KitError(f"Legacy memory has a different symlink target: {old}")
    elif exists(old) and exists(new):
        raise KitError(f"Both {old} and {new} exist; reconcile their contents before initialization.")
    for path in (old, new):
        if exists(path) and not path.is_symlink() and not path.is_dir():
            raise KitError(f"Expected memory directory: {path}")
        if path.is_dir():
            for item in path.rglob("*"):
                if item.is_symlink():
                    raise KitError(f"Review memory symlink before migration: {item}")
    return old, new


def initialize(project):
    plans = [migration_plan(project, name) for name in ("memory", "agent-memory")]
    for relative in (".agentic", ".claude", ".agentic/events", ".agentic/CONTRACT.md",
                     ".agentic/CODEX.md", "CLAUDE.md", "AGENTS.md", ".gitignore"):
        path = ensure_local(project, relative)
        if path.is_symlink():
            raise KitError(f"Review existing symlink before initialization: {path}")
    claude = managed_text(project / "CLAUDE.md",
                          "Read `.agentic/CONTRACT.md` for shared memory, attribution and handoff rules.")
    codex = managed_text(project / "AGENTS.md",
                         "Read `.agentic/CODEX.md` and `.agentic/CONTRACT.md` before working.\n"
                         "Use the eight specialty subagents described there for substantial tasks.")
    # Preflight is complete before moving either legacy directory.
    for old, new in plans:
        new.parent.mkdir(parents=True, exist_ok=True)
        if exists(old) and not old.is_symlink():
            old.rename(new)
        else:
            new.mkdir(exist_ok=True)
        old.parent.mkdir(parents=True, exist_ok=True)
        if not old.is_symlink():
            old.symlink_to(os.path.relpath(new, old.parent), target_is_directory=True)
    memory = project / ".agentic/memory"
    for template in (ROOT / "global/templates/memory").glob("*.md"):
        target = memory / template.name
        if not target.exists():
            atomic_write(target, template.read_text())
    for name in ROLES:
        (project / ".agentic/agent-memory" / name).mkdir(exist_ok=True)
    (project / ".agentic/events").mkdir(exist_ok=True)
    atomic_write(project / ".agentic/CONTRACT.md", (ROOT / "shared/SESSION_CONTRACT.md").read_text())
    atomic_write(project / ".agentic/CODEX.md", (ROOT / "codex/AGENTS.md").read_text())
    atomic_write(project / "CLAUDE.md", claude)
    atomic_write(project / "AGENTS.md", codex)
    ignore_path = project / ".gitignore"
    ignore = ignore_path.read_text() if ignore_path.exists() else ""
    additions = [line for line in ("/.agentic/agent-memory/", "/.claude/agent-memory")
                 if line not in ignore.splitlines()]
    if additions:
        atomic_write(ignore_path, ignore.rstrip() + "\n\n# Private per-role memory\n" + "\n".join(additions) + "\n")


def role_config(name):
    text = (ROOT / "global/agents" / f"{name}.md").read_text()
    _, metadata, body = text.split("---", 2)
    fields = dict(line.split(": ", 1) for line in metadata.strip().splitlines())
    memory = (f"~/.claude/agent-memory/{name}/MEMORY.md" if fields["memory"] == "user"
              else f".agentic/agent-memory/{name}/MEMORY.md")
    adapter = (
        f"Codex adapter for role {name}. Read .agentic/CONTRACT.md when present.\n"
        f"Shared role memory: {memory}. Read it if present. Return proposed memory\n"
        "updates to the orchestrator, which is the sole shared-memory writer.\n"
        "Identify your tool as codex and your role in every report.\n"
        "The original role contract follows. This adapter overrides references\n"
        "to automatic memory injection, Claude tool names and Claude hooks:\n"
        "use available Codex tools with equivalent capabilities; Claude's\n"
        "agent-guard is not running in Codex. Keep its role restrictions as\n"
        "instructions and obey the active Codex permissions. Never claim those\n"
        "instructions are enforced tool restrictions. Missing MCP is a gap.\n"
    )
    if name == "reviewer":
        adapter += "Read-only role: return reports and memory proposals; ask the parent to run checks requiring writes.\n"
    if name == "devops":
        # Remove the runtime-specific assertion while preserving its intent.
        body = re.sub(r"- \*\*You prepare;.*?Everything else.*?is yours\.",
                      "- Prepare privileged/server/deployment commands for the orchestrator.\n"
                      "  Do not execute sudo/nginx/certbot/systemctl/deploy/push/merge as a subagent.\n"
                      "  Provisioning via MCP still requires the applicable human approval.", body, flags=re.S)
    config = {"name": name, "description": fields["description"],
              "developer_instructions": adapter + "\n" + body.strip() + "\n"}
    if name == "reviewer":
        config["sandbox_mode"] = "read-only"
    # TOML basic strings accept the JSON escapes used by these UTF-8 instructions.
    return "# Generated by agentic install from global/agents; rerun installation to refresh.\n" + "\n".join(
        f"{key} = {json.dumps(value, ensure_ascii=False)}" for key, value in config.items()) + "\n"


def install(home, codex_dir):
    home, codex_dir = home.resolve(), codex_dir.resolve()
    files = {codex_dir / "agents" / f"{name}.toml": role_config(name) for name in ROLES}
    instructions = (
        f"Read `{ROOT / 'codex/AGENTS.md'}` for the Agentic Delivery Kit roles and workflow.\n"
        f"Read `{ROOT / 'shared/SESSION_CONTRACT.md'}` for shared project memory and handoffs.\n"
        "Available roles: product-manager, researcher, architect, designer, builder, reviewer, qa, devops.\n"
        "If this runtime exposes generic delegation rather than custom role selection,\n"
        "read `agentic role <name>` and include its instructions in the delegated task.\n"
        "Apply these workflows to agentic projects and explicit kit requests; keep other tasks scoped."
    )
    files[codex_dir / "AGENTS.md"] = managed_text(codex_dir / "AGENTS.md", instructions)
    links = {home / ".local/bin/agentic": ROOT / "scripts/agentic.py"}
    for skill in (ROOT / "codex/skills").iterdir():
        links[home / ".agents/skills" / skill.name] = skill
    for path in files:
        if path.is_symlink():
            raise KitError(f"Refusing to replace existing symlink: {path}")
        if path.name != "AGENTS.md" and path.exists() and not path.read_text().startswith("# Generated by agentic install"):
            raise KitError(f"Existing custom agent would be overwritten: {path}")
    for path, source in links.items():
        if exists(path) and (not path.is_symlink() or path.resolve() != source.resolve()):
            raise KitError(f"Existing installation entry would be overwritten: {path}")
    for path, content in files.items():
        if not path.exists() or path.read_text() != content:
            atomic_write(path, content)
    for path, source in links.items():
        if not exists(path):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.symlink_to(source, target_is_directory=source.is_dir())
    print(f"Installed 8 Codex agents, 3 skills and {home / '.local/bin/agentic'}")
    print("Existing config.toml, models, MCP credentials and Claude settings preserved.")


def identity(args):
    tool = args.tool or os.environ.get("AGENTIC_TOOL")
    if tool not in ("claude", "codex"):
        raise KitError("Specify --tool claude|codex outside an agentic run session.")
    session = os.environ.get("AGENTIC_SESSION_ID", "manual-" + uuid.uuid4().hex)
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", session):
        raise KitError("Invalid AGENTIC_SESSION_ID")
    return {"tool": tool, "agent": args.agent, "session": session}


def snapshot(project):
    paths = git(project, "status", "--porcelain=v1", "--untracked-files=normal").splitlines()
    return {"head": git(project, "rev-parse", "--verify", "HEAD", check=False) or None,
            "branch": git(project, "branch", "--show-current"), "dirty_paths": paths}


def event(project, actor, kind, **details):
    directory = ensure_local(project, ".agentic/events")
    if not directory.is_dir():
        raise KitError("Initialize the project with agentic init first.")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    data = {"version": 1, "timestamp": stamp, "kind": kind, **actor, **details}
    path = directory / f"{stamp}-{uuid.uuid4().hex}.json"
    # Separate immutable event files make concurrent subagent checkpoints safe.
    atomic_write(path, json.dumps(data, ensure_ascii=True, indent=2) + "\n", replace=False)
    return path


def run_session(project, tool, arguments):
    if not (project / ".agentic/CONTRACT.md").is_file():
        raise KitError("Run agentic init before starting a shared session.")
    if os.environ.get("AGENTIC_SESSION_ID"):
        raise KitError("Exit the current agentic session before launching another.")
    if not shutil.which(tool):
        raise KitError(f"{tool} is not installed or not on PATH.")
    actor = {"tool": tool, "agent": "orchestrator", "session": uuid.uuid4().hex}
    environment = dict(os.environ, AGENTIC_TOOL=tool, AGENTIC_AGENT="orchestrator",
                       AGENTIC_SESSION_ID=actor["session"])
    with project_lock(project):
        before = snapshot(project)
        event(project, actor, "session-start", observed=before)
        command = [tool]
        if tool == "codex":
            # Explicit local policy; never inherit an unrelated permissive profile.
            command += ["--sandbox", "workspace-write", "--ask-for-approval", "on-request"]
        command += arguments
        result = 130
        try:
            result = subprocess.call(command, cwd=project, env=environment)
        except KeyboardInterrupt:
            pass
        finally:
            event(project, actor, "session-end", exit_code=result, observed=snapshot(project),
                  note="Process exit is not a QA verdict. Read the latest checkpoint.")
        return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    setup = commands.add_parser("install", help="Install Codex agents, skills and launcher without replacing personal config")
    setup.add_argument("--home", type=Path, default=Path.home())
    setup.add_argument("--codex-dir", type=Path)
    role = commands.add_parser("role", help="Print a shared role for runtimes using generic delegation")
    role.add_argument("name", choices=ROLES)
    for command in ("init", "status", "log", "checkpoint", "commit", "run"):
        sub = commands.add_parser(command)
        sub.add_argument("--project", default=".", type=Path)
        if command in ("checkpoint", "commit"):
            sub.add_argument("--tool", choices=("claude", "codex"))
            sub.add_argument("--agent", choices=("orchestrator", *ROLES), default="orchestrator")
            if command == "checkpoint":
                sub.add_argument("--summary", required=True)
                sub.add_argument("--next", required=True)
                sub.add_argument("--test", action="append", default=[])
                sub.add_argument("--file", action="append", default=[])
            else:
                sub.add_argument("--message", "-m", required=True)
        elif command == "run":
            sub.add_argument("tool", choices=("claude", "codex"))
            sub.add_argument("arguments", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    if args.command == "role":
        for line in role_config(args.name).splitlines():
            if line.startswith("developer_instructions = "):
                print(json.loads(line.split(" = ", 1)[1]))
        return 0
    if args.command == "install":
        codex_dir = args.codex_dir or (args.home / ".codex")
        install(args.home, codex_dir)
        return 0
    project = project_root(args.project)
    if args.command == "init":
        with project_lock(project):
            initialize(project)
        print(f"Shared project initialized: {project}")
    elif args.command == "run":
        arguments = args.arguments[1:] if args.arguments[:1] == ["--"] else args.arguments
        return run_session(project, args.tool, arguments)
    elif args.command == "status":
        print(json.dumps(snapshot(project), indent=2))
        state = ensure_local(project, ".agentic/memory/PROJECT_STATE.md")
        if state.exists():
            print(state.read_text())
    elif args.command == "log":
        for path in sorted(ensure_local(project, ".agentic/events").glob("*.json")):
            print(path.read_text().strip())
    else:
        actor = identity(args)
        if args.command == "checkpoint":
            print(event(project, actor, "checkpoint", summary=args.summary,
                        next_steps=args.next, tests=args.test, files=args.file,
                        observed=snapshot(project)))
        else:
            if not (project / ".agentic/events").is_dir():
                raise KitError("Initialize the project before an attributed commit.")
            message = args.message.rstrip() + "\n\n" + "\n".join(
                f"Agentic-{key.title()}: {value}" for key, value in actor.items())
            subprocess.run(["git", "-C", str(project), "commit", "-m", message], check=True)
            print(event(project, actor, "commit", head=snapshot(project)["head"]))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KitError, OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
