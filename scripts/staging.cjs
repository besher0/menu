// Node 24. Run with --env-file=/private/staging.env. Never loads a repository .env.
const path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),env=process.env;
function run(cmd,args,extra={}) {
  const p=spawnSync(cmd,args,{cwd:root,env:{...env,...extra},stdio:'inherit'});
  if(p.status!==0)throw Error('Command failed; STOP (details above)');
}
async function main(){
 if(env.ORDERSAWA_ENV!=='staging')throw Error('Staging environment required');
 require('../apps/api/dist/common/security/production-config').validateProductionConfig(env);
 const mode=process.argv[2]||'check';
 const {Client}=require('pg'); const db=new Client({connectionString:env.DIRECT_URL});
 try {await db.connect();const {rows:[identity]}=await db.query('SELECT current_database() AS name, r.rolsuper FROM pg_roles r WHERE r.rolname=current_user');
  if(identity.name!==env.STAGING_DB_NAME||identity.rolsuper)throw Error('Expected isolated staging database and non-superuser role');
  // Read-only preflight, including soft-deleted rows. Never convert saved configurations.
  const {rows:[columns]}=await db.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='Product' AND column_name='configurationTree'`);
  if(columns.n && ['check','migrate'].includes(mode)){
   const {rows:[legacy]}=await db.query(`SELECT EXISTS(SELECT 1 FROM "Product" WHERE "configurationTree" IS NOT NULL AND (jsonb_typeof("configurationTree") IS DISTINCT FROM 'object' OR "configurationTree"->'schemaVersion' IS DISTINCT FROM '2'::jsonb)) AS found`);
   if(legacy.found)throw Error('Unsupported saved product configuration; STOP before migration');
  }

 } finally {await db.end();}
 if(mode==='check'){console.log('PASS staging configuration and DB identity');return;}
 if(mode==='bootstrap'){
  const validPassword=v=>v && v.length>=16 && Buffer.byteLength(v)<=72;
  if(!validPassword(env.STAGING_BOOTSTRAP_ADMIN_PASSWORD)||!validPassword(env.STAGING_SMOKE_PASSWORD)||
     !env.STAGING_BOOTSTRAP_ADMIN_EMAIL||!env.STAGING_SMOKE_EMAIL||env.STAGING_SMOKE_EMAIL===env.STAGING_BOOTSTRAP_ADMIN_EMAIL||
     !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(env.STAGING_SMOKE_RESTAURANT_SLUG||'')||
     !/^\+?[1-9]\d{7,14}$/.test(env.STAGING_SMOKE_WHATSAPP_PHONE||''))throw Error('Private synthetic bootstrap inputs required');
  const {PrismaClient}=require('@prisma/client'),bcrypt=require('bcryptjs'),{PLAN_FEATURES,ABO_MALEK_THEME}=require('@menu/shared');const p=new PrismaClient();
  try{await p.$transaction(async tx=>{
   await tx.$executeRaw`LOCK TABLE "User", "Restaurant", "SubscriptionPlan" IN EXCLUSIVE MODE`;
   if(await tx.user.count()||await tx.restaurant.count()||await tx.subscriptionPlan.count())throw Error('Bootstrap requires empty staging');
   await tx.user.create({data:{email:env.STAGING_BOOTSTRAP_ADMIN_EMAIL,passwordHash:await bcrypt.hash(env.STAGING_BOOTSTRAP_ADMIN_PASSWORD,12),role:'SUPER_ADMIN',name:'Staging administrator'}});
   const owner=await tx.user.create({data:{email:env.STAGING_SMOKE_EMAIL,passwordHash:await bcrypt.hash(env.STAGING_SMOKE_PASSWORD,12),role:'USER',name:'Staging owner'}});
   const plan=await tx.subscriptionPlan.create({data:{key:'STAGING_TEST',name:'Staging test only',priceMonthly:0,priceYearly:0,features:{create:(PLAN_FEATURES.PREMIUM||[]).map(f=>({key:f.key,enabled:f.enabled,limit:f.limit}))}}});
   const restaurant=await tx.restaurant.create({data:{slug:env.STAGING_SMOKE_RESTAURANT_SLUG,name:'Staging test restaurant',currency:'SYP',whatsappPhone:env.STAGING_SMOKE_WHATSAPP_PHONE,members:{create:{userId:owner.id,role:'OWNER'}},subscription:{create:{planId:plan.id,status:'ACTIVE',startsAt:new Date()}}}});
   await tx.restaurantThemeSettings.create({data:{restaurantId:restaurant.id,settings:ABO_MALEK_THEME}});
   const category=await tx.category.create({data:{restaurantId:restaurant.id,name:'Staging test',slug:'staging-test'}});
   await tx.product.create({data:{restaurantId:restaurant.id,categoryId:category.id,name:'Staging test product',slug:'staging-test-product',basePrice:1000,currency:'SYP',isActive:true,isAvailable:true,images:{create:{url:'/assets/public/demo-pizza-cheese.jpg',isActive:true,sortOrder:0}}}});
  },{timeout:30000});}finally{await p.$disconnect();}
  console.log('PASS isolated staging fixture created. No WhatsApp message sent.');return;
 }
 if(mode==='migrate'){run(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy','--schema','apps/api/prisma/schema.prisma']);return;}
 if(mode==='backup'){
  const target=process.argv[3];if(!target||!path.isAbsolute(target)||fs.existsSync(target))throw Error('Use a new absolute backup filename');
  const u=new URL(env.DIRECT_URL);run('pg_dump',['-Fc','--file',target],{PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:decodeURIComponent(u.pathname.slice(1)),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGSSLMODE:u.searchParams.get('sslmode')||'prefer'});console.log('PASS backup created; restore verification remains mandatory');return;
 }
 if(mode!=='smoke')throw Error('Expected check, migrate, bootstrap, backup or smoke');
 const origin=env.WEB_ORIGIN,api=env.API_ORIGIN;
 const get=async(url,headers={})=>{const r=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Smoke HTTP failure '+r.status);return r;};
 await get(origin+'/login'); await get(api+'/health/ready');
 const denied=await fetch(api+'/dashboard/overview',{redirect:'error'});if(denied.status!==401)throw Error('Anonymous boundary failed');
 if(!env.STAGING_SMOKE_EMAIL||!env.STAGING_SMOKE_PASSWORD||!env.STAGING_SMOKE_RESTAURANT_SLUG)throw Error('Synthetic smoke account/restaurant required');
 const login=await fetch(api+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:env.STAGING_SMOKE_EMAIL,password:env.STAGING_SMOKE_PASSWORD}),redirect:'error'});
 if(!login.ok)throw Error('Smoke login failed');const session=(await login.json()).data;
 if(session.user.role!=='USER')throw Error('Use a merchant smoke account, not a superadmin');
 const member=session.memberships.find(m=>m.restaurant.slug===env.STAGING_SMOKE_RESTAURANT_SLUG);if(!member)throw Error('Smoke membership mismatch');
 const headers={authorization:'Bearer '+session.accessToken,'x-restaurant-id':member.restaurant.id};
 await get(api+'/dashboard/overview',headers);
 const foreign=await fetch(api+'/dashboard/overview',{headers:{...headers,'x-restaurant-id':'smoke-nonmember'},redirect:'error'});if(foreign.status!==403)throw Error('Tenant boundary failed');
 await get(api+'/public/menus/'+encodeURIComponent(member.restaurant.slug)+'?track=0');
 console.log('PASS HTTP smoke; run browser smoke separately. No order or WhatsApp message created.');
}
main().catch(()=>{console.error('FAIL staging operation. Check private configuration/permissions/logs; STOP. Secrets suppressed.');process.exitCode=1;});
