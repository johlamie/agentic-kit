import json,subprocess
from pathlib import Path
r=Path('/tmp/agentic-kit-audit-2026-09-07');rows=[]
payload={'tool_name':'Bash','agent_type':'builder','cwd':str(r/'fixtures/guards/home/projects/demo'),'tool_input':{'command':'git push origin synthetic-audit-topic'}}
for p in ['/usr/bin:/bin','/agentic-audit-nonexistent-bin']:
 e={'HOME':str(r/'fixtures/guards/home'),'PATH':p,'TMPDIR':str(r/'work/tmp')};x=subprocess.run(['/bin/bash',str(r/'work/source/global/hooks/agent-guard.sh')],input=json.dumps(payload),capture_output=True,text=True,timeout=5,env=e);rows.append({'PATH':p,'exit_code':x.returncode,'stdout':x.stdout,'stderr':x.stderr})
print(json.dumps({'payload_data_never_executed':payload,'results':rows},indent=2))
