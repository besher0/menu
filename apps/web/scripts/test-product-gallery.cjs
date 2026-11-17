const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function({origin,api,token,out,executable,note}){
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
 const images=['demo-pizza-cheese.jpg','demo-pizza-margherita.jpg','demo-pizza-slices.jpg','categories-burgers.png','categories-shawarma.png'];
 for(const count of [0,1,2,3,5]){
  const r=await fetch(api+'/dashboard/products/ordering-gallery-'+count+'/editor',{method:'PUT',headers:{'content-type':'application/json',authorization:'Bearer '+token,'x-restaurant-id':'ordering-restaurant'},body:JSON.stringify({create:true,expectedProductVersion:0,expectedConfigurationVersion:0,product:{name:'Gallery QA '+count,description:'Isolated gallery fixture',categoryId:'ordering-category',basePrice:'200',isNew:false,isFeatured:false,isPopular:false,moodKeys:[],images:images.slice(0,count).map((name,i)=>({url:'/assets/public/'+name,altText:'Gallery '+i})),ingredients:[],mealDetails:[]}})});assert.equal(r.status,200,await r.text());
 }
 const browser=await chromium.launch({executablePath:executable,args:['--no-proxy-server']});
 try{for(const width of [1440,1280,430,390,360]){
  const context=await browser.newContext({viewport:{width,height:950},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>[origin,api].includes(new URL(r.request().url()).origin)?r.continue():r.abort());
  const cdp=await context.newCDPSession(page),home=origin+'/m/ordering-restaurant';
  for(const lang of ['ar','en']){
   await page.goto(home,{waitUntil:'domcontentloaded'});await page.locator('link[rel="manifest"][href^="blob:"]').waitFor({state:'attached'});await page.locator('.public-header > .public-nav-control').click();await page.locator('.public-drawer').getByRole('button',{name:lang.toUpperCase(),exact:true}).click();await page.keyboard.press('Escape');
   for(const count of [0,1,2,3,5]){
    await page.goto(home+'/product/ordering-gallery-'+count,{waitUntil:'domcontentloaded'});await page.locator('link[rel="manifest"][href^="blob:"]').waitFor({state:'attached'});const photo=page.locator('.product-photo');await photo.waitFor();
    const height=(await photo.boundingBox()).height;assert(Math.abs(height-318)<.1);
    assert.equal(await photo.locator(':scope > span:not(.product-image-placeholder)').count(),0,'No numeric counter');assert.equal(await photo.locator('.product-gallery-dots button').count(),count>1?count:0);
    if(count<2){assert.equal(await photo.locator('.product-gallery-arrow').count(),0);if(!count)assert.equal(await photo.locator('.product-image-placeholder').count(),1);}
    else{
     const dots=photo.locator('.product-gallery-dots button');const active=()=>dots.evaluateAll(es=>es.findIndex(e=>e.getAttribute('aria-current')==='true'));
     assert.equal(await active(),0);await dots.nth(count-1).click();assert.equal(await active(),count-1);
     await photo.focus();await page.keyboard.press('Home');assert.equal(await active(),0);await page.keyboard.press(lang==='ar'?'ArrowLeft':'ArrowRight');assert.equal(await active(),1);
     await page.keyboard.press('End');assert.equal(await active(),count-1);await page.keyboard.press(lang==='ar'?'ArrowLeft':'ArrowRight');assert.equal(await active(),0,'Preserve existing cyclic gallery');
     const box=await photo.boundingBox();
     if(width<600){
      assert.equal(await photo.locator('.product-gallery-arrow').first().evaluate(e=>getComputedStyle(e).display),'none');
      const swipe=async(dx,dy)=>{const x=box.x+box.width/2,y=140;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/6,y:y+dy*i/6}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(80)};
      await swipe(lang==='ar'?90:-90,5);assert.equal(await active(),1);await swipe(lang==='ar'?-90:90,0);assert.equal(await active(),0);await swipe(45,-85);assert.equal(await active(),0,'Vertical intent does not change image');await page.evaluate(()=>scrollTo(0,0));
     }else{await photo.evaluate(e=>e.blur());await page.mouse.move(0,900);await page.waitForTimeout(200);assert.equal(await photo.locator('.product-gallery-arrow').first().evaluate(e=>getComputedStyle(e).opacity),'0');await photo.hover();await page.waitForTimeout(200);assert.equal(await photo.locator('.product-gallery-arrow').first().evaluate(e=>getComputedStyle(e).opacity),'1');}
     await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await dots.first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');await page.emulateMedia({reducedMotion:'no-preference'});
    }
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    if(count===3||count===1){await page.screenshot({path:path.join(out,`gallery-${count}-${lang}-${width}.png`)});}
    // Owner rejected the reduced-height experiment; original 318px is asserted above.
   }
  }
  assert.deepEqual(errors,[]);note(width+' gallery 0/1/2/3/5, actual touch direction/vertical intent, keyboard, dots, hover, reduced motion and mobile hero height');await context.close();
 }}finally{await browser.close()}
};
