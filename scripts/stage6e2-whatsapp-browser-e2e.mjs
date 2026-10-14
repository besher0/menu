import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";

const target = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (process.env.NODE_ENV === "production" || process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT !== "1"
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
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__waTargets = [];
    window.open = () => ({ location: { set href(value) { window.__waTargets.push(value); } }, close() {} });
  ` });

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
  await evaluate("[...document.querySelectorAll('.rail-product')].find(x=>x.textContent.includes('Legacy Salad'))?.querySelector('button')?.click()");
  await until("document.querySelectorAll('.cart-page-list article').length===2", "mixed cart after Legacy add");
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
  console.log(JSON.stringify({ results, whatsappUrlLength: whatsappUrl.length, screenshot: screenshotPath }, null, 2));
} finally {
  await db.product.update({ where: { id: "s6e2-legacy" }, data: { basePrice: "12.000001" } }).catch(() => undefined);
  socket?.close();
  chrome.kill();
  await db.$disconnect();
}
