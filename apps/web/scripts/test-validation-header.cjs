const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function({origin,api,out,executable,note}){
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const browser=await chromium.launch({executablePath:executable,args:['--no-proxy-server']});
 try{for(const width of [1440,1280,430,390,360]){
  const context=await browser.newContext({viewport:{width,height:950},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  await context.route('**/*',r=>[origin,api].includes(new URL(r.request().url()).origin)?r.continue():r.abort());page.on('pageerror',e=>errors.push(e.message));
  const home=origin+'/m/ordering-restaurant',ready=async()=>page.locator('link[rel="manifest"][href^="blob:"]').waitFor({state:'attached'});
  await page.goto(home,{waitUntil:'domcontentloaded'});await ready();await page.locator('.public-header > .public-nav-control').click();const drawer=page.locator('.public-drawer');await drawer.waitFor();
  const slider=drawer.locator('.drawer-language-control');const shape=await slider.evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {width:r.width,height:r.height,radius:s.borderRadius,duration:getComputedStyle(e,'::before').transitionDuration}});
  assert.equal(shape.width,125);assert.equal(shape.height,42);assert.equal(shape.radius,'999px');assert.equal(shape.duration,'0.18s');
  await drawer.getByRole('button',{name:'AR',exact:true}).click();await page.waitForTimeout(220);
  await page.screenshot({path:path.join(out,'pill-ar-'+width+'.png')});
  await drawer.getByRole('button',{name:'EN',exact:true}).click();
  const motion=await slider.evaluate(async e=>{const x=()=>new DOMMatrix(getComputedStyle(e,'::before').transform).m41;const start=x();await new Promise(r=>setTimeout(r,70));const middle=x();await new Promise(r=>setTimeout(r,160));return{start,middle,end:x()}});
  assert(motion.end>0);assert(motion.middle>motion.start&&motion.middle<motion.end,'Indicator moves between endpoints');
  const order=await slider.locator('button').evaluateAll(es=>es.map(e=>({text:e.textContent,x:e.getBoundingClientRect().x,width:e.getBoundingClientRect().width})));
  assert.deepEqual(order.map(x=>x.text),['AR','EN']);assert(order[0].x<order[1].x);assert.equal(order[0].width,order[1].width);
  assert.equal(await drawer.getAttribute('dir'),'ltr');assert.equal((await drawer.boundingBox()).x,0);await page.screenshot({path:path.join(out,'pill-en-'+width+'.png')});
  await page.emulateMedia({reducedMotion:'reduce'});await drawer.getByRole('button',{name:'AR',exact:true}).focus();await page.keyboard.press('Space');assert.equal(await drawer.getAttribute('dir'),'rtl');assert.equal(await slider.evaluate(e=>getComputedStyle(e,'::before').transitionDuration),'0s');await page.emulateMedia({reducedMotion:'no-preference'});
  await page.keyboard.press('Escape');
  for(const lang of ['ar','en']){
   await page.goto(home,{waitUntil:'domcontentloaded'});await ready();await page.locator('.public-header > .public-nav-control').click();await drawer.getByRole('button',{name:lang.toUpperCase(),exact:true}).click();await page.keyboard.press('Escape');
   const measurements=[];
   for(const route of ['', '/menu?category=all&display=list','/product/ordering-ordinary','/product/ordering-pizza','/cart']){
    await page.goto(home+route,{waitUntil:'domcontentloaded'});await ready();if(route.includes('ordering-pizza'))await page.locator('[data-group-id]').first().waitFor();
    if(route.startsWith('/product/')){const control=page.locator('.public-back-button:visible, .public-nav-control:visible').first();await control.waitFor();assert.equal(await page.locator('.public-header-logo').count(),0,'Product details omit only the logo');const a=await control.boundingBox(),screen=await page.locator('.public-screen').boundingBox();assert.equal(a.width,42);assert.equal(a.height,42);assert.equal(a.y-screen.y,13);assert.equal(await control.locator('.public-back-icon').evaluate(e=>getComputedStyle(e).display),'block');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await control.click();await page.waitForURL(url=>!url.pathname.includes('/product/'));measurements.push({route,control:a,logo:null});continue;}
    const control=page.locator('.public-back-button:visible, .public-nav-control:visible').first(),logo=page.locator('.public-header-logo:visible').first();await control.waitFor();await logo.waitFor();
    const a=await control.boundingBox(),l=await logo.boundingBox();assert.equal(a.width,route===''?44:42);assert.equal(a.height,route===''?44:42);assert.equal(l.width,44);assert.equal(l.height,44);assert(Math.abs(a.y+a.height/2-l.y-l.height/2)<1);const screen=await page.locator('.public-screen').boundingBox();assert.equal(a.y-screen.y,route===''?12:13);assert.equal(l.y-screen.y,12);
    const shell=await page.locator('.public-screen').getAttribute('dir');assert.equal(shell,lang==='ar'?'rtl':'ltr');assert(lang==='ar'?a.x>l.x:a.x<l.x);
    if(route!=='')assert.equal(await control.locator('.public-back-icon').evaluate(e=>getComputedStyle(e).display),'block');
    const saved=await page.evaluate(()=>({cart:localStorage.getItem('cart:ordering-restaurant:main'),language:localStorage.getItem('language:ordering-restaurant')}));
    await page.evaluate(()=>window.__headerNavigationMarker='retained');await logo.click();await page.waitForURL(home);assert.equal(await page.evaluate(()=>window.__headerNavigationMarker),'retained');
    assert.deepEqual(await page.evaluate(()=>({cart:localStorage.getItem('cart:ordering-restaurant:main'),language:localStorage.getItem('language:ordering-restaurant')})),saved);
    measurements.push({route,control:a,logo:l});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   }
   await page.screenshot({path:path.join(out,'header-home-'+lang+'-'+width+'.png')});note(width+' '+lang+' shared header geometry across home/menu/Legacy/Network/cart and logo SPA navigation preserves storage',{measurements});
  }
  assert.deepEqual(errors,[]);note(width+' language pill fixed geometry, AR/EN order, real intermediate animation, keyboard, reduced motion and drawer direction',{shape,motion});await context.close();
 }}finally{await browser.close()}
};
