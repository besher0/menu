const fs=require('node:fs'), path=require('node:path'), semver=require('semver');
const directory=path.resolve(process.argv[2]);
const read=n=>JSON.parse(fs.readFileSync(path.join(directory,n),'utf8'));
const versions=read('versions.json'), hits=[];
for (const rec of read('osv-relevant.json')) {
 for(const v of versions[rec.pkg]){
  let match=rec.versions.includes(v);
  for(const r of rec.ranges.filter(x=>['SEMVER','ECOSYSTEM'].includes(x.type))){
   let active=false;
   for(const e of r.events){
    if(e.introduced!==undefined && (e.introduced==='0'||(semver.valid(e.introduced)&&semver.gte(v,e.introduced))))active=true;
    const end=e.fixed||e.limit||e.last_affected;
    if(end&&semver.valid(end)&&(e.last_affected?semver.gt(v,end):semver.gte(v,end)))active=false;
   }
   if(active) match=true;
  }
  if(match)hits.push({pkg:rec.pkg,version:v,id:rec.id,severity:rec.severity,summary:rec.summary});
 }
}
fs.writeFileSync(path.join(directory,'advisory-matches.json'),JSON.stringify(hits,null,2));
console.log(hits.length + " advisory/version matches");
if (hits.some(hit=>["CRITICAL","HIGH"].includes(hit.severity))) process.exitCode=1;
