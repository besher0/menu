// Manual, read-only browser regression for the isolated OrderSawa demo.
// Example: CARD_QA_ORIGIN=http://127.0.0.1:3101 node scripts/product-card-browser-regression.mjs
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";

const origin = process.env.CARD_QA_ORIGIN ?? "http://127.0.0.1:3101";
const url = new URL(origin);
if (url.protocol !== "http:" || !["127.0.0.1", "192.168.178.69"].includes(url.hostname)
  || !["3101", "3200"].includes(url.port) || url.pathname !== "/") {
  throw new Error("This manual browser check accepts only the isolated local demo origin.");
}

const output = resolve(process.cwd(), "../work/product-card-qa");
const profile = await mkdtemp(join(tmpdir(), "ordersawa-card-qa-"));
await mkdir(output, { recursive: true });
const chrome = spawn(process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-sandbox",
  "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=9237",
  "--remote-allow-origins=*", `--user-data-dir=${profile}`, "about:blank"
], { windowsHide: true, stdio: "ignore" });

let socket;
try {
  let target;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:9237/json/list");
      target = (await response.json()).find((entry) => entry.type === "page");
      if (target) break;
    } catch { /* Chrome is starting. */ }
    await pause(200);
  }
  if (!target) throw new Error("Chrome debugger did not start");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    socket.addEventListener("open", ok, { once: true });
    socket.addEventListener("error", fail, { once: true });
  });

  let nextId = 0;
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
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); fail(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); ok(value); },
      reject: (error) => { clearTimeout(timer); fail(error); }
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const packet = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (packet.exceptionDetails) throw new Error(packet.exceptionDetails.exception?.description ?? packet.exceptionDetails.text);
    return packet.result.value;
  };
  const until = async (expression, label, attempts = 50) => {
    for (let i = 0; i < attempts; i += 1) {
      if (await evaluate(expression)) return true;
      await pause(200);
    }
    return false;
  };
  const click = async (selector) => {
    const rect = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!rect) throw new Error(`Missing click target: ${selector}`);
    await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  };
  const navigateToMenu = async () => {
    await cdp("Page.navigate", { url: `${origin}/m/preview-ordersawa/menu?category=demo-products&display=list` });
    if (!await until("location.pathname === '/m/preview-ordersawa/menu' && document.readyState === 'complete'", "menu navigation", 100)) {
      throw new Error(`Menu navigation failed: ${await evaluate("location.href")}`);
    }
    if (!await until("!!document.querySelector('.menu-product-row .menu-product-open')", "menu product row")) {
      throw new Error("Menu product row did not render");
    }
  };

  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__cardQaClicks = [];
    document.addEventListener('click', (event) => window.__cardQaClicks.push({
      target: event.target?.tagName, card: !!event.target?.closest('.menu-product-open'),
      time: Date.now()
    }), true);
  ` });

  const results = [];
  const originLabel = url.hostname === "127.0.0.1" ? "local" : "lan";
  for (const width of [360, 390, 430, 1280]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await navigateToMenu();
    if (!await until("getComputedStyle(document.querySelector('.menu-product-row .menu-product-open')).display === 'grid' && document.querySelector('.menu-category-chip > span:last-of-type').clientWidth > 0", `styles at ${width}px`)) {
      throw new Error(`Styles did not finish loading at ${width}px`);
    }
    await evaluate("document.fonts.ready");
    const metrics = await evaluate(`(() => {
      const card = document.querySelector('.menu-product-row');
      const button = card.querySelector('.menu-product-open');
      const label = document.querySelector('.menu-category-chip > span:last-of-type');
      const copy = card.querySelector('.menu-product-copy');
      const price = card.querySelector('.product-price');
      const title = card.querySelector('b');
      const r = (element) => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom }; };
      return { width: innerWidth, card: r(card), button: r(button), copy: r(copy),
        title: r(title), price: r(price), label: { text: label.innerText, scrollWidth: label.scrollWidth, clientWidth: label.clientWidth },
        direction: document.querySelector('.public-screen')?.dir };
    })()`);
    const screenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    if (metrics.button.width < 200 || metrics.button.height < 94 || metrics.label.scrollWidth > metrics.label.clientWidth
      || metrics.title.bottom >= metrics.price.y || metrics.price.bottom > metrics.card.bottom + 1) {
      throw new Error(`Readability or hitbox failed at ${width}px: ${JSON.stringify(metrics)}`);
    }
    const imageName = `menu-after-${originLabel}-${width}.png`;
    await writeFile(join(output, imageName), Buffer.from(screenshot.data, "base64"));
    results.push({ width, metrics, screenshot: imageName });
  }

  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigateToMenu();
  await pause(1200);
  await click(".menu-product-row .menu-product-open b");
  const clickEvents = await evaluate("window.__cardQaClicks");
  const navigated = await until("location.pathname.startsWith('/m/preview-ordersawa/product/')", "product details", 80);
  if (!navigated) throw new Error(`Product title click did not navigate: ${JSON.stringify(clickEvents)}`);
  results.push({ scenario: "click product title", clickEvents, navigated, path: await evaluate("location.pathname") });

  await navigateToMenu();
  await pause(1200);
  await click(".menu-product-row .menu-product-image-link");
  const imageNavigated = await until("location.pathname.startsWith('/m/preview-ordersawa/product/')", "image to details", 80);
  if (!imageNavigated) throw new Error("Product image click did not navigate");
  results.push({ scenario: "click product image", navigated: imageNavigated });

  await navigateToMenu();
  await pause(1200);
  await evaluate("document.querySelector('.menu-product-row .menu-product-open').focus()");
  await cdp("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await cdp("Input.dispatchKeyEvent", { type: "char", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  const keyboardNavigated = await until("location.pathname.startsWith('/m/preview-ordersawa/product/')", "keyboard to details", 80);
  if (!keyboardNavigated) throw new Error(`Keyboard Enter did not navigate: ${JSON.stringify(await evaluate("({ focused: document.activeElement?.outerHTML.slice(0,180), clicks: window.__cardQaClicks })"))}`);
  results.push({ scenario: "keyboard Enter", navigated: keyboardNavigated });

  await navigateToMenu();
  await until("!!document.querySelector('.menu-product-row[data-cart-mode=LEGACY] .menu-product-quantity button')", "Legacy quantity control");
  await pause(1200);
  const beforeQuantity = await evaluate("document.querySelector('.menu-product-row[data-cart-mode=LEGACY] .menu-product-quantity strong')?.textContent");
  await click(".menu-product-row[data-cart-mode=LEGACY] .menu-product-quantity button:first-of-type");
  await until(`document.querySelector('.menu-product-row[data-cart-mode=LEGACY] .menu-product-quantity strong')?.textContent !== ${JSON.stringify(beforeQuantity)}`, "Legacy quantity increase");
  const afterQuantity = await evaluate("document.querySelector('.menu-product-row[data-cart-mode=LEGACY] .menu-product-quantity strong')?.textContent");
  const stillMenu = await evaluate("location.pathname.endsWith('/menu')");
  if (!stillMenu || beforeQuantity === afterQuantity) throw new Error("Legacy quantity control navigated or did not update");
  results.push({ scenario: "Legacy quantity button", beforeQuantity, afterQuantity, stillMenu });

  await click(".menu-view-switch button:first-of-type");
  await until("!!document.querySelector('.category-spotlight-title-row')", "large product card");
  await click(".category-spotlight-title-row");
  const largeNavigated = await until("location.pathname.startsWith('/m/preview-ordersawa/product/')", "large card to details", 80);
  if (!largeNavigated) throw new Error("Large card title did not navigate");
  results.push({ scenario: "large product card", navigated: largeNavigated });

  if (!await until("!!document.querySelector('.product-back-link')", "details back control", 150)) {
    throw new Error(`Product details did not finish loading: ${await evaluate("document.body.innerText.slice(0,300)")}`);
  }
  await click(".product-back-link");
  const returnedToMenu = await until("location.pathname.endsWith('/menu')", "return to menu", 80);
  if (!returnedToMenu) throw new Error("Product details did not return to the menu");
  results.push({ scenario: "return from details", returnedToMenu });

  await evaluate("localStorage.setItem('language:preview-ordersawa', 'en')");
  await navigateToMenu();
  const ltr = await until("document.querySelector('.public-screen')?.dir === 'ltr'", "English LTR menu");
  if (!ltr) throw new Error("English menu did not switch to LTR");
  const ltrScreenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(output, `menu-after-${originLabel}-ltr-390.png`), Buffer.from(ltrScreenshot.data, "base64"));
  results.push({ scenario: "English LTR", ltr });
  await evaluate("localStorage.setItem('language:preview-ordersawa', 'ar')");

  await cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
  await navigateToMenu();
  await pause(1200);
  const touchPoint = await evaluate("(() => { const r = document.querySelector('.menu-product-row .menu-product-open b').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
  await cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: touchPoint.x, y: touchPoint.y, id: 1 }] });
  await cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const touchNavigated = await until("location.pathname.startsWith('/m/preview-ordersawa/product/')", "touch to details", 80);
  if (!touchNavigated) throw new Error("Touch did not open product details");
  results.push({ scenario: "mobile touch", touchNavigated });
  console.log(JSON.stringify({ origin, output, results }, null, 2));
} finally {
  socket?.close();
  chrome.kill();
}
