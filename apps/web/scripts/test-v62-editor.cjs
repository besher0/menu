/* Isolated acceptance runner. Requires the JWT/API supplied by the disposable PostgreSQL fixture. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process'),assert=require('node:assert/strict'),{randomInt}=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),api=process.env.UNIFIED_V62_API_ORIGIN,token=process.env.UNIFIED_V62_OWNER_TOKEN;
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(api||''),'Loopback API required');
assert(/^postgresql:\/\/[^@]+@127\.0\.0\.1:\d+\/unified_save_[a-f0-9]+$/.test(process.env.UNIFIED_SAVE_TEST_DATABASE_URL||''),'Disposable database fixture required');
assert(token,'Ephemeral fixture JWT required');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve(process.env.UNIFIED_V62_BROWSER_OUTPUT||path.join(root,'dist/v62-browser'));
fs.mkdirSync(out,{recursive:true});
const rows=[];const note=(flow,details={})=>{rows.push({flow,status:'PASS',...details});fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(rows,null,2));console.log('PASS '+flow)};
let next,proxy,browser,log,currentPage;
const headers={'content-type':'application/json',authorization:'Bearer '+token,'x-restaurant-id':'editor-r1'};
async function request(p,init={}){const r=await fetch(api+p,{...init,headers:{...headers,...init.headers}});const body=await r.json();assert(r.ok,JSON.stringify(body));return body.data??body}
async function listen(server){for(let i=0;i<30;i++){try{await new Promise((r,j)=>{server.once('error',j);server.listen(randomInt(20000,60000),'127.0.0.1',r)});server.removeAllListeners('error');return server.address().port}catch{server.removeAllListeners('error')}}throw Error('No available test port')}
async function seed(width){
 const id='v62-browser-source-'+width;
 const configuration={schemaVersion:2,productId:id,revision:1,basePrice:'90000',groups:[{type:'SIZE',id:'source-sizes-'+width,label:'حجم المصدر',
  sizes:[{id:'source-small-'+width,label:'صغير المصدر',price:'9000'},{id:'source-large-'+width,label:'كبير المصدر',price:'14000'}]}]};
 const product={name:'DEMO مصدر '+width,description:'Synthetic isolated browser fixture',categoryId:'editor-c1',basePrice:'90000',isNew:false,isFeatured:false,isPopular:false,moodKeys:[],images:[],ingredients:[],mealDetails:[]};
 await request('/dashboard/products/'+id+'/editor',{method:'PUT',body:JSON.stringify({create:true,expectedProductVersion:0,expectedConfigurationVersion:0,configuration,product})});
 await request('/dashboard/products/'+id+'-ordinary/editor',{method:'PUT',body:JSON.stringify({create:true,expectedProductVersion:0,expectedConfigurationVersion:0,
  product:{...product,name:'DEMO مصدر عادي '+width}})});
 return id;
}
async function main(){
 const reservation=http.createServer();const webPort=await listen(reservation);await new Promise(r=>reservation.close(r));
 log=fs.openSync(path.join(out,'next-production.log'),'w');
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP)$/i.test(k)));
 env.NEXT_TELEMETRY_DISABLED='1';
 next=cp.spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(webPort)],{cwd:path.join(root,'apps/web'),env,windowsHide:true,stdio:['ignore',log,log]});
 let ready=false;for(let i=0;i<120;i++){try{if((await fetch('http://127.0.0.1:'+webPort+'/offline')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,200))}assert(ready,'Next Production readiness');
 proxy=http.createServer((req,res)=>{
  const isApi=req.url.startsWith('/api/'),base=new URL(isApi?api:'http://127.0.0.1:'+webPort);
  const upstream=http.request({hostname:base.hostname,port:base.port,path:isApi?req.url.slice(4):req.url,method:req.method,headers:{...req.headers,host:base.host}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});
  upstream.on('error',()=>{if(res.destroyed||res.writableEnded)return;if(res.headersSent){res.destroy();return}res.writeHead(502);res.end('Isolated upstream unavailable')});res.on('close',()=>upstream.destroy());req.pipe(upstream);
 });
 const origin='http://127.0.0.1:'+await listen(proxy);
 const executable=[process.env.V62_BROWSER_EXECUTABLE,'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
 browser=await chromium.launch({...(executable?{executablePath:executable}:{channel:'chrome'}),args:['--no-proxy-server']});
 for(const width of [1280,1440,430,390,360]){
  const sourceId=await seed(width),context=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'});
  await context.addInitScript(({token})=>{
   const restaurant={id:'editor-r1',slug:'editor-r1',name:'Synthetic one'};
   localStorage.setItem('menu-builder-session',JSON.stringify({accessToken:token,user:{id:'editor-owner',role:'USER'},memberships:[{role:'OWNER',restaurant}]}));
   localStorage.setItem('menu-builder-restaurant',JSON.stringify(restaurant));
  },{token});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage(),errors=[],writes=[];currentPage=page;page.setDefaultTimeout(15_000);
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='PUT')writes.push(r.url())});
  const close=async()=>{const b=page.getByRole('button',{name:'إغلاق لوحة الخصائص',exact:true});if(await b.isVisible())await b.click()};
  const select=async label=>{await close();await page.locator('.config-option-main').filter({hasText:label}).first().click()};
  const addRoot=async type=>{await close();await page.locator('.config-section-head').getByRole('button',{name:type==='SIZE'?'+ أحجام':'+ خيارات',exact:true}).click()};
  await page.goto(origin+'/dashboard/products/new',{waitUntil:'networkidle'});
  await page.getByLabel('اسم المنتج',{exact:true}).fill('DEMO بيتزا '+width);
  await page.getByLabel(/^القسم/).selectOption('editor-c1');
  await page.getByLabel('السعر الأساسي Base',{exact:true}).fill('6000');
  await addRoot('SIZE');await page.getByRole('button',{name:'+ حجم',exact:true}).click();
  await close();await page.getByRole('button',{name:'حفظ المنتج',exact:true}).click();
  await page.getByLabel('اسم الحجم',{exact:true}).waitFor();assert.equal(writes.length,0);
  await close();await page.locator('.kind-size .config-option-main').first().click();
  await page.getByLabel('اسم الحجم',{exact:true}).fill('صغير');await page.getByLabel('السعر',{exact:true}).fill('11000');
  for(const [label,price] of [['وسط','15000'],['كبير','21000']]){
   await close();await page.getByRole('button',{name:'+ حجم',exact:true}).first().click();
   assert.equal(await page.getByLabel('اسم الحجم',{exact:true}).inputValue(),'');
   assert.equal(await page.getByLabel('السعر',{exact:true}).inputValue(),'');
   await page.getByLabel('اسم الحجم',{exact:true}).fill(label);await page.getByLabel('السعر',{exact:true}).fill(price);
  }
  await close();
  const base=page.getByLabel('السعر الأساسي Base',{exact:true});assert(await base.isDisabled());assert.equal(await base.inputValue(),'6000');
  await page.locator('.basic-price').focus();
  await page.getByRole('tooltip').waitFor({state:'visible'});
  assert(await page.getByRole('tooltip').isVisible());
  await page.locator('.basic-price').press('Tab');
  await addRoot('OPTIONS');await page.getByLabel('اسم الخيارات',{exact:true}).fill('إضافات');
  await page.getByLabel('الكمية المشمولة مجانًا',{exact:true}).fill('1');await page.locator('.kind-group').last().getByRole('button',{name:'+ خيار',exact:true}).click();
  await close();await page.locator('.kind-group .config-option-main').filter({hasText:'خيار جديد'}).first().click();
  await page.getByLabel('اسم الخيار',{exact:true}).fill('جبنة');
  await page.getByLabel('السعر الثابت',{exact:true}).fill('1500');
  await page.getByLabel('طريقة التسعير',{exact:true}).selectOption('by-size');
  await page.getByLabel('سعر صغير',{exact:true}).fill('750');
  await page.getByLabel('سعر وسط',{exact:true}).fill('1000');
  await page.getByLabel('سعر وسط',{exact:true}).fill('');
  await page.getByLabel('سعر كبير',{exact:true}).fill('0');
  assert.equal(await page.getByLabel('سعر وسط',{exact:true}).inputValue(),'');
  assert.equal(await page.getByLabel('الحد الأقصى للخيار',{exact:true}).inputValue(),'');
  await page.getByText('إبراز الخيار في ملخص السعر',{exact:true}).click();
  await close();
  // Switch directly between nodes: every prior keystroke already belongs to the parent draft.
  await select('صغير');assert.equal(await page.getByLabel('اسم الحجم',{exact:true}).inputValue(),'صغير');await close();
  await select('جبنة');assert.equal(await page.getByLabel('سعر صغير',{exact:true}).inputValue(),'750');await close();
  note(width+' sizes, scoped null/zero, included quantity, immediate inspector draft');
  // Shared Size branches are stored once on Group.children; private branches belong to an option.
  await page.getByRole('button',{name:'إضافة خيارات مشتركة للأحجام',exact:true}).click();
  await page.getByLabel('اسم الخيارات',{exact:true}).fill('تحمير مشترك');await close();await page.locator('.config-node-card').filter({has:page.locator('.config-node-title b').getByText('تحمير مشترك',{exact:true})}).last().getByRole('button',{name:'+ خيار',exact:true}).first().click();
  await page.getByLabel('اسم الخيار',{exact:true}).fill('تحمير إضافي');
  assert.equal(await page.getByLabel('طريقة التسعير',{exact:true}).count(),1);await close();
  const cheeseRow=page.locator('.config-option-row').filter({has:page.locator('.config-option-main b').getByText('جبنة',{exact:true})}).first();
  await cheeseRow.getByRole('button',{name:'+ فرع',exact:true}).click();await page.getByRole('dialog',{name:'إضافة فرع',exact:true}).getByRole('button',{name:'+ خيارات',exact:true}).click();
  await page.getByLabel('اسم الخيارات',{exact:true}).fill('نوع الجبنة');
  await page.getByLabel('الحد الأدنى',{exact:true}).fill('1');await page.getByLabel('الحد الأقصى',{exact:true}).fill('1');
  await page.getByText('إبراز في ملخص السعر',{exact:true}).click();await close();await page.locator('.config-node-card').filter({has:page.locator('.config-node-title b').getByText('نوع الجبنة',{exact:true})}).last().getByRole('button',{name:'+ خيار',exact:true}).first().click();
  await page.getByLabel('اسم الخيار',{exact:true}).fill('موزاريلا');
  assert.equal(await page.getByLabel('طريقة التسعير',{exact:true}).count(),0);await close();
  await page.getByRole('button',{name:'نجمة إضافات',exact:true}).click();
  note(width+' shared/private branches and Shared scope isolation');
  await addRoot('OPTIONS');await page.getByLabel('الحد الأدنى',{exact:true}).fill('1');await page.getByLabel('الحد الأقصى',{exact:true}).fill('1');
  await page.getByLabel('اسم الخيارات',{exact:true}).fill('   ');
  assert.equal(await page.getByLabel('اسم الخيارات',{exact:true}).inputValue(),'');await page.locator('.kind-group').last().getByRole('button',{name:'+ خيار',exact:true}).click();
  await close();await page.locator('.config-option-main').filter({hasText:'خيار جديد'}).first().click();
  await page.getByLabel('اسم الخيار',{exact:true}).fill('صلصة إجبارية');await close();
  await addRoot('OPTIONS');await page.getByLabel('اسم الخيارات',{exact:true}).fill('مشروبات');await page.locator('.kind-group').last().getByRole('button',{name:'+ خيار',exact:true}).click();
  for(const mode of ['ORIGINAL','CUSTOM']){
   await close();
   if(mode==='CUSTOM')await page.locator('.kind-group').filter({has:page.locator('.config-node-title b').filter({hasText:'مشروبات'})}).getByRole('button',{name:'+ خيار',exact:true}).first().click();
   else await page.locator('.config-option-main').filter({hasText:'خيار جديد'}).first().click();
   await page.getByLabel('نوع الخيار',{exact:true}).selectOption('linked');
   await page.getByLabel('المنتج المرتبط',{exact:true}).selectOption(sourceId);
   await page.waitForFunction(id=>document.querySelector('select[aria-label="المنتج المرتبط"]')?.value===id,sourceId);
   await page.getByLabel('طريقة استخدام خيارات المنتج',{exact:true}).waitFor();
   if(mode==='CUSTOM')await page.getByLabel('طريقة استخدام خيارات المنتج',{exact:true}).selectOption('CUSTOM');
   // Wait for the real GET source and controlled draft update before selecting another node.
   await page.waitForFunction(mode=>document.querySelector('select[aria-label="طريقة استخدام خيارات المنتج"]')?.value===mode && !document.querySelector('.config-live')?.textContent.includes('جارٍ تحميل'),mode);
   await close();
  }
  note(width+' ORIGINAL and CUSTOM source loading through real tenant-scoped HTTP');
  await page.locator('.kind-group').filter({has:page.locator('.config-node-title b').filter({hasText:'مشروبات'})}).getByRole('button',{name:'+ خيار',exact:true}).first().click();
  await page.getByLabel('نوع الخيار',{exact:true}).selectOption('linked');
  await page.getByLabel('طريقة استخدام خيارات المنتج',{exact:true}).selectOption('CUSTOM');
  assert.equal(await page.getByLabel('طريقة استخدام خيارات المنتج',{exact:true}).inputValue(),'CUSTOM');
  await page.getByLabel('المنتج المرتبط',{exact:true}).selectOption(sourceId+'-ordinary');
  await page.waitForFunction(id=>document.querySelector('select[aria-label="المنتج المرتبط"]')?.value===id,sourceId+'-ordinary');await close();
  // Pointer drag cancel must never mutate the draft, and keyboard ordering is always available.
  const firstHandle=page.getByRole('button',{name:'سحب صغير',exact:true});
  await firstHandle.scrollIntoViewIfNeeded();
  const h=await firstHandle.boundingBox();
  if(width<600){const c=await context.newCDPSession(page);
   await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:h.x+h.width/2,y:h.y+h.height/2,id:1}]});
   await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:h.x+h.width/2+15,y:h.y+h.height/2+10,id:1}]});
   await c.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  }
  await firstHandle.focus();await firstHandle.press('Alt+ArrowDown');
  assert.deepEqual(await page.locator('.kind-size').first().locator(':scope > .config-node-body > .config-options-list > .config-option-wrap > div > .config-option-row .config-option-main b').allTextContents(),['وسط','صغير','كبير']);
  // A real pointer move reorders, rather than invoking the transformation directly.
  await firstHandle.scrollIntoViewIfNeeded();
  const start=await firstHandle.boundingBox(),targetRow=page.locator('.kind-size').first().locator('.config-option-row').filter({hasText:'وسط'}).first();
  const end=await targetRow.boundingBox(),from={x:start.x+start.width/2,y:start.y+start.height/2},to={x:end.x+end.width/2,y:end.y+3};
  if(width<600){const c=await context.newCDPSession(page);
   await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:2}]});
   await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...to,id:2}]});
   await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up()}
  assert.deepEqual(await page.locator('.kind-size').first().locator(':scope > .config-node-body > .config-options-list > .config-option-wrap > div > .config-option-row .config-option-main b').allTextContents(),['صغير','وسط','كبير']);
  // Size deletion has a Dashboard confirmation; cancellation preserves the exact node.
  const smallRow=page.locator('.kind-size').first().locator('.config-option-row').filter({hasText:'صغير'}).first();
  await smallRow.getByRole('button',{name:'حذف',exact:true}).click();
  await page.locator('.config-modal').getByRole('button',{name:'إلغاء',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'سحب صغير',exact:true}).count(),1);
  note(width+' pointer/touch reorder, keyboard reorder and cancel-safe deletion');
  await close();
  const save=page.getByRole('button',{name:'حفظ المنتج',exact:true});
  const savedResponse=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/editor'));
  await save.click();const response=await savedResponse;assert.equal(response.status(),200,await response.text());
  const saved=(await response.json()).data;
  assert.equal(saved.configuration.schemaVersion,2);assert.equal(saved.configuration.groups.length,4);
  assert.deepEqual(saved.configuration.groups[3].options.slice(0,2).map(x=>x.linkedProduct.mode),['ORIGINAL','CUSTOM']);
  assert.equal(saved.configuration.basePrice,'6000');assert.equal(saved.configuration.groups[1].max,null);
  assert.equal(saved.configuration.groups[0].children[0].label,'تحمير مشترك');
  assert(saved.configuration.groups[0].sizes.every(x=>!Object.hasOwn(x,'children')));
  const cheese=saved.configuration.groups[1].options[0];assert.equal(cheese.maxQuantity,null);
  assert.equal(Object.values(cheese.priceBySize.overrides).filter(x=>x==='0').length,1);
  assert.equal(writes.length,1);assert(writes.every(x=>x.endsWith('/editor')));
  await page.waitForURL('**/'+saved.id+'/edit');
  await page.reload({waitUntil:'networkidle'});await page.locator('.config-option-main').filter({hasText:'جبنة'}).waitFor();
  const read=await request('/dashboard/products/'+saved.id+'/editor');assert.deepEqual(read.configuration,saved.configuration);
  await select('جبنة');await page.getByLabel('اسم الخيار',{exact:true}).fill('جبنة معدلة');await close();
  const secondResponse=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/editor'));
  await save.click();const second=await secondResponse;assert.equal(second.status(),200,await second.text());
  const final=(await second.json()).data;assert.equal(final.configurationVersion,2);assert.equal(final.editVersion,2);
  assert.equal((await request('/dashboard/products/'+sourceId+'/editor')).configuration.basePrice,'90000');
  assert.equal((await request('/dashboard/products/'+sourceId+'-ordinary/editor')).product.basePrice,'90000');
  note(width+' atomic create/reopen/update; one PUT per save; source unchanged; stable node IDs',{release:'isolated-production-build'});
  assert.equal(await page.getByRole('button',{name:'معاينة التكوين الإدارية',exact:true}).count(),0);
  assert.equal(await page.locator('.config-highlight-frame .config-highlight-frame').count(),0);
  const geometry=await page.locator('[data-v62-editor]').evaluate(editor=>{
   const rows=Array.from(editor.querySelectorAll('.config-node-head,.config-option-row'));
   const diffs=rows.filter(row=>row.offsetHeight).map(row=>{const wrap=row.closest('[data-v62-item]');return Math.abs(parseFloat(wrap.style.getPropertyValue('--node-anchor'))-(row.getBoundingClientRect().top-wrap.getBoundingClientRect().top+row.offsetHeight/2))});
   return {overflow:document.documentElement.scrollWidth>innerWidth,anchorMax:Math.max(0,...diffs),direction:getComputedStyle(editor).direction};
  });
  assert.equal(geometry.overflow,false);assert(geometry.anchorMax<=1,JSON.stringify(geometry));assert.equal(geometry.direction,'rtl');
  note(width+' no extra admin simulator, no nested frames, responsive connectors',geometry);
  await page.locator('[data-v62-editor]').screenshot({path:path.join(out,'v62-tree-'+width+'.png')});
  await select('جبنة معدلة');await page.locator('.config-drawer').screenshot({path:path.join(out,'v62-inspector-'+width+'.png')});
  assert.equal(await page.locator('.config-drawer').evaluate(el=>getComputedStyle(el).position),width<600?'static':'sticky');
  await page.getByLabel('اسم الخيار',{exact:true}).focus();await page.keyboard.press('Escape');
  assert(await page.locator('dialog[aria-labelledby="product-editor-title"]').isVisible());
  note(width+' inline responsive inspector, Escape closes inspector without closing product popup');
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('V62_BROWSER_PASS');
}
main().catch(async e=>{
 fs.writeFileSync(path.join(out,'failure.txt'),String(e.stack||e));
 try{await currentPage?.screenshot({path:path.join(out,'failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'failure.html'),await currentPage.content())}catch{}
 console.error(e);process.exitCode=1;
}).finally(async()=>{
 await browser?.close();if(next&&next.exitCode===null){next.kill();await new Promise(r=>next.once('exit',r))}
 if(log!==undefined)fs.closeSync(log);if(proxy)await new Promise(r=>proxy.close(r));
});
