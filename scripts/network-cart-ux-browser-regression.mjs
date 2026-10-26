// Manual browser regression against the isolated local OrderSawa demo only.
// CART_UX_ORIGIN=http://127.0.0.1:3101 node scripts/network-cart-ux-browser-regression.mjs
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";

const origin = process.env.CART_UX_ORIGIN ?? "http://192.168.178.69:3200";
const parsed = new URL(origin);
if (parsed.protocol !== "http:" || ![["127.0.0.1", "3101"], ["192.168.178.69", "3200"]].some(([host, port]) => parsed.hostname === host && parsed.port === port) || parsed.pathname !== "/") {
  throw new Error("Only the isolated local demo origins are accepted.");
}
const output = resolve(process.cwd(), "docs/qa/network-cart");
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "ordersawa-cart-ux-"));
const chrome = spawn(process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-sandbox", "--remote-debugging-port=9238",
  "--remote-debugging-address=127.0.0.1", "--remote-allow-origins=*", `--user-data-dir=${profile}`, "about:blank"
], { windowsHide: true, stdio: "ignore" });
let socket;
try {
  let target;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:9238/json/list");
      target = (await response.json()).find((entry) => entry.type === "page");
      if (target) break;
    } catch { /* Browser still starting. */ }
    await pause(200);
  }
  if (!target) throw new Error("Chrome did not start");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { socket.addEventListener("open", ok, { once: true }); socket.addEventListener("error", fail, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  const quoteRequests = [];
  const checkoutRequests = [];
  socket.addEventListener("message", (event) => {
    const packet = JSON.parse(String(event.data));
    if (packet.method === "Network.requestWillBeSent" && packet.params.request.url.includes("/quote")) quoteRequests.push(packet.params.request.url);
    if (packet.method === "Network.requestWillBeSent" && packet.params.request.url.includes("/orders/whatsapp")) checkoutRequests.push(packet.params.request.url);
    if (packet.method === "Network.requestWillBeSent" && packet.params.request.url.includes("/checkout/whatsapp/")) checkoutRequests.push(packet.params.request.url);
    const request = pending.get(packet.id);
    if (!request) return;
    pending.delete(packet.id);
    if (packet.error) request.reject(new Error(JSON.stringify(packet.error)));
    else request.resolve(packet.result);
  });
  const cdp = (method, params = {}) => new Promise((ok, fail) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); fail(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve: (value) => { clearTimeout(timer); ok(value); }, reject: (error) => { clearTimeout(timer); fail(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evalInPage = async (expression) => {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async (expression, label, tries = 80) => {
    for (let i = 0; i < tries; i += 1) {
      if (await evalInPage(expression)) return;
      await pause(250);
    }
    throw new Error(`Timed out: ${label}; current page: ${await evalInPage("document.body.innerText.slice(0, 500)")}`);
  };
  const click = async (selector) => {
    const found = await evalInPage(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e?.click(); return !!e; })()`);
    if (!found) throw new Error(`Missing click target: ${selector}`);
  };
  const pizzaCard = "[...document.querySelectorAll('.menu-product-row[data-cart-mode=NETWORK]')].find(e => e.querySelector('.menu-product-copy b')?.textContent.includes('بيتزا مارغريتا'))";
  const clickPizza = async (selector) => {
    const found = await evalInPage(`(() => { const e = (${pizzaCard})?.querySelector(${JSON.stringify(selector)}); e?.click(); return !!e; })()`);
    if (!found) throw new Error(`Missing pizza control: ${selector}`);
  };
  const navigate = async (path) => {
    await cdp("Page.navigate", { url: origin + path });
    await until(`location.pathname === ${JSON.stringify(path.split("?")[0])} && document.readyState === 'complete'`, `navigate ${path}`, 120);
  };
  const shot = async (name) => {
    await evalInPage("document.fonts.ready");
    const screenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(join(output, name), Buffer.from(screenshot.data, "base64"));
  };
  const results = [];
  await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Network.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate("/m/preview-ordersawa/menu?category=demo-products&display=list");
  await until("!!document.querySelector('.menu-product-row[data-cart-mode=NETWORK] .menu-product-quantity')", "Network quantity control");
  await evalInPage("localStorage.removeItem('cart:preview-ordersawa:main')");
  await navigate("/m/preview-ordersawa/menu?category=demo-products&display=list");
  const menuState = await evalInPage(`(() => ({ legacy: !!document.querySelector('.menu-product-row[data-cart-mode=LEGACY] .menu-product-quantity'),
    network: [...document.querySelectorAll('.menu-product-row[data-cart-mode=NETWORK]')].map(e => ({ name: e.querySelector('b')?.textContent, control: !!e.querySelector('.menu-product-quantity') })) }))()`);
  if (!menuState.legacy || !menuState.network.some((line) => line.control)) throw new Error(`Missing menu controls: ${JSON.stringify(menuState)}`);
  results.push({ scenario: "menu quantity controls", menuState });
  await shot("menu-network-stepper-390.png");
  await clickPizza(".menu-product-quantity button:first-of-type");
  await until("location.pathname.includes('/product/')", "Network + opens configuration");
  await until("!!document.querySelector('[data-testid=public-product-configurator] [data-group-type=SIZE] [role=radio]')", "configuration loaded");
  await click("[data-testid=public-product-configurator] [data-group-type=SIZE] [role=radio]:not([disabled])");
  await evalInPage("document.querySelector('[data-testid=public-product-configurator] [aria-label*=\"زيادة جبنة\"]')?.click()");
  await click(".product-bottom-cart-network .product-cart-link");
  await until("!!JSON.parse(localStorage.getItem('cart:preview-ordersawa:main') || '{}').items?.some?.(item => item.mode === 'NETWORK')", "Network line saved");
  results.push({ scenario: "Network configuration opened from +", path: await evalInPage("location.pathname") });
  await navigate("/m/preview-ordersawa/cart");
  await until("!!document.querySelector('.network-cart-item .network-cart-expand')", "Network cart line");
  const collapsed = await evalInPage("({ image: !!document.querySelector('.network-cart-item > img, .network-cart-item > .product-image-placeholder'), expanded: document.querySelector('.network-cart-expand')?.getAttribute('aria-expanded'), choiceVisible: !document.querySelector('.network-cart-expanded')?.hidden, price: document.querySelector('.network-cart-item .product-price')?.innerText })");
  if (!collapsed.image || collapsed.expanded !== "false" || collapsed.choiceVisible !== false || !collapsed.price) throw new Error(`Incorrect collapsed Network card: ${JSON.stringify(collapsed)}`);
  const cardLayout = await evalInPage(`(() => { const card = document.querySelector('.network-cart-item'); const image = card.querySelector('img, .product-image-placeholder');
    const rect = image.getBoundingClientRect(); return { ratio: rect.width / rect.height, note: !!card.querySelector('.cart-card-note input'), summary: !!card.querySelector('.network-cart-choice-summary') }; })()`);
  if (Math.abs(cardLayout.ratio - 1) > 0.03 || !cardLayout.note || !cardLayout.summary) throw new Error(`Card layout differs: ${JSON.stringify(cardLayout)}`);
  results.push({ scenario: "square card image and inline note", cardLayout });
  const collapsedInvoice = await evalInPage("({ handle: !!document.querySelector('.cart-invoice-handle'), rows: document.querySelectorAll('.cart-invoice-lines .cart-invoice-line').length, images: document.querySelectorAll('.cart-invoice-scroll img').length })");
  if (!collapsedInvoice.handle || collapsedInvoice.rows !== 1 || collapsedInvoice.images !== 0) throw new Error(`Invoice shell differs: ${JSON.stringify(collapsedInvoice)}`);
  await click(".cart-invoice-handle");
  await until("document.querySelector('.cart-invoice-handle')?.getAttribute('aria-expanded') === 'true'", "invoice expands");
  await shot("network-cart-invoice-expanded-390.png");
  await click(".cart-invoice-handle");
  const handlePoint = await evalInPage("(() => { const r = document.querySelector('.cart-invoice-handle').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: handlePoint.x, y: handlePoint.y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: handlePoint.x, y: handlePoint.y - 85, button: "left", buttons: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: handlePoint.x, y: handlePoint.y - 85, button: "left", clickCount: 1 });
  await until("document.querySelector('.cart-invoice-handle')?.getAttribute('aria-expanded') === 'true'", "invoice drag opens");
  const openPoint = await evalInPage("(() => { const r = document.querySelector('.cart-invoice-handle').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: openPoint.x, y: openPoint.y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: openPoint.x, y: openPoint.y + 85, button: "left", buttons: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: openPoint.x, y: openPoint.y + 85, button: "left", clickCount: 1 });
  await until("document.querySelector('.cart-invoice-handle')?.getAttribute('aria-expanded') === 'false'", "invoice drag closes");
  results.push({ scenario: "invoice expands, collapses and drags without images", collapsedInvoice });
  await shot("network-cart-collapsed-390.png");
  await click(".network-cart-expand");
  await until("document.querySelector('.network-cart-expanded')?.hidden === false", "expanded choices");
  const expanded = await evalInPage("({ choices: document.querySelector('.network-cart-expanded')?.innerText, priceLines: document.querySelectorAll('.network-cart-selections .product-price').length })");
  if (!expanded.choices || expanded.priceLines) throw new Error(`Expanded choices invalid: ${JSON.stringify(expanded)}`);
  await shot("network-cart-expanded-390.png");
  await click(".network-cart-edit");
  await until("!!document.querySelector('.network-cart-editor [data-testid=public-product-configurator] [role=radio]')", "cart editor loaded");
  const selectedBeforeCancel = await evalInPage("document.querySelector('.network-cart-editor [role=radio][aria-checked=true]')?.innerText");
  if (!selectedBeforeCancel) throw new Error("Cart editor did not restore selected size");
  await shot("network-cart-editor-390.png");
  const cartBeforeCancel = await evalInPage("localStorage.getItem('cart:preview-ordersawa:main')");
  await click(".network-cart-editor-cancel");
  if (await evalInPage("!!document.querySelector('.network-cart-editor')")) throw new Error("Cancel did not close editor");
  if (cartBeforeCancel !== await evalInPage("localStorage.getItem('cart:preview-ordersawa:main')")) throw new Error("Cancel changed cart storage");
  results.push({ scenario: "collapsed/expanded/edit/cancel", collapsed, expanded, selectedBeforeCancel });
  await click(".network-cart-edit");
  await until("!!document.querySelector('.network-cart-editor [role=radio][aria-checked=true]')", "editor reopened");
  await evalInPage(`(() => { const input = document.querySelector('.network-cart-editor .cart-item-note input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'ملاحظة اختبار'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await evalInPage(`[...document.querySelectorAll('.network-cart-editor button')].find(e => e.innerText.includes('حفظ التكوين في السلة'))?.click()`);
  await until("!document.querySelector('.network-cart-editor')", "editor save closes");
  await until("document.querySelector('.network-cart-item .cart-card-note input')?.value === 'ملاحظة اختبار'", "edited note saved");
  const savedNote = await evalInPage("JSON.parse(localStorage.getItem('cart:preview-ordersawa:main')).items.find(e => e.mode === 'NETWORK')?.note");
  if (savedNote !== "ملاحظة اختبار") throw new Error(`Edited note not saved: ${savedNote}`);
  results.push({ scenario: "edit target Network line with trusted quote", savedNote,
    heading: await evalInPage("document.querySelector('.network-cart-item .cart-page-copy > b')?.innerText") });
  await shot("network-cart-edited-390.png");
  const beforeRecheck = quoteRequests.length;
  await cdp("Network.emulateNetworkConditions", { offline: false, latency: 900, downloadThroughput: -1, uploadThroughput: -1 });
  await click(".network-cart-recheck");
  await until("!!document.querySelector('.network-cart-status.status-checking')", "recheck loading");
  await shot("network-cart-recheck-loading-390.png");
  await cdp("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await until("!!document.querySelector('.network-cart-recheck-feedback') || !!document.querySelector('.network-cart-status.status-changed, .network-cart-status.status-invalid, .network-cart-status.status-offline')", "recheck result");
  if (quoteRequests.length <= beforeRecheck) throw new Error("Recheck did not request a server quote");
  results.push({ scenario: "manual recheck", newQuoteRequests: quoteRequests.length - beforeRecheck, feedback: await evalInPage("document.querySelector('.network-cart-recheck-feedback, .network-cart-status')?.innerText") });
  await shot("network-cart-rechecked-390.png");
  await cdp("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await click(".network-cart-recheck");
  await until("!!document.querySelector('.network-cart-status.status-offline')", "offline quote failure");
  const offlinePath = await evalInPage("location.pathname");
  await cdp("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  if (!offlinePath.endsWith("/cart")) throw new Error("Offline recheck unexpectedly navigated");
  await click(".network-cart-recheck");
  await until("!!document.querySelector('.network-cart-recheck-feedback')", "offline retry recovery");
  results.push({ scenario: "offline recheck fail closed and recovery", offlinePath });
  await navigate("/m/preview-ordersawa/menu?category=demo-products&display=list");
  await until(`Number((${pizzaCard})?.querySelector('.menu-product-quantity strong')?.innerText) > 0 && !!(${pizzaCard})?.querySelector('.menu-product-quantity button:first-of-type:not([disabled])')`, "single Network line verified");
  const oneLineQuantity = await evalInPage(`(${pizzaCard})?.querySelector('.menu-product-quantity strong')?.innerText`);
  await clickPizza(".menu-product-quantity button:first-of-type");
  await until(`(${pizzaCard})?.querySelector('.menu-product-quantity strong')?.innerText !== ${JSON.stringify(oneLineQuantity)}`, "one configuration quantity increases");
  if (!await evalInPage("location.pathname.endsWith('/menu')")) throw new Error("Network quantity changed route");
  await clickPizza(".menu-product-open");
  await until("!!document.querySelector('[data-testid=public-product-configurator] [data-group-type=SIZE] [role=radio]')", "second configuration page");
  await click("[data-testid=public-product-configurator] [data-group-type=SIZE] [role=radio]:nth-child(3)");
  await click(".product-bottom-cart-network .product-cart-link");
  await until("JSON.parse(localStorage.getItem('cart:preview-ordersawa:main')).items.filter(e => e.mode === 'NETWORK').length === 2", "two independent configurations");
  await navigate("/m/preview-ordersawa/menu?category=demo-products&display=list");
  await until(`!!(${pizzaCard})?.querySelector('.menu-network-configure')`, "multi-configuration control restored");
  const multiState = await evalInPage(`(() => { const card = ${pizzaCard}; return { ambiguousStepper: !!card?.querySelector('.menu-product-quantity'), configure: !!card?.querySelector('.menu-network-configure') }; })()`);
  if (multiState.ambiguousStepper || !multiState.configure) throw new Error(`Unsafe multi-configuration control: ${JSON.stringify(multiState)}`);
  await shot("menu-network-multiple-configurations-390.png");
  await click(".menu-product-row[data-cart-mode=LEGACY] .menu-product-quantity button:first-of-type");
  await navigate("/m/preview-ordersawa/cart");
  await until("!!document.querySelector('.network-cart-item') && !!document.querySelector('.cart-page-item:not(.network-cart-item)')", "mixed cart");
  const priceStyles = await evalInPage(`(() => {
    const style = selector => { const e = document.querySelector(selector); const s = getComputedStyle(e); return { fontSize: s.fontSize, fontWeight: s.fontWeight, color: s.color, lineHeight: s.lineHeight }; };
    return { network: style('.network-cart-item .product-price'), legacy: style('.cart-page-item:not(.network-cart-item) .product-price') };
  })()`);
  if (JSON.stringify(priceStyles.network) !== JSON.stringify(priceStyles.legacy)) throw new Error(`Network price style differs from Legacy: ${JSON.stringify(priceStyles)}`);
  await shot("mixed-cart-390.png");
  await click(".cart-invoice-handle");
  await until("document.querySelectorAll('.cart-invoice-lines .cart-invoice-line').length === 3", "expanded Mixed invoice lines");
  await shot("mixed-invoice-expanded-390.png");
  await click(".cart-invoice-handle");
  results.push({ scenario: "one vs multiple Network configurations and Mixed cart", oneLineQuantity, multiState, priceStyles,
    networkLines: await evalInPage("document.querySelectorAll('.network-cart-item').length"),
    legacyLines: await evalInPage("document.querySelectorAll('.cart-page-item:not(.network-cart-item)').length") });
  await evalInPage(`(() => { const input = document.querySelector('.cart-page-item:not(.network-cart-item) .cart-card-note input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Legacy note test'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await until("JSON.parse(localStorage.getItem('cart:preview-ordersawa:main')).items.some(e => e.mode === 'LEGACY' && e.note === 'Legacy note test')", "inline Legacy note persisted");
  await navigate("/m/preview-ordersawa/cart");
  await until("document.querySelectorAll('.network-cart-item').length === 2 && document.querySelectorAll('.cart-page-item:not(.network-cart-item)').length === 1", "mixed cart after reload");
  if (!await evalInPage("document.querySelector('.cart-page-item:not(.network-cart-item) .cart-card-note input')?.value === 'Legacy note test'")) {
    throw new Error("Inline Legacy note was lost after reload");
  }
  results.push({ scenario: "cart reload persistence", restoredNetworkLines: 2, restoredLegacyLines: 1 });
  for (const width of [360, 430, 1280]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    const overflow = await evalInPage("document.documentElement.scrollWidth > innerWidth + 1");
    if (overflow) throw new Error(`Cart horizontal overflow at ${width}px`);
    await shot(`network-cart-${width}.png`);
    results.push({ scenario: "responsive cart", width, overflow });
  }
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 1, mobile: false });
  await evalInPage("localStorage.setItem('language:preview-ordersawa', 'en')");
  await navigate("/m/preview-ordersawa/cart");
  await until("document.querySelector('.public-screen')?.dir === 'ltr'", "LTR cart");
  await shot("network-cart-ltr-390.png");
  results.push({ scenario: "English LTR", direction: await evalInPage("document.querySelector('.public-screen')?.dir") });
  await click(".cart-whatsapp");
  await until("!!document.querySelector('.cart-message-preview-open')", "checkout verification step");
  await click(".cart-message-preview-open");
  await until("!!document.querySelector('.whatsapp-preview-dialog pre') || !!document.querySelector('.cart-message[role=alert]')", "trusted message preview");
  const message = await evalInPage("document.querySelector('.whatsapp-preview-dialog pre')?.innerText");
  if (!message || !message.includes('بيتزا مارغريتا') || !message.includes('Legacy note test')
    || checkoutRequests.some((url) => url.includes('/orders/whatsapp') || url.includes('/checkout/whatsapp/confirm'))
    || !checkoutRequests.some((url) => url.includes('/checkout/whatsapp/prepare'))) {
    throw new Error(`Preview did not use the side-effect-free trusted prepare: ${JSON.stringify({ message, checkoutRequests })}`);
  }
  await writeFile(join(output, "mixed-whatsapp-message-preview.txt"), `${message}\n`, "utf8");
  await shot("mixed-whatsapp-message-preview-390.png");
  results.push({ scenario: "trusted Mixed message preview without order creation", previewLength: message.length,
    checkoutRequests });
  console.log(JSON.stringify({ origin, output, results }, null, 2));
} finally {
  socket?.close();
  chrome.kill();
}
