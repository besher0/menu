// Called only by test-staging.py with its fresh loopback cluster and synthetic account.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),net=require('node:net'),assert=require('node:assert/strict');
const root=path.resolve(process.env.STAGING_RUNTIME_ROOT||''),out=path.resolve(process.env.RUNTIME_SMOKE_OUTPUT||'');
assert(process.env.STAGING_RUNTIME_ROOT&&process.env.RUNTIME_SMOKE_OUTPUT&&fs.existsSync(path.join(root,'RUNTIME_BUILD.json')));
const db=new URL(process.env.DATABASE_URL);assert(db.hostname==='127.0.0.1'&&db.pathname==='/ordersawa_staging'&&process.env.ORDERSAWA_ENV==='staging');
fs.mkdirSync(out,{recursive:true});
const env={...process.env,NEXT_TELEMETRY_DISABLED:'1'};delete env.NODE_PATH;delete env.NODE_OPTIONS;
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function request(url,options={}){return fetch(url,{...options,signal:AbortSignal.timeout(10000)});}
async function wait(url,process){for(let i=0;i<100;i++){assert(process.exitCode===null,'Runtime process exited');try{if((await request(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('Runtime readiness timeout');}
async function stop(p){if(!p||p.exitCode!==null)return;const ended=new Promise(r=>p.once('exit',r));p.kill();await ended;}
async function main(){
 assert.equal(cp.spawnSync(process.execPath,[path.join(root,'scripts/verify-staging-runtime.cjs')],{cwd:root,env,encoding:'utf8',windowsHide:true}).status,0);
 const apiPort=await port(),webPort=await port(),api='http://127.0.0.1:'+apiPort,web='http://127.0.0.1:'+webPort;
 Object.assign(env,{PORT:String(apiPort),WEB_PORT:String(webPort),ORDERSAWA_PREVIEW_INTERNAL_API_URL:api});
 const envFile=path.join(out,'runtime-env-check');fs.writeFileSync(envFile,'# Values supplied in the isolated child process environment.\n');
 try {
  const pm2=cp.spawnSync(process.execPath,['-e',"const c=require('./deploy/staging/ecosystem.config.cjs');if(c.apps.length!==2||c.apps.some(a=>a.env.NODE_ENV!=='production')||c.apps[1].args[0]!=='start')process.exit(1)"],{cwd:root,env:{...env,STAGING_ENV_FILE:envFile},encoding:'utf8',windowsHide:true});assert.equal(pm2.status,0,'PM2 runtime configuration');
 }finally{fs.unlinkSync(envFile);}
 assert.equal(cp.spawnSync(process.execPath,[path.join(__dirname,'test-staging-matcher.cjs')],{env,encoding:'utf8',windowsHide:true}).status,0,'Next pattern input boundary');
 const results=[];let uploaded;
 for(let cycle=0;cycle<2;cycle++){
  const aLog=fs.openSync(path.join(out,`api-${cycle}.log`),'w'),wLog=fs.openSync(path.join(out,`web-${cycle}.log`),'w');let a,w;
  try{
   a=cp.spawn(process.execPath,[path.join(root,'apps/api/dist/main.js')],{cwd:path.join(root,'apps/api'),env,stdio:['ignore',aLog,aLog],windowsHide:true});
   w=cp.spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(webPort)],{cwd:path.join(root,'apps/web'),env,stdio:['ignore',wLog,wLog],windowsHide:true});
   await wait(api+'/health/ready',a);await wait(web+'/offline',w);
   assert.equal((await request(api+'/health')).status,200);
   const login=await request(api+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:env.STAGING_SMOKE_EMAIL,password:env.STAGING_SMOKE_PASSWORD})});assert(login.ok);
   const session=(await login.json()).data,restaurant=session.memberships[0].restaurant,headers={authorization:'Bearer '+session.accessToken,'x-restaurant-id':restaurant.id};
   assert.equal((await request(api+'/dashboard/overview',{headers})).status,200);
   assert.equal((await request(api+'/dashboard/overview')).status,401);
   assert.equal((await request(api+'/dashboard/overview',{headers:{...headers,'x-restaurant-id':'foreign'}})).status,403);
   const page=await request(web+'/m/'+restaurant.slug,{headers:{'x-ordersawa-internal-restaurant-rewrite':env.INTERNAL_RESTAURANT_REWRITE_SECRET,'x-ordersawa-internal-restaurant-slug':restaurant.slug}});assert(page.ok);const html=await page.text();assert(html.includes('Staging test product'));
   const asset=html.match(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/);assert(asset);assert.equal((await request(new URL(asset[1].replaceAll('&amp;','&'),web))).status,200);
   const image='/assets/public/demo-pizza-cheese.jpg';assert.equal((await request(web+image)).status,200);
   assert.equal((await request(web+'/_next/image?url='+encodeURIComponent(image)+'&w=384&q=75')).status,200);
   assert.equal((await request(web+'/_next/image?url='+encodeURIComponent('https://evil.test/+(*)')+'&w=384&q=75')).status,400);
   if(!uploaded){const form=new FormData();form.set('file',new Blob([fs.readFileSync(path.join(root,'apps/web/public'+image))],{type:'image/jpeg'}),'runtime-smoke.jpg');form.set('type','IMAGE');const r=await request(api+'/dashboard/media/upload',{method:'POST',headers,body:form});assert(r.ok,'Media upload '+r.status);uploaded=(await r.json()).data.url;}
   const media=new URL(uploaded);assert.equal(media.origin,env.WEB_ORIGIN);assert(media.pathname.startsWith('/api/uploads/'));assert.equal((await request(api+media.pathname.slice(4))).status,200);
   assert.equal((await request(web+'/_next/webpack-hmr')).status,404);
   assert.equal((await request(web+'/__vitest__/')).status,404);
   results.push({cycle,api:true,next:true,prismaAuth:true,tenant:true,static:true,imageOptimizer:true,media:true,ready:true,devEndpointsAbsent:true});
  }finally{await stop(w);await stop(a);fs.closeSync(aLog);fs.closeSync(wLog);}
 }
 // Config validation must still reject an unsafe identity with the runtime-only tree.
 const bad=cp.spawnSync(process.execPath,[path.join(root,'apps/api/dist/main.js')],{cwd:path.join(root,'apps/api'),env:{...env,STAGING_DB_NAME:'production'},encoding:'utf8',timeout:15000,windowsHide:true});assert.notEqual(bad.status,0);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({status:'PASS',cycles:results,invalidEnvironmentRejected:true,externalLinuxTested:false},null,2));console.log('PRODUCTION_ONLY_RUNTIME_SMOKE_PASS');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
