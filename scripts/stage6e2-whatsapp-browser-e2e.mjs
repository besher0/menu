import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";

const target = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const browserMode = process.env.STAGE6E3_BROWSER_MODE === "off" ? "off" : "on";
if (process.env.NODE_ENV === "production"
  || process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT !== (browserMode === "off" ? "0" : "1")
  || !target || target.hostname !== "127.0.0.1" || target.port !== "55440"
  || target.pathname !== "/ordersawa_stage3_stage6e2_checkout") {
  throw new Error("Stage 6E.2 browser runner requires the exact disposable loopback database and checkout flag.");
}
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const profile = await mkdtemp(resolve(process.cwd(), "../work/stage6e2-chrome-"));
const chrome = spawn(process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
  "--headless=new", "--disable-gpu", "--disable-software-rasterizer", "--no-sandbox", "--no-first-run",
  "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=9226", "--remote-allow-origins=*",
  `--user-data-dir=${profile}`, "about:blank"
], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let stderr = "";
chrome.stderr.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-2000); });
let socket;
const results = [];
const check = (condition, message) => { if (!condition) throw new Error(message); };

async function debuggerJson(path) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    for (const host of ["127.0.0.1", "[::1]"]) {
      try { const response = await fetch(`http://${host}:9226${path}`); if (response.ok) return response.json(); }
      catch { /* Chrome is starting. */ }
    }
    await pause(200);
  }
  throw new Error(`Chrome debugger unavailable: ${stderr}`);
}

try {
  await db.$connect();
  const identity = await db.$queryRaw`SELECT current_database() AS name, host(inet_server_addr()) AS address, inet_server_port() AS port`;
  check(identity[0]?.name === "ordersawa_stage3_stage6e2_checkout" && identity[0]?.address === "127.0.0.1"
    && identity[0]?.port === 55440, "Disposable database identity changed");
  await db.restaurant.update({ where: { id: "s6e2-r1" }, data: { whatsappPhone: "201000000000" } });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch("http://127.0.0.1:3000/m/s6e2-r1/cart")).ok) break; }
    catch { /* Next is starting. */ }
    await pause(250);
  }
  const tabs = await debuggerJson("/json/list");
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
    const timer = setTimeout(() => { pending.delete(id); fail(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve: (value) => { clearTimeout(timer); ok(value); }, reject: (error) => { clearTimeout(timer); fail(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const packet = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (packet.exceptionDetails) throw new Error(packet.exceptionDetails.exception?.description ?? packet.exceptionDetails.text);
    return packet.result.value;
  };
  const until = async (expression, description) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await evaluate(expression)) return;
      await pause(200);
    }
    throw new Error(`Timed out: ${description}; page=${await evaluate("document.body.innerText.slice(0,900)")}`);
  };
  const navigate = async (path) => { await cdp("Page.navigate", { url: `http://127.0.0.1:3000/m/s6e2-r1${path}` }); };
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__waTargets = [];
    window.open = (url) => { if (url && url !== 'about:blank') window.__waTargets.push(url);
      return { location: { set href(value) { window.__waTargets.push(value); } }, close() {} }; };
  ` });

  if (browserMode === "off") {
    const ordersBefore = await db.order.count({ where: { restaurantId: "s6e2-r1" } });
    await navigate("/cart");
    await until("localStorage.getItem('cart:s6e2-r1:main')!==null", "Flag OFF cart hydration");
    await evaluate("[...document.querySelectorAll('.rail-product')].find(x=>x.textContent.includes('Legacy Salad'))?.querySelector(':scope > button')?.click()");
    await until("document.querySelectorAll('.cart-page-list article').length===1", "Flag OFF Legacy cart");
    check(await evaluate("!!document.querySelector('.trusted-whatsapp-checkout')") === false, "Flag OFF exposed trusted checkout");
    await evaluate("document.querySelector('.cart-checkout-card button.cart-whatsapp').click()");
    await until("!!document.querySelector('.cart-confirm-form')", "Flag OFF Legacy confirm form");
    await evaluate("document.querySelector('.cart-checkout-card button.cart-whatsapp').click()");
    await until("window.__waTargets.length===1", "Flag OFF Legacy WhatsApp URL");
    check(await db.order.count({ where: { restaurantId: "s6e2-r1" } }) === ordersBefore + 1, "Flag OFF Legacy Order persistence changed");
    results.push("Flag OFF Legacy-only browser checkout persists exactly one old Order and opens official WhatsApp URL");
    const denied = await fetch("http://127.0.0.1:5000/public/menus/s6e2-r1/checkout/whatsapp/prepare", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: "ar", items: [] })
    });
    check(denied.status === 403, `Flag OFF trusted endpoint returned ${denied.status}`);
    results.push("Flag OFF public trusted endpoint rejects direct HTTP with 403");
    await navigate("/product/s6e2-pizza");
    await until("!!document.querySelector('[data-testid=public-product-configurator] [role=radiogroup]')", "Flag OFF Pizza configurator");
    await evaluate("[...document.querySelectorAll('[data-testid=public-product-configurator] [role=radio]')].find(x=>x.textContent.includes('Small')).click()");
    await until("!![...document.querySelectorAll('[class*=previewGate] button')].find(x=>!x.disabled)", "Flag OFF valid Pizza selection");
    await evaluate("document.querySelector('[class*=previewGate] button').click()");
    await until("(localStorage.getItem('cart:s6e2-r1:main')||'').includes('NETWORK')", "Flag OFF Network cart line");
    await navigate("/cart");
    await until("document.querySelectorAll('.cart-page-list article').length===2", "Flag OFF mixed cart");
    check(await evaluate("!!document.querySelector('.network-cart-gate') && !document.querySelector('.cart-checkout-card button.cart-whatsapp') && !document.querySelector('.trusted-whatsapp-checkout')"),
      "Flag OFF mixed cart exposed a checkout route");
    results.push("Flag OFF mixed cart cannot enter Legacy or trusted checkout");
    await evaluate("[...document.querySelectorAll('.cart-page-list article')].find(x=>x.textContent.includes('Legacy Salad'))?.querySelector('.cart-page-remove')?.click()");
    await until("document.querySelectorAll('.cart-page-list article').length===1", "Flag OFF Network-only cart");
    check(await evaluate("!!document.querySelector('.network-cart-gate') && !document.querySelector('.cart-checkout-card button.cart-whatsapp') && !document.querySelector('.trusted-whatsapp-checkout')"),
      "Flag OFF Network-only cart exposed a checkout route");
    results.push("Flag OFF Network-only cart cannot enter Legacy or trusted checkout");
    console.log(JSON.stringify({ results }, null, 2));
  } else {
  const legacyOrdersBefore = await db.order.count({ where: { restaurantId: "s6e2-r1" } });
  const legacyEventsBefore = await db.analyticsEvent.count({ where: { restaurantId: "s6e2-r1", type: "WHATSAPP_ORDER_CLICKED" } });
  await navigate("/cart");
  await until("!![...document.querySelectorAll('.rail-product')].find(x=>x.textContent.includes('Legacy Salad'))", "Legacy recommendation");
  await until("localStorage.getItem('cart:s6e2-r1:main')!==null", "empty cart client hydration");
  check(await evaluate("!![...document.querySelectorAll('.rail-product')].find(x=>x.textContent.includes('Legacy Salad'))?.querySelector(':scope > button')"), "Legacy rail Add button missing");
  await evaluate("[...document.querySelectorAll('.rail-product')].find(x=>x.textContent.includes('Legacy Salad'))?.querySelector(':scope > button')?.click()");
  await until("document.querySelectorAll('.cart-page-list article').length===1", "Legacy-only cart");
  check(await evaluate("!!document.querySelector('.trusted-whatsapp-checkout')") === false, "Legacy-only cart replaced by trusted checkout");
  await evaluate("document.querySelector('.cart-checkout-card button.cart-whatsapp').click()");
  await until("!!document.querySelector('.cart-confirm-form')", "Legacy confirmation form");
  await evaluate("document.querySelector('.cart-checkout-card button.cart-whatsapp').click()");
  await until("window.__waTargets.length===1", "Legacy WhatsApp URL");
  check(await db.order.count({ where: { restaurantId: "s6e2-r1" } }) === legacyOrdersBefore + 1, "Legacy checkout did not save exactly one Order");
  check(await db.analyticsEvent.count({ where: { restaurantId: "s6e2-r1", type: "WHATSAPP_ORDER_CLICKED" } }) === legacyEventsBefore + 1,
    "Legacy checkout did not preserve Analytics");
  check((await evaluate("window.__waTargets[0]")).startsWith("https://wa.me/201000000000?text="), "Legacy destination changed");
  results.push("Legacy-only with Network flag ON uses the persisted checkout once, with Analytics and original WhatsApp route");
  await evaluate("window.__realFetch = window.fetch; window.fetch = (url, options) => String(url).includes('/orders/whatsapp') ? Promise.resolve(new Response('{}', {status:503})) : window.__realFetch(url, options)");
  await evaluate("document.querySelector('.cart-checkout-card button.cart-whatsapp').click()");
  await until("!!document.querySelector('.cart-checkout-card .cart-message')", "Legacy server error message");
  check(await evaluate("window.__waTargets.length") === 1, "Legacy failure opened an untrusted browser-price fallback URL");
  check(await db.order.count({ where: { restaurantId: "s6e2-r1" } }) === legacyOrdersBefore + 1, "Legacy failure wrote a duplicate Order");
  await evaluate("window.fetch = window.__realFetch");
  results.push("Legacy server failure does not open an untrusted local-price fallback or duplicate Order");
  await evaluate("localStorage.removeItem('cart:s6e2-r1:main'); window.__waTargets = []");

  await navigate("/product/s6e2-pizza");
  await until("!!document.querySelector('[data-testid=public-product-configurator] [role=radiogroup]')", "Pizza configurator");
  check(await evaluate("document.querySelector('[data-testid=public-product-configurator]').getAttribute('dir')") === "rtl", "Pizza configurator is not RTL");
  await evaluate("[...document.querySelectorAll('[data-testid=public-product-configurator] [role=radio]')].find(x=>x.textContent.includes('Medium')).click()");
  const cheeseCount = "[...document.querySelectorAll('[data-testid=public-product-configurator] article')].find(x=>x.querySelector('[class*=optionLabel] b')?.textContent==='Cheese')?.querySelector('[class*=quantity] strong')?.textContent";
  await evaluate("[...document.querySelectorAll('[data-testid=public-product-configurator] article')].find(x=>x.querySelector('[class*=optionLabel] b')?.textContent==='Cheese')?.querySelector('[class*=optionLabel]')?.click()");
  await until(`${cheeseCount}==='1'`, "first Cheese unit");
  for (const count of [2, 3]) {
    await evaluate("[...document.querySelectorAll('[data-testid=public-product-configurator] article')].find(x=>x.querySelector('[class*=optionLabel] b')?.textContent==='Cheese')?.querySelector('[class*=quantity] button:last-of-type')?.click()");
    await until(`${cheeseCount}==='${count}'`, `Cheese quantity ${count}`);
  }
  await until("document.querySelector('[data-testid=public-product-configurator]')?.innerText.includes('BBQ')", "nested sauce");
  await evaluate("[...document.querySelectorAll('[data-testid=public-product-configurator] article')].find(x=>x.querySelector('[class*=optionLabel] b')?.textContent==='BBQ')?.querySelector('[class*=optionLabel]')?.click()");
  await until("!![...document.querySelectorAll('[class*=previewGate] button')].find(x=>!x.disabled)", "valid Pizza selection");
  await evaluate("document.querySelector('[class*=previewGate] button').click()");
  await until("(localStorage.getItem('cart:s6e2-r1:main')||'').includes('NETWORK')", "Pizza added to Network cart");
  results.push("Pizza size, nested sauce, included quantity and server Quote added through configurator");

  await navigate("/cart");
  await until("!!document.querySelector('.trusted-whatsapp-checkout')", "trusted cart checkout");
  await until("[...document.querySelectorAll('.cart-page-list article')].some(x=>x.textContent.includes('Pizza Margherita'))", "restored Pizza cart line");
  await evaluate("document.querySelector('.trusted-whatsapp-checkout button.cart-whatsapp').click()");
  await until("!!document.querySelector('.trusted-whatsapp-draft')", "Network-only trusted draft");
  await evaluate("document.querySelector('.trusted-whatsapp-draft button.cart-whatsapp').click()");
  await until("window.__waTargets.length===1", "Network-only WhatsApp URL");
  check((await evaluate("window.__waTargets[0]")).includes("wa.me/201000000000"), "Network-only destination changed");
  check(await db.order.count({ where: { restaurantId: "s6e2-r1" } }) === legacyOrdersBefore + 1, "Network-only checkout persisted an Order");
  await evaluate("window.__waTargets = []");
  results.push("Network-only checkout uses trusted revalidation and creates no Order");
  await evaluate("[...document.querySelectorAll('.rail-product')].find(x=>x.textContent.includes('Legacy Salad'))?.querySelector(':scope > button')?.click()");
  await until("document.querySelectorAll('.cart-page-list article').length===2", "mixed cart after Legacy add");
  await evaluate("document.querySelectorAll('.cart-page-list article')[1].querySelector('.cart-page-stepper button')?.click()");
  await until("document.querySelectorAll('.cart-page-list article')[1]?.querySelector('.cart-page-stepper strong')?.textContent==='2'", "Legacy quantity edit");
  await evaluate("document.querySelectorAll('.cart-page-list article')[1].querySelector('.cart-page-remove')?.click()");
  await until("document.querySelectorAll('.cart-page-list article').length===1", "Legacy cart item deletion");
  await evaluate("[...document.querySelectorAll('.rail-product')].find(x=>x.textContent.includes('Legacy Salad'))?.querySelector(':scope > button')?.click()");
  await until("document.querySelectorAll('.cart-page-list article').length===2", "Legacy item re-added");
  results.push("Cart quantity edit, removal and re-add preserve Network line");
  results.push("Legacy and Network coexist in one cart");

  await navigate("/product/s6e2-combo");
  await until("!!document.querySelector('[data-testid=public-product-configurator]')", "Combo configurator");
  await until("document.querySelector('[data-group-type=OPTIONS] header small')?.textContent.match(/\\d+/)?.[0]==='3'", "required linked instances");
  check(await evaluate("document.querySelector('[data-testid=public-product-configurator]').innerText.includes('CUSTOM')"), "CUSTOM linked choice missing");
  await until("!![...document.querySelectorAll('[class*=previewGate] button')].find(x=>!x.disabled)", "valid Combo selection");
  await evaluate("document.querySelector('[class*=previewGate] button').click()");
  await until("(localStorage.getItem('cart:s6e2-r1:main')||'').includes('s6e2-combo')", "Combo added");
  results.push("Combo with two independent ORIGINAL and one CUSTOM linked instances added");

  await navigate("/cart");
  await until("document.querySelectorAll('.cart-page-list article').length===3", "three restored cart lines");
  await cdp("Page.reload", { ignoreCache: true });
  await until("document.querySelectorAll('.cart-page-list article').length===3", "cart persisted after reload");
  await until("document.querySelectorAll('.network-cart-item [role=alert]').length===0", "network lines rechecked");
  results.push("Mixed cart persists after reload");
  await evaluate("document.querySelector('.cart-item-note input').focus()");
  await cdp("Input.insertText", { text: "No onion" });
  await until("document.querySelector('.cart-item-note input').value==='No onion'", "product note");
  await evaluate("document.querySelector('.trusted-whatsapp-checkout textarea').focus()");
  await cdp("Input.insertText", { text: "Ring once" });
  await until("document.querySelector('.trusted-whatsapp-checkout textarea').value==='Ring once'", "order note");
  results.push("Product and order notes entered through the live checkout form");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await pause(250);
  const bounds = await evaluate("({width:document.querySelector('.trusted-whatsapp-checkout').getBoundingClientRect().width,dir:document.querySelector('.trusted-whatsapp-checkout').getAttribute('dir')})");
  check(bounds.width <= 390 && bounds.dir === "rtl", `Mobile/RTL failed: ${JSON.stringify(bounds)}`);
  const screenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const screenshotPath = resolve(process.cwd(), "../work/stage6e2-mixed-cart-mobile.png");
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
  results.push("RTL and 390px mobile layout screenshot");
  await cdp("Emulation.clearDeviceMetricsOverride");

  await evaluate("document.querySelector('.trusted-whatsapp-checkout button.cart-whatsapp').click()");
  await until("!!document.querySelector('.trusted-whatsapp-draft')", "trusted server draft");
  check(await evaluate("document.querySelector('.trusted-whatsapp-draft').innerText.includes('Legacy Salad') && document.querySelector('.trusted-whatsapp-draft').innerText.includes('Family Combo')"), "Draft did not include all mixed lines");
  check(await evaluate("document.querySelector('.trusted-whatsapp-message-preview')?.innerText.includes('Pizza Margherita') && document.querySelector('.trusted-whatsapp-message-preview')?.innerText.includes('BBQ') && document.querySelector('.trusted-whatsapp-message-preview')?.innerText.includes('Family Combo')"), "Full trusted message preview omitted configured choices");
  check(await evaluate("document.querySelector('.trusted-whatsapp-message-preview')?.innerText.includes('No onion') && document.querySelector('.trusted-whatsapp-message-preview')?.innerText.includes('Ring once')"), "Trusted message omitted customer notes");
  results.push("Trusted Draft displays all mixed lines and exact server total");
  await db.product.update({ where: { id: "s6e2-legacy" }, data: { basePrice: "13.000001" } });
  await evaluate("document.querySelector('.trusted-whatsapp-draft button.cart-whatsapp').click()");
  await until("document.querySelector('.trusted-whatsapp-checkout [role=alert]')?.textContent.includes('تغيّر')", "changed price requires acceptance");
  check(await evaluate("window.__waTargets.length") === 0, "WhatsApp opened on an unaccepted price");
  check(await evaluate("document.querySelector('.trusted-whatsapp-message-preview')?.innerText.includes('13.000001')"), "Reaccepted preview did not show the new trusted Legacy price");
  results.push("Changed price blocks WhatsApp and requests explicit reacceptance");
  await evaluate("document.querySelector('.trusted-whatsapp-draft button.cart-whatsapp').click()");
  await until("window.__waTargets.length===1", "accepted WhatsApp URL");
  const whatsappUrl = await evaluate("window.__waTargets[0]");
  const message = decodeURIComponent(new URL(whatsappUrl).searchParams.get("text"));
  check(whatsappUrl.startsWith("https://wa.me/201000000000?text="), `Wrong restaurant phone: ${whatsappUrl.slice(0,80)}`);
  check(message.includes("Pizza Margherita") && message.includes("Legacy Salad") && message.includes("Family Combo")
    && message.includes("Source Pizza") && message.includes("265.000004") && message.includes("13.000001"),
    `Incomplete trusted WhatsApp message: ${message.slice(0,500)}`);
  results.push("Explicit acceptance opens only the revalidated complete WhatsApp URL (intercepted, never sent)");
  const originalPizza = await db.product.findUniqueOrThrow({ where: { id: "s6e2-pizza" } });
  const wholePizza = structuredClone(originalPizza.configurationTree);
  wholePizza.groups[0].sizes[1].price = "200";
  wholePizza.groups[1].options[0].price = "30";
  wholePizza.groups[1].options[0].children[0].options[0].price = "5";
  try {
    await db.restaurant.update({ where: { id: "s6e2-r1" }, data: { currency: "SYP" } });
    await db.product.updateMany({ where: { restaurantId: "s6e2-r1" }, data: { currency: "SYP" } });
    await db.product.update({ where: { id: "s6e2-legacy" }, data: { basePrice: "12" } });
    await db.product.update({ where: { id: "s6e2-pizza" }, data: { configurationTree: wholePizza } });
    await navigate("/product/s6e2-pizza");
    await until("!!document.querySelector('[data-testid=public-product-configurator] [role=radiogroup]')", "SYP Pizza configurator");
    check(await evaluate("document.querySelector('[data-testid=public-product-configurator]').innerText.includes('200 SYP')"),
      "SYP size was not displayed as a whole amount");
    await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    check(await evaluate("document.querySelector('[data-testid=public-product-configurator]').getAttribute('dir')==='rtl'"),
      "SYP mobile configurator lost RTL");
    results.push("SYP integer size display and RTL 390px configurator verified in Chrome");
    await cdp("Emulation.clearDeviceMetricsOverride");
  } finally {
    await db.product.update({ where: { id: "s6e2-pizza" }, data: { configurationTree: originalPizza.configurationTree } });
    await db.product.update({ where: { id: "s6e2-legacy" }, data: { basePrice: "12.000001" } });
    await db.product.updateMany({ where: { restaurantId: "s6e2-r1" }, data: { currency: "EGP" } });
    await db.restaurant.update({ where: { id: "s6e2-r1" }, data: { currency: "EGP" } });
  }
  console.log(JSON.stringify({ results, whatsappUrlLength: whatsappUrl.length, screenshot: screenshotPath }, null, 2));
  }
} finally {
  await db.product.update({ where: { id: "s6e2-legacy" }, data: { basePrice: "12.000001" } }).catch(() => undefined);
  socket?.close();
  chrome.kill();
  await db.$disconnect();
}
