import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
const databaseTarget = databaseUrl ? new URL(databaseUrl) : null;
if (process.env.NODE_ENV === "production" || process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS !== "1"
  || !databaseTarget || databaseTarget.hostname !== "127.0.0.1" || databaseTarget.port !== "55440"
  || databaseTarget.pathname !== "/ordersawa_stage3_stage6c_stage6d2b_demo") {
  throw new Error("Browser E2E requires the exact disposable demo database and test flag.");
}
const db = new PrismaClient({ datasourceUrl: databaseUrl });
let originalTree;

const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = await mkdtemp(resolve(process.cwd(), "../work/stage6d2b-chrome-"));
const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--disable-software-rasterizer", "--disable-gpu-compositing",
  "--disable-features=Vulkan,UseSkiaRenderer", "--no-sandbox", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=9223", "--remote-allow-origins=*",
  `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
chrome.stderr.on("data", () => {});

async function waitForJson(path) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try { const response = await fetch(`http://127.0.0.1:9223${path}`); if (response.ok) return await response.json(); }
    catch { /* Browser has not opened its loopback debugger yet. */ }
    await pause(200);
  }
  throw new Error("Chrome DevTools loopback endpoint did not start");
}

let socket;
try {
  const tabs = await waitForJson("/json/list");
  const tab = tabs.find((entry) => entry.type === "page");
  if (!tab) throw new Error("No local Chrome page target");
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
  socket.addEventListener("close", (event) => process.stderr.write(`CDP closed: ${event.code} ${event.reason}\n`));
  socket.addEventListener("error", (event) => process.stderr.write(`CDP socket error: ${String(event.error ?? event)}\n`));
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10_000);
    pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const navigate = async (url) => { await cdp("Page.navigate", { url }); await pause(5500); };
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await navigate("http://127.0.0.1:3000/m/s6d2b-demo/product/pizza");
  await evaluate(`[...document.querySelectorAll('button')].find(x=>x.innerText.includes('كبير'))?.click()`);
  await evaluate(`[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='زيادة جبنة إضافية')?.click()`);
  await evaluate(`[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='زيادة باربكيو')?.click()`);
  await pause(400);
  await evaluate(`[...document.querySelectorAll('button')].find(x=>x.innerText.includes('تحقق وأضف'))?.click()`);
  await pause(1800);
  await navigate("http://127.0.0.1:3000/m/s6d2b-demo/product/combo");
  await evaluate(`[...document.querySelectorAll('button')].filter(x=>x.innerText.includes('كبير'))[1]?.click()`);
  await evaluate(`[...document.querySelectorAll('button')].find(x=>x.innerText.includes('تحقق وأضف'))?.click()`);
  await pause(1700);
  await navigate("http://127.0.0.1:3000/m/s6d2b-demo/cart");
  const cartState = await evaluate(`({text:document.body.innerText, whatsapp:[...document.querySelectorAll('a')].some(x=>x.href.startsWith('https://wa.me/'))})`);
  if (!cartState.text.includes("Pizza Margherita") || !cartState.text.includes("Family Combo") || cartState.whatsapp) {
    throw new Error(`Network Cart did not persist safely: ${JSON.stringify(cartState)}`);
  }
  await navigate("http://127.0.0.1:3000/m/s6d2b-demo/network-order-test");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const mobile = await evaluate(`({rtl:document.querySelector('main')?.getAttribute('dir'),overflow:document.documentElement.scrollWidth-window.innerWidth})`);
  if (mobile.rtl !== "rtl" || mobile.overflow > 2) throw new Error(`Mobile/RTL layout issue: ${JSON.stringify(mobile)}`);
  await evaluate(`(() => { const fields=[...document.querySelectorAll('input')]; const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(fields[2],'Demo Customer'); fields[2].dispatchEvent(new Event('input',{bubbles:true})); setter.call(fields[3],'0000000000'); fields[3].dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await evaluate(`[...document.querySelectorAll('button')].find(x=>x.innerText.includes('اطلب مسودة'))?.click()`);
  await pause(2300);
  const draft = await evaluate(`document.querySelector('[aria-label="Trusted Draft"]')?.innerText ?? ''`);
  if (!draft.includes('413.5 EGP') || !draft.includes('Family Combo')) throw new Error(`Unexpected trusted draft: ${draft}`);
  await evaluate(`document.querySelector('input[type="checkbox"]')?.click()`);
  const pizza = await db.product.findUniqueOrThrow({ where: { id: "s6d2b-pizza" }, select: { configurationTree: true } });
  const ordersBefore = await db.order.count({ where: { restaurantId: "s6d2b-demo-restaurant", source: "NETWORK_TEST" } });
  originalTree = pizza.configurationTree;
  const revisedTree = structuredClone(originalTree);
  const large = revisedTree.groups[0].sizes.find((size) => size.id === "demo-size-large");
  if (large?.price !== "145") throw new Error(`Unexpected disposable pizza price: ${large?.price}`);
  large.price = "155";
  await db.product.update({ where: { id: "s6d2b-pizza" }, data: { configurationTree: revisedTree } });
  await evaluate(`[...document.querySelectorAll('button')].find(x=>x.innerText.includes('إنشاء طلب تجريبي'))?.click()`);
  await pause(2500);
  const changedDraft = await evaluate(`({alerts:[...document.querySelectorAll('[role="alert"]')].map(x=>x.innerText), draft:document.querySelector('[aria-label="Trusted Draft"]')?.innerText ?? '', preview:!!document.querySelector('[aria-label="WhatsApp Preview"]'), accepted:document.querySelector('input[type="checkbox"]')?.checked})`);
  if (changedDraft.preview || changedDraft.accepted || !changedDraft.draft.includes('423.5 EGP') || !changedDraft.alerts.length) {
    throw new Error(`Price change did not require fresh acceptance: ${JSON.stringify(changedDraft)}`);
  }
  if (await db.order.count({ where: { restaurantId: "s6d2b-demo-restaurant", source: "NETWORK_TEST" } }) !== ordersBefore) {
    throw new Error("Order was saved before renewed customer acceptance.");
  }
  await evaluate(`document.querySelector('input[type="checkbox"]')?.click()`);
  await evaluate(`[...document.querySelectorAll('button')].find(x=>x.innerText.includes('إنشاء طلب تجريبي'))?.click()`);
  await pause(2500);
  const result = await evaluate(`({title:document.title, text:document.body.innerText.slice(0,5000), preview:document.querySelector('[aria-label="WhatsApp Preview"] pre')?.innerText ?? null, alerts:[...document.querySelectorAll('[role="alert"]')].map(x=>x.innerText)})`);
  if (!result.preview?.includes('Demo Customer') || !result.preview.includes('Family Combo') || !result.preview.includes('Pizza Margherita') || !result.preview.includes('423.5 EGP')) throw new Error(`Saved snapshot preview missing: ${JSON.stringify(result)}`);
  const savedOrders = await db.order.findMany({ where: { restaurantId: "s6d2b-demo-restaurant", source: "NETWORK_TEST" }, orderBy: { createdAt: "desc" }, take: 1,
    select: { id: true, totalAmount: true, cartSnapshot: true } });
  if (await db.order.count({ where: { restaurantId: "s6d2b-demo-restaurant", source: "NETWORK_TEST" } }) !== ordersBefore + 1
    || savedOrders[0]?.totalAmount.toString() !== "423.5" || savedOrders[0]?.cartSnapshot?.totalAmount !== "423.5") {
    throw new Error(`Saved order does not match trusted preview: ${JSON.stringify(savedOrders)}`);
  }
  result.savedOrderId = savedOrders[0].id;
  await db.product.update({ where: { id: "s6d2b-pizza" }, data: { configurationTree: originalTree } });
  originalTree = undefined;
  const historical = await fetch(`http://127.0.0.1:5000/public/menus/s6d2b-demo/orders/network-test/${encodeURIComponent(savedOrders[0].id)}/preview`).then((response) => response.json());
  if (historical.data?.message !== result.preview || historical.data?.totalAmount !== "423.5") {
    throw new Error("Historical WhatsApp preview changed after restoring the catalog price.");
  }
  result.historicalSnapshotStable = true;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  if (originalTree) await db.product.update({ where: { id: "s6d2b-pizza" }, data: { configurationTree: originalTree } });
  await db.$disconnect();
  socket?.close();
  chrome.kill();
}
