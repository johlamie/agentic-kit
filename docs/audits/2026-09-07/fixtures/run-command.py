#!/usr/bin/env python3
import argparse,datetime,json,os,pathlib,signal,subprocess,time,sys
R=pathlib.Path('/tmp/agentic-kit-audit-2026-09-07')
p=argparse.ArgumentParser();p.add_argument('id');p.add_argument('--cwd',default=str(R/'work/source'));p.add_argument('--timeout',type=int,default=120);split=sys.argv.index('--');a=p.parse_args(sys.argv[1:split]);cmd=sys.argv[split+1:]
if cmd and cmd[0]=='--':cmd=cmd[1:]
if not pathlib.Path(a.cwd).resolve().is_relative_to(R):raise SystemExit('cwd outside audit')
env={'HOME':str(R/'work/home'),'PATH':str(R/'work/bin')+':/usr/bin:/bin','TMPDIR':str(R/'work/tmp'),'LANG':'C.UTF-8','LC_ALL':'C.UTF-8','XDG_CONFIG_HOME':str(R/'work/home/.config'),'XDG_CACHE_HOME':str(R/'work/home/.cache'),'CODEX_HOME':str(R/'work/home/.codex'),'CLAUDE_CONFIG_DIR':str(R/'work/home/.claude'),'GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null','GIT_TERMINAL_PROMPT':'0','PYTHONDONTWRITEBYTECODE':'1','npm_config_userconfig':str(R/'work/home/empty.npmrc'),'npm_config_globalconfig':str(R/'work/home/empty-global.npmrc'),'npm_config_cache':str(R/'work/npm-cache'),'npm_config_audit':'false','npm_config_fund':'false','npm_config_fetch_retries':'0','npm_config_fetch_timeout':'25000'}
start=time.monotonic();stamp=datetime.datetime.now(datetime.timezone.utc).isoformat();proc=subprocess.Popen(cmd,cwd=a.cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True);timed=False
try: out,_=proc.communicate(timeout=a.timeout)
except subprocess.TimeoutExpired:
 timed=True;os.killpg(proc.pid,signal.SIGTERM)
 try: out,_=proc.communicate(timeout=3)
 except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);out,_=proc.communicate()
record={'id':a.id,'command':cmd,'cwd':a.cwd,'env_policy':'clean allowlist; synthetic HOME/TMPDIR/CODEX_HOME; no inherited credentials; real model/notification CLIs blocked by PATH shims','started_utc':stamp,'duration_seconds':round(time.monotonic()-start,3),'timeout_seconds':a.timeout,'timed_out':timed,'exit_code':proc.returncode,'log':f'evidence/{a.id}.log'}
(R/f'evidence/{a.id}.log').write_text(out);(R/f'evidence/{a.id}.json').write_text(json.dumps(record,indent=2));print(json.dumps(record));print(out[-3500:]);raise SystemExit(0)
