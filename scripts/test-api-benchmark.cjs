const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {randomBytes} = require('node:crypto');
const {setTimeout: sleep} = require('node:timers/promises');
const {PrismaClient} = require('@prisma/client');
const sizes = [20, 100, 500];

async function buildFixture(db) {
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/ordersawa_qa_bench' || !['55440','55449'].includes(url.port))
    throw Error('Disposable benchmark database required');
  const [identity] = await db.$queryRaw`SELECT current_setting('data_directory') AS dir, current_database() AS db`;
  if (path.resolve(identity.dir) !== path.resolve(process.env.QA_DATA_DIR) || identity.db !== 'ordersawa_qa_bench' || await db.restaurant.count())
    throw Error('Fixture identity mismatch');
  await db.restaurant.createMany({data:Array.from({length:1000},(_,i)=>({id:'qa-'+i,name:'Fixture '+i,slug:'qa-'+i}))});
  await db.category.createMany({data:Array.from({length:1000},(_,i)=>({id:'cat-'+i,restaurantId:'qa-'+i,name:'الكل',slug:'all',sortOrder:0}))});
  for(const n of sizes) {
    await db.product.createMany({data:Array.from({length:n},(_,i)=>({name:'Product '+i,slug:'p-'+i,restaurantId:'qa-'+n,categoryId:'cat-'+n,sortOrder:i,basePrice:10}))});
  }
}

async function countQueries(root,label,round,rows) {
  const {PrismaClient:Client}=require(path.join(root,'node_modules/@prisma/client'));
  const db=new Client({log:[{emit:'event',level:'query'}]});
  const queries=[];
  db.$on('query',event=>queries.push(event.duration));
  try {
    const {PublicMenuService}=require(path.join(root,'apps/api/dist/modules/public-menu/public-menu.service'));
    const {FeatureFlagsService}=require(path.join(root,'apps/api/dist/modules/feature-flags/feature-flags.service'));
    const {ConfigService}=require(path.join(root,'node_modules/@nestjs/config'));
    const reader=new PublicMenuService(db,new FeatureFlagsService(db),new ConfigService());
    await db.$connect();
    for(const n of sizes){
      queries.length=0;
      const response=await reader.menu('qa-'+n,undefined,false);
      if(response.products.length!==n)throw Error('Reader output mismatch');
      rows.push({release:label,round,readerSize:n,statements:queries.length,dbMs:queries.reduce((a,b)=>a+b,0)});
    }
  } finally {await db.$disconnect();}
}

async function measureHttp(root,release,round,rows) {
  const probe=net.createServer();
  probe.listen(0,'127.0.0.1');await once(probe,'listening');
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const proc=spawn(process.execPath,['dist/main.js'],{cwd:path.join(root,'apps/api'),windowsHide:true,stdio:'ignore',env:{
    ...process.env,ORDERSAWA_RELEASE_ID:release,PORT:String(port),API_HOST:'127.0.0.1',JWT_SECRET:randomBytes(32).toString('hex'),ORDERSAWA_DEMO_UPLOADS_DIR:path.join(process.env.QA_OUTPUT,'synthetic-uploads')
  }});
  const exit=once(proc,'exit'), origin='http://127.0.0.1:'+port;
  try {
    let ready=false;
    for(let i=0;i<100;i++){
      await sleep(100);
      if(proc.exitCode!==null)throw Error('Fixture API exited');
      try{const r=await fetch(origin+'/health');if(r.ok&&r.headers.get('x-ordersawa-release')===release){ready=true;break;}}catch{}
    }
    if(!ready)throw Error('API did not start');
    async function read(tenant,expected) {
      const start=performance.now();
      const res=await fetch(origin+'/public/menus/qa-'+tenant+'?track=0',{signal:AbortSignal.timeout(15000)});
      const ttfb=performance.now()-start;
      if(!res.ok || res.headers.get('x-ordersawa-release')!==release)throw Error('Unexpected API response '+res.status);
      const body=await res.json();
      if(body.data.restaurant.slug!=='qa-'+tenant||body.data.products.length!==expected)throw Error('Tenant or payload mismatch');
      return {ttfb,completeMs:performance.now()-start};
    }
    for(const n of sizes)for(let i=0;i<18;i++)rows.push({release,round,n,i,...await read(n,n)});
    const start=performance.now();
    const samples=await Promise.all(Array.from({length:100},(_,i)=>read(i%10,0)));
    rows.push({release,round,concurrent:100,tenantsQueried:10,tenantsInDatabase:1000,ms:performance.now()-start,samples});
  } finally {if(proc.exitCode===null)proc.kill();await exit;}
}

async function main() {
  const db=new PrismaClient();
  try {await buildFixture(db);} finally {await db.$disconnect();}
  const rows=[], candidate=path.resolve(__dirname,'..'), reference=process.env.QA_REFERENCE_ROOT;
  const roots=reference?[reference,candidate,candidate,reference]:[candidate];
  for(const [round,root] of roots.entries()){
    const label=root===candidate?'qa-current':'qa-reference';
    await countQueries(root,label,round,rows);
    await measureHttp(root,label,round,rows);
  }
  await fs.writeFile(path.join(process.env.QA_OUTPUT,'api-benchmark.json'),JSON.stringify(rows,null,2));
}
main().catch(e=>{console.error(e.message.replace(/postgres(?:ql)?:\/\/\S+/gi,'[redacted]'));process.exitCode=1;});
