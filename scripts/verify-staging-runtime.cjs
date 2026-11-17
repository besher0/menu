const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
module.exports=function verifyRuntime(){
const root=path.resolve(__dirname,'..'),req=createRequire(path.join(root,'package.json'));
if(!fs.existsSync(path.join(root,'RUNTIME_BUILD.json')))throw Error('Prepared runtime required');
const forbidden=['vitest','vite','tinyglobby','fdir','picomatch','tsx','typescript'];
for(const name of forbidden){try{req.resolve(name+'/package.json');throw Error('Build-only dependency resolves: '+name)}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}}
for(const name of ['@nestjs/core','@prisma/client','@menu/shared','next','sharp','prisma'])req.resolve(name);
for(const file of ['apps/api/dist/main.js','apps/web/.next/BUILD_ID','node_modules/.prisma/client/index.js'])if(!fs.existsSync(path.join(root,file)))throw Error('Missing runtime file '+file);
// npm retains the Prisma CLI as @prisma/client optional peer; it is audited and is not a test server.
// Next ships its own compiled matcher; it is deliberately NOT claimed absent.
return {runtime:'PASS',absentBuildPackages:forbidden,nextBundledMatcher:!!req.resolve('next/dist/compiled/picomatch')};
};
if(require.main===module)console.log(JSON.stringify(module.exports()));
