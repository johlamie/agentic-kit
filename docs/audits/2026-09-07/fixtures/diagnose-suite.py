import pathlib,subprocess,json,re,os
r=pathlib.Path('/tmp/agentic-kit-audit-2026-09-07'); out=r/'evidence/supervisor-modules';out.mkdir(exist_ok=True);rows=[]
for f in sorted((r/'work/source/supervisor/dist/tests').glob('*.test.js')):
 cmd=['node',str(f)]
 try:
  p=subprocess.run(cmd,cwd=r/'work/source/supervisor',capture_output=True,text=True,timeout=20);log=p.stdout+p.stderr;code=p.returncode
 except subprocess.TimeoutExpired as e:log=str(e);code=124
 (out/(f.stem+'.log')).write_text(log);row={'module':f.name,'command':cmd,'exit_code':code,'pass':re.findall(r'^# pass (\d+)',log,re.M),'fail':re.findall(r'^# fail (\d+)',log,re.M),'environment_block': 'listen EPERM' in log,'log':str((out/(f.stem+'.log')).relative_to(r))};rows.append(row);print(json.dumps(row),flush=True)
(out/'results.json').write_text(json.dumps(rows,indent=2))
