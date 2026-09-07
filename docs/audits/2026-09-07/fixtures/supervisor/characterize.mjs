import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const root=process.argv[2],base=join(root,'work/source/supervisor/dist');
const get=async p=>import(pathToFileURL(join(base,p)).href);
const {SupervisorDatabase}=await get('src/db.js');
const {AuditDispatcher}=await get('src/audits/dispatcher.js');
const {AuditQueue}=await get('src/queue.js');
const {PromptBuilder}=await get('src/codex/prompt-builder.js');
const {ArtifactStore}=await get('src/artifacts.js');
const {normalizeHookEvent}=await get('src/hooks/normalize.js');
const {forwardHook}=await get('src/hooks/forwarder.js');
const {auditResult,testConfig}=await get('tests/helpers.js');
const work=join(root,'fixtures/supervisor/runtime');mkdirSync(work,{recursive:true});
const project=name=>{const p=join(work,name);mkdirSync(p,{recursive:true});return p;};
const row=(scenario,data)=>console.log(JSON.stringify({scenario,...data}));
const finish=(db,p,type,decision='PASS',extra={})=>{const a=db.enqueueAudit({projectPath:p,auditType:type});db.completeAudit(a.id,auditResult({decision,...extra}),null);return a;};
{
 const p=project('stale-pass'),db=new SupervisorDatabase(':memory:');writeFileSync(join(p,'app.js'),'export const valid = true;\n');const a=finish(db,p,'code');const before=db.gate(p,'code');writeFileSync(join(p,'app.js'),'export const valid = false;\n');const after=db.gate(p,'code');assert.equal(after.decision,'PASS');assert.equal(after.audit_id,a.id);row('stale_pass_after_code_change',{before:before.decision,after:after.decision,sameAudit:before.audit_id===after.audit_id,reviewerAudits:db.listAudits(p).filter(a=>a.audit_type==='reviewer_meta').length,qaAudits:db.listAudits(p).filter(a=>a.audit_type==='qa').length});db.close();
}
{
 const p=project('history'),db=new SupervisorDatabase(':memory:');const blocked=finish(db,p,'visual_ux_audit','BLOCK');for(let i=0;i<250;i++)finish(db,p,'qa');row('stop_gate_history_250',{phase:db.gate(p,'code').decision,stop:db.stopGate(p).decision,blockedStillStored:db.getAudit(blocked.id).decision});assert.equal(db.stopGate(p).decision,'PASS');assert.equal(db.gate(p,'code').decision,'BLOCK');for(let i=0;i<250;i++)finish(db,p,'qa');assert.equal(db.gate(p,'code').decision,'PASS');row('phase_gate_history_500',{phase:db.gate(p,'code').decision,blockedStillStored:db.getAudit(blocked.id).decision});db.close();
}
{
 const p=project('late-reviewer'),db=new SupervisorDatabase(':memory:'),cfg=testConfig({uiAudit:false}),dispatcher=new AuditDispatcher(db,cfg);
 const ingest=(agent,message)=>{const ev=normalizeHookEvent({hook_event_name:'SubagentStop',cwd:p,session_id:'s',agent_id:agent,agent_type:agent,last_assistant_message:message});const ids=db.insertEvent(ev);return dispatcher.dispatch(ev,ids.sessionId)[0];};
 const first=ingest('builder','Builder says done');let release,signalStarted;const started=new Promise(r=>signalStarted=r),hold=new Promise(r=>release=r);let captured='';
 const runner={async run(a,prompt){captured=prompt;signalStarted();await hold;return {result:auditResult(),threadId:null,stdout:'',stderr:'',durationMs:1};}};
 const queue=new AuditQueue(db,cfg,runner,new PromptBuilder(cfg),new ArtifactStore(cfg),{send:async()=>null},{info(){},warn(){},error(){}});const running=queue.drainOnce();await started;const late=ingest('reviewer','LATE_REVIEW_BLOCK ownership check missing');assert.equal(late.id,first.id);const storedHasEvidence=db.getAudit(first.id).context_json.includes('LATE_REVIEW_BLOCK');release();await running;assert.equal(captured.includes('LATE_REVIEW_BLOCK'),false);assert.equal(db.listAudits(p).length,1);assert.equal(db.gate(p,'code').decision,'PASS');row('reviewer_evidence_coalesced_after_start',{sameAudit:late.id===first.id,storedHasEvidence,runnerSawEvidence:captured.includes('LATE_REVIEW_BLOCK'),totalAudits:db.listAudits(p).length,gate:db.gate(p,'code').decision});db.close();
}
{
 const p=project('duplicate-hooks'),db=new SupervisorDatabase(':memory:'),dispatcher=new AuditDispatcher(db,testConfig());const payload={hook_event_name:'SubagentStop',cwd:p,session_id:'s',agent_id:'researcher-1',agent_type:'researcher',last_assistant_message:'Research completed'};for(let i=0;i<2;i++){const e=normalizeHookEvent(payload);const ids=db.insertEvent(e);dispatcher.dispatch(e,ids.sessionId);}assert.equal(db.listAudits(p).length,2);row('duplicate_raw_hook',{events:db.listEvents(p).length,audits:db.listAudits(p).length});db.close();
}
{
 const p=project('raw-output'),file=join(work,'raw-output.sqlite3'),db=new SupervisorDatabase(file),a=finish(db,p,'code');const fake=['github','pat','SYNTHETIC_AUDIT_SENTINEL_1234567890'].join('_');db.recordCodexRun({auditId:a.id,threadId:null,status:'completed',durationMs:1,stdout:fake,stderr:'password='+fake});db.close();const ro=new DatabaseSync(file,{readOnly:true}),v=ro.prepare('SELECT stdout_excerpt,stderr_excerpt FROM codex_runs').get();assert.equal(v.stdout_excerpt.includes(fake),true);row('raw_codex_output_persisted',{stdoutContainsSyntheticSecret:v.stdout_excerpt.includes(fake),stderrContainsSyntheticSecret:v.stderr_excerpt.includes(fake)});ro.close();
}
{
 const p=project('human-persistence'),other=project('other-project'),file=join(work,'human.sqlite3');let db=new SupervisorDatabase(file);finish(db,p,'research','HUMAN_REQUIRED',{human_request:{reason:'Synthetic owner decision missing',requested_action:'Choose A or B',safe_to_continue_other_work:true}});finish(db,p,'research');finish(db,other,'research');db.close();db=new SupervisorDatabase(file);assert.equal(db.gate(p,'research').decision,'HUMAN_REQUIRED');assert.equal(db.gate(other,'research').decision,'PASS');row('human_persistence_project_isolation',{reopened:db.gate(p,'research').decision,otherProject:db.gate(other,'research').decision});db.close();
}
{
 const p=project('recovery'),file=join(work,'recovery.sqlite3');let db=new SupervisorDatabase(file);const a=db.enqueueAudit({projectPath:p,auditType:'code',maxAttempts:2});db.claimNextAudit();db.close();db=new SupervisorDatabase(file);const recovery=db.recoverInterruptedAudits();assert.equal(recovery.recovered,1);const retry=db.claimNextAudit();assert.equal(retry.attempt_count,2);db.failAudit(a.id,'synthetic infrastructure failure',0);assert.equal(db.gate(p,'code').decision,'ERROR');row('recovery_retry_budget',{recovered:recovery.recovered,attempts:retry.attempt_count,decision:db.gate(p,'code').decision});db.close();
}
process.env.SUPERVISOR_ENV_FILE=join(work,'missing.env');process.env.SUPERVISOR_HOOK_TOKEN_FILE=join(work,'missing-token');process.env.SUPERVISOR_DATA_DIR=join(work,'forwarder-data');process.env.SUPERVISOR_PORT='8787';process.env.SUPERVISOR_HOST='127.0.0.1';
const payload={hook_event_name:'Stop',cwd:project('stop-project'),session_id:'fixture-session',last_assistant_message:'Phase complete'};
for(const decision of ['PASS','PENDING','CHALLENGE','BLOCK','HUMAN_REQUIRED','ERROR']){
 const response=await forwardHook(JSON.stringify(payload),async()=>new Response(JSON.stringify({gate:{decision,exit_code:decision==='ERROR'?50:0,summary:'Synthetic '+decision,audit_id:'fixture'}}),{status:200}));const parsed=response?JSON.parse(response):null,blocks=parsed?.decision==='block';assert.equal(blocks,['PENDING','CHALLENGE','BLOCK','HUMAN_REQUIRED'].includes(decision));row('mock_forwarder_gate',{decision,blocks,output:parsed});
}
const transport=await forwardHook(JSON.stringify(payload),async()=>{throw new Error('synthetic transport failure');});assert.equal(transport,null);row('mock_forwarder_transport_failure',{output:transport,blocks:false});
const recursive=await forwardHook(JSON.stringify({...payload,stop_hook_active:true}),async()=>new Response(JSON.stringify({gate:{decision:'BLOCK',exit_code:20,summary:'Synthetic existing block',audit_id:'fixture'}}),{status:200}));assert.equal(recursive,null);row('mock_forwarder_recursive_stop',{output:recursive,blocks:false});
