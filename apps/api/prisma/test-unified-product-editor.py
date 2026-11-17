"""Run only against a NEW disposable loopback PostgreSQL cluster. Never reads .env.

Usage: python apps/api/prisma/test-unified-product-editor.py --postgres-bin <PostgreSQL-bin>
Requires Node, npm ci + Prisma generate + shared build; PostgreSQL initdb/pg_ctl/psql.
No existing cluster, service, database, upload or credential is modified.
Evidence is written to an isolated subdirectory of dist/qa-unified-editor.
"""
from pathlib import Path
import subprocess, os, sys, shutil, json, argparse, socket, secrets
if not __debug__:
 raise RuntimeError("Do not run this safety-checked test runner with Python -O")
s=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser()
parser.add_argument('--postgres-bin',required=True,type=Path)
args=parser.parse_args()
pg=args.postgres_bin.resolve()
def pgexe(name):return pg/(name+('.exe' if os.name=='nt' else ''))
if not all(pgexe(name).is_file() for name in ['initdb','pg_ctl','psql']):
 raise SystemExit('PostgreSQL binaries are required; this runner never installs or stops services')
b=Path(os.environ.get('QA_OUTPUT',s/'dist/qa-unified-editor')).resolve()/'editor-postgres'/secrets.token_hex(8)
b.mkdir(parents=True)
env={k:v for k,v in os.environ.items() if k.upper() in {
 'PATH','COMSPEC','SYSTEMROOT','WINDIR','PATHEXT','USERPROFILE','LOCALAPPDATA','APPDATA',
 'TEMP','TMP','HOME','PRISMA_SCHEMA_ENGINE_BINARY','PRISMA_QUERY_ENGINE_LIBRARY',
 'UNIFIED_V62_BROWSER_SCRIPT','UNIFIED_V62_BROWSER_OUTPUT','PLAYWRIGHT_MODULE','UNIFIED_EDITOR_DEMO_SECONDS','V62_BROWSER_EXECUTABLE','V62_REFERENCE_HTML'}}
demo_seconds=int(env.get('UNIFIED_EDITOR_DEMO_SECONDS','0'))
if not 0<=demo_seconds<=900:raise ValueError('DEMO wait must be 0..900 seconds')
uploads=b/'uploads';uploads.mkdir()
env.update(CHECKPOINT_DISABLE='1',NEXT_TELEMETRY_DISABLED='1',PYTHONUTF8='1',ORDERSAWA_DEMO_UPLOADS_DIR=str(uploads.resolve()))
node=shutil.which('node')
if not node:raise SystemExit('Node is required')
results={}
def call(name,args,cwd=s):
 logpath=b/(name+'.log')
 with logpath.open('wb') as output:
  result=subprocess.run(list(map(str,args)),cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=output,stderr=output,
    timeout=(960 if env.get("V62_REFERENCE_HTML") else 540)+demo_seconds if name=='unified-postgres-tests' and env.get('UNIFIED_V62_BROWSER_SCRIPT') else (330 if name in ('initdb','pg-stop') else 120))
 # Only ephemeral test credentials exist in this process; still redact them from evidence.
 log=logpath.read_bytes()
 if 'pw' in globals():log=log.replace(pw.encode(),b'[REDACTED]')
 logpath.write_bytes(log)
 results[name]=result.returncode
 (b/'checks.json').write_text(json.dumps(results,indent=2),encoding='utf8')
 print(name,result.returncode,flush=True)
 return result.returncode
data=b/('pg-'+secrets.token_hex(5));data.mkdir()
with socket.socket() as sock:
 sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
dbname='unified_save_'+secrets.token_hex(5)
pw=secrets.token_hex(32);pwfile=b/(data.name+'-password');pwfile.write_text(pw,'utf8')
env.update(PGPASSWORD=pw)
started=False
try:
 if call('initdb',[pgexe('initdb'),'-D',data,'-U','qa_owner','-A','scram-sha-256','--pwfile',pwfile,'--encoding=UTF8','--locale=C']):sys.exit(1)
 pwfile.unlink()
 if call('pg-start',[pgexe('pg_ctl'),'-D',data,'-l',data/'server.log','-w','start','-o',f'-h 127.0.0.1 -p {port}']):sys.exit(1)
 started=True
 base=[pgexe('psql'),'-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','qa_owner']
 if call('create-db',base+['-d','postgres','-c','CREATE DATABASE '+dbname]):sys.exit(1)
 uri=f'postgresql://qa_owner:{pw}@127.0.0.1:{port}/{dbname}'
 env.update(DATABASE_URL=uri,DIRECT_URL=uri,UNIFIED_SAVE_TEST_DATABASE_URL=uri,UNIFIED_SAVE_TEST_DATA_DIRECTORY=str(data.resolve()),UNIFIED_SAVE_TEST_PORT=str(port))
 schema=b/('dbschema-'+data.name);schema.mkdir()
 shutil.copy2(s/'apps/api/prisma/schema.prisma',schema/'schema.prisma')
 migrations=s/'apps/api/prisma/migrations'
 target=schema/'migrations';target.mkdir(exist_ok=True)
 for f in migrations.iterdir():
  if f.name.startswith('20261114000000'):continue
  if f.is_dir():shutil.copytree(f,target/f.name,dirs_exist_ok=True)
  else:shutil.copy2(f,target/f.name)
 prisma=[node,s/'node_modules/prisma/build/index.js']
 if call('migrate-before',prisma+['migrate','deploy','--schema',schema/'schema.prisma']):sys.exit(1)
 fixture=b/'before.sql'
 fixture.write_text('''INSERT INTO "Restaurant" ("id","slug","name","currency","updatedAt") VALUES ('migration-r','migration-r','Synthetic existing restaurant','SYP',NOW());
INSERT INTO "Category" ("id","restaurantId","slug","name") VALUES ('migration-c','migration-r','existing','Existing category');
INSERT INTO "Product" ("id","restaurantId","categoryId","name","slug","description","basePrice","currency","ingredients","nutrition","updatedAt")
VALUES ('migration-p','migration-r','migration-c','Existing ordinary','existing','Retain me',12500,'SYP','["cheese"]','{"weight":"200 mg","otherMetadata":"keep"}',NOW());
INSERT INTO "MediaAsset" ("id","restaurantId","url","type","provider","updatedAt") VALUES ('migration-media','migration-r','https://example.test/existing.jpg','IMAGE','LOCAL',NOW());
INSERT INTO "ProductImage" ("id","productId","mediaId","url","sortOrder") VALUES ('migration-img','migration-p','migration-media','https://example.test/existing.jpg',0);
INSERT INTO "MealDetailLibraryItem" ("id","adminName","adminNameNormalized","displayName","value","updatedAt") VALUES ('migration-detail','weight','weight','Weight','200 mg',NOW());
''','utf8')
 if call('migration-fixture',base+['-d',dbname,'-f',fixture]):sys.exit(1)
 # Fingerprint every pre-existing row, omitting only the two additive columns after migration.
 def sql_value(sql):
  out=subprocess.check_output(list(map(str,base+['-d',dbname,'-At','-c',sql])),env=env).decode().strip();return out
 before={table:sql_value(f'''SELECT md5(string_agg((to_jsonb(t)-'editVersion'-'valueType')::text,'|' ORDER BY (to_jsonb(t)-'editVersion'-'valueType')::text)) FROM "{table}" t;''')
  for table in ['Restaurant','Category','Product','ProductImage','MediaAsset','MealDetailLibraryItem']}
 # Rehearse the migration's no-conversion guard on an independent pre-upgrade clone.
 guarddb=dbname+'_unsupported'
 if call('migration-guard-clone',base+['-d','postgres','-c','CREATE DATABASE '+guarddb+' TEMPLATE '+dbname]):sys.exit(1)
 unsupported='''INSERT INTO "Product" ("id","restaurantId","name","slug","basePrice","currency","configurationTree","configurationVersion","updatedAt")
 VALUES ('unsupported','migration-r','Unsupported','unsupported',10,'SYP','{"schemaVersion":1,"productId":"unsupported","revision":1,"basePrice":"10","groups":[]}',1,NOW());'''
 if call('migration-guard-fixture',base+['-d',guarddb,'-c',unsupported]):sys.exit(1)
 guardcode=call('migration-guard-rejection',base+['-d',guarddb,'-f',migrations/'20261114000000_unified_product_editor/migration.sql'])
 assert guardcode!=0,'Migration must reject unsupported saved configuration'
 guard_columns=subprocess.check_output(list(map(str,base+['-d',guarddb,'-At','-c',"""SELECT count(*) FROM information_schema.columns WHERE table_name='Product' AND column_name='editVersion'"""])),env=env).decode().strip()
 assert guard_columns=='0','Failed migration must not add columns'
 shutil.copytree(migrations/'20261114000000_unified_product_editor',target/'20261114000000_unified_product_editor',dirs_exist_ok=True)
 if call('migrate-after',prisma+['migrate','deploy','--schema',schema/'schema.prisma']):sys.exit(1)
 after={table:sql_value(f'''SELECT md5(string_agg((to_jsonb(t)-'editVersion'-'valueType')::text,'|' ORDER BY (to_jsonb(t)-'editVersion'-'valueType')::text)) FROM "{table}" t;''') for table in before}
 assert before==after,'Pre-existing data changed'
 (b/'migration-evidence.json').write_text(json.dumps({'sameExistingRows':before==after,'before':before,'after':after,'versionDefault':sql_value('SELECT "editVersion" FROM "Product"'),'detailDefault':sql_value('SELECT "valueType" FROM "MealDetailLibraryItem"'),'postgresVersion':sql_value('SHOW server_version;'),'port':port,'onlyDisposableDatabase':dbname},indent=2),'utf8')
 if call('unified-postgres-tests',[node,s/'node_modules/vitest/vitest.mjs','run','src/modules/products/product-editor.integration.spec.ts','--reporter=json','--outputFile',b/'integration-results.json'],s/'apps/api'):sys.exit(1)
finally:
 if pwfile.exists():pwfile.unlink()
 if started:
  if call('pg-stop',[pgexe('pg_ctl'),'-D',data,'-m','fast','-t','300','-w','stop']):raise RuntimeError('Owned test PostgreSQL did not stop; inspect evidence in '+str(b))
 print('Evidence:',b)
 env.pop('PGPASSWORD',None)
