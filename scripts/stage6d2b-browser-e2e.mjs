import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";

// Stage 6D.3A extends the original Stage 6D.2B runner. It never accepts a real DB.
const databaseUrl = process.env.DATABASE_URL;
const target = databaseUrl ? new URL(databaseUrl) : null;
if (process.env.NODE_ENV === "production" || process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS !== "1"
  || !target || target.hostname !== "127.0.0.1" || target.port !== "55440"
  || target.pathname !== "/ordersawa_stage3_stage6c_stage6d3a_demo") {
  throw new Error("Browser E2E requires the exact Stage 6D.3A disposable demo database and flag.");
}
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const base = "http://127.0.0.1:3000/m/s6d2b-demo";
const api = "http://127.0.0.1:5000/public/menus/s6d2b-demo/orders/network-test";
const orderScope = { restaurantId: "s6d2b-demo-restaurant", source: "NETWORK_TEST" };
const results = [];
const originalState = new Map();
const profile = await mkdtemp(resolve(process.cwd(), "../work/stage6d3a-chrome-"));
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--disable-software-rasterizer", "--disable-gpu-compositing",
  "--disable-features=Vulkan,UseSkiaRenderer", "--no-sandbox", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=9223", "--remote-allow-origins=*",
  `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let chromeStartupError = "";
chrome.stderr.on("data", (chunk) => { chromeStartupError = (chromeStartupError + String(chunk)).slice(-2000); });
let socket;

function check(value, message) { if (!value) throw new Error(message); }
async function waitForJson(path) {
  for (let i = 0; i < 60; i++) {
    for (const loopback of ["127.0.0.1", "[::1]"]) {
      try { const response = await fetch(`http://${loopback}:9223${path}`); if (response.ok) return response.json(); }
      catch { /* Chrome debugger is starting or Windows selected the other loopback family. */ }
    }
    await pause(200);
  }
  throw new Error(`Chrome loopback debugger did not start (exit ${chrome.exitCode ?? "running"}): ${chromeStartupError}`);
}

try {
  const tabs = await waitForJson("/json/list");
  const tab = tabs.find((entry) => entry.type === "page");
  check(tab, "No Chrome page target");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { socket.addEventListener("open", ok, { once: true }); socket.addEventListener("error", fail, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const packet = JSON.parse(String(event.data));
    const request = pending.get(packet.id);
    if (!request) return;
    pending.delete(packet.id);
    if (packet.error) request.reject(new Error(JSON.stringify(packet.error)));
    else request.resolve(packet.result);
  });
  const cdp = (method, params = {}) => new Promise((ok, fail) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); fail(new Error(`CDP timeout: ${method}`)); }, 12_000);
    pending.set(id, { resolve: (value) => { clearTimeout(timer); ok(value); }, reject: (error) => { clearTimeout(timer); fail(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const packet = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (packet.exceptionDetails) throw new Error(packet.exceptionDetails.exception?.description ?? packet.exceptionDetails.text);
    return packet.result.value;
  };
  const until = async (expression, description, timeout = 12_000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expression)) return;
      await pause(200);
    }
    throw new Error(`Timed out waiting for ${description}`);
  };
  const go = async (url, marker = "main") => {
    await cdp("Page.navigate", { url });
    await until(`location.href===${JSON.stringify(url)} && !!document.querySelector(${JSON.stringify(marker)})`, `page ${url}`);
    await pause(500);
  };
  const button = async (fragment, position = 0) => {
    const clicked = await evaluate(`(() => { const found=[...document.querySelectorAll('button')].filter(x=>x.innerText.includes(${JSON.stringify(fragment)})); const target=found[${position}]; if(!target || target.disabled)return false; target.click(); return true; })()`);
    check(clicked, `Missing or disabled button: ${fragment} #${position}`);
    await pause(150);
  };
  const aria = async (name) => {
    const clicked = await evaluate(`(() => { const target=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(name)}); if(!target || target.disabled)return false; target.click(); return true; })()`);
    check(clicked, `Missing or disabled aria button: ${name}`);
    await pause(150);
  };
  const field = async (label, value) => {
    const changed = await evaluate(`(() => { const wrapper=[...document.querySelectorAll('label')].find(x=>x.innerText.trim().startsWith(${JSON.stringify(label)})); const element=wrapper?.querySelector('input,textarea'); if(!element)return false; const prototype=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,${JSON.stringify(value)}); element.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
    check(changed, `Missing field: ${label}`);
    await pause(100);
  };
  const clearCart = async () => {
    await go(`${base}/menu`);
    await evaluate(`localStorage.removeItem('cart:s6d2b-demo:main')`);
  };
  const storedCart = () => evaluate(`JSON.parse(localStorage.getItem('cart:s6d2b-demo:main') || '{"items":[]}')`);
  const addPizza = async () => {
    await go(`${base}/product/pizza`);
    await until(`[...document.querySelectorAll('button')].some(x=>x.getAttribute('aria-label')==='زيادة جبنة إضافية')`, "Pizza configurator");
    await button("كبير");
    await aria("زيادة جبنة إضافية");
    await aria("زيادة باربكيو");
    await button("تحقق وأضف");
    await until(`JSON.parse(localStorage.getItem('cart:s6d2b-demo:main')||'{"items":[]}').items?.some(x=>x.productId==='s6d2b-pizza')`, "Pizza in Network Cart");
  };
  const addCombo = async () => {
    await go(`${base}/product/combo`);
    await until(`[...document.querySelectorAll('button')].filter(x=>x.innerText.includes('كبير')).length>=2`, "Combo linked sizes");
    await button("كبير", 1);
    await button("تحقق وأضف");
    await until(`JSON.parse(localStorage.getItem('cart:s6d2b-demo:main')||'{"items":[]}').items?.some(x=>x.productId==='s6d2b-combo')`, "Combo in Network Cart");
  };
  const openDemo = async () => {
    await go(`${base}/network-order-test`, '[aria-label="Trusted Draft"], main');
    await until(`document.body.innerText.includes('اطلب مسودة موثوقة')`, "test order form");
    await until(`document.body.innerText.includes('ملاحظة الصنف') || document.body.innerText.includes('السلة فارغة')`, "hydrated test Cart");
  };
  const prepare = async (name = "Demo Customer") => {
    await field("اسم الزبون", name);
    await button("اطلب مسودة");
    await until(`!!document.querySelector('[aria-label="Trusted Draft"]') || !!document.querySelector('[role="alert"]')`, "trusted draft or error");
    return evaluate(`document.querySelector('[aria-label="Trusted Draft"]')?.innerText ?? ''`);
  };
  const accept = async () => { check(await evaluate(`(() => { const box=document.querySelector('input[type="checkbox"]'); if(!box)return false; box.click(); return box.checked; })()`), "Consent checkbox unavailable"); };
  const create = async () => { await button("إنشاء طلب تجريبي"); await until(`!!document.querySelector('[aria-label="WhatsApp Preview"]') || !!document.querySelector('[role="alert"]')`, "create outcome"); await pause(350); };
  const orderCount = () => db.order.count({ where: orderScope });
  const rememberProduct = async (id) => {
    if (!originalState.has(id)) originalState.set(id, await db.product.findUniqueOrThrow({ where: { id }, select: { configurationTree: true, configurationVersion: true, isAvailable: true } }));
    return structuredClone(originalState.get(id));
  };
  const restoreProducts = async () => {
    for (const [id, state] of originalState) await db.product.update({ where: { id }, data: state });
    originalState.clear();
  };
  const scenario = async (name, fn) => {
    if (process.env.BROWSER_E2E_ONLY && !name.startsWith(process.env.BROWSER_E2E_ONLY)) return;
    try { const outcome = await fn(); if (outcome === "skipped") { results.push({ name, status: "skipped" }); process.stdout.write(`SKIP ${name}\n`); } else { results.push({ name, status: "passed" }); process.stdout.write(`PASS ${name}\n`); } }
    catch (error) { results.push({ name, status: "failed", reason: error instanceof Error ? error.message : String(error) }); process.stderr.write(`FAIL ${name}: ${String(error)}\n`); }
    finally { await restoreProducts(); }
  };

  await cdp("Page.enable");
  await cdp("Runtime.enable");

  await scenario("01 Pizza sizes and addons", async () => {
    await clearCart(); await addPizza();
    const lines = (await storedCart()).items;
    check(lines.length === 1 && lines[0].selection.groups[0].sizeChoiceId === "demo-size-large", "Pizza Size not persisted");
    check(lines[0].acceptedQuote.total === "173.5", "Pizza addons not quoted by server");
  });
  await scenario("02 Combo repeated linked instances", async () => {
    await clearCart(); await addCombo();
    const line = (await storedCart()).items[0];
    const instances = line.selection.groups[0].instances;
    check(instances.length === 3 && new Set(instances.map((x) => x.instanceId)).size === 3, "Combo instances are not independent");
    check(instances.filter((x) => x.linkedSelection?.productId === "s6d2b-pizza").length === 2, "Repeated Pizza source missing");
  });
  await scenario("03 Cart persistence after reload", async () => {
    await clearCart(); await addPizza(); await addCombo();
    await go(`${base}/cart`); await cdp("Page.reload");
    await until(`document.body.innerText.includes('Pizza Margherita') && document.body.innerText.includes('Family Combo')`, "restored Cart lines");
    check((await storedCart()).items.length === 2, "Cart lines lost after reload");
  });
  await scenario("04 Price change requires renewed acceptance and saved historical snapshot", async () => {
    await clearCart(); await addPizza(); await addCombo(); await openDemo();
    await field("ملاحظة الصنف", "No onion");
    const draft = await prepare(); check(draft.includes("413.5 EGP"), "Initial trusted total differs");
    await accept(); const before = await orderCount();
    const state = await rememberProduct("s6d2b-pizza"); const changed = structuredClone(state.configurationTree);
    changed.groups[0].sizes.find((size) => size.id === "demo-size-large").price = "155";
    await db.product.update({ where: { id: "s6d2b-pizza" }, data: { configurationTree: changed } });
    await create();
    const changedDraft = await evaluate(`({text:document.querySelector('[aria-label="Trusted Draft"]')?.innerText||'',accepted:document.querySelector('input[type="checkbox"]')?.checked,preview:!!document.querySelector('[aria-label="WhatsApp Preview"]')})`);
    check(changedDraft.text.includes("423.5 EGP") && !changedDraft.accepted && !changedDraft.preview && await orderCount() === before, "Stale acceptance created an order");
    await accept(); await create();
    const message = await evaluate(`document.querySelector('[aria-label="WhatsApp Preview"] pre')?.innerText||''`);
    check(await orderCount() === before + 1 && message.includes("423.5 EGP") && message.includes("No onion"), "Accepted order or note missing");
    check(message.includes("اختيارات المكوّن 1") && message.includes("اختيارات المكوّن 2") && message.includes("اختيارات المكوّن 3"), "Linked instance numbering repeated");
    check(message.includes("دون تكلفة إضافية للحجم") && !/الحجم:.*مجاني/.test(message), "Linked zero size described as free");
    const saved = await db.order.findFirstOrThrow({ where: orderScope, orderBy: { createdAt: "desc" }, select: { id: true, cartSnapshot: true } });
    check(saved.cartSnapshot.totalAmount === "423.5", "Database snapshot total differs");
    await restoreProducts();
    const historical = await fetch(`${api}/${encodeURIComponent(saved.id)}/preview`).then((response) => response.json());
    check(historical.data?.message === message, "Catalog change rewrote historical message");
    process.stdout.write(`SAVED_COMBO_ORDER_ID ${saved.id}\nSAVED_COMBO_MESSAGE\n${message}\n`);
  });
  await scenario("05 Configuration revision change", async () => {
    await clearCart(); await addPizza(); await openDemo(); await prepare(); await accept();
    const before = await orderCount(); const state = await rememberProduct("s6d2b-pizza"); const revised = structuredClone(state.configurationTree);
    revised.revision += 1;
    await db.product.update({ where: { id: "s6d2b-pizza" }, data: { configurationTree: revised, configurationVersion: revised.revision } });
    await create();
    check(await orderCount() === before && !await evaluate(`!!document.querySelector('[aria-label="WhatsApp Preview"]')`), "Revision change created order");
  });
  await scenario("06 Availability change", async () => {
    await clearCart(); await addPizza(); await openDemo(); await prepare(); await accept();
    const before = await orderCount(); await rememberProduct("s6d2b-pizza");
    await db.product.update({ where: { id: "s6d2b-pizza" }, data: { isAvailable: false } });
    await create();
    check(await orderCount() === before && !await evaluate(`!!document.querySelector('[aria-label="WhatsApp Preview"]')`), "Unavailable Product created order");
  });
  await scenario("07 Invalid selection rejected from browser", async () => {
    await clearCart(); await addPizza(); await openDemo();
    const before = await orderCount();
    const outcome = await evaluate(`(async()=>{const cart=JSON.parse(localStorage.getItem('cart:s6d2b-demo:main'));const selection=structuredClone(cart.items[0].selection);selection.groups[0].sizeChoiceId='missing-size';const response=await fetch(${JSON.stringify(`${api}/prepare`)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({locale:'ar',items:[{productId:'s6d2b-pizza',quantity:1,selection}],fulfillmentType:'pickup'})});return {status:response.status,body:await response.json()};})()`);
    check(outcome.status >= 400 && await orderCount() === before, `Invalid selection accepted: ${JSON.stringify(outcome)}`);
  });
  await scenario("08 Rapid duplicate create click", async () => {
    await clearCart(); await addPizza(); await openDemo(); await prepare(); await accept();
    const before = await orderCount();
    await evaluate(`(() => {const button=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('إنشاء طلب تجريبي'));button.click();button.click();})()`);
    await until(`!!document.querySelector('[aria-label="WhatsApp Preview"]')`, "single order preview");
    check(await orderCount() === before + 1, "Rapid click created multiple orders");
  });
  await scenario("09 Idempotent retry from browser", async () => {
    await clearCart(); await addPizza(); await openDemo(); await prepare(); await accept();
    await evaluate(`(() => {const original=window.fetch.bind(window);window.__orderBody=null;window.fetch=(url,options)=>{if(String(url).endsWith('/orders/network-test')&&options?.method==='POST')window.__orderBody=options.body;return original(url,options);};})()`);
    const before = await orderCount(); await create();
    const replay = await evaluate(`(async()=>{const response=await fetch(${JSON.stringify(api)},{method:'POST',headers:{'Content-Type':'application/json'},body:window.__orderBody});return {status:response.status,body:await response.json()};})()`);
    check(replay.status === 201 && replay.body.data?.replayed === true && await orderCount() === before + 1, `Idempotent retry failed: ${JSON.stringify(replay)}`);
  });
  await scenario("10 Delivery address and notes", async () => {
    await clearCart(); await addPizza(); await openDemo();
    await evaluate(`(() => {const select=document.querySelector('select');select.value='delivery';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await until(`[...document.querySelectorAll('label')].some(x=>x.innerText.startsWith('المنطقة'))`, "delivery fields");
    await field("المنطقة", "Demo District"); await field("بالقرب من", "Demo Park"); await field("بجانب", "Demo Gate");
    await field("ملاحظات الطلب", "Pack separately"); await field("ملاحظة الصنف", "No onion");
    await prepare("Delivery Demo"); await accept(); await create();
    const message = await evaluate(`document.querySelector('[aria-label="WhatsApp Preview"] pre')?.innerText||''`);
    check(["Delivery Demo", "Demo District", "Demo Park", "Demo Gate", "Pack separately", "No onion"].every((part) => message.includes(part)), "Delivery snapshot details missing");
  });
  await scenario("11 Pickup time", async () => {
    await clearCart(); await addPizza(); await openDemo();
    await field("موعد الاستلام", "6 PM"); await prepare("Pickup Demo"); await accept(); await create();
    const message = await evaluate(`document.querySelector('[aria-label="WhatsApp Preview"] pre')?.innerText||''`);
    check(message.includes("Pickup Demo") && message.includes("6 PM"), `Pickup snapshot details missing: ${message}`);
  });
  await scenario("12 Mixed Legacy + Network cart denied", async () => {
    await clearCart(); await addPizza();
    await evaluate(`(() => {const key='cart:s6d2b-demo:main';const cart=JSON.parse(localStorage.getItem(key));cart.items.push({mode:'LEGACY',lineId:'legacy:legacy',slug:'legacy',name:'Legacy Demo',quantity:1,price:20,currency:'EGP'});localStorage.setItem(key,JSON.stringify(cart));})()`);
    await openDemo();
    await until(`document.body.innerText.includes('Legacy Demo')`, "mixed Cart hydration");
    check(await evaluate(`!!document.querySelector('[role="alert"]') && [...document.querySelectorAll('button')].find(x=>x.innerText.includes('اطلب مسودة'))?.disabled`), "Mixed Cart could request Draft");
    await go(`${base}/cart`);
    check(!await evaluate(`[...document.querySelectorAll('button')].some(x=>x.innerText.includes('إرسال عبر WhatsApp'))`), "Mixed Cart exposed Legacy send");
  });
  await scenario("13 Test flag disabled API", async () => {
    const guardOffApi = process.env.GUARD_OFF_API_URL;
    if (!guardOffApi) return "skipped";
    await go(`${base}/menu`);
    const status = await evaluate(`(async()=>{const response=await fetch(${JSON.stringify(`${guardOffApi}/public/menus/s6d2b-demo/orders/network-test/prepare`)},{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});return response.status;})()`);
    check(status === 403, `Flag-off API returned HTTP ${status}`);
  });
  await scenario("14 Legacy Checkout remains visible", async () => {
    await clearCart(); await go(`${base}/product/legacy`);
    await until(`document.body.innerText.includes('Legacy Demo')`, "Legacy product");
    await until(`localStorage.getItem('cart:s6d2b-demo:main') !== null`, "hydrated Legacy cart");
    await until(`[...document.querySelectorAll('button')].some(x=>x.getAttribute('aria-label')==='+ Legacy Demo')`, "Legacy quantity control");
    await aria("+ Legacy Demo");
    await pause(500);
    const stored = await evaluate(`({cart:localStorage.getItem('cart:s6d2b-demo:main'),text:document.body.innerText.slice(-800)})`);
    check(stored.cart && JSON.parse(stored.cart).items?.some((x) => x.mode === "LEGACY"), `Legacy item not stored after quantity click: ${JSON.stringify(stored)}`);
    await go(`${base}/cart`);
    check((await storedCart()).items.some((x) => x.mode === "LEGACY"), "Legacy item not persisted");
    check(await evaluate(`document.body.innerText.includes('تأكيد الطلب') || document.body.innerText.includes('Confirm order')`), "Legacy Checkout UI missing");
  });
  await scenario("15 RTL mobile 390px", async () => {
    await clearCart(); await addPizza(); await openDemo();
    await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    const layout = await evaluate(`({rtl:document.querySelector('main')?.getAttribute('dir'),overflow:document.documentElement.scrollWidth-window.innerWidth})`);
    check(layout.rtl === "rtl" && layout.overflow <= 2, `Mobile/RTL issue: ${JSON.stringify(layout)}`);
  });

  const passed = results.filter((entry) => entry.status === "passed").length;
  const failed = results.filter((entry) => entry.status === "failed").length;
  const skipped = results.filter((entry) => entry.status === "skipped").length;
  process.stdout.write(`BROWSER_E2E_RESULT ${JSON.stringify({ passed, failed, skipped, scenarios: results })}\n`);
  if (failed) process.exitCode = 1;
} finally {
  for (const [id, state] of originalState) await db.product.update({ where: { id }, data: state });
  await db.$disconnect();
  socket?.close();
  chrome.kill();
}
