import json,hashlib,zipfile
from pathlib import Path
import sys
src=Path(__file__).resolve().parents[1]
archive=Path(sys.argv[1])
d=Path(sys.argv[2]);d.mkdir(exist_ok=True,parents=True)
packages=json.loads((src/'package-lock.json').read_bytes())['packages']; names={}
for k,v in packages.items():
 if not v.get('version') or 'node_modules/' not in k: continue
 name=v.get('name',k.rsplit('node_modules/',1)[1])
 names.setdefault(name,set()).add(v['version'])
(d/'versions.json').write_text(json.dumps({n:sorted(v) for n,v in names.items()}))
found=[]; count=0
with zipfile.ZipFile(archive) as z:
 for n in z.namelist():
  if not n.endswith('.json'):continue
  rec=json.loads(z.read(n));count+=1
  if rec.get('withdrawn'):continue
  for aff in rec.get('affected',[]):
   pkg=aff.get('package',{}).get('name')
   if pkg not in names:continue
   found.append({'pkg':pkg,'id':rec['id'],'severity':aff.get('database_specific',{}).get('severity') or rec.get('database_specific',{}).get('severity','UNKNOWN'),'summary':rec.get('summary','')[:220],'ranges':aff.get('ranges',[]),'versions':list(names[pkg].intersection(aff.get('versions',[])))})
(d/'osv-relevant.json').write_text(json.dumps(found))
(d/'osv-scan.json').write_text(json.dumps({'publicDatabaseSha256':hashlib.file_digest((archive).open('rb'),'sha256').hexdigest(),'readRecords':count,'packageNames':len(names)}))
