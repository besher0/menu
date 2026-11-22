/* Isolated acceptance runner. Requires the JWT/API supplied by the disposable PostgreSQL fixture. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process'),assert=require('node:assert/strict'),{randomInt}=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),api=process.env.UNIFIED_V62_API_ORIGIN,token=process.env.UNIFIED_V62_OWNER_TOKEN;
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(api||''),'Loopback API required');
assert(/^postgresql:\/\/[^@]+@127\.0\.0\.1:\d+\/unified_save_[a-f0-9]+$/.test(process.env.UNIFIED_SAVE_TEST_DATABASE_URL||''),'Disposable database fixture required');
assert(token,'Ephemeral fixture JWT required');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve(process.env.UNIFIED_V62_BROWSER_OUTPUT||path.join(root,'dist/v62-browser'));
fs.mkdirSync(out,{recursive:true});
const rows=[];const note=(flow,details={})=>{rows.push({flow,status:'PASS',...details});fs.writeFileSync(path.join(out,'fields-browser-results.json'),JSON.stringify(rows,null,2));console.log('PASS '+flow)};
let next,proxy,browser,log,currentPage;const navigationEvidence=[];
const headers={'content-type':'application/json',authorization:'Bearer '+token,'x-restaurant-id':'editor-r1'};
async function request(p,init={}){const r=await fetch(api+p,{...init,headers:{...headers,...init.headers}});const body=await r.json();assert(r.ok,JSON.stringify(body));return body.data??body}
async function listen(server){for(let i=0;i<30;i++){try{await new Promise((r,j)=>{server.once('error',j);server.listen(randomInt(20000,60000),'127.0.0.1',r)});server.removeAllListeners('error');return server.address().port}catch{server.removeAllListeners('error')}}throw Error('No available test port')}
async function main(){
 const demo=Number(process.env.UNIFIED_EDITOR_DEMO_SECONDS||0);assert(Number.isInteger(demo)&&demo>=0&&demo<=900,'DEMO wait must be 0..900 seconds');
 if(!demo){const prior=cp.spawnSync(process.execPath,[path.join(__dirname,'test-v62-editor.cjs')],{env:{...process.env,UNIFIED_V62_BROWSER_OUTPUT:path.join(out,'task3-regression')},windowsHide:true,encoding:'utf8',timeout:180000});assert.equal(prior.status,0,prior.stderr||prior.stdout)}

 const reservation=http.createServer();const webPort=await listen(reservation);await new Promise(r=>reservation.close(r));
 log=fs.openSync(path.join(out,'next-production.log'),'w');
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP)$/i.test(k)));
 env.NEXT_TELEMETRY_DISABLED='1';
 next=cp.spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(webPort)],{cwd:path.join(root,'apps/web'),env,windowsHide:true,stdio:['ignore',log,log]});
 let ready=false;for(let i=0;i<120;i++){try{if((await fetch('http://127.0.0.1:'+webPort+'/offline')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,200))}assert(ready,'Next Production readiness');
 proxy=http.createServer((req,res)=>{
  const isApi=req.url.startsWith('/api/'),base=new URL(isApi?api:'http://127.0.0.1:'+webPort);
  const upstream=http.request({hostname:base.hostname,port:base.port,path:isApi?req.url.slice(4):req.url,method:req.method,headers:{...req.headers,host:base.host}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});
  upstream.on('error',()=>{if(res.destroyed||res.writableEnded)return;if(res.headersSent){res.destroy();return}res.writeHead(502);res.end('Isolated upstream unavailable')});
  res.on('close',()=>upstream.destroy());req.pipe(upstream);
 });
 const origin='http://127.0.0.1:'+await listen(proxy);
 const executable=[process.env.V62_BROWSER_EXECUTABLE,'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
 for(const width of (demo?[1280]:[1280,1440,430,390,360])){
  browser=await chromium.launch({headless:!demo,...(executable?{executablePath:executable}:{channel:'chrome'}),args:['--no-proxy-server']});
  const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'});
  await context.addInitScript(({token})=>{
   const restaurant={id:'editor-r1',slug:'editor-r1',name:'DEMO — مطعم الاختبار المعزول'};
   localStorage.setItem('menu-builder-session',JSON.stringify({accessToken:token,user:{id:'editor-owner',role:'USER'},memberships:[{role:'OWNER',restaurant}]}));
   localStorage.setItem('menu-builder-restaurant',JSON.stringify(restaurant));
  },{token});
  await context.route('**/*',r=>[origin,api].includes(new URL(r.request().url()).origin)?r.continue():r.abort());
  const page=await context.newPage();currentPage=page;page.setDefaultTimeout(15000);const errors=[],writes=[],uploads=[];
  const touchDriver=width<600?await context.newCDPSession(page):null;
  page.on('framenavigated',f=>{if(f===page.mainFrame())navigationEvidence.push({url:f.url(),at:Date.now()})});page.on('requestfailed',r=>navigationEvidence.push({failed:r.url(),reason:r.failure()?.errorText}));page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='PUT')writes.push(r.url());if(r.method()==='POST'&&r.url().endsWith('/media/upload'))uploads.push(r.url())});
  let discard=true;page.on('dialog',d=>discard?d.accept():d.dismiss());
  if(width===1280){
   for(const [route,visible] of [['/dashboard','زيارات المنيو'],['/dashboard/products','الأصناف'],['/dashboard/banners','البنرات'],['/dashboard/settings','ساعات العمل']]){
    const response=await page.goto(origin+route,{waitUntil:'networkidle'});assert.equal(response.status(),200);
    assert((await page.locator('body').innerText()).includes(visible),route);
    assert(!(await page.locator('body').innerText()).includes('+8 %'));
    if(route.endsWith('/settings'))assert.equal(await page.locator('.hours-row').count(),7);
    note('Owner Dashboard '+route+' with actual API and correct hours/category data');
   }
  }
  await page.goto(origin+'/dashboard/categories',{waitUntil:'networkidle'});
  await page.waitForURL('**/dashboard/products');
  assert.equal(await page.locator('a[href="/dashboard/categories"]').count(),0,'Owner categories remain hidden per approved legacy permissions');
  await page.getByRole('region',{name:'إدارة الأصناف'}).waitFor();
  await page.locator('a[href="/dashboard/products/new"]').click();
  const popup=page.locator('dialog[aria-labelledby="product-editor-title"]');await popup.waitFor();
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
  assert.equal(await popup.evaluate(el=>getComputedStyle(el).direction),'rtl');
  await page.getByLabel('اسم المنتج',{exact:true}).fill('Unsaved draft');discard=false;
  await page.getByRole('button',{name:'إغلاق محرر المنتج',exact:true}).click();
  assert.equal(await page.getByLabel('اسم المنتج',{exact:true}).inputValue(),'Unsaved draft');
  assert(await page.evaluate(()=>Boolean(window.navigation)),'QA browser supports native traversal cancellation');
  await page.evaluate(()=>history.back());await page.waitForTimeout(150);
  assert.equal(await page.getByLabel('اسم المنتج',{exact:true}).inputValue(),'Unsaved draft');
  assert(page.url().endsWith('/dashboard/products/new'));
  discard=true;await page.keyboard.press('Escape');await page.waitForURL('**/dashboard/products');
  assert.equal(await popup.count(),0);assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden');
  await page.locator('a[href="/dashboard/products/new"]').click();await popup.waitFor();
  note(width+' create opens over catalog, modal focus/RTL, cancelled discard retains draft, Escape restores list and body scroll');
  const save=page.getByRole('button',{name:'حفظ المنتج',exact:true}),upload=page.getByLabel('رفع صور المنتج',{exact:true});
  await page.getByLabel('اسم المنتج',{exact:true}).fill('DEMO بيتزا Mozzarella '+width);
  await page.getByLabel('السعر الأساسي Base',{exact:true}).fill('12500');
  assert.equal(await page.getByLabel('القسم',{exact:true}).inputValue(),'');
  await save.click();assert.equal(writes.length,0);await page.getByLabel('القسم',{exact:true}).selectOption('editor-c1');
  assert.equal(await page.getByLabel('عملة المطعم',{exact:true}).count(),0);assert.equal(await page.locator('.price-frame .price-currency').innerText(),'ل.س');
  await page.getByRole('checkbox',{name:'عشاق الجبنة',exact:true}).check();await page.getByRole('checkbox',{name:'وجبة اليوم',exact:true}).check();
  await page.getByRole('checkbox',{name:/إضافة إلى جديدنا/}).check();await page.getByRole('checkbox',{name:/إضافة إلى الأكثر طلبًا/}).check();
  const description='DEMO فقط — بيتزا مع صوص BBQ\nوصف متعدد الأسطر';await page.getByLabel('الوصف',{exact:true}).fill(description);
  note(width+' required category, backend currency, mixed name, multiline description, multiple moods and manual flags',{browserVersion:browser.version(),isMobile:width<600,hasTouch:width<600,touchTapDurationMs:width<600?80:null});
  const photos=['demo-pizza-cheese.jpg','demo-pizza-margherita.jpg','demo-pizza-slices.jpg'].map(n=>path.join(root,'apps/web/public/assets/public',n));
  await page.getByLabel('اسم المنتج',{exact:true}).fill('DEMO بيتزا');
  await upload.setInputFiles(photos[0]);await page.waitForFunction(()=>document.querySelectorAll('.image-tile').length===1&&!document.querySelector('input[aria-label="رفع صور المنتج"]').disabled);
  await page.locator('[data-product-editor-scroll]').evaluate(el=>el.scrollTop=0);
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.image-main img')).every(x=>x.complete&&x.naturalWidth>0));
  const measured=await popup.evaluate(el=>{
    const get=x=>{const r=x.getBoundingClientRect(),c=getComputedStyle(x);return {width:r.width,height:r.height,font:c.fontFamily,fontSize:c.fontSize,padding:c.padding,borderRadius:c.borderRadius,color:c.color,background:c.backgroundColor}};
    return {modal:get(el),header:get(el.querySelector('form > header')),body:get(el.querySelector('[data-product-editor-scroll]')),footer:get(el.querySelector('form > footer')),basic:get(el.querySelector('.basic-grid')),input:get(el.querySelector('input[aria-label="اسم المنتج"]')),gallery:get(el.querySelector('.image-main'))};
  });
  fs.writeFileSync(path.join(out,'geometry-'+width+'.json'),JSON.stringify(measured,null,2));
  await page.screenshot({path:path.join(out,'popup-'+width+'.png')});
  await page.locator('.basic-grid').screenshot({path:path.join(out,'basic-'+width+'.png')});
  await page.getByRole('button',{name:'إزالة الصورة 1',exact:true}).click();
  await upload.setInputFiles([...photos,...photos]);await page.getByRole('button',{name:'إلغاء محاولة الرفع الفاشلة',exact:true}).click();assert.equal(uploads.length,1,'Only the earlier valid comparison image was uploaded');
  await upload.setInputFiles(photos);await page.waitForFunction(()=>document.querySelectorAll('.image-tile').length===3);await page.waitForFunction(()=>!document.querySelector('input[aria-label="رفع صور المنتج"]').disabled);
  await page.getByRole('button',{name:'تعيين الصورة 2 رئيسية',exact:true}).click();
  const galleryKeyboard=page.locator('[data-editor-sort="images"]').nth(1);await galleryKeyboard.focus();await galleryKeyboard.press('Alt+ArrowDown');assert.equal(await page.locator('.card-sort').count(),0);
  const beforeFailure=await page.locator('.image-thumb img').evaluateAll(xs=>xs.map(x=>x.src));
  await upload.setInputFiles([{name:'partial-good.jpg',mimeType:'image/jpeg',buffer:fs.readFileSync(photos[0])},{name:'forged.png',mimeType:'image/png',buffer:Buffer.from('not an image')}]);
  await page.getByRole('button',{name:'إلغاء محاولة الرفع الفاشلة',exact:true}).waitFor();assert(await save.isDisabled());assert.equal(await page.getByLabel('الوصف',{exact:true}).inputValue(),description);
  assert.equal(await page.locator('.image-tile').count(),4);assert.deepEqual((await page.locator('.image-thumb img').evaluateAll(xs=>xs.map(x=>x.src))).slice(0,3),beforeFailure);
  await page.getByRole('button',{name:'إلغاء محاولة الرفع الفاشلة',exact:true}).click();await upload.setInputFiles(photos[1]);
  await page.waitForFunction(()=>document.querySelectorAll('.image-tile').length===5);assert(await upload.isDisabled());
  await page.getByRole('button',{name:'إزالة الصورة 5',exact:true}).click();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.image-thumb img')).every(x=>x.complete&&x.naturalWidth>0));
  const gallery=await page.locator('.image-main').boundingBox();const ratio=gallery.width/gallery.height;assert(Math.abs(gallery.height-Math.max(260,gallery.width*9/16))<2,JSON.stringify(gallery));
  note(width+' real multipart image uploads, five-image cap, partial failure retention, primary/reorder/removal and reference 16:9 with 260px minimum', {ratio});
  const activate=async button=>{
   if(width<600){
    await button.scrollIntoViewIfNeeded();const rect=await button.boundingBox();assert(rect,'Visible touch target');
    const point={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
    await touchDriver.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await page.waitForTimeout(80);
    await touchDriver.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }else await button.click();
  };
  const open=async name=>{await activate(page.getByRole('button',{name:'اختيار '+name+' من المكتبة',exact:true}));await page.locator('.library-dialog').waitFor()};
  const choose=async text=>{
   let choice=page.locator('.library-dialog .library-choice').filter({hasText:text});
   const fixtures={'جبن':['ingredients','editor-ingredient'],'صوص BBQ':['ingredients','editor-ingredient-bbq'],'الوزن التقريبي':['meal-details','editor-value-demo'],'مناسب للنباتيين':['meal-details','editor-presence-demo']};
   if(fixtures[text]){
    // Independent migration/API fixtures can share display labels; assert the saved identity below.
    const [endpoint,id]=fixtures[text],raw=await request('/dashboard/media/'+endpoint);
    const matches=(Array.isArray(raw)?raw:raw.data).filter(x=>x.isActive!==false&&(x.displayName||x.name||x.label||'').includes(text));
    const index=matches.findIndex(x=>(x.libraryId||x.id)===id);
    assert(index>=0);assert.equal(await choice.count(),matches.length);choice=choice.nth(index);
   }
   await activate(choice);await page.locator('.library-dialog').waitFor({state:'hidden'});
  };
  const close=async()=>{await activate(page.getByRole('button',{name:'إغلاق المكتبة',exact:true}));await page.locator('.library-dialog').waitFor({state:'hidden'})};
  if(width<600){const opener=page.getByRole('button',{name:'اختيار المكونات من المكتبة',exact:true});await opener.scrollIntoViewIfNeeded();const r=await opener.boundingBox();
   await touchDriver.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+r.height/2}]});
   await touchDriver.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert(!(await page.locator('.library-dialog').isVisible()),'Cancelled touch must not open the picker')}
  await open('المكونات');assert.equal(await page.getByLabel('بحث في المكتبة',{exact:true}).count(),0);assert.equal(writes.length,0);
  await choose('جبن');await open('المكونات');await choose('صوص BBQ');await open('المكونات');assert.equal(await page.locator('.library-dialog .library-choice').filter({hasText:'صوص BBQ'}).count(),0);await close();
  await page.getByRole('button',{name:'إزالة جبن من الصنف',exact:true}).click();await open('المكونات');await choose('جبن');
  const cheeseCard=page.locator('[data-editor-sort="ingredients"]').filter({has:page.getByText('جبن',{exact:true})});await cheeseCard.focus();await cheeseCard.press('Alt+ArrowUp');const cheese=cheeseCard.locator('.library-drag-zone');
  await cheese.scrollIntoViewIfNeeded();const dragStart=await cheese.boundingBox();
  const dragTarget=await page.locator('[data-editor-sort="ingredients"]').filter({has:page.getByText('صوص BBQ',{exact:true})}).locator('.library-photo').boundingBox();
  const from={x:dragStart.x+dragStart.width/2,y:dragStart.y+dragStart.height/2},to={x:dragTarget.x+dragTarget.width/2-8,y:dragTarget.y+dragTarget.height/2};
  if(width<600){const c=touchDriver;await c.send('Input.dispatchTouchEvent',{type:'touchStart',modifiers:0,touchPoints:[from]});await page.waitForTimeout(60);
   // Exercise a real multi-frame touch gesture, then tap the next control without a forced click.
   for(let step=1;step<=10;step++){await c.send('Input.dispatchTouchEvent',{type:'touchMove',modifiers:0,touchPoints:[{x:from.x+(to.x-from.x)*step/10,y:from.y+(to.y-from.y)*step/10}]});await page.waitForTimeout(20)}
   await c.send('Input.dispatchTouchEvent',{type:'touchEnd',modifiers:0,touchPoints:[]});}
  else{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up()}
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-editor-sort="ingredients"] .library-name')).map(x=>x.textContent).join('|')==='صوص BBQ|جبن');
  assert.equal(await page.evaluate(()=>window.getSelection()?.toString()||''),'');
  await open('تفاصيل الوجبة');await choose('الوزن التقريبي');await open('تفاصيل الوجبة');await choose('مناسب للنباتيين');
  assert.equal(await page.getByLabel('قيمة الوزن التقريبي',{exact:true}).inputValue(),'');await page.getByLabel('قيمة الوزن التقريبي',{exact:true}).fill('450 غ');
  assert.equal(await page.getByLabel('قيمة مناسب للنباتيين',{exact:true}).count(),0);
  const presenceCard=page.locator('.library-card.detail').filter({has:page.getByText('مناسب للنباتيين',{exact:true})});
  if(width<600) await presenceCard.locator('.library-photo').tap(); else await presenceCard.hover();
  await presenceCard.focus();await presenceCard.press('Alt+ArrowUp');
  assert.equal(await page.getByLabel('قيمة الوزن التقريبي',{exact:true}).inputValue(),'450 غ');
  await page.getByRole('button',{name:'إزالة مناسب للنباتيين من الصنف',exact:true}).click();await open('تفاصيل الوجبة');await choose('مناسب للنباتيين');
  note(width+' library identity dedup, remove/return, keyboard ordering, local VALUE and PRESENCE');
  await page.locator('.config-section-head').getByRole('button',{name:'+ أحجام',exact:true}).click();await page.getByRole('button',{name:'+ حجم',exact:true}).click();
  await page.getByRole('button',{name:'إغلاق لوحة الخصائص',exact:true}).click();await page.locator('.kind-size .config-option-main').first().click();
  await page.getByLabel('اسم الحجم',{exact:true}).fill('صغير DEMO');await page.getByLabel('السعر',{exact:true}).fill('14000');await page.getByRole('button',{name:'إغلاق لوحة الخصائص',exact:true}).click();
  await page.locator('[data-v62-editor]').screenshot({path:path.join(out,'tree-comparison-'+width+'.png')});
  if(process.env.V62_REFERENCE_HTML) await require('./compare-v62-reference.cjs')(page,width,out);
  assert(await page.getByLabel('السعر الأساسي Base',{exact:true}).isDisabled());assert.equal(await page.getByLabel('السعر الأساسي Base',{exact:true}).inputValue(),'12500');
  const savedResponse=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/editor'));await save.click();const response=await savedResponse;
  assert.equal(response.status(),200,await response.text());const saved=(await response.json()).data;assert.equal(writes.length,1);
  assert.equal(saved.product.images.length,4);assert.deepEqual(saved.product.moodKeys,['cheese-lovers','وجبة اليوم']);assert(saved.product.isNew&&saved.product.isPopular);assert.equal(saved.product.isFeatured,false);
  assert.deepEqual(saved.product.ingredients.map(x=>x.libraryId),['editor-ingredient-bbq','editor-ingredient']);
  assert.equal(saved.product.mealDetails.find(x=>x.libraryId==='editor-value-demo').value,'450 غ');assert.equal(saved.product.mealDetails.find(x=>x.libraryId==='editor-presence-demo').value,'');
  assert.equal(saved.configuration.groups[0].sizes[0].price,'14000');await page.waitForURL('**/'+saved.id+'/edit',{waitUntil:'domcontentloaded'});
  await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByLabel('الوصف',{exact:true}).inputValue(),description);assert.equal(await page.getByLabel('قيمة الوزن التقريبي',{exact:true}).inputValue(),'450 غ');
  assert.deepEqual(await page.locator('.image-thumb img').evaluateAll(xs=>xs.map(x=>x.src)),saved.product.images.map(x=>x.url));
  // A separate writer sets Featured; subsequent UI New/Popular changes must preserve that independent field.
  const independent=await request('/dashboard/products/'+saved.id+'/editor');
  await request('/dashboard/products/'+saved.id+'/editor',{method:'PUT',body:JSON.stringify({create:false,expectedProductVersion:independent.editVersion,expectedConfigurationVersion:independent.configurationVersion,product:{...independent.product,isFeatured:true}})});
  await page.reload({waitUntil:'networkidle'});await page.getByRole('checkbox',{name:/إضافة إلى جديدنا/}).uncheck();await page.getByRole('checkbox',{name:/إضافة إلى الأكثر طلبًا/}).uncheck();
  await page.getByLabel('الوصف',{exact:true}).fill(description+'\nتعديل بعد إعادة الفتح');
  const again=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/editor'));await save.click();const edited=await again;assert.equal(edited.status(),200);const final=(await edited.json()).data;
  assert.equal(final.product.isFeatured,true);assert.equal(final.product.isNew,false);assert.equal(final.product.isPopular,false);assert.deepEqual(final.configuration,saved.configuration);
  assert.deepEqual(final.product.images.map(x=>x.id),saved.product.images.map(x=>x.id));
  note(width+' one aggregate save for fields and V2, real reopen/update, stable image IDs, independent Featured');
  const geometry=await page.locator('[data-product-fields]').evaluate(el=>({overflow:document.documentElement.scrollWidth>innerWidth,rtl:getComputedStyle(el).direction==='rtl'}));assert(!geometry.overflow);assert(geometry.rtl);
  await page.locator('[data-product-fields]').screenshot({path:path.join(out,'fields-'+width+'.png')});await open('تفاصيل الوجبة');await page.locator('.library-dialog').screenshot({path:path.join(out,'picker-'+width+'.png')});await close();
  note(width+' responsive native gallery/cards/picker, keyboard focus and no horizontal overflow',geometry);
  // Unavailable categories are retained in the draft, and never silently changed to the first option.
  await page.route('**/api/dashboard/categories?*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{data:[],meta:{pages:1}}})}));
  await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByLabel('القسم',{exact:true}).inputValue(),'editor-c1');
  const beforeMissing=writes.length;await save.click();assert.equal(writes.length,beforeMissing);await page.unroute('**/api/dashboard/categories?*');await page.reload({waitUntil:'networkidle'});
  // Actual concurrent writer yields a real 409. Then a simulated transport 500 exercises recovery without changing DB.
  await page.getByLabel('الوصف',{exact:true}).fill('مسودة محلية 409');
  const concurrent=await request('/dashboard/products/'+saved.id+'/editor');await request('/dashboard/products/'+saved.id+'/editor',{method:'PUT',body:JSON.stringify({create:false,expectedProductVersion:concurrent.editVersion,expectedConfigurationVersion:concurrent.configurationVersion,product:{...concurrent.product,name:'DEMO محرر آخر '+width}})});
  const conflict=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/editor'));await save.click();assert.equal((await conflict).status(),409);assert.equal(await page.getByLabel('الوصف',{exact:true}).inputValue(),'مسودة محلية 409');
  await page.reload({waitUntil:'networkidle'});await page.getByLabel('الوصف',{exact:true}).fill('مسودة محلية 500');
  await page.route('**/api/dashboard/products/*/editor',r=>r.request().method()==='PUT'?r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Synthetic transport failure'})}):r.continue());
  await save.click();await page.getByText('تعذر حفظ الصنف. بقيت مسودتك محفوظة هنا؛ راجع البيانات والاتصال ثم حاول مجددًا.',{exact:true}).waitFor();assert.equal(await page.getByText('Synthetic transport failure',{exact:true}).count(),0);assert.equal(await page.getByLabel('الوصف',{exact:true}).inputValue(),'مسودة محلية 500');assert.equal(await page.locator('.kind-size').count(),1);
  await page.unroute('**/api/dashboard/products/*/editor');
  note(width+' real 409 and simulated transport failure retain metadata and configuration draft');
  // Existing galleries above the new UI limit are retained, never silently truncated.
  const legacyId='fields-existing-six-'+width;
  await page.goto(origin+'/dashboard/products/'+legacyId+'/edit',{waitUntil:'networkidle'});assert.equal(await page.locator('.image-tile').count(),6);assert(await upload.isDisabled());
  await page.getByLabel('اسم المنتج',{exact:true}).fill('DEMO احتفاظ بالصور '+width);const legacy=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/editor'));await save.click();const kept=await legacy;assert.equal(kept.status(),200);assert.equal((await kept.json()).data.product.images.length,6);
  note(width+' existing oversized galleries remain editable and preserve all images');
  assert.deepEqual(errors,[]);
  if(demo){const item=await request('/dashboard/products/'+saved.id+'/editor');
   await request('/dashboard/products/'+saved.id+'/editor',{method:'PUT',body:JSON.stringify({create:false,expectedProductVersion:item.editVersion,expectedConfigurationVersion:item.configurationVersion,product:{...item.product,isNew:true,isPopular:true}})});
   await page.goto(origin+'/dashboard/products/'+saved.id+'/edit',{waitUntil:'networkidle'});console.log('DEMO ONLY: synthetic PostgreSQL; interactive Chrome available for '+demo+' seconds. '+page.url());await new Promise(r=>setTimeout(r,demo*1000))}
  await context.close();await browser.close();browser=undefined;
 }
 // Admin-only 3D uses the same real API fixture. No Cloudinary upload is simulated as successful.
 assert(process.env.UNIFIED_V62_ADMIN_TOKEN,'Synthetic admin token required');
 browser=await chromium.launch({executablePath:process.env.V62_BROWSER_EXECUTABLE,args:['--no-proxy-server']});
 const adminContext=await browser.newContext({viewport:{width:1280,height:1000},serviceWorkers:'block'});
 await adminContext.addInitScript(({token})=>{const restaurant={id:'editor-r1',slug:'editor-r1',name:'DEMO'};
  localStorage.setItem('menu-builder-session',JSON.stringify({accessToken:token,user:{id:'editor-admin',role:'SUPER_ADMIN'},memberships:[{role:'OWNER',restaurant}]}));localStorage.setItem('menu-builder-restaurant',JSON.stringify(restaurant));},{token:process.env.UNIFIED_V62_ADMIN_TOKEN});
 const adminPage=await adminContext.newPage();currentPage=adminPage;
 await adminContext.route('**/*',r=>[origin,api].includes(new URL(r.request().url()).origin)?r.continue():r.abort());
 await adminPage.goto(origin+'/dashboard/categories?restaurantId=editor-r1&restaurantSlug=editor-r1',{waitUntil:'networkidle'});
 assert((await adminPage.locator('body').innerText()).includes('One'),'Admin category management remains available');
 await adminPage.goto(origin+'/dashboard/products/admin-model-fixture/edit?restaurantId=editor-r1&restaurantSlug=editor-r1',{waitUntil:'networkidle'});
 const section=adminPage.getByRole('region',{name:'إدارة 3D الحالية'});
 await section.getByText('demo-approved.glb',{exact:true}).waitFor();
 assert.equal(await section.locator('input:not([type="file"]),select').count(),0);
 await section.screenshot({path:path.join(out,'admin-3d.png')});
 await adminPage.getByLabel('اسم المنتج',{exact:true}).fill('Admin unchanged media');
 const saved3d=adminPage.waitForResponse(r=>r.url().endsWith('/editor')&&r.request().method()==='PUT');await adminPage.getByRole('button',{name:'حفظ المنتج',exact:true}).click();
 const response3d=await saved3d;assert.equal(response3d.status(),200,await response3d.text());
 assert.equal((await response3d.json()).data.advancedMedia.model3dUrl,'https://example.test/demo-approved.glb');
 await adminPage.reload({waitUntil:'networkidle'});await section.getByText('demo-approved.glb',{exact:true}).waitFor();
 const rejected3d=adminPage.waitForResponse(r=>r.url().endsWith('/media/upload')&&r.request().method()==='POST');
 await section.locator('input[type="file"]').setInputFiles({name:'forged.glb',mimeType:'model/gltf-binary',buffer:Buffer.from('not a model')});
 assert((await rejected3d).status()>=400);await adminPage.waitForFunction(()=>document.querySelector('[aria-label="حفظ المنتج"]').disabled);await section.getByText('demo-approved.glb',{exact:true}).waitFor();
 assert(await adminPage.getByRole('button',{name:'حفظ المنتج',exact:true}).isDisabled());
 note('Admin 3D reference upload/filename only; real save/reopen preserves stored model; forged upload fails without loss');
 await adminContext.close();await browser.close();browser=undefined;
 console.log('V62_BROWSER_PASS');
}
main().catch(async e=>{
 fs.writeFileSync(path.join(out,'failure.txt'),String(e.stack||e));
 try{await currentPage?.screenshot({path:path.join(out,'failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'failure.html'),await currentPage.content())}catch{}
 fs.writeFileSync(path.join(out,'navigation-evidence.json'),JSON.stringify({url:currentPage?.url(),navigationEvidence},null,2));console.error(e);process.exitCode=1;
}).finally(async()=>{
 await browser?.close();if(next&&next.exitCode===null){next.kill();await new Promise(r=>next.once('exit',r))}
 if(log!==undefined)fs.closeSync(log);if(proxy)await new Promise(r=>proxy.close(r));
});
