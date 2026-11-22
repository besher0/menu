"""Rehearse staging CLI on a NEW loopback cluster, including backup/restore. No .env read."""
from pathlib import Path
import os,sys,subprocess,socket,secrets,shutil,json,time,urllib.request,urllib.error
if not __debug__: raise RuntimeError('Do not use Python -O')
root=Path(__file__).resolve().parents[1]
pg=Path(os.environ['PG_BIN']).resolve()
out=Path(os.environ['QA_OUTPUT']).resolve()/('staging-'+secrets.token_hex(6));out.mkdir(parents=True)
data=out/'postgres';pw=secrets.token_hex(32);node=shutil.which('node')
env={k:v for k,v in os.environ.items() if k.upper() in {'PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','USERPROFILE','LOCALAPPDATA','APPDATA','TEMP','TMP'}}
env.update(PGPASSWORD=pw,PYTHONUTF8='1',CHECKPOINT_DISABLE='1')
# The CLI backup invokes pg_dump by name; use this rehearsal's explicit reviewed PostgreSQL tools.
env['PATH']=str(pg)+os.pathsep+env.get('PATH','')
with socket.socket() as sock: sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
exe=lambda n:pg/(n+('.exe' if os.name=='nt' else ''))
results={}
def run(name,args,extra=None,expect=0):
 log=out/(name+'.log')
 with log.open('wb') as stream:
  p=subprocess.run(list(map(str,args)),cwd=root,env={**env,**(extra or {})},stdin=subprocess.DEVNULL,stdout=stream,stderr=stream,timeout=180)
 output=log.read_bytes();log.write_bytes(output.replace(pw.encode(),b'[REDACTED]'))
 results[name]=p.returncode;(out/'results.json').write_text(json.dumps(results,indent=2))
 if (p.returncode==0)!=(expect==0):raise RuntimeError(name+' unexpected exit; check redacted log')
 return output
base=[exe('psql'),'-XAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','fixture','-d','postgres']
pwfile=out/'one-time-password';pwfile.write_text(pw)
started=False
try:
 run('initdb',[exe('initdb'),'-D',data,'-U','fixture','-A','scram-sha-256','--pwfile',pwfile,'--locale=C','--encoding=UTF8']);pwfile.unlink()
 run('start',[exe('pg_ctl'),'-D',data,'-l',out/'pg.log','-w','start','-o',f'-h 127.0.0.1 -p {port} -c unix_socket_directories=']);started=True
 run('role',base+['-c',"CREATE ROLE staging_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '"+pw+"'"])
 run('database',base+['-c','CREATE DATABASE ordersawa_staging OWNER staging_app'])
 uri=f'postgresql://staging_app:{pw}@127.0.0.1:{port}/ordersawa_staging'
 env.update(ORDERSAWA_ENV='staging',NODE_ENV='production',DATABASE_URL=uri,DIRECT_URL=uri,STAGING_DB_HOST='127.0.0.1',STAGING_DB_PORT=str(port),STAGING_DB_NAME='ordersawa_staging',JWT_SECRET=secrets.token_hex(32),PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY=secrets.token_hex(32),INTERNAL_RESTAURANT_REWRITE_SECRET=secrets.token_hex(32),WEB_ORIGIN='https://staging.example.test',API_ORIGIN='https://staging.example.test/api',CORS_ORIGINS='https://staging.example.test',NEXT_PUBLIC_WEB_URL='https://staging.example.test',NEXT_PUBLIC_API_URL='/api',ROOT_DOMAIN='staging.example.test',NEXT_PUBLIC_ROOT_DOMAIN='staging.example.test',ORDERSAWA_PREVIEW_INTERNAL_API_URL='http://127.0.0.1:5000',TRUST_PROXY='127.0.0.1',API_HOST='127.0.0.1',ORDERSAWA_RELEASE_ID='staging-rehearsal',STAGING_BOOTSTRAP_ADMIN_EMAIL='admin@staging.test',STAGING_BOOTSTRAP_ADMIN_PASSWORD=secrets.token_hex(24),STAGING_SMOKE_EMAIL='owner@staging.test',STAGING_SMOKE_PASSWORD=secrets.token_hex(24),STAGING_SMOKE_RESTAURANT_SLUG='staging-demo',STAGING_SMOKE_WHATSAPP_PHONE='15555550123')
 cli=[node,root/'scripts/staging.cjs']
 # Independent old-schema negative control; do not remove any deployed constraint.
 run('old-schema-db',base+['-c','CREATE DATABASE ordersawa_staging_unsupported OWNER staging_app'])
 oldbase=base[:-1]+['ordersawa_staging_unsupported']
 run('old-schema',oldbase+['-c',"""CREATE TABLE "Product" ("configurationTree" jsonb); ALTER TABLE "Product" OWNER TO staging_app; INSERT INTO "Product" VALUES ('{"schemaVersion":1}');"""])
 olduri=f'postgresql://staging_app:{pw}@127.0.0.1:{port}/ordersawa_staging_unsupported'
 oldenv={'DATABASE_URL':olduri,'DIRECT_URL':olduri,'STAGING_DB_NAME':'ordersawa_staging_unsupported'}
 for mode in ['check','migrate']:
  run('v1-preflight-'+mode+'-denied',cli+[mode],oldenv,expect=1)
 unchanged=run('v1-preflight-no-write',oldbase+['-c',"""SELECT "configurationTree"->>'schemaVersion',to_regclass('public._prisma_migrations') IS NULL FROM "Product" """])
 assert unchanged.strip()==b'1|t'
 # Same target identity/configuration must pass when only the version is supported.
 run('v2-preflight-control-fixture',oldbase+['-c',"""UPDATE "Product" SET "configurationTree"='{"schemaVersion":2}'::jsonb"""])
 run('v2-preflight-control-accepted',cli+['check'],oldenv)
 for mode in ['check','migrate','bootstrap']:run(mode,cli+[mode])
 # Start the actual compiled production API with staging validation enabled.
 with socket.socket() as probe: probe.bind(('127.0.0.1',0));api_port=probe.getsockname()[1]
 runtime={**env,'PORT':str(api_port),'ORDERSAWA_PREVIEW_INTERNAL_API_URL':f'http://127.0.0.1:{api_port}','ORDERSAWA_DEMO_UPLOADS_DIR':str(out/'uploads')}
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
 def http(route,body=None,headers=None):
  request=urllib.request.Request(f'http://127.0.0.1:{api_port}'+route,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json',**(headers or {})})
  try:response=opener.open(request,timeout=10)
  except urllib.error.HTTPError as error:response=error
  with response:return response.status,response.read(),dict(response.headers)
 with (out/'api-runtime.log').open('wb') as log:
  api=subprocess.Popen([node,root/'apps/api/dist/main.js'],cwd=root/'apps/api',env=runtime,stdin=subprocess.DEVNULL,stdout=log,stderr=log)
  try:
   for attempt in range(80):
    if api.poll() is not None:raise RuntimeError('Staging API exited')
    try:
     if http('/health/ready')[0]==200:break
    except urllib.error.URLError:pass
    time.sleep(.2)
   else:raise RuntimeError('Staging API readiness timeout')
   status,body,headers=http('/auth/login',{'email':env['STAGING_SMOKE_EMAIL'],'password':env['STAGING_SMOKE_PASSWORD']})
   assert status in (200,201);session=json.loads(body)['data'];assert session['user']['role']=='USER'
   owned=session['memberships'][0]['restaurant'];auth={'Authorization':'Bearer '+session['accessToken'],'X-Restaurant-Id':owned['id']}
   assert http('/dashboard/overview',headers=auth)[0]==200
   assert http('/dashboard/overview')[0]==401
   assert http('/dashboard/overview',headers={**auth,'X-Restaurant-Id':'foreign'})[0]==403
   assert http('/admin/restaurants',headers=auth)[0]==403
   status,body,headers=http('/public/menus/'+owned['slug']+'?track=0');assert status==200
   assert b'Staging test product' in body
   assert http('/health/ready',headers={'Origin':'https://foreign.example.test'})[2].get('Access-Control-Allow-Origin') is None
   results['production-staging-http']=0;(out/'results.json').write_text(json.dumps(results,indent=2))
  finally:api.terminate();api.wait(timeout=20)
 logdata=(out/'api-runtime.log').read_bytes()
 for key in ['JWT_SECRET','PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY','STAGING_SMOKE_PASSWORD','STAGING_BOOTSTRAP_ADMIN_PASSWORD']:
  if env[key].encode() in logdata:raise RuntimeError('Runtime secret leakage; do not publish log')
 if os.environ.get('STAGING_RUNTIME_ROOT'):
  run('production-only-runtime',[node,root/'scripts/test-staging-runtime.cjs'],{**runtime,'STAGING_RUNTIME_ROOT':os.environ['STAGING_RUNTIME_ROOT'],'RUNTIME_SMOKE_OUTPUT':str(out/'runtime-smoke')})
 run('repeat-bootstrap-denied',cli+['bootstrap'],expect=1)
 run('wrong-target-denied',cli+['check'],{'STAGING_DB_NAME':'production'},expect=1)
 run('backup',cli+['backup',out/'synthetic.dump'])
 run('restore-db',base+['-c','CREATE DATABASE ordersawa_staging_restore OWNER staging_app'])
 run('restore',[exe('pg_restore'),'--exit-on-error','--no-owner','-h','127.0.0.1','-p',port,'-U','staging_app','-d','ordersawa_staging_restore',out/'synthetic.dump'])
 for db in ['ordersawa_staging','ordersawa_staging_restore']:
  count=run(db,base[:-1]+[db,'-c','SELECT (SELECT count(*) FROM "User"),(SELECT count(*) FROM "Restaurant"),(SELECT count(*) FROM "Product")'])
  if count.strip()!=b'2|1|1':raise RuntimeError('Restore mismatch')
 print('STAGING_REHEARSAL_PASS',out,flush=True)
finally:
 if pwfile.exists():pwfile.unlink()
 if started:run('stop',[exe('pg_ctl'),'-D',data,'-m','fast','-w','stop'])
