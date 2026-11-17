/* Runs only through the existing owned PostgreSQL/browser fixture. Never sends social messages. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({origin,api,token,out,executable,note}){
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),browser=await chromium.launch({executablePath:executable,args:['--no-proxy-server']});
 const headers={'content-type':'application/json',authorization:'Bearer '+token,'x-restaurant-id':'ordering-restaurant'};
 const request=async(body)=>{const r=await fetch(api+'/dashboard/settings',{headers,method:body?'PATCH':'GET',...(body?{body:JSON.stringify(body)}:{})});const raw=await r.json();assert(r.ok,JSON.stringify(raw));return raw.data??raw};
 const before=await request(),legacy='https://wa.me/999999999';
 const all={whatsappPhone:'+49 (170) 123-4567',instagramUrl:'https://instagram.com/order-demo',facebookUrl:'https://facebook.com/order-demo',tiktokUrl:'https://tiktok.com/@order-demo',whatsappUrl:legacy};
 let current;
 try{
  for(const width of [1440,430,390,360]){
   const context=await browser.newContext({viewport:{width,height:950},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'});
   await context.addInitScript(token=>{const restaurant={id:'ordering-restaurant',slug:'ordering-restaurant',name:'DEMO مطعم V2'};localStorage.setItem('menu-builder-session',JSON.stringify({accessToken:token,user:{id:'ordering-owner',role:'USER'},memberships:[{role:'OWNER',restaurant}]}));localStorage.setItem('menu-builder-restaurant',JSON.stringify(restaurant))},token);
   const attempted=[];await context.route('**/*',route=>{if(![origin,api].includes(new URL(route.request().url()).origin)){attempted.push(route.request().url());return route.abort()}return route.continue()});
   const page=await context.newPage();current=page;const errors=[],apiErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)apiErrors.push({path:new URL(r.url()).pathname,status:r.status()})});
   await request(all);await page.goto(origin+'/dashboard/settings',{waitUntil:'networkidle'});
   const fee=page.getByLabel('رسوم التوصيل الثابتة');await fee.waitFor();
   assert.equal(await page.getByLabel('العملة',{exact:true}).count(),0);assert.equal(await page.getByLabel('رابط واتساب',{exact:true}).count(),0);
   for(const name of ['رقم الواتس','رابط إنستغرام','رابط فيسبوك','رابط تيك توك'])assert.equal(await page.getByLabel(name,{exact:true}).count(),1);
   const geometry=await fee.evaluate(e=>{const r=e.getBoundingClientRect(),l=e.closest('label').getBoundingClientRect(),c=getComputedStyle(e);return{width:r.width,height:r.height,right:r.right,labelRight:l.right,textAlign:c.textAlign,direction:c.direction}});
   assert(geometry.width<=241&&geometry.height<=38);assert.equal(geometry.textAlign,'right');assert.equal(geometry.direction,'rtl');assert(Math.abs(geometry.right-geometry.labelRight)<1);
   for(const value of width===1440?['1750','0','']:['1750']){
    await fee.fill(value);const pending=page.waitForResponse(r=>r.url().endsWith('/api/dashboard/settings')&&r.request().method()==='PATCH');
    await page.getByRole('button',{name:'حفظ التغييرات',exact:true}).click();const saved=await pending;assert(saved.ok());const payload=saved.request().postDataJSON();assert(!Object.hasOwn(payload,'currency'));assert(!Object.hasOwn(payload,'whatsappUrl'));
    const result=await request();assert.equal(result.restaurant.deliveryFee,value||null);assert.equal(result.restaurant.currency,before.restaurant.currency);assert.equal(result.restaurant.whatsappUrl,legacy);assert.equal(result.restaurant.instagramUrl,all.instagramUrl);
    await page.reload({waitUntil:'networkidle'});await fee.waitFor();assert.equal(await fee.inputValue(),value);
   }
   await fee.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'settings-fee-'+width+'.png')});note(width+' settings: no currency/WhatsApp URL fields, compact right-aligned fee saved/reloaded; hidden fields omitted without overwriting backend values');
   const cases=[
    {...all,expected:['whatsapp','instagram','facebook','tiktok']},
    {...all,whatsappPhone:'  ',expected:['instagram','facebook','tiktok']},
    {...all,instagramUrl:'',facebookUrl:'',expected:['whatsapp','tiktok']},
    {...all,whatsappPhone:'',facebookUrl:'',tiktokUrl:'',expected:['instagram']},
    {...all,whatsappPhone:'',instagramUrl:'',facebookUrl:'',tiktokUrl:'',expected:[]}
   ];
   for(const data of cases){
    const {expected,...settings}=data;await request(settings);
    await page.goto(origin+'/m/ordering-restaurant',{waitUntil:'domcontentloaded'});
    // The existing client manifest effect signals that handlers have hydrated; this is a layout test.
    await page.waitForFunction(()=>document.querySelector('link[rel="manifest"]')?.getAttribute('href')?.startsWith('blob:'));
    await page.locator('.public-header').getByRole('button',{name:'القائمة',exact:true}).click();
    const drawer=page.locator('.public-drawer');await drawer.waitFor();await drawer.evaluate(async e=>{await Promise.all(e.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))});const nav=drawer.locator('.drawer-social-links');
    assert.equal(await nav.count(),expected.length?1:0);const actual=await drawer.locator('.social-link').evaluateAll(xs=>xs.map(e=>({key:e.className.split(' ').find(x=>x.startsWith('social-')&&x!=='social-link').slice(7),href:e.href})));
    assert.deepEqual(actual.map(x=>x.key),expected);for(const link of actual){assert.equal(link.href,link.key==='whatsapp'?'https://wa.me/491701234567':settings[link.key+'Url'])}
    const logoRect=await drawer.locator('.public-drawer-logo').boundingBox(),drawerRect=await drawer.boundingBox();
    assert(Math.abs(logoRect.x+logoRect.width/2-drawerRect.x-drawerRect.width/2)<1,'Logo stays at drawer center, independent of social count');
    if(expected.length){
     const geometry=await nav.evaluate(e=>{const r=e.getBoundingClientRect(),logo=e.previousElementSibling.getBoundingClientRect(),lang=e.nextElementSibling.getBoundingClientRect(),icons=[...e.querySelectorAll('a')].map(x=>{const r=x.getBoundingClientRect(),s=getComputedStyle(x);return{left:r.left,right:r.right,width:r.width,height:r.height,radius:s.borderRadius}});return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,logoBottom:logo.bottom,languageTop:lang.top,icons}});
     assert(geometry.top>=geometry.logoBottom&&geometry.bottom<=geometry.languageTop);const icons=geometry.icons;assert(Math.abs((icons[0].left+icons.at(-1).right)/2-(geometry.left+geometry.right)/2)<1.5||Math.abs((Math.min(...icons.map(i=>i.left))+Math.max(...icons.map(i=>i.right)))/2-(geometry.left+geometry.right)/2)<1.5);
     for(const i of icons){assert.equal(i.width,i.height);assert.equal(i.width,44);assert.equal(i.radius,'50%')}
    }
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:path.join(out,'sidebar-'+expected.length+'-'+width+'.png')});
    if(expected.length===4){
     for(const key of expected){
      if(!await drawer.isVisible())await page.locator('.public-header').getByRole('button',{name:'القائمة',exact:true}).click();
      const link=drawer.locator('.social-'+key),href=await link.getAttribute('href'),pending=context.waitForEvent('page');
      await link.click();const popup=await pending;for(let n=0;n<40&&!attempted.includes(href);n++)await new Promise(r=>setTimeout(r,25));assert(attempted.includes(href));await popup.close();
     }
     await page.locator('.public-header').getByRole('button',{name:'القائمة',exact:true}).click();
     await drawer.getByRole('button',{name:'EN',exact:true}).click();assert.equal(await drawer.getAttribute('dir'),'ltr');await drawer.evaluate(async e=>{await Promise.all(e.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))});const centerOffset=await drawer.evaluate(e=>{const logo=e.querySelector('.public-drawer-logo').getBoundingClientRect(),box=e.getBoundingClientRect();return logo.x+logo.width/2-box.x-box.width/2});assert(Math.abs(centerOffset)<1);assert.equal(await nav.locator('a').count(),4);await page.screenshot({path:path.join(out,'sidebar-ltr-'+width+'.png')});await drawer.getByRole('button',{name:'AR',exact:true}).click();assert.equal(await drawer.getAttribute('dir'),'rtl');
     for(const label of ['الدوام','التقييم والشكاوي'])assert.equal(await drawer.getByRole('button',{name:label,exact:true}).count(),1);
     for(const label of ['الشكاوي','الأسئلة','تقييم'])assert.equal(await drawer.getByRole('button',{name:label,exact:true}).count(),0);
     await drawer.getByRole('button',{name:'الدوام',exact:true}).click();await drawer.locator('.drawer-hours-list').waitFor();await drawer.locator('.drawer-close').click();
    }
   }
   assert.deepEqual(errors,[]);assert.deepEqual(apiErrors,[]);note(width+' sidebar 4/3/2/1/0 centered circles below logo and above language; real link clicks intercepted before external network, no message; RTL/LTR and existing drawer actions preserved');
   await context.close();
  }
 }catch(error){if(current)await current.screenshot({path:path.join(out,'settings-social-failure.png')}).catch(()=>{});throw error}
 finally{await request({whatsappPhone:before.restaurant.whatsappPhone??'',instagramUrl:before.restaurant.instagramUrl??'',facebookUrl:before.restaurant.facebookUrl??'',tiktokUrl:before.restaurant.tiktokUrl??'',whatsappUrl:before.restaurant.whatsappUrl??'',deliveryFee:before.restaurant.deliveryFee});await browser.close()}
};
