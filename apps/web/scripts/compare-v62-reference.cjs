const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async function compare(page,width,out){
 out=path.join(out,'v62-parity');fs.mkdirSync(out,{recursive:true});
 // Three real sibling choices allow a full reorder trace, not a drag over an immovable single row.
 for(const [name,price]of [['وسط QA','18000'],['كبير QA','21000']]){
  await page.getByRole('button',{name:'+ حجم',exact:true}).click();
  await page.getByRole('button',{name:'إغلاق لوحة الخصائص',exact:true}).click();
  await page.locator('.kind-size .config-option-main').last().click();
  await page.getByLabel('اسم الحجم',{exact:true}).fill(name);await page.getByLabel('السعر',{exact:true}).fill(price);
  await page.getByRole('button',{name:'إغلاق لوحة الخصائص',exact:true}).click();
 }
 const data=await page.evaluate(()=>({name:document.querySelector('[aria-label="اسم المنتج"]').value,
  category:document.querySelector('[aria-label="القسم"]').selectedOptions[0].textContent,price:document.querySelector('[aria-label="السعر الأساسي Base"]').value,description:document.querySelector('[aria-label="الوصف"]').value,
  activeImage:[...document.querySelectorAll(".image-tile")].findIndex(x=>x.classList.contains("active")),
  moods:[...document.querySelectorAll('.pe-mood-choice')].map(x=>({label:x.querySelector('span').textContent,checked:x.querySelector('input').checked})),
  images:[...document.querySelectorAll('.image-thumb img')].map(x=>({data:x.src})),
  ingredients:[...document.querySelectorAll('[data-editor-sort="ingredients"]')].map(x=>({name:x.querySelector('.library-name').textContent,image:x.querySelector('img')?.src||''})),
  mealDetails:[...document.querySelectorAll('[data-editor-sort="details"]')].map(x=>({name:x.querySelector('.library-name').textContent,image:x.querySelector('img')?.src||'',type:x.querySelector('input')?'standard':'presence',note:x.querySelector('input')?.value||''}))
 }));
 const refPage=await page.context().newPage();await refPage.route('**/*',r=>/^https?:\/\/(127\.0\.0\.1|localhost):/.test(r.request().url())||r.request().url().startsWith('data:')?r.continue():r.abort());
 await refPage.setContent(fs.readFileSync(process.env.V62_REFERENCE_HTML,'utf8'),{waitUntil:'domcontentloaded'});
 await refPage.evaluate(()=>openScreen(10,{menuScope:'business',businessName:'Fluffy'}));
 let frame;for(let i=0;i<60;i++){frame=refPage.frames().at(-1);if(await frame.evaluate(()=>typeof openProductEditor==='function').catch(()=>false))break;await new Promise(r=>setTimeout(r,100))}
 await refPage.locator('iframe').last().evaluate(el=>{el.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:99999'});
 await frame.evaluate(data=>{
  configuredMoodOptions=()=>data.moods.map(x=>x.label);moodFeatureAvailable=()=>true;
  const p=structuredClone(menuData().products.find(x=>x.id==='p5'));menuData().categories.push({id:'qa-category',name:data.category});p.categoryId='qa-category';Object.assign(p,data,{id:'qa-reference-parity',moods:data.moods.filter(x=>x.checked).map(x=>x.label),newItem:true,mostOrdered:true,sizes:[],modifierGroups:[],configurationTree:[]});const originalProductEditorData=productEditorData;productEditorData=id=>id?originalProductEditorData(id):p;openProductEditor(null);productEditorData=originalProductEditorData;
  document.querySelector('#prodName').value=data.name;document.querySelector('#prodPrice').value=data.price;
  // Only owner-excluded prototype-only panels are removed from this comparison fixture.
  document.querySelectorAll('.allergen-section,#linkedAllergenPreview,#caloriePreview,#osMenuInfoPreview,#osLinkCheck,#osGenericQuoteArea,.os-preflight,.os-schedule-entry,.os-operational-form').forEach(x=>x.remove());
  state.editorConfigTree=[normalizeConfigNode({id:'qa-size',kind:'size',name:'الأحجام',options:[{id:'qa-small',name:'صغير DEMO',price:'14000'},{id:'qa-medium',name:'وسط QA',price:'18000'},{id:'qa-large',name:'كبير QA',price:'21000'}],children:[]})];state.configSelectedId=null;refreshConfigBuilder();state.activeImageIndex=data.activeImage;refreshImages();
  document.querySelector('#osConfigIntegrityPanel')?.remove();
 },data);
 await page.locator('[data-product-editor-scroll]').evaluate(el=>el.scrollTop=0);await frame.locator('.product-editor-modal > .modal-body').evaluate(el=>el.scrollTop=0);
 const measurements={width,height:1000,engine:page.context().browser().version(),data,states:[]};
 const measure=async (target,selector)=>target.locator(selector).first().evaluate(el=>{const r=el.getBoundingClientRect(),c=getComputedStyle(el);return {width:r.width,height:r.height,padding:c.padding,gap:c.gap,fontFamily:c.fontFamily,fontSize:c.fontSize,fontWeight:c.fontWeight,borderRadius:c.borderRadius,borderColor:c.borderColor,background:c.backgroundColor,shadow:c.boxShadow,cursor:c.cursor,transform:c.transform}});
 const pairs=[['popup','dialog[aria-labelledby="product-editor-title"]','.product-editor-modal'],['header','dialog[aria-labelledby="product-editor-title"] header','.product-editor-modal > .modal-head'],['footer','dialog[aria-labelledby="product-editor-title"] footer','.product-editor-modal > .modal-foot'],['nameInput','[aria-label="اسم المنتج"]','#prodName'],['description','[aria-label="الوصف"]','#prodDescription'],['flag','.flag-card','.product-flag-card'],['mood','.pe-mood-choice','.mood-option label'],['gallery','.image-main','.product-main-preview'],['thumbnail','.image-tile','.product-thumb'],['library','.library-card:not(.detail)','.component-tile:not(.small)'],['libraryPhoto','.library-photo','.component-card'],['detail','.library-card.detail','.component-tile.small'],['detailValue','.library-value','.component-note'],['tree','.config-tree-panel','.config-tree-panel'],['size','.config-option-row','.config-option-row'],['dragHandle','.config-drag','.config-drag'],['inspector','.config-drawer','.config-drawer']];
 for(const [name,a,r]of pairs){await page.locator(a).first().evaluate(el=>el.scrollIntoView({block:'center'}));await frame.locator(r).first().evaluate(el=>el.scrollIntoView({block:'center'}));await page.waitForTimeout(180);
  measurements.states.push({name,state:'rest',app:await measure(page,a),reference:await measure(frame,r)});
  await page.locator(a).first().screenshot({path:path.join(out,`app-${name}-${width}.png`)});await frame.locator(r).first().screenshot({path:path.join(out,`reference-${name}-${width}.png`)});
 }
 for(const [name,a,r] of pairs.filter(x=>['thumbnail','library','detail'].includes(x[0]))){await page.locator(a).first().hover();await frame.locator(r).first().hover();await page.waitForTimeout(180);
  measurements.states.push({name,state:'hover',app:await measure(page,a),reference:await measure(frame,r)});
  await page.locator(a).first().screenshot({path:path.join(out,`app-${name}-hover-${width}.png`)});await frame.locator(r).first().screenshot({path:path.join(out,`reference-${name}-hover-${width}.png`)});
 }
 const drag=async(target,browserPage,prefix,kind)=>{
  const app=prefix==='app',selector=kind==='library'?(app?'[data-editor-sort="ingredients"] .library-drag-zone':'#ingredientsList .component-drag-zone'):(app?'.kind-size .config-drag':'.config-node-card.kind-size .config-drag');
  const handle=target.locator(selector).first();await handle.scrollIntoViewIfNeeded();const r=await handle.boundingBox();assert(r);
  await browserPage.mouse.move(r.x+r.width/2,r.y+r.height/2);await browserPage.mouse.down();
  const read=()=>target.evaluate(()=>({ghosts:document.querySelectorAll('.editor-drag-ghost,.component-drag-ghost').length,placeholders:document.querySelectorAll('.component-placeholder').length,sources:document.querySelectorAll('.config-sort-source,.is-source').length}));
  const steps=[];for(const [label,dx,dy] of [['start',0,0],['moving',-30,15],['edge',-55,28]]){await browserPage.mouse.move(r.x+r.width/2+dx,r.y+r.height/2+dy,{steps:3});await browserPage.waitForTimeout(180);steps.push({label,...await read()});await browserPage.screenshot({path:path.join(out,`${prefix}-${kind}-${label}-${width}.png`)});}
  // Both reference and application implement pointer cancellation; Escape is an additional accessible app path.
  await target.evaluate(()=>document.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));await browserPage.mouse.up();
  const after=await read();assert.equal(after.ghosts,0);assert.equal(after.placeholders,0);assert.equal(after.sources,0);
  return {steps,after};
 };
 for(const kind of ['library','tree']){const app=await drag(page,page,'app',kind),reference=await drag(frame,refPage,'reference',kind);assert.deepEqual(app.steps.map(x=>[x.ghosts,x.placeholders,x.sources]),reference.steps.map(x=>[x.ghosts,x.placeholders,x.sources]));measurements.states.push({name:kind,state:'pointer sequence and cancellation',app,reference});}
 const reorderTrace=async(target,browserPage,prefix)=>{
  const cards=()=>target.locator('.kind-size .config-option-row');
  const text=()=>cards().locator('.config-option-main b').allTextContents();
  const original=await text();assert.equal(original.length,3);
  await cards().first().evaluate(el=>el.scrollIntoView({block:'center'}));
  const grip=cards().first().locator('.config-drag'),a=await grip.boundingBox(),z=await cards().last().boundingBox();assert(a&&z);
  await browserPage.mouse.move(a.x+a.width/2,a.y+a.height/2);await browserPage.mouse.down();
  const frames=[];
  for(const fraction of [0,.3,.65,1]){
   await browserPage.mouse.move(a.x+a.width/2,a.y+a.height/2+(z.y+z.height-a.y-a.height/2)*fraction,{steps:3});
   await browserPage.waitForTimeout(170);
   frames.push({fraction,order:await text(),geometry:await cards().evaluateAll(xs=>xs.map(x=>({top:x.getBoundingClientRect().top,height:x.getBoundingClientRect().height,transform:getComputedStyle(x.closest('[data-v62-item],.config-option-wrap')||x).transform})))});
   await browserPage.screenshot({path:path.join(out,`${prefix}-reorder-${fraction}-${width}.png`)});
  }
  await browserPage.mouse.up();await browserPage.waitForTimeout(180);
  assert.deepEqual(await text(),[original[1],original[2],original[0]]);
  await browserPage.screenshot({path:path.join(out,`${prefix}-reorder-dropped-${width}.png`)});
  // Restore by the existing accessible keyboard behavior; the saved fixture remains deterministic.
  const last=cards().last().locator('.config-drag');await last.focus();await last.press('Alt+ArrowUp');
  await cards().nth(1).locator('.config-drag').focus();await cards().nth(1).locator('.config-drag').press('Alt+ArrowUp');
  assert.deepEqual(await text(),original);
  return {frames,dropped:[original[1],original[2],original[0]],restored:await text()};
 };
 const appReorder=await reorderTrace(page,page,'app'),referenceReorder=await reorderTrace(frame,refPage,'reference');
 assert.deepEqual(appReorder.dropped,referenceReorder.dropped);assert.deepEqual(appReorder.restored,referenceReorder.restored);
 measurements.states.push({name:'size-choice reorder',state:'live sibling displacement, drop, keyboard restoration',app:appReorder,reference:referenceReorder});
 await refPage.close();fs.writeFileSync(path.join(out,`comparison-${width}.json`),JSON.stringify(measurements,null,2));
};
