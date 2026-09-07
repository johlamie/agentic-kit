from pathlib import Path
import json,re,hashlib,os,subprocess,datetime
r=Path('/tmp/agentic-kit-audit-2026-09-07');f=json.loads((r/'FINDINGS.json').read_text());missing=[]
for x in f['findings']:
 for k in ['id','title','severity','proof_status','source_references','preconditions','reproduction','expected','observed','impact','minimal_recommendation','correction_test','confidence','evidence']:
  if not x.get(k):missing.append((x['id'],k))
 for p in x['evidence']:
  if not (r/p).exists():missing.append((x['id'],'missing '+p))
 for ref in x['source_references']:
  path,lines=ref.rsplit(':',1);p=r/'work/source'/path
  if not p.exists() or int(lines.split('-')[-1])>len(p.read_text().splitlines()):missing.append((x['id'],'invalid ref '+ref))
for report in ['AUDIT_REPORT.md','TEST_RESULTS.md','SYNTHESE.md']:
 for target in re.findall(r'\]\(([^)]+)\)',(r/report).read_text()):
  if not (r/target).exists():missing.append((report,'broken link '+target))
links=[]
for p in (r/'fixtures').rglob('*'):
 if p.is_symlink():
  target=p.resolve(strict=False);links.append({'link':str(p.relative_to(r)),'target_in_audit':target.is_relative_to(r),'target':str(target.relative_to(r)) if target.is_relative_to(r) else '[OUTSIDE]'})
assert all(l['target_in_audit'] for l in links),links
m=json.loads((r/'evidence/source-manifest.json').read_text());source_changes=[];copy_changes=[]
for root,errors in [(Path('/home/ubuntu/agentic-kit'),source_changes),(r/'work/source',copy_changes)]:
 for item in m:
  p=root/item['path']
  if hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256'] or oct(p.stat().st_mode & 0o777)!=item['mode']:errors.append(item['path'])
result={'checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'finding_count':len(f['findings']),'finding_schema_and_evidence_errors':missing,'fixture_symlinks':links,'all_fixture_symlinks_remain_in_audit':True,'source_bytes_or_modes_changed':source_changes,'snapshot_implementation_bytes_or_modes_changed':copy_changes,'note':'Synthetic symlinks leave their project but never the audit root; fake canaries are synthetic. No real secrets were loaded.'};(r/'evidence/artifact-check.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));assert not missing and not source_changes and not copy_changes
