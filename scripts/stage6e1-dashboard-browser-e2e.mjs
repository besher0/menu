import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";

const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (process.env.NODE_ENV === "production" || !url || url.hostname !== "127.0.0.1"
  || url.port !== "55440" || url.pathname !== "/ordersawa_stage3_stage6e1a_browser"
  || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  throw new Error("Stage 6E.1 browser test requires its exact disposable loopback DB and a local JWT secret.");
}

const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const browserProfile = await mkdtemp(resolve(process.cwd(), "../work/stage6e1-chrome-"));
const chrome = spawn(process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
  "--headless=new", "--disable-gpu", "--disable-software-rasterizer", "--no-sandbox", "--no-first-run",
  "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=9224", "--remote-allow-origins=*",
  `--user-data-dir=${browserProfile}`, "about:blank"
], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let chromeError = "";
chrome.stderr.on("data", (chunk) => { chromeError = (chromeError + String(chunk)).slice(-2000); });
let socket;
const results = [];
function check(value, message) { if (!value) throw new Error(message); }

async function debuggerJson(path) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    for (const host of ["127.0.0.1", "[::1]"]) {
      try {
        const response = await fetch(`http://${host}:9224${path}`);
        if (response.ok) return response.json();
      } catch { /* debugger starting */ }
    }
    await pause(200);
  }
  throw new Error(`Chrome debugger unavailable: ${chromeError}`);
}

try {
  await db.$connect();
  await db.restaurant.upsert({ where: { id: "s6e1-r1" }, update: {}, create: {
    id: "s6e1-r1", name: "Stage 6E.1 Demo", slug: "s6e1-demo", currency: "EGP"
  } });
  await db.subscriptionPlan.upsert({ where: { id: "s6e1-plan" }, update: {}, create: {
    id: "s6e1-plan", key: "STAGE6E1", name: "Stage 6E.1 Test Plan"
  } });
  await db.subscriptionFeature.upsert({ where: { id: "s6e1-capability" }, update: { enabled: true }, create: {
    id: "s6e1-capability", planId: "s6e1-plan", key: "PRODUCT_CONFIGURATION", enabled: true
  } });
  await db.restaurantSubscription.upsert({ where: { restaurantId: "s6e1-r1" }, update: { planId: "s6e1-plan" }, create: {
    id: "s6e1-subscription", restaurantId: "s6e1-r1", planId: "s6e1-plan", status: "ACTIVE", startsAt: new Date("2026-01-01T00:00:00Z")
  } });
  await db.user.upsert({ where: { id: "s6e1-user" }, update: {}, create: {
    id: "s6e1-user", email: "stage6e1@example.test", passwordHash: "not-used", role: "USER"
  } });
  await db.restaurantMember.upsert({ where: { id: "s6e1-membership" }, update: {}, create: {
    id: "s6e1-membership", restaurantId: "s6e1-r1", userId: "s6e1-user", role: "OWNER"
  } });

  const token = new JwtService({ secret: process.env.JWT_SECRET }).sign({
    sub: "s6e1-user", email: "stage6e1@example.test", role: "USER"
  });
  const session = { accessToken: token, user: { id: "s6e1-user", email: "stage6e1@example.test", role: "USER" },
    memberships: [{ role: "OWNER", restaurant: { id: "s6e1-r1", name: "Stage 6E.1 Demo", slug: "s6e1-demo" } }] };

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch("http://127.0.0.1:3000/dashboard/products/new")).ok) break; }
    catch { /* Next.js starting */ }
    await pause(250);
  }
  const tabs = await debuggerJson("/json/list");
  const tab = tabs.find((entry) => entry.type === "page");
  check(tab, "No Chrome page target");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    socket.addEventListener("open", ok, { once: true });
    socket.addEventListener("error", fail, { once: true });
  });
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
  await cdp("Page.enable");
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `
    if (location.hostname === '127.0.0.1') {
      localStorage.setItem('menu-builder-session', ${JSON.stringify(JSON.stringify(session))});
      localStorage.setItem('menu-builder-restaurant', ${JSON.stringify(JSON.stringify(session.memberships[0].restaurant))});
      window.confirm = () => true;
    }
  ` });
  await cdp("Page.navigate", { url: "http://127.0.0.1:3000/dashboard/products/new" });
  await until("!!document.querySelector('.product-creation-mode')", "creation mode picker");
  check(await evaluate("document.querySelector('.product-form-page')?.getAttribute('dir') || document.documentElement.getAttribute('dir')") === "rtl", "Dashboard is not RTL");
  await evaluate("document.querySelectorAll('input[name=creation-mode]')[1].click()");
  await until("document.body.innerText.includes('شبكة فارغة')", "Network setup explanation");
  const fill = async (label, value) => {
    const changed = await evaluate(`(() => { const field=[...document.querySelectorAll('.product-form-card label')].find(x=>x.innerText.trim().startsWith(${JSON.stringify(label)}))?.querySelector('input'); if(!field)return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(value)}); field.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
    check(changed, `Missing field: ${label}`);
  };
  await fill("اسم المنتج", `Stage 6E.1 Browser Pizza ${Date.now()}`);
  await until("!!document.querySelector('.product-form-card input[readonly]')?.value", "restaurant context");
  const validity = await evaluate("({valid:document.querySelector('.product-form-page').checkValidity(), invalid:[...document.querySelector('.product-form-page').elements].filter(x=>!x.validity?.valid).map(x=>({name:x.name,value:x.value}))})");
  check(validity.valid, `Form is invalid before submit: ${JSON.stringify(validity.invalid)}`);
  await evaluate("document.querySelector('.product-form-page button[type=submit]').click()");
  await until("location.pathname.includes('/edit') && !!document.querySelector('.pc-shell') || !!document.querySelector('.form-message:not(.success)')", "created product editor or submit error");
  check(await evaluate("location.pathname.includes('/edit')"), `Create failed: ${await evaluate("document.querySelector('.form-message')?.innerText ?? ''")}`);
  results.push("create setup and navigate to editor");
  const productId = new URL(await evaluate("location.href")).pathname.split("/").at(-2);
  const before = await db.product.findUniqueOrThrow({ where: { id: productId } });
  check(before.isAvailable === false && before.configurationVersion === 1 && before.basePrice === null
    && before.configurationTree?.schemaVersion === 1 && before.configurationTree?.productId === productId
    && before.configurationTree?.revision === 1 && before.configurationTree?.basePrice === null
    && Array.isArray(before.configurationTree?.groups) && before.configurationTree.groups.length === 0,
  "Setup product was not an unpriced Network tree");
  const premature = await fetch(`http://127.0.0.1:5000/dashboard/products/${productId}/toggle-availability`, {
    method: "PATCH", headers: { authorization: `Bearer ${token}`, "x-restaurant-id": "s6e1-r1" }
  });
  check(premature.status === 409, `Premature activation was not blocked: ${premature.status}`);
  const hidden = await fetch(`http://127.0.0.1:5000/public/menus/s6e1-demo/products/${productId}/configuration`);
  check(hidden.status === 404, `Incomplete setup leaked to Public Menu: ${hidden.status}`);
  results.push("incomplete setup activation and public access blocked");
  await until("document.querySelector('.pc-demo-bar') !== null", "configuration editor ready");
  await evaluate("[...document.querySelectorAll('.pc-demo-bar button')].find(x=>x.innerText.includes('Pizza Margherita')).click()");
  await until("!!document.querySelector('.pc-dirty')", "unsaved demo changes");
  await evaluate("document.querySelector('.pc-save-actions button.primary').click()");
  await until("document.querySelector('.pc-main-header')?.innerText.includes('النسخة الحالية 2')", "saved configuration revision");
  const saved = await db.product.findUniqueOrThrow({ where: { id: productId } });
  check(saved.configurationVersion === 2 && saved.basePrice === null && saved.configurationTree !== null && !saved.isAvailable, "Network tree did not persist with null Base");
  results.push("save Pizza demo through existing editor and atomic API");
  await cdp("Page.reload", { ignoreCache: true });
  await until("document.querySelector('.pc-main-header')?.innerText.includes('النسخة الحالية 2')", "reloaded saved tree");
  check(await evaluate("document.querySelector('.pc-shell')?.innerText.includes('Small') || document.querySelector('.pc-shell')?.innerText.includes('صغير')"), "Saved sizes were lost after reload");
  results.push("reload and preserve configuration");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await pause(400);
  check(await evaluate("document.querySelector('.pc-shell')?.getAttribute('dir')") === "rtl", "Editor lost RTL on mobile");
  await evaluate("document.querySelector('.pc-shell').scrollIntoView({block:'start'})");
  await pause(300);
  const editorWidth = await evaluate("document.querySelector('.pc-shell').getBoundingClientRect().width");
  check(editorWidth <= 390, `Editor exceeds 390px viewport: ${editorWidth}`);
  const screenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(resolve(process.cwd(), "../work/stage6e1a-dashboard-mobile.png"), Buffer.from(screenshot.data, "base64"));
  results.push("RTL and 390px mobile screenshot");
  await cdp("Emulation.clearDeviceMetricsOverride");
  await cdp("Page.navigate", { url: "http://127.0.0.1:3000/dashboard/products/new" });
  await until("!!document.querySelector('.product-creation-mode')", "Legacy product form");
  const legacyName = `Stage 6E.1 Legacy Zero ${Date.now()}`;
  await fill("اسم المنتج", legacyName);
  await fill("السعر", "0");
  await evaluate("document.querySelector('.product-form-page button[type=submit]').click()");
  await until("location.pathname==='/dashboard/products'", "Legacy product list navigation");
  const legacy = await db.product.findFirstOrThrow({ where: { restaurantId: "s6e1-r1", name: legacyName } });
  check(legacy.basePrice?.toString() === "0" && legacy.isAvailable && legacy.configurationTree === null, "Legacy creation behavior changed");
  results.push("Legacy product creation and zero-price regression");
  console.log(JSON.stringify({ results, productId, screenshot: resolve(process.cwd(), "../work/stage6e1a-dashboard-mobile.png") }, null, 2));
} finally {
  socket?.close();
  chrome.kill();
  await db.$disconnect();
}
