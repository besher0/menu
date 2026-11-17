"""Owns a fresh PostgreSQL cluster; never reads .env or touches existing servers.
python apps/api/prisma/test-v2-customer-ordering.py --postgres-bin <bin> [--browser]
Use ORDERING_DEMO_SECONDS=0..900 for an opt-in interactive synthetic session.
"""
from pathlib import Path
import subprocess,os,sys,shutil,json,argparse,socket,secrets
if not __debug__:raise RuntimeError('Safety checks require Python without -O')
s=Path(__file__).resolve().parents[3]
a=argparse.ArgumentParser();a.add_argument('--postgres-bin',required=True,type=Path);a.add_argument('--browser',action='store_true');a.add_argument('--legacy-regressions',action='store_true');args=a.parse_args()
pg=args.postgres_bin.resolve()
def exe(n):return pg/(n+('.exe' if os.name=='nt' else ''))
if not all(exe(n).is_file() for n in ['initdb','pg_ctl','psql']):raise RuntimeError('PostgreSQL binaries required')
b=Path(os.environ.get('QA_OUTPUT',s/'dist/qa-v2-ordering')).resolve()/'ordering-postgres'/secrets.token_hex(8);b.mkdir(parents=True)
data=b/'postgres';data.mkdir();uploads=b/'uploads';uploads.mkdir()
env={k:v for k,v in os.environ.items() if k.upper() in {'PATH','COMSPEC','SYSTEMROOT','WINDIR','PATHEXT','USERPROFILE','LOCALAPPDATA','APPDATA','TEMP','TMP','PRISMA_SCHEMA_ENGINE_BINARY','PRISMA_QUERY_ENGINE_LIBRARY','PLAYWRIGHT_MODULE','V62_BROWSER_EXECUTABLE','ORDERING_BROWSER_OUTPUT','ORDERING_DEMO_SECONDS'}}
demo=int(env.get('ORDERING_DEMO_SECONDS','0'))
if not 0<=demo<=900:raise ValueError('DEMO wait must be 0..900 seconds')
env.update(CHECKPOINT_DISABLE='1',NEXT_TELEMETRY_DISABLED='1',PYTHONUTF8='1',ORDERSAWA_DEMO_UPLOADS_DIR=str(uploads.resolve()))
node=shutil.which('node')
if not node:raise RuntimeError('Node required')
pw=secrets.token_hex(32);pwfile=b/'password';pwfile.write_text(pw,'utf8');env['PGPASSWORD']=pw
with socket.socket() as sock:sock.bind(('127.0.0.1',55440 if args.legacy_regressions else 0));port=sock.getsockname()[1]
db='ordering_v2_'+secrets.token_hex(6);results={};started=False
def call(name,cmd,cwd=s,timeout=120):
 p=b/(name+'.log')
 with p.open('wb') as output:r=subprocess.run(list(map(str,cmd)),cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=output,stderr=output,timeout=timeout)
 p.write_bytes(p.read_bytes().replace(pw.encode(),b'[REDACTED]'));results[name]=r.returncode
 (b/'checks.json').write_text(json.dumps(results,indent=2),'utf8');print(name,r.returncode,flush=True);return r.returncode
try:
 if call('initdb',[exe('initdb'),'-D',data,'-U','qa_owner','-A','scram-sha-256','--pwfile',pwfile,'--encoding=UTF8','--locale=C']):sys.exit(1)
 pwfile.unlink()
 if call('pg-start',[exe('pg_ctl'),'-D',data,'-l',data/'server.log','-w','start','-o',f'-h 127.0.0.1 -p {port}']):sys.exit(1)
 started=True
 if call('create-db',[exe('psql'),'-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','qa_owner','-d','postgres','-c','CREATE DATABASE '+db]):sys.exit(1)
 uri=f'postgresql://qa_owner:{pw}@127.0.0.1:{port}/{db}'
 env.update(DATABASE_URL=uri,DIRECT_URL=uri,ORDERING_TEST_DATABASE_URL=uri,ORDERING_TEST_DATA_DIRECTORY=str(data.resolve()),ORDERING_TEST_PORT=str(port))
 if args.browser:env['ORDERING_BROWSER_SCRIPT']=str(s/'apps/web/scripts/test-v2-customer-ordering.cjs')
 # Keep populated upgrade fixtures in their own disposable database, never legacy test templates.
 upgradeDb='ordering_v2_'+secrets.token_hex(6)
 if call('create-upgrade-db',[exe('psql'),'-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','qa_owner','-d','postgres','-c','CREATE DATABASE '+upgradeDb]):sys.exit(1)
 upgradeUri=f'postgresql://qa_owner:{pw}@127.0.0.1:{port}/{upgradeDb}'
 env.update(DATABASE_URL=upgradeUri,DIRECT_URL=upgradeUri,ORDERING_TEST_DATABASE_URL=upgradeUri)
 baseline=b/'upgrade-baseline';baseline.mkdir();shutil.copy2(s/'apps/api/prisma/schema.prisma',baseline/'schema.prisma')
 shutil.copytree(s/'apps/api/prisma/migrations',baseline/'migrations',ignore=shutil.ignore_patterns('20261115000000_restaurant_feedback','20261115010000_feedback_rolling_quotas'))
 if call('migrate-historical',[node,s/'node_modules/prisma/build/index.js','migrate','deploy','--schema',baseline/'schema.prisma']):sys.exit(1)
 if call('populate-upgrade-fixture',[node,s/'apps/api/prisma/feedback-upgrade-fixture.cjs','before',b/'upgrade-snapshot.json']):sys.exit(1)
 if call('migrate',[node,s/'node_modules/prisma/build/index.js','migrate','deploy','--schema',s/'apps/api/prisma/schema.prisma']):sys.exit(1)
 if call('verify-populated-upgrade',[node,s/'apps/api/prisma/feedback-upgrade-fixture.cjs','after',b/'upgrade-snapshot.json']):sys.exit(1)
 env.update(DATABASE_URL=uri,DIRECT_URL=uri,ORDERING_TEST_DATABASE_URL=uri)
 if call('migrate-fresh-test-db',[node,s/'node_modules/prisma/build/index.js','migrate','deploy','--schema',s/'apps/api/prisma/schema.prisma']):sys.exit(1)
 specs=['src/modules/public-menu/v2-customer-ordering.integration.spec.ts','src/modules/feedback/feedback.integration.spec.ts']
 if args.legacy_regressions:
  # Historical guards stay unchanged: claim55440 only when free, create these DBs here.
  for envkey,name,spec in [('PUBLIC_MENU_RACE_TEST_DATABASE_URL','ordersawa_stage3_stage6d3c1_public','public-menu-race.integration.spec.ts'),('WHATSAPP_CHECKOUT_TEST_DATABASE_URL','ordersawa_stage3_stage6e2_checkout','public-whatsapp-checkout.integration.spec.ts')]:
   if call('create-'+name,[exe('psql'),'-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','qa_owner','-d','postgres','-c','CREATE DATABASE '+name+' TEMPLATE '+db]):sys.exit(1)
   env[envkey]=f'postgresql://qa_owner:{pw}@127.0.0.1:{port}/{name}'
   specs.append('src/modules/public-menu/'+spec)
 (b/'isolation.json').write_text(json.dumps({'database':db,'port':port,'dataDirectory':str(data),'freshCluster':True,'envFilesRead':False}),'utf8')
 sys.exit(call('v2-ordering-tests',[node,s/'node_modules/vitest/vitest.mjs','run',*specs,'--fileParallelism=false','--reporter=default','--reporter=json','--outputFile',b/'integration-results.json'],s/'apps/api',600+demo))
finally:
 if pwfile.exists():pwfile.unlink()
 if started:
  if call('pg-stop',[exe('pg_ctl'),'-D',data,'-m','fast','-t','300','-w','stop'],timeout=330):raise RuntimeError('Owned PostgreSQL did not stop: '+str(b))
 print('Evidence:',b)
