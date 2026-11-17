/* Same owned PostgreSQL/API/browser harness; no external Maps request is allowed. */
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function({origin,api,token,out,executable,note}){
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE),browser=await chromium.launch({executablePath:executable,args:['--no-proxy-server']});
 const headers={'content-type':'application/json',authorization:'Bearer '+token,'x-restaurant-id':'ordering-restaurant'};
 async function settings(body){const r=await fetch(api+'/dashboard/settings',{method:body?'PATCH':'GET',headers,...(body?{body:JSON.stringify(body)}:{})});assert(r.ok);return (await r.json()).data;}
 const before=(await settings()).restaurant,link='https://maps.app.goo.gl/Synthetic';
 try{
  for(const width of [360,390,430,1280])for(const language of ['ar','en']){
   const context=await browser.newContext({viewport:{width,height:850},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.addInitScript(language=>localStorage.setItem('language:ordering-restaurant',language),language);
   await context.route('**/*',route=>[origin,api].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
   for(let bits=0;bits<8;bits++){
    const description=bits&4?'نبذة مطعم تجريبية — Restaurant description':'',address=bits&2?'حلب الجديدة، مفرق مشفى الشهباء، جانب صيدلية لينا، عنوان طويل محفوظ كاملًا دون اختصار':'',googleMapsUrl=bits&1?link:'';
    await settings({description,address,googleMapsUrl});
    await page.goto(origin+'/m/ordering-restaurant',{waitUntil:'domcontentloaded'});await page.locator('link[rel="manifest"][href^="blob:"]').waitFor({state:'attached'});await page.locator('.public-header button').first().click();
    const drawer=page.locator('.public-drawer'),toggle=drawer.locator('[aria-controls="drawer-about"]');
    assert.equal(await toggle.count(),bits?1:0);
    if(bits){await toggle.click();const section=drawer.locator('#drawer-about');
     assert.equal(await section.locator('.drawer-about-description').count(),description?1:0);assert.equal(await section.locator('.public-about-address').count(),address?1:0);
     assert.equal(await section.locator('.drawer-about-map').count(),googleMapsUrl?1:0);
     if(address){assert.equal(await section.locator('.public-about-address').textContent(),address);assert.equal(await section.locator('.public-about-address a').count(),0);}
     if(googleMapsUrl){const map=section.getByRole('link',{name:language==='ar'?'موقع المطعم على خرائط Google':'Restaurant location on Google Maps',exact:true});assert.equal(await map.getAttribute('href'),link);assert.equal(await map.getAttribute('rel'),'noopener noreferrer');const box=await map.boundingBox();assert(box.width>=44&&box.height>=44);
      if(address){const text=await section.locator('.drawer-about-location-text').boundingBox();assert(Math.abs((box.y+box.height/2)-(text.y+text.height/2))<2);}
      if(bits===1){const popup=context.waitForEvent('page');await map.click();const tab=await popup;await tab.waitForLoadState('domcontentloaded').catch(()=>{});await tab.close();}
     }
     assert(await section.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
     if([1,5,7].includes(bits))await page.screenshot({path:path.join(out,`about-${bits}-${language}-${width}.png`),animations:"disabled"});
     await toggle.click();assert.equal(await section.isVisible(),false);
    }
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    note(`About optional fields ${bits}/7 ${language} ${width}: Maps destination, layout, toggle PASS`);
   }
   assert.deepEqual(errors,[]);await context.close();
  }
  for(const googleMapsUrl of ['javascript:alert(1)','http://maps.google.com/','https://google.com.evil.test/maps','https://user@maps.google.com/']){
   const r=await fetch(api+'/dashboard/settings',{method:'PATCH',headers,body:JSON.stringify({googleMapsUrl})});assert.equal(r.status,400);note('About unsafe Maps URL rejected: '+googleMapsUrl.split(':')[0]);
  }
 }finally{await settings({description:before.description??'',address:before.address??'',googleMapsUrl:before.googleMapsUrl??''});await browser.close();}
};
