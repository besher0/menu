/* Real API + fresh PostgreSQL are supplied only by test-v2-customer-ordering.py. No pricing mocks. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process'),assert=require('node:assert/strict'),{randomInt,randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),api=process.env.ORDERING_API_ORIGIN,token=process.env.ORDERING_OWNER_TOKEN;
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(api||''));assert(/^postgresql:\/\/[^@]+@127\.0\.0\.1:\d+\/ordering_v2_[a-f0-9]+$/.test(process.env.ORDERING_TEST_DATABASE_URL||''));assert(token,'Owned fixture JWT required');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve(process.env.ORDERING_BROWSER_OUTPUT||path.join(root,'dist/qa-v2-ordering/browser'));fs.mkdirSync(out,{recursive:true});
const rows=[];function note(flow,details={}){rows.push({flow,status:'PASS',...details});fs.writeFileSync(path.join(out,'ordering-browser-results.json'),JSON.stringify(rows,null,2));console.log('PASS '+flow)}
let next,proxy,browser,log,currentPage;
async function listen(s){for(let i=0;i<30;i++)try{await new Promise((r,j)=>{s.once('error',j);s.listen(randomInt(20000,60000),'127.0.0.1',r)});s.removeAllListeners('error');return s.address().port}catch{s.removeAllListeners('error')}throw Error('No available isolated port')}
async function request(p,body){const r=await fetch(api+p,{method:body?'PUT':'GET',headers:{'content-type':'application/json',authorization:'Bearer '+token,'x-restaurant-id':'ordering-restaurant'},...(body?{body:JSON.stringify(body)}:{})});const raw=await r.json();assert(r.ok,JSON.stringify(raw));return raw.data??raw;}
const cartKey='cart:ordering-restaurant:main';
async function main(){
 const demo=Number(process.env.ORDERING_DEMO_SECONDS||0);assert(Number.isInteger(demo)&&demo>=0&&demo<=900);
 const reservation=http.createServer(),webPort=await listen(reservation);await new Promise(r=>reservation.close(r));log=fs.openSync(path.join(out,'next-production.log'),'w');
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP)$/i.test(k)));env.NEXT_TELEMETRY_DISABLED='1';env.ORDERSAWA_PREVIEW_INTERNAL_API_URL=api;env.INTERNAL_RESTAURANT_REWRITE_SECRET=randomBytes(32).toString('hex');
 next=cp.spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(webPort)],{cwd:path.join(root,'apps/web'),env,windowsHide:true,stdio:['ignore',log,log]});
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch('http://127.0.0.1:'+webPort+'/offline')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,200))}assert(ready,'Production readiness');
 proxy=http.createServer((req,res)=>{const isApi=req.url.startsWith('/api/'),base=new URL(isApi?api:'http://127.0.0.1:'+webPort);const upstream=http.request({hostname:base.hostname,port:base.port,path:isApi?req.url.slice(4):req.url,method:req.method,headers:{...req.headers,host:base.host,...(!isApi&&/^\/m\/ordering-restaurant(?:\/|$)/.test(req.url)?{'x-ordersawa-internal-restaurant-rewrite':env.INTERNAL_RESTAURANT_REWRITE_SECRET,'x-ordersawa-internal-restaurant-slug':'ordering-restaurant'}:{})}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});upstream.on('error',()=>{if(res.destroyed||res.writableEnded)return;if(res.headersSent){res.destroy();return}res.writeHead(502);res.end('Isolated upstream unavailable')});res.on('close',()=>upstream.destroy());req.pipe(upstream)});
 const origin='http://127.0.0.1:'+await listen(proxy);const menu=await request('/public/menus/ordering-restaurant');
 const product=id=>{const p=menu.products.find(p=>p.id===id);assert(p,'Public fixture '+id);return p;};
 const executable=process.env.V62_BROWSER_EXECUTABLE;assert(executable&&fs.existsSync(executable),'Reviewed QA browser required');
 if(!demo)await require('./test-validation-summary.cjs')({origin,api,token,out,executable,note});
 if(!demo)await require('./test-product-gallery.cjs')({origin,api,token,out,executable,note});
 if(!demo)await require('./test-validation-header.cjs')({origin,api,token,out,executable,note});
 if(!demo)await require('./test-public-feedback.cjs')({origin,api,token,out,executable,note});
 if(!demo)await require('./test-about-maps.cjs')({origin,api,token,out,executable,note});
 if(!demo)await require('./test-settings-sidebar.cjs')({origin,api,token,out,executable:process.env.V62_BROWSER_EXECUTABLE,note});
 for(const width of demo?[1280]:[1280,1440,430,390,360]){
  browser=await chromium.launch({headless:!demo,executablePath:executable,args:['--no-proxy-server']});const context=await browser.newContext({viewport:{width,height:950},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'});
  await context.addInitScript(({token})=>{const restaurant={id:'ordering-restaurant',slug:'ordering-restaurant',name:'DEMO مطعم V2'};localStorage.setItem('menu-builder-session',JSON.stringify({accessToken:token,user:{id:'ordering-owner',role:'USER'},memberships:[{role:'OWNER',restaurant}]}));localStorage.setItem('menu-builder-restaurant',JSON.stringify(restaurant));},{token});
  await context.addInitScript(()=>{const active=new Set(),add=document.addEventListener.bind(document),remove=document.removeEventListener.bind(document);document.addEventListener=(type,listener,options)=>{if(type==='keydown')active.add(listener);return add(type,listener,options)};document.removeEventListener=(type,listener,options)=>{if(type==='keydown')active.delete(listener);return remove(type,listener,options)};window.__orderingKeydownCount=()=>active.size;});
  await context.route('**/*',r=>[origin,api].includes(new URL(r.request().url()).origin)?r.continue():r.abort());
  const page=await context.newPage();currentPage=page;page.setDefaultTimeout(15000);const errors=[],requests=[],responses=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method(),document:r.isNavigationRequest()}));page.on('response',r=>{if(r.status()>=500)responses.push({url:r.url(),status:r.status()})});
  const tap=async locator=>{await locator.scrollIntoViewIfNeeded();if(width<600)await locator.tap();else await locator.click();};
  const cart=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'{"items":[]}').items,cartKey);
  const waitCart=async(n,quantity)=>page.waitForFunction(({k,n,q})=>{const c=JSON.parse(localStorage.getItem(k)||'{"items":[]}').items;return c.length===n&&(!q||c[0].quantity===q)},{k:cartKey,n,q:quantity});
  if(width===1280){
   await page.goto(origin+'/dashboard/products/new',{waitUntil:'domcontentloaded'});await page.getByLabel('اسم المنتج',{exact:true}).fill('DEMO منتج عميل من Dashboard');await page.getByLabel('السعر الأساسي Base',{exact:true}).fill('9000');await page.getByLabel('القسم',{exact:true}).selectOption('ordering-category');
   await tap(page.locator('.config-section-head').getByRole('button',{name:'+ أحجام',exact:true}));await tap(page.getByRole('button',{name:'+ حجم',exact:true}));await tap(page.getByRole('button',{name:'إغلاق لوحة الخصائص',exact:true}));await tap(page.locator('.kind-size .config-option-main').first());await page.getByLabel('اسم الحجم',{exact:true}).fill('صغير من المحرر');await page.getByLabel('السعر',{exact:true}).fill('11000');await tap(page.getByRole('button',{name:'إغلاق لوحة الخصائص',exact:true}));
   const savedResponse=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/editor'));await tap(page.getByRole('button',{name:'حفظ المنتج',exact:true}));const response=await savedResponse;assert.equal(response.status(),200,await response.text());const saved=(await response.json()).data;assert.equal(saved.configuration.schemaVersion,2);
   const toggle=await fetch(api+'/dashboard/products/'+saved.id+'/toggle-availability',{method:'PATCH',headers:{authorization:'Bearer '+token,'x-restaurant-id':'ordering-restaurant'}});assert.equal(toggle.status,200);
   await page.goto(origin+'/m/ordering-restaurant/product/'+saved.id,{waitUntil:'domcontentloaded'});await page.locator('[data-group-type="SIZE"]').first().waitFor();await tap(page.locator('.product-bottom-cart-network .product-cart-link'));await waitCart(1);assert.equal((await cart())[0].acceptedQuote.total,'11000');
   await page.goto(origin+'/m/ordering-restaurant/cart',{waitUntil:'domcontentloaded'});await tap(page.getByRole('button',{name:'- DEMO منتج عميل من Dashboard',exact:true}));await waitCart(0);
   note('1280 real Dashboard create → publish availability → customer product → trusted quote → cart using the same saved V2 configuration');
  }
  await page.goto(origin+'/m/ordering-restaurant',{waitUntil:'domcontentloaded'});await page.locator('.mood-strip').waitFor();
  const homeOrder=await page.locator('main.public-content').evaluate(el=>[...el.children].map(x=>x.className));
  assert(homeOrder.findIndex(x=>x.includes('mood-strip'))<homeOrder.findIndex(x=>x.includes('hero-promo')));
  assert(homeOrder.findIndex(x=>x.includes('hero-promo'))<homeOrder.findIndex(x=>x.includes('new-grid')));
  const newText=await page.locator('.new-grid').innerText();
  for(const i of [3,5,6])assert(newText.includes('Mood Case '+i),'New independent of Featured '+i);
  for(const i of [0,1,2,4])assert(!newText.includes('Mood Case '+i),'No false New from Mood/Popular '+i);
  await tap(page.locator('.mood-strip').getByRole('link',{name:'عشاق الجبنة',exact:true}));await page.waitForURL('**/menu?mood=cheese-lovers');
  const moodRail=page.locator('.menu-context-products');await moodRail.getByRole('heading',{name:'عشاق الجبنة',exact:true}).waitFor();
  for(const i of [0,1,4,6])await moodRail.getByText('Mood Case '+i,{exact:true}).first().waitFor();
  for(const i of [2,3,5])assert.equal(await moodRail.getByText('Mood Case '+i,{exact:true}).count(),0);
  await page.screenshot({path:path.join(out,'mood-'+width+'.png')});
  note(width+' Mood → banner → rails, New independent of Featured, and custom-key Mood filtering');
  const menuUrl=origin+'/m/ordering-restaurant/menu?category=all&display=list';
  // Exercise the actual persisted view settings through authorized HTTP, not menu-data mocks.
  const theme=await request('/dashboard/theme');
  const settings=theme.settings??theme;
  for(const [mode,layout] of [['grid','double'],['large','single'],['list','single']]){
    const changed=await fetch(api+'/dashboard/theme',{method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer '+token,'x-restaurant-id':'ordering-restaurant'},body:JSON.stringify({settings:{...settings,layout:{...settings.layout,categoryProductListLayout:layout}}})});
    assert.equal(changed.status,200,await changed.text());
    await page.goto(origin+'/m/ordering-restaurant/menu?category=all&display='+mode,{waitUntil:'domcontentloaded'});
    if(mode==='grid'){
      await page.locator('.menu-product-grid').first().waitFor();
      assert.equal(await page.locator('.menu-product-grid button[aria-label^="+ "]').count(),0,'Grid has no legacy or Network steppers');
      await tap(page.locator('.menu-product-card').filter({hasText:'بيتزا V2'}).first().locator('.menu-product-open'));
      await page.locator('.product-quick-modal').waitFor();
      assert((await page.locator('.product-quick-title-row').innerText()).includes('بيتزا V2'));
      await page.locator('.product-quick-close').click();await page.locator('.product-quick-modal').waitFor({state:'hidden'});
    }else if(mode==='large'){
      await page.locator('.category-spotlight-open').waitFor();
      assert.equal(await page.locator('.spotlight-quantity').count(),1,'Large retains its own quantity control');
    }else{
      await page.getByRole('button',{name:'+ بيتزا V2',exact:true}).waitFor();
      await tap(page.getByRole('button',{name:'+ منتج عادي',exact:true}));await waitCart(1);
      assert.equal((await cart())[0].productId,'ordering-ordinary');
      await tap(page.getByRole('button',{name:'- منتج عادي',exact:true}));await waitCart(0);
    }
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:path.join(out,'menu-'+mode+'-'+width+'.png'),fullPage:true});
    note(width+' '+mode+' view-specific controls, actual API data and no overflow');
  }

  await page.goto(menuUrl,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'+ بيتزا V2',exact:true}).waitFor();await tap(page.getByRole('button',{name:'+ بيتزا V2',exact:true}));
  let dialog=page.locator('.menu-network-modal-new');await dialog.locator('[data-group-id="pizza-size"]').waitFor();
  const add=()=>dialog.getByRole('button',{name:'إضافة إلى السلة',exact:true});assert(await add().isEnabled(),'Incomplete add remains actionable for guidance');assert.equal(await dialog.locator('[data-validation-highlight]').count(),0);assert.equal(await dialog.locator('[data-testid="incomplete-choices"]').count(),1);const noQuote=requests.filter(r=>r.url.endsWith('/quote')).length;await tap(add());assert.equal(await dialog.locator('[data-validation-highlight]').count(),1);assert.equal(requests.filter(r=>r.url.endsWith('/quote')).length,noQuote,'Invalid attempt makes no quote');
  const initialDocuments=requests.filter(r=>r.document).length;
  const initialReads=requests.filter(r=>r.url.endsWith('/configuration')).length,initialQuotes=requests.filter(r=>r.url.endsWith('/quote')).length;
  await tap(dialog.locator('[data-group-id="pizza-size"]').getByRole('radio',{name:/وسط/}));await tap(dialog.getByRole('button',{name:'زيادة جبنة Mozzarella',exact:true}));await tap(dialog.getByRole('button',{name:'عرض الخيارات الناقصة',exact:true}));assert.equal(await dialog.locator('[data-validation-highlight]').getAttribute('data-group-id'),'cheese-finish');assert.equal(await dialog.locator('[data-validation-highlight]').count(),1);
  await tap(dialog.locator('[data-group-id="cheese-finish"]').getByRole('radio',{name:/ثوم/}));assert.equal(await dialog.locator('[data-validation-highlight]').count(),0);await tap(dialog.getByRole('button',{name:'زيادة فطر',exact:true}));await tap(dialog.locator('[data-group-id="bake"]').getByRole('checkbox',{name:/تحمير إضافي/}));
  await tap(dialog.locator('[data-group-id="pizza-size"]').getByRole('radio',{name:/كبير/}));assert.equal(await dialog.locator('[data-group-id="cheese-finish"]').getByRole('radio',{name:/ثوم/}).getAttribute('aria-checked'),'true');
  await tap(dialog.locator('[data-option-id="olive"]').getByRole('checkbox'));
  assert(await dialog.getByRole('button',{name:'زيادة فطر',exact:true}).isDisabled(),'Group maximum enforced');
  await tap(dialog.locator('[data-option-id="olive"]').getByRole('checkbox'));assert.equal(requests.filter(r=>r.url.endsWith('/configuration')).length,initialReads,'No configuration reload on choice');assert.equal(requests.filter(r=>r.url.endsWith('/quote')).length,initialQuotes,'No HTTP repricing per choice');
  assert.equal(requests.filter(r=>r.document).length,initialDocuments,'Choices do not trigger document reloads');
  await page.keyboard.press('Tab');assert(await dialog.evaluate(d=>d.contains(document.activeElement)),'Focus remains within dialog');
  await tap(add());await waitCart(1);assert.equal((await cart())[0].acceptedQuote.total,'21750');assert.equal((await cart())[0].configurationSnapshot.snapshotVersion,2);
  note(width+' menu → V2 modal, size update, private/shared branch, included pick, max/availability and no per-click requests',{configurationReads:initialReads,quotePosts:requests.filter(r=>r.url.endsWith('/quote')).length,browser:browser.version(),mobileEmulation:width<600});
  await dialog.waitFor({state:'hidden'});const listenerBefore=await page.evaluate(()=>window.__orderingKeydownCount()),cycleQuotes=requests.filter(r=>r.url.endsWith('/quote')).length,cycleReads=requests.filter(r=>r.url.endsWith('/configuration')).length,cycleTimes=[];
  for(let cycle=0;cycle<3;cycle++){const started=performance.now();await tap(page.getByRole('button',{name:'+ بيتزا V2',exact:true}));const repeated=page.locator('.menu-network-modal-new');await repeated.locator('[data-group-id="pizza-size"]').waitFor();cycleTimes.push(performance.now()-started);await tap(repeated.getByRole('button',{name:'إغلاق',exact:true}));await repeated.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.__orderingKeydownCount()),listenerBefore,'Document keydown subscription cleaned up after close');}
  assert.equal(requests.filter(r=>r.url.endsWith('/quote')).length,cycleQuotes,'Open/close does not POST quotes');assert(requests.filter(r=>r.url.endsWith('/configuration')).length-cycleReads<=3,'At most one configuration request per open');
  note(width+' repeated modal open/close cleans keydown subscriptions without quote storms',{cycles:3,keydownBefore:listenerBefore,keydownAfter:await page.evaluate(()=>window.__orderingKeydownCount()),configurationReads:requests.filter(r=>r.url.endsWith('/configuration')).length-cycleReads,quotePosts:0,openVisibleMs:cycleTimes});
  await page.goto(origin+'/m/ordering-restaurant/cart',{waitUntil:'domcontentloaded'});await tap(page.getByRole('button',{name:'تعديل تكوين بيتزا V2',exact:true}));dialog=page.locator('.network-cart-editor');
  await dialog.locator('[data-group-id="pizza-size"]').waitFor();assert.equal(await dialog.locator('[data-group-id="cheese-finish"]').getByRole('radio',{name:/ثوم/}).getAttribute('aria-checked'),'true');
  await tap(dialog.locator('[data-group-id="pizza-size"]').getByRole('radio',{name:/وسط/}));await tap(dialog.getByRole('button',{name:'حفظ التكوين في السلة',exact:true}));await waitCart(1);await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).items[0].acceptedQuote.total==='17250',cartKey);
  // A new add uses a fresh server quote, not a local-storage injection or browser pricing mock.
  await page.goto(origin+'/m/ordering-restaurant/product/ordering-pizza',{waitUntil:'domcontentloaded'});const detail=page.locator('.product-detail');await detail.locator('[data-group-id="pizza-size"]').waitFor();
  assert.equal(await detail.locator('[data-group-id="pizza-size"]').getByRole('radio',{name:/وسط/}).getAttribute('aria-checked'),'true');
  await tap(page.locator('.product-bottom-cart-network .product-cart-link'));await waitCart(1,2);
  await tap(detail.locator('[data-group-id="pizza-size"]').getByRole('radio',{name:/كبير/}));await tap(page.locator('.product-bottom-cart-network .product-cart-link'));await waitCart(2);
  await page.goto(origin+'/m/ordering-restaurant/cart',{waitUntil:'domcontentloaded'});await tap(page.locator('.cart-page-item').filter({hasText:'كبير'}).getByRole('button',{name:'- بيتزا V2',exact:true}));await waitCart(1,2);await tap(page.getByRole('button',{name:'- بيتزا V2',exact:true}));await waitCart(1,1);
  note(width+' semantic cart identity merges the same choices and separates a different size through actual UI quotes');
  await page.getByLabel('ملاحظة بيتزا V2',{exact:true}).fill('DEMO بدون ملح');await page.reload({waitUntil:'domcontentloaded'});assert.equal((await cart())[0].note,'DEMO بدون ملح');assert.equal((await cart())[0].selection.schemaVersion,2);
  note(width+' cart edit preserves valid branches, note, Snapshot2 and refresh restoration');
  await page.goto(menuUrl,{waitUntil:'domcontentloaded'});await tap(page.getByRole('button',{name:'+ عرض Combo V2',exact:true}));dialog=page.locator('.menu-network-modal-new');await dialog.locator('[data-group-id="components"]').waitFor();
  assert.equal(await dialog.getByText('مجموعة تقنية لا تظهر',{exact:true}).count(),0);await tap(dialog.getByRole('button',{name:'زيادة مكوّن CUSTOM',exact:true}));await tap(dialog.getByRole('button',{name:'زيادة مكوّن CUSTOM',exact:true}));
  assert.equal(await dialog.locator('[data-group-id="custom-size"]').count(),2);await tap(dialog.locator('[data-option-id="bbq"]').first().getByRole('checkbox'));assert(await dialog.getByText('خفيف',{exact:true}).count());
  await tap(dialog.getByRole('button',{name:'زيادة هدية العرض',exact:true}));await tap(dialog.getByRole('button',{name:'زيادة هدية العرض',exact:true}));
  await tap(dialog.locator('[data-option-id="original-drink"]').getByRole('checkbox'));const original=dialog.locator('[data-option-id="original-drink"]');assert((await original.textContent()).includes('1500'),'Local ORIGINAL size price');
  await tap(dialog.getByRole('button',{name:'إضافة إلى السلة',exact:true}));await waitCart(2);assert.equal((await cart()).find(x=>x.productId==='ordering-combo').acceptedQuote.total,'7050');
  note(width+' repeated CUSTOM, independent private children, 3 levels, anonymous forced option, shared included gift and ORIGINAL local prices');
  await page.goto(origin+'/m/ordering-restaurant/cart',{waitUntil:'domcontentloaded'});await tap(page.getByRole('button',{name:'- عرض Combo V2',exact:true}));await waitCart(1);
  await page.goto(origin+'/m/ordering-restaurant/product/ordering-ordinary',{waitUntil:'domcontentloaded'});await page.locator('.product-detail').waitFor();await tap(page.getByRole('button',{name:'+ منتج عادي',exact:true}));await waitCart(2);await page.goto(origin+'/m/ordering-restaurant/cart',{waitUntil:'domcontentloaded'});
  await tap(page.getByRole('button',{name:'+ بيتزا V2',exact:true}));await waitCart(2,2);await tap(page.getByRole('button',{name:'- بيتزا V2',exact:true}));await waitCart(2,1);assert((await cart()).some(x=>x.mode==='LEGACY'&&x.priceText==='200'));
  const before=await cart(),current=await request('/dashboard/products/ordering-pizza/editor');const config=structuredClone(current.configuration);config.revision=current.configurationVersion+1;config.groups[0].sizes.find(x=>x.id==='pizza-medium').price=String(Number(config.groups[0].sizes.find(x=>x.id==='pizza-medium').price)+500);
  await request('/dashboard/products/ordering-pizza/editor',{create:false,expectedProductVersion:current.editVersion,expectedConfigurationVersion:current.configurationVersion,product:current.product,configuration:config});
  await tap(page.locator('.cart-whatsapp'));const review=page.locator('.network-review-dialog');await review.waitFor();assert.equal((await cart())[0].acceptedQuote.total,before[0].acceptedQuote.total,'No silent acceptance');
  await tap(review.getByRole('button',{name:'أوافق على الأسعار الحالية',exact:true}));await review.waitFor({state:'hidden'});await tap(page.locator('.cart-whatsapp'));await page.locator('.cart-confirm-form').waitFor();
  await tap(page.getByRole('button',{name:'توصيل دليفري',exact:true}));await page.getByLabel('المنطقة',{exact:true}).fill('DEMO area');await page.getByLabel('قريب من',{exact:true}).fill('DEMO landmark');
  assert.equal(await page.getByRole('button',{name:'معاينة رسالة WhatsApp دون إرسال',exact:true}).count(),0,'Removed preview action stays absent');
  await page.getByLabel('الهاتف',{exact:true}).fill('+15555550123');
  const confirmLocally=async()=>{
   const response=page.waitForResponse(r=>r.url().endsWith('/checkout/whatsapp/confirm')&&r.request().method()==='POST');
   const opened=context.waitForEvent('page');
   await tap(page.locator('.cart-whatsapp'));
   const confirmed=await response;assert.equal(confirmed.status(),200,await confirmed.text());
   const result=(await confirmed.json()).data;assert(result.whatsappUrl.startsWith('https://wa.me/'));
   const tab=await opened;await tab.waitForLoadState('domcontentloaded').catch(()=>{});await tab.close();
   return result;
  };
  // The existing context network allowlist blocks ALL external WhatsApp requests before they leave Chromium.
  const delivery=await confirmLocally();assert.equal(delivery.draft.deliveryFee,'1500');
  await tap(page.getByRole('button',{name:'استلام من المطعم',exact:true}));
  const pickup=await confirmLocally();assert.equal(pickup.draft.deliveryFee,null);
  const message=new URL(pickup.whatsappUrl).searchParams.get('text');
  assert(message.includes('ثوم')&&message.includes('فطر')&&message.includes('منتج عادي'));
  const repeated=await confirmLocally();assert.equal(repeated.orderNumber,pickup.orderNumber,'Retry reuses the saved synthetic order');
  await page.screenshot({path:path.join(out,'checkout-'+width+'.png'),fullPage:true});
  note(width+' ordinary + V2, authorized price reacceptance, delivery/pickup, real prepare/confirm, idempotent retry; external WhatsApp network blocked');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(responses.length,0,JSON.stringify(responses));
  await page.goto(origin+'/m/ordering-restaurant/product/'+product('ordering-pizza').slug,{waitUntil:'domcontentloaded'});await page.locator('[data-group-id="pizza-size"]').first().waitFor();await page.goBack({waitUntil:'domcontentloaded'});await page.goForward({waitUntil:'domcontentloaded'});await page.locator('[data-group-id="pizza-size"]').first().waitFor();
  await page.screenshot({path:path.join(out,'product-'+width+'.png'),fullPage:true});note(width+' real product route Back/Forward, RTL mobile/touch/focus and no runtime errors');
  await page.evaluate(()=>localStorage.setItem('language:ordering-restaurant','en'));await page.reload({waitUntil:'domcontentloaded'});await page.getByText('Price summary',{exact:true}).waitFor();assert.equal(await page.locator('.product-detail').evaluate(e=>getComputedStyle(e).direction),'ltr');note(width+' English/LTR product renderer preserves configuration and readable layout');
  if(demo){const menuUrl=origin+'/m/ordering-restaurant/menu?category=all';fs.writeFileSync(path.join(out,'demo-preview.json'),JSON.stringify({status:'RUNNING',menuUrl,expiresAfterSeconds:demo},null,2));console.log('ISOLATED_DEMO_URL='+menuUrl);await new Promise(r=>setTimeout(r,demo*1000));fs.writeFileSync(path.join(out,'demo-preview.json'),JSON.stringify({status:'STOPPED',menuUrl},null,2))}
  await browser.close();browser=null;
  const reset=await request('/dashboard/products/ordering-pizza/editor');const resetConfig=structuredClone(reset.configuration);resetConfig.revision=reset.configurationVersion+1;resetConfig.groups[0].sizes.find(x=>x.id==='pizza-medium').price='15000';await request('/dashboard/products/ordering-pizza/editor',{create:false,expectedProductVersion:reset.editVersion,expectedConfigurationVersion:reset.configurationVersion,product:reset.product,configuration:resetConfig});
 }
 console.log('ORDERING_BROWSER_PASS');
}
main().catch(async e=>{rows.push({flow:'current flow',status:'FAIL',message:String(e.stack||e)});fs.writeFileSync(path.join(out,'ordering-browser-results.json'),JSON.stringify(rows,null,2));if(currentPage){try{await currentPage.screenshot({path:path.join(out,'failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'failure.html'),await currentPage.content())}catch{}}console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(proxy)await new Promise(r=>proxy.close(r));if(next&&!next.killed){next.kill();await new Promise(r=>next.once('exit',r))}if(log)fs.closeSync(log)});
