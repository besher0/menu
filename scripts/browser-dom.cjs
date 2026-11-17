const fs = require('node:fs/promises');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');

async function check() {
  const [profile, url] = process.argv.slice(2);
  let tab;
  for (let attempt=0; attempt<100 && !tab; attempt++) {
    await sleep(100);
    try {
      const data = await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8');
      const list = await fetch('http://127.0.0.1:'+Number(data.split('\n')[0])+'/json/list');
      tab = (await list.json()).find(t=>t.type==='page' && t.url===url);
    } catch { /* Chrome is still starting. */ }
  }
  if (!tab) throw Error('Fixture tab did not open');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=()=>reject(Error('Chrome debugging connection failed'));});
  let id=0;
  function send(method,params={}) {
    const requestId=++id;
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{ws.removeEventListener('message',receive);reject(Error('CDP timeout'));},5000);
      function receive(e) {
        const msg=JSON.parse(e.data);
        if(msg.id!==requestId)return;
        ws.removeEventListener('message',receive);clearTimeout(timeout);
        if(msg.error)reject(Error(msg.error.message));else resolve(msg.result);
      }
      ws.addEventListener('message',receive);ws.send(JSON.stringify({id:requestId,method,params}));
    });
  }
  try {
    if(process.env.BROWSER_SMOKE_REWRITE_SECRET){
      const target=new URL(url);
      if(target.hostname!=='127.0.0.1'||!target.pathname.startsWith('/m/preview-ordersawa/'))throw Error('Owned loopback fixture required');
      await send('Network.enable');
      await send('Network.setExtraHTTPHeaders',{headers:{'x-ordersawa-internal-restaurant-rewrite':process.env.BROWSER_SMOKE_REWRITE_SECRET,'x-ordersawa-internal-restaurant-slug':'preview-ordersawa'}});
      await send('Page.navigate',{url});
    }
    for(let i=0;i<200;i++) {
      const r=await send('Runtime.evaluate',{expression:`Array.from(document.querySelectorAll('article')).some(c=>c.textContent.includes('QA-Meal-Only') && c.querySelector('button[data-menu-increase]'))`,returnByValue:true});
      if(r.result.value===true)return;
      await sleep(100);
    }
    const diagnostic=await send('Runtime.evaluate',{expression: `JSON.stringify({title:document.title,location:location.href,articles:document.querySelectorAll('article').length,quantityActions:document.querySelectorAll('button[data-menu-increase]').length,fixturePresent:document.body.textContent.includes('QA-Meal-Only'),screen:document.querySelector('.public-screen')?.className,card:document.querySelector('article')?.className})`,returnByValue:true});
    throw Error('Menu product and quantity action missing in Chrome: '+diagnostic.result.value);
  } finally {await send('Browser.close').catch(()=>{});ws.close();}
}
check().catch(e=>{console.error(e.message);process.exitCode=1;});
