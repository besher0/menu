// Build on the target OS first. Create a NEW production-only tree; never prune the builder.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const source=path.resolve(__dirname,'..'),target=path.resolve(process.argv[2]||'');
const relative=path.relative(source,target);
if(!process.argv[2]||!path.isAbsolute(process.argv[2])||fs.existsSync(target)||!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw Error('Use a new absolute runtime directory outside the builder');
for(const file of ['apps/api/dist/main.js','apps/web/.next/BUILD_ID','packages/shared/dist/index.js','node_modules/.prisma/client/index.js'])if(!fs.existsSync(path.join(source,file)))throw Error('Build and generate Prisma first: '+file);
fs.mkdirSync(target,{recursive:true});
for(const relative of ['package.json','package-lock.json','apps/api/package.json','apps/web/package.json','packages/shared/package.json','apps/api/dist','packages/shared/dist','apps/web/.next','apps/web/public','apps/web/next.config.mjs','apps/web/public-image-policy.json','deploy/staging','scripts/staging.cjs','scripts/verify-staging-runtime.cjs']){
 const from=path.join(source,relative),to=path.join(target,relative);fs.mkdirSync(path.dirname(to),{recursive:true});
 fs.cpSync(from,to,{recursive:true,filter:p=>!p.startsWith(path.join(source,'apps/web/.next/cache'))});
}
// No dependency lifecycle scripts in the runtime installation. Prisma's generated client
// and native engine come from the same OS/architecture builder after npm ci + generate.
const npm=process.env.npm_execpath||path.join(path.dirname(process.execPath),process.platform==='win32'?'node_modules/npm/bin/npm-cli.js':'../lib/node_modules/npm/bin/npm-cli.js');
const result=cp.spawnSync(process.execPath,[npm,'ci','--omit=dev','--ignore-scripts'],{cwd:target,env:{...process.env,NODE_ENV:'production'},stdio:'inherit',windowsHide:true});
if(result.status!==0)throw Error('Runtime install failed; do not deploy this directory');
fs.cpSync(path.join(source,'node_modules/.prisma'),path.join(target,'node_modules/.prisma'),{recursive:true});
fs.writeFileSync(path.join(target,'RUNTIME_BUILD.json'),JSON.stringify({platform:process.platform,arch:process.arch,node:process.version,devDependenciesInstalled:false,lifecycleScripts:false,prisma:'copied from same-platform builder'},null,2));
const check=cp.spawnSync(process.execPath,[path.join(target,'scripts/verify-staging-runtime.cjs')],{cwd:target,stdio:'inherit',windowsHide:true});
if(check.status!==0)throw Error('Runtime verification failed; STOP');
console.log('RUNTIME_PREPARED (HTTP/restart smoke still required)');
