#!/usr/bin/env python3
"""Independent real CLI checks. Tool: codex; role: qa. No model/provider calls."""
import hashlib, json, os, pathlib, subprocess, sys, time
ROOT = pathlib.Path("/tmp/agentic-kit-merge-2026-09-08/qa")
SOURCE = pathlib.Path("/tmp/agentic-kit-merge-2026-09-08/candidate")
CLI = SOURCE / "scripts/agentic.py"
RUN = ROOT / ("cli-fixtures-" + str(time.time_ns()))
RUN.mkdir(parents=True)
for d in ("home", "tmp", "codex", "claude", "xdg-config", "xdg-cache", "xdg-data", "git-template"):
    (RUN / d).mkdir()
CONFIG = RUN / "gitconfig"
CONFIG.write_text("[user]\n\tname = Synthetic QA\n\temail = qa@example.invalid\n")
ENV = {
    "PATH": "/usr/bin:/bin", "HOME": str(RUN / "home"), "TMPDIR": str(RUN / "tmp"),
    "CODEX_HOME": str(RUN / "codex"), "CLAUDE_CONFIG_DIR": str(RUN / "claude"),
    "XDG_CONFIG_HOME": str(RUN / "xdg-config"), "XDG_CACHE_HOME": str(RUN / "xdg-cache"),
    "XDG_DATA_HOME": str(RUN / "xdg-data"), "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_CONFIG_SYSTEM": "/dev/null", "GIT_CONFIG_GLOBAL": str(CONFIG),
    "GIT_TEMPLATE_DIR": str(RUN / "git-template"), "LC_ALL": "C.UTF-8",
}
commands, checks = [], []
before = hashlib.sha256(CLI.read_bytes()).hexdigest()
assert CLI.resolve().is_relative_to(SOURCE) and not CLI.is_symlink()
def invoke(args, timeout=3):
    start = time.monotonic()
    try:
        p = subprocess.run(args, env=ENV, cwd=RUN, capture_output=True, text=True, timeout=timeout)
        r = {"command": args, "exit": p.returncode, "stdout": p.stdout, "stderr": p.stderr,
             "duration_seconds": round(time.monotonic()-start, 4), "timeout": False}
    except subprocess.TimeoutExpired:
        r = {"command": args, "exit": None, "stdout": "", "stderr": "TIMEOUT",
             "duration_seconds": round(time.monotonic()-start, 4), "timeout": True}
    commands.append(r)
    return r
def cli(command, project, *args):
    return invoke(["/usr/bin/python3", "-I", "-B", str(CLI), command, "--project", str(project), *args])
def check(name, passed, detail=""):
    checks.append({"name": name, "passed": bool(passed), "detail": detail})
def expect_ok(r):
    assert r["exit"] == 0, r
project = RUN / "fresh project with spaces"
r = invoke(["git", "init", "-q", "-b", "feature/synthetic-qa", str(project)])
expect_ok(r)
r = cli("log", project)
check("Uninitialized project log returns empty without error", r["exit"] == 0 and r["stdout"] == "")
r = cli("init", project)
expect_ok(r)
check("Real init creates contract and local legacy memory links",
      (project / ".agentic/CONTRACT.md").is_file() and
      (project / ".claude/memory").resolve() == project / ".agentic/memory")
r = cli("log", project)
check("Initialized project empty log", r["exit"] == 0 and r["stdout"] == "")
for summary in ("Synthetic first verified step", "Synthetic resumed next step"):
    expect_ok(cli("checkpoint", project, "--tool", "codex", "--agent", "qa", "--summary", summary,
                  "--next", "Independent synthetic review", "--test", "Synthetic acceptance scenario",
                  "--file", "synthetic.txt"))
events = project / ".agentic/events"
event_files = sorted(events.glob("*.json"))
records = [json.loads(p.read_text()) for p in event_files]
check("Two real checkpoints persist explicit codex/qa attribution and next action",
      len(records) == 2 and all(r["tool"] == "codex" and r["agent"] == "qa" and
      r["kind"] == "checkpoint" and r["next_steps"] == "Independent synthetic review" for r in records))
expected = "".join(p.read_text().strip() + "\n" for p in event_files)
first = cli("log", project)
check("Log returns real checkpoint files in filename order", first["exit"] == 0 and first["stdout"] == expected)
resumed = cli("log", project)
check("Fresh CLI process resumes exact persisted log", resumed["exit"] == 0 and resumed["stdout"] == first["stdout"])
(events / "zz-ignored.txt").write_text("Synthetic non-event ignored")
ordered = cli("log", project)
check("Non-JSON file does not alter log", ordered["exit"] == 0 and ordered["stdout"] == expected)
canary = RUN / "outside-project-canary.txt"
marker = "SYNTHETIC_QA_CANARY_7845_NO_REAL_SECRET"
canary.write_text(marker)
def safe_rejection(name, r, message):
    check(name, r["exit"] == 1 and message in r["stderr"] and marker not in r["stdout"]+r["stderr"]
          and not r["timeout"], "Return code 1, explicit refusal, no canary disclosure, no timeout.")
link = events / "000-untrusted.json"
link.symlink_to(canary)
try: safe_rejection("External event symlink refused without canary leak", cli("log", project), "Cannot safely open event file")
finally: link.unlink()
outside = RUN / "outside-project-events"
outside.mkdir()
(outside / "000-canary.json").write_text(marker)
saved_events = project / ".agentic/events.saved"
events.rename(saved_events)
events.symlink_to(outside, target_is_directory=True)
try: safe_rejection("External events-directory symlink refused", cli("log", project), "Event path must contain real directories")
finally:
    events.unlink()
    saved_events.rename(events)
outside_agentic = RUN / "outside-project-agentic"
(outside_agentic / "events").mkdir(parents=True)
(outside_agentic / "events/000-canary.json").write_text(marker)
agentic = project / ".agentic"
saved_agentic = project / ".agentic.saved"
agentic.rename(saved_agentic)
agentic.symlink_to(outside_agentic, target_is_directory=True)
try: safe_rejection("External .agentic-directory symlink refused", cli("log", project), "Event path must contain real directories")
finally:
    agentic.unlink()
    saved_agentic.rename(agentic)
fifo = events / "000-fifo.json"
os.mkfifo(fifo)
try: safe_rejection("FIFO event refused promptly rather than blocking", cli("log", project), "Event must be a regular file")
finally: fifo.unlink()
final = cli("log", project)
check("Normal persisted log recovers after removing hostile fixtures", final["exit"] == 0 and final["stdout"] == expected)
check("External synthetic canary unchanged", canary.read_text() == marker)
check("Audited CLI content unchanged", before == hashlib.sha256(CLI.read_bytes()).hexdigest())
report = {"tool": "codex", "role": "qa", "source": str(CLI), "source_sha256": before,
          "fixture_root": str(RUN), "environment_keys": sorted(ENV), "commands": commands,
          "checks": checks, "passed": sum(c["passed"] for c in checks), "total": len(checks)}
(ROOT / "cli-results.json").write_text(json.dumps(report, indent=2) + "\n")
lines = ["# Independent CLI QA — codex / qa", "", "Verdict: " + ("PASS" if all(c["passed"] for c in checks) else "FAIL"),
         "", "Scope: WF01 corrected event-log reader, real local CLI processes and synthetic Git repository.",
         "Candidate code was read-only for QA; all writes are under the QA directory.",
         "No model invocation, provider, browser, real account, personal memory or notification was used.",
         "", "## Predeclared acceptance results", ""]
lines += [("- [x] " if c["passed"] else "- [ ] ") + c["name"] for c in checks]
lines += ["", "## Evidence and reproduction", "", "- Exact command/exit/stdout/stderr/timing: cli-results.json.",
          "- Script: run_cli_qa.py; execute with /usr/bin/python3 -I -B.",
          "- Fixture root: " + str(RUN), "- Candidate scripts/agentic.py SHA-256: " + before,
          "- Every subprocess has a three-second timeout; the outer runner also has a 30-second timeout.",
          "- Child environment is allowlisted; HOME, TMPDIR, CODEX_HOME, CLAUDE_CONFIG_DIR, XDG and Git configuration use synthetic paths.",
          "- Git hooks/templates come only from the empty synthetic template directory.",
          "", "## Limits", "", "This is real CLI/file-system behavior, not an agent memory reasoning or model handoff test.",
          "Successful log persistence does not prove the model obeys the recorded next action.",
          "No race attack, concurrent hostile filesystem mutation, deployment or UI behavior was evaluated here.",
          "Normal checkpoint files may precede an unsafe filename before log rejects it; the security criterion is no unsafe target disclosure.",
          "No shared-memory update is proposed."]
(ROOT / "RESULTS.md").write_text("\n".join(lines) + "\n")
print(json.dumps({"passed": report["passed"], "total": report["total"], "fixture_root": str(RUN), "source_sha256": before}))
sys.exit(0 if all(c["passed"] for c in checks) else 1)
