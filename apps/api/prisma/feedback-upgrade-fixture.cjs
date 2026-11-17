/* Owned disposable PostgreSQL only. Never reads .env or an operational database. */
const {PrismaClient}=require('@prisma/client'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{const url=new URL(process.env.ORDERING_TEST_DATABASE_URL||'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,process.env.ORDERING_TEST_PORT);assert(/^\/ordering_v2_[a-f0-9]+$/.test(url.pathname));
 const prisma=new PrismaClient({datasourceUrl:url.href});try{
 const [{data_directory:directory}]=await prisma.$queryRawUnsafe('SHOW data_directory');assert.equal(path.resolve(directory).toLowerCase(),path.resolve(process.env.ORDERING_TEST_DATA_DIRECTORY).toLowerCase());
 const file=process.argv[3],id='feedback-upgrade-sentinel';
 if(process.argv[2]==='before'){
  await prisma.restaurant.create({data:{id,name:'Synthetic populated upgrade',slug:id,description:'نبذة محفوظة',currency:'SYP',branches:{create:{name:'Main',slug:'main',address:'عنوان محفوظ',latitude:33,longitude:36}},themeSettings:{create:{settings:{dashboardSettings:{phone:'synthetic',showPrices:true},unrelated:'preserved'}}}}});
  await prisma.category.create({data:{id:id+'-category',restaurantId:id,name:'Category',slug:'category'}});
  await prisma.product.create({data:{id:id+'-product',restaurantId:id,categoryId:id+'-category',name:'Legacy retained',slug:'legacy-retained',basePrice:'12500',currency:'SYP',images:{create:{url:'/assets/public/menu-home.png'}}}});
 }
 const value=await prisma.restaurant.findUniqueOrThrow({where:{id},include:{branches:true,themeSettings:true,categories:true,products:{include:{images:true}}}}),snapshot=JSON.stringify(value),sha256=crypto.createHash('sha256').update(snapshot).digest('hex');
 if(process.argv[2]==='before')fs.writeFileSync(file,JSON.stringify({sha256,snapshot}));
 else{const before=JSON.parse(fs.readFileSync(file));assert.equal(snapshot,before.snapshot);assert.equal(await prisma.restaurantFeedback.count(),0);fs.writeFileSync(file.replace(/\.json$/,'.result.json'),JSON.stringify({status:'PASS',populatedUpgrade:'PRESERVED',beforeSha256:before.sha256,afterSha256:sha256,feedbackTableEmpty:true},null,2));console.log('POPULATED_FEEDBACK_UPGRADE_PASS');}
 }finally{await prisma.$disconnect()}
})().catch(e=>{console.error(e);process.exitCode=1});
