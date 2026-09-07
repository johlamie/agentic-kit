"""External evaluation; do not expose this file to either experimental builder."""
import importlib.util,json,pathlib,sys,tempfile,io,csv
candidate=pathlib.Path(sys.argv[1]);spec=importlib.util.spec_from_file_location('candidate',candidate/'tasks.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);rows=[]
def check(id,fn):
 try: fn(); rows.append({'id':id,'pass':True})
 except Exception as e: rows.append({'id':id,'pass':False,'error':type(e).__name__})
def eq(a,b): assert a==b,(a,b)
with tempfile.TemporaryDirectory(prefix='comparison-eval-') as tmp:
 n=0
 def app():
  global n
  n+=1;return m.Tasks(pathlib.Path(tmp)/f'{n}.json')
 def legacy():
  a=app();eq(a.add('One')['id'],1);eq(a.list()[0]['title'],'One')
 def persist():
  a=app();a.add('One');eq(m.Tasks(a.path).list(),a.list())
 def done():
  a=app();a.add('One');a.complete(1);eq(a.list()[0]['done'],True)
 def ids():
  a=app();eq([a.add('x')['id'] for _ in range(3)],[1,2,3])
 def blank():
  a=app()
  try:a.add(' \t ')
  except ValueError:pass
  else:raise AssertionError('blank accepted')
  eq(a.list(),[])
 def trim():eq(app().add('  Keep  ')['title'],'Keep')
 def stats():
  a=app();a.add('One');a.add('Two');a.complete(1);eq(a.stats(),{'total':2,'completed':1})
 def empty():eq(app().stats(),{'total':0,'completed':0})
 def filter_open():
  a=app();a.add('One');a.add('Two');a.complete(1);eq([x['id'] for x in a.list(status='open')],[2])
 def filter_done():
  a=app();a.add('One');a.complete(1);eq([x['id'] for x in a.list(status='done')],[1])
 def export():
  a=app();a.add('quoted, "title"');raw=a.export_csv();v=list(csv.DictReader(io.StringIO(raw)));eq(len(v),1);eq(v[0]['title'],'quoted, "title"');eq(set(v[0]),{'id','title','done'})
 def missing():
  a=app();a.add('One');before=a.list()
  try:a.complete(999)
  except KeyError:pass
  else:raise AssertionError('missing accepted')
  eq(a.list(),before)
 for name,fn in [('legacy-add-list',legacy),('restart-persistence',persist),('complete',done),('stable-ids',ids),('reject-blank',blank),('trim-title',trim),('completed-count',stats),('empty-stats',empty),('filter-open',filter_open),('filter-done',filter_done),('csv-preserve-title',export),('missing-id-no-mutation',missing)]:check(name,fn)
print(json.dumps({'candidate':str(candidate),'passed':sum(x['pass'] for x in rows),'total':len(rows),'results':rows},indent=2));sys.exit(0 if all(x['pass'] for x in rows) else 1)
