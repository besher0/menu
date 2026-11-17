const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=path.resolve(process.env.STAGING_RUNTIME_ROOT||''),req=createRequire(path.join(root,'package.json')),pm=req('next/dist/compiled/picomatch'),original=pm.makeRe,seen=[];
pm.makeRe=(pattern,...rest)=>{seen.push(pattern);return original(pattern,...rest)};
const policy=req('./apps/web/public-image-policy.json'),local=req('next/dist/shared/lib/match-local-pattern'),remote=req('next/dist/shared/lib/match-remote-pattern');
for(const input of ['/assets/public/demo-pizza-cheese.jpg','/assets/public/+(*)','/+(*)','/uploads/+(*)','/assets/brand/logo.png'])local.hasLocalMatch(policy.localPatterns,input);
for(const input of ['https://images.pexels.com/photos/+(*)','https://res.cloudinary.com/test/image/upload/+(*)','https://evil.test/+(*)'])remote.hasRemoteMatch([],policy.remotePatterns,new URL(input));
const expected=new Set([...policy.localPatterns.map(p=>p.pathname),...policy.remotePatterns.flatMap(p=>[p.hostname,p.pathname])]);assert(seen.length>0);assert(seen.every(p=>expected.has(p)));assert(!seen.some(p=>p.includes('+(')));
assert(process.env.STAGING_RUNTIME_ROOT&&process.env.RUNTIME_SMOKE_OUTPUT);
fs.writeFileSync(path.join(process.env.RUNTIME_SMOKE_OUTPUT,'matcher-reachability.json'),JSON.stringify({status:'PASS',patternsObserved:[...new Set(seen)],source:'Runtime Next matcher functions invoked with untrusted URL candidates; makeRe receives repository policy patterns only',nextBundledMatcherPresent:true,bundledVersion:'not declared in vendored manifest; not assumed safe by npm audit',untrustedPatternObserved:false},null,2));console.log('MATCHER_BOUNDARY_PASS');
