const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function({origin,api,token,out,executable,note}){
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
 for(const count of [1,2,5]){
  const id='ordering-missing-'+count,configuration={schemaVersion:2,productId:id,revision:1,basePrice:'9000',groups:Array.from({length:count},(_,i)=>({type:'OPTIONS',id:'required-'+i,label:'Required '+i,min:1,max:2,includedQuantity:0,options:[{id:'a-'+i,label:'A '+i,price:'10',maxQuantity:1},{id:'b-'+i,label:'B '+i,price:'20',maxQuantity:1}]}))};
  const headers={'content-type':'application/json',authorization:'Bearer '+token,'x-restaurant-id':'ordering-restaurant'};
  const r=await fetch(api+'/dashboard/products/'+id+'/editor',{method:'PUT',headers,body:JSON.stringify({create:true,expectedProductVersion:0,expectedConfigurationVersion:0,product:{name:'Missing '+count,description:'Isolated validation fixture',categoryId:'ordering-category',basePrice:'9000',isNew:false,isFeatured:false,isPopular:false,moodKeys:[],images:[],ingredients:[],mealDetails:[]},configuration})});assert.equal(r.status,200,await r.text());assert.equal((await fetch(api+'/dashboard/products/'+id+'/toggle-availability',{method:'PATCH',headers})).status,200);
 }
 const browser=await chromium.launch({executablePath:executable,args:['--no-proxy-server']});
 try{for(const width of [360,390,430,1280,1440]){
  const ctx=await browser.newContext({viewport:{width,height:950},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'}),p=await ctx.newPage();let quotes=0;p.on('request',r=>{if(r.url().endsWith('/quote'))quotes++});
  await ctx.route('**/*',r=>[origin,api].includes(new URL(r.request().url()).origin)?r.continue():r.abort());
  for(const count of [1,2,5]){
   await p.goto(origin+'/m/ordering-restaurant/product/ordering-missing-'+count,{waitUntil:'domcontentloaded'});const notice=p.locator('[data-testid="incomplete-choices"]');await notice.waitFor();assert.equal(await notice.count(),1);assert.equal(await p.locator('[data-validation-highlight]').count(),0);assert.equal(await p.locator('[data-missing-choice]').count(),count);
   const summary=p.locator('[data-testid="public-product-configurator"] aside');const style=await summary.evaluate(e=>{const s=getComputedStyle(e);return{background:s.backgroundColor,border:s.borderTopColor}});assert.deepEqual(style,{background:'rgb(246, 247, 249)',border:'rgb(230, 232, 236)'});assert.equal(await summary.locator('li').count(),0);await notice.scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,`summary-missing-${count}-${width}.png`)});
   await notice.getByRole('button').click();assert.equal(await p.locator('[data-validation-highlight]').getAttribute('data-group-id'),'required-0');
   await p.locator('.product-bottom-cart-network .product-cart-link').click();assert.equal(quotes,0);assert.equal(await p.locator('[data-validation-highlight]').count(),1);
   for(let i=0;i<count;i++){await p.locator('[data-group-id="required-'+i+'"]').getByRole('checkbox',{name:'A '+i+' 10 ل.س',exact:false}).or(p.locator('[data-group-id="required-'+i+'"] [data-option-id="a-'+i+'"] button')).first().click();assert.equal(await p.locator('[data-validation-highlight]').count(),0);if(i<count-1){await notice.getByRole('button').click();assert.equal(await p.locator('[data-validation-highlight]').getAttribute('data-group-id'),'required-'+(i+1));}}
   assert.equal(await notice.count(),0);assert.equal(quotes,0);assert((await summary.innerText()).includes(String(9000+count*10)));await summary.scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,`summary-complete-${count}-${width}.png`)});
  }
  note(width+' 1/2/5 missing groups: one neutral notice, explicit target only, clears immediately, no quote on invalid add, unchanged complete totals');await ctx.close();
 }}finally{await browser.close()}
};
