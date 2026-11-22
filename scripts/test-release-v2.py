"""Complete active acceptance on owned PostgreSQL; retired V1 cases have an audited disposition.
Requires the build, PG_BIN, PLAYWRIGHT_MODULE and V62_BROWSER_EXECUTABLE. No .env is read.
"""
from pathlib import Path
import os,sys,subprocess,shutil,json
if not __debug__:raise RuntimeError('Python -O is not supported')
s=Path(__file__).resolve().parents[1];pg=Path(os.environ['PG_BIN']).resolve()
for key in ('PLAYWRIGHT_MODULE','V62_BROWSER_EXECUTABLE'):
 if not Path(os.environ[key]).exists():raise RuntimeError('Reviewed browser dependency required: '+key)
b=Path(os.environ.get('QA_OUTPUT',s/'dist/qa-release-v2')).resolve();b.mkdir(parents=True,exist_ok=True)
node=shutil.which('node');env=dict(os.environ)
# Require an explicit empty/private-free process environment from the caller, never dotenv.
for key in ('DATABASE_URL','DIRECT_URL','JWT_SECRET','PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY'):
 env.pop(key,None)
results={}
# Fail if a new integration file is silently omitted from the official gate.
expected={'products/product-editor.integration.spec.ts','public-menu/v2-customer-ordering.integration.spec.ts','feedback/feedback.integration.spec.ts','public-menu/public-menu-race.integration.spec.ts','public-menu/public-whatsapp-checkout.integration.spec.ts'}
actual={p.relative_to(s/'apps/api/src/modules').as_posix() for p in (s/'apps/api/src/modules').rglob('*.integration.spec.ts')}
if actual!=expected:raise RuntimeError('Integration inventory differs: '+str(actual^expected))
import hashlib
retirement=json.loads((s/'docs/staging/V1_CASE_DISPOSITION.json').read_text('utf8'))
assert len(retirement['cases'])==90 and len({r['id'] for r in retirement['cases']})==90
for item in retirement['files']:
 assert hashlib.sha256((s/item['archive']).read_bytes()).hexdigest()==item['sha256']
 assert not (s/item['original']).exists()
for item in retirement['cases']:
 if item['targetFile']:assert item['targetTest'] in (s/item['targetFile']).read_text('utf8')

def run(name,args,cwd=s):
 with (b/(name+'.log')).open('wb') as output:
  r=subprocess.run(list(map(str,args)),cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=output,stderr=output,timeout=1200)
 results[name]=r.returncode;(b/'checks.json').write_text(json.dumps(results,indent=2),'utf8')
 print(name,r.returncode,flush=True)
 if r.returncode:
  # The individual fixture logs stay private. Only surface named substep exit codes in CI.
  import re
  for line in (b/(name+'.log')).read_text('utf8',errors='replace').splitlines():
   if re.fullmatch(r'[a-z][a-z0-9-]{0,64} -?[0-9]{1,10}',line):print(line,flush=True)
  raise SystemExit(r.returncode)
for name,folder in [('shared','packages/shared'),('api-unit','apps/api'),('web','apps/web')]:
 report=b/(name+'.json');args=[node,s/'node_modules/vitest/vitest.mjs','run','--reporter=json','--outputFile',report]
 if name=='api-unit':args+=['--exclude','**/*.integration.spec.ts']
 run(name,args,s/folder)
 data=json.loads(report.read_text('utf8'))
 if data['numFailedTests'] or data['numPendingTests'] or not data['numPassedTests']:raise RuntimeError('Unit failure/skip: '+name)
# Preserve startup, schema drift, populated ordinary upgrade, restore, API benchmark and readiness checks.
run('operations',[sys.executable,s/'scripts/test-isolated.py','--operations-only'])
env.update(UNIFIED_V62_BROWSER_SCRIPT=str(s/'apps/web/scripts/test-product-editor-fields.cjs'),UNIFIED_V62_BROWSER_OUTPUT=str(b/'editor-browser'),ORDERING_BROWSER_OUTPUT=str(b/'ordering-browser'))
run('editor',[sys.executable,s/'apps/api/prisma/test-unified-product-editor.py','--postgres-bin',pg])
env.update(UNIFIED_V62_BROWSER_SCRIPT=str(s/'apps/web/scripts/test-product-management.cjs'),UNIFIED_V62_BROWSER_OUTPUT=str(b/'management-browser'))
run('management',[sys.executable,s/'apps/api/prisma/test-unified-product-editor.py','--postgres-bin',pg])
run('ordering',[sys.executable,s/'apps/api/prisma/test-v2-customer-ordering.py','--postgres-bin',pg,'--browser','--legacy-regressions'])
# No enabled suite may pass by leaving cases pending. Deduplicate repeated editor runs.
reports=list(b.rglob('integration-results.json'))
assert reports,'No database integration reports'
unique={}
for report in reports:
 data=json.loads(report.read_text('utf8'))
 if data['numFailedTests'] or data['numPendingTests'] or data.get('numTodoTests',0):raise RuntimeError('Integration failure/skip: '+str(report))
 for suite in data['testResults']:
  for case in suite['assertionResults']:
   assert case['status']=='passed',(suite['name'],case['fullName'])
   unique[(suite['name'],case['fullName'])]=case['status']
(b/'unique-integration-count.json').write_text(json.dumps({'passed':len(unique),'failed':0,'skipped':0}),'utf8')
run('staging',[sys.executable,s/'scripts/test-staging.py'])
env.setdefault('CHROME_BIN', env['V62_BROWSER_EXECUTABLE'])
run('browser-smoke',[sys.executable,s/'scripts/browser-smoke.py'])
print('V2_RELEASE_ACCEPTANCE_PASS')
