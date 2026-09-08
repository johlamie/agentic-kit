#!/usr/bin/env python3
"""Execute only the hook process; payload commands are inert JSON data. codex / qa."""
import hashlib, json, pathlib, subprocess, time
ROOT=pathlib.Path("/tmp/agentic-kit-merge-2026-09-08/qa")
CANDIDATE=pathlib.Path("/tmp/agentic-kit-merge-2026-09-08/candidate")
HOOK=CANDIDATE/"global/hooks/agent-guard.sh"
HELPER=CANDIDATE/"global/hooks/local-operations.py"
RUN=ROOT/("guard-fixtures-"+str(time.time_ns()))
RUN.mkdir()
for d in ("home/.claude","tmp","codex","xdg-config","xdg-cache"):
    (RUN/d).mkdir(parents=True)
(RUN/"home/.claude/production-projects").write_text("# Synthetic fixture only\nlive-app\n")
ENV={"PATH":"/usr/bin:/bin","HOME":str(RUN/"home"),"TMPDIR":str(RUN/"tmp"),
     "CODEX_HOME":str(RUN/"codex"),"CLAUDE_CONFIG_DIR":str(RUN/"home/.claude"),
     "XDG_CONFIG_HOME":str(RUN/"xdg-config"),"XDG_CACHE_HOME":str(RUN/"xdg-cache"),
     "CLAUDE_PROJECTS_ROOT":"/home/agentic-merge-synthetic/projects","LC_ALL":"C.UTF-8",
     "PYTHONDONTWRITEBYTECODE":"1"}
hashes={str(p.relative_to(CANDIDATE)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (HOOK,HELPER)}
assert all(p.resolve().is_relative_to(CANDIDATE) and not p.is_symlink() for p in (HOOK,HELPER))
release=["npm run deploy:prod","npm run migrate:prod","./deploy.sh","bash ./scripts/migrate.sh"]
cases=[("live-app",command,"ask") for command in release]
cases += [("live-app","git diff ./deploy.sh","NO_OPINION"),("live-app","echo ./deploy.sh","NO_OPINION")]
cases += [("scratch-app",command,"NO_OPINION") for command in release]
results=[]
for project,command,expected in cases:
    payload={"hook_event_name":"PreToolUse","tool_name":"Bash","agent_type":"",
             "cwd":ENV["CLAUDE_PROJECTS_ROOT"]+"/"+project,"tool_input":{"command":command}}
    start=time.monotonic()
    try:
        process=subprocess.run(["/bin/bash",str(HOOK)],input=json.dumps(payload),capture_output=True,text=True,
                               env=ENV,cwd=RUN,timeout=3)
        if not process.stdout.strip():
            decision="NO_OPINION"
        else:
            response=json.loads(process.stdout)
            assert response["hookSpecificOutput"]["hookEventName"]=="PreToolUse"
            decision=response["hookSpecificOutput"]["permissionDecision"]
        result={"payload":payload,"expected":expected,"decision":decision,"exit":process.returncode,
                "stdout":process.stdout,"stderr":process.stderr,"timeout":False}
        result["passed"]=decision==expected and process.returncode==0 and process.stderr==""
    except (subprocess.TimeoutExpired,ValueError,KeyError,AssertionError) as error:
        result={"payload":payload,"expected":expected,"passed":False,"error":str(error)}
    result["duration_seconds"]=round(time.monotonic()-start,4)
    results.append(result)
unchanged=all(hashlib.sha256((CANDIDATE/path).read_bytes()).hexdigest()==digest for path,digest in hashes.items())
passed=sum(r["passed"] for r in results)
report={"tool":"codex","role":"qa","scope":"PreToolUse Bash JSON decisions only; command strings never executed",
        "fixture_root":str(RUN),"project_root_is_text_only":ENV["CLAUDE_PROJECTS_ROOT"],
        "source_sha256":hashes,"source_unchanged":unchanged,"subprocess_command":["/bin/bash",str(HOOK)],
        "environment":ENV,"results":results,"passed":passed,"total":len(results)}
(ROOT/"guard-results.json").write_text(json.dumps(report,indent=2)+"\n")
lines=["# Guard JSON QA — codex / qa","","Verdict: "+("PASS" if passed==len(results) and unchanged else "FAIL"),
       "","Real hook processes received PreToolUse Bash JSON on stdin. Payload commands were never executed.",
       "The synthetic live project exists only as a cwd string; no directory was created or opened under /home.",
       "Production listing, HOME, TMPDIR and configuration paths are new synthetic fixtures under qa/.",
       "","## Acceptance results","",
       "| Project | Payload command (inert text) | Expected | Observed | Result |",
       "|---|---|---|---|---|"]
for r in results:
    lines.append("| "+r["payload"]["cwd"].rsplit("/",1)[-1]+" | "+r["payload"]["tool_input"]["command"]+
                 " | "+r["expected"]+" | "+r.get("decision","ERROR")+" | "+("PASS" if r["passed"] else "FAIL")+" |")
lines += ["","All source hashes remained unchanged: "+str(unchanged)+".",
          "Each hook process has a three-second timeout; the outer execution has a 45-second bound.",
          "","## Evidence","","- guard-results.json: exact input payloads, output JSON/empty output, exit codes, timings and hashes.",
          "- run_guard_qa.py: independent executable fixture.",
          "- GUARD_ACCEPTANCE.md: criteria recorded before execution.",
          "- Fixture root: "+str(RUN),
          "","## Limits","","NO_OPINION is not permission: it defers to the remaining runtime permission system.",
          "ASK is a hook decision, not evidence of an actual human dialog or approval.",
          "This test does not exercise Claude hook registration, a deployment, model behavior, arbitrary shell parsing, symlinked project roots or a sandbox boundary.",
          "No global configuration, live app, genuine account, personal memory or network service was accessed."]
(ROOT/"GUARD_RESULTS.md").write_text("\n".join(lines)+"\n")
print(json.dumps({"passed":passed,"total":len(results),"source_unchanged":unchanged,"hashes":hashes}))
raise SystemExit(0 if passed==len(results) and unchanged else 1)
