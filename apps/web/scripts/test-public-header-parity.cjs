// Run against a restaurant origin with a published product. Requests are read-only.
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");

const [origin, productSlug, out] = process.argv.slice(2);
if (!origin || !productSlug) throw Error("Supply the public menu origin and an existing product slug");
const tenant = new URL(origin).hostname.split(".")[0];
const properties = ["width", "height", "borderRadius", "objectFit", "objectPosition", "padding", "border", "boxShadow", "backgroundColor", "alignItems", "justifyContent"];
const logo = ".public-header-logo";
const back = ".public-back-button";

async function styles(locator, keys = properties) {
  return locator.evaluate((node, names) => Object.fromEntries(names.map(name => [name, getComputedStyle(node)[name]])), keys);
}

async function run(browser, locale, width, data) {
  const orderingEnabled = data.theme?.publicUi?.whatsappOrderingEnabled !== false;
  const sections = (data.menus || []).flatMap(menu => (menu.pages || []).flatMap(page => page.sections || []));
  const homeView = !data.menus?.length || sections.some(s => s.isActive !== false && ["HERO", "MOOD_STRIP", "FEATURED_PRODUCTS"].includes(s.type)) ? "home" : "menu";
  const variant = process.env.HEADER_TEST_LOGO || "original";
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  try {
    const item = data.products.find(product => product.slug === productSlug);
    assert.ok(item);
    await context.addInitScript(({ tenant, locale, item, orderingEnabled }) => {
      localStorage.setItem("language:" + tenant, locale);
      const key = "cart:" + tenant + ":main";
      if (orderingEnabled && !localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify([{ slug: item.slug, productId: item.id, quantity: 1, price: Number(item.basePrice), name: item.name, imageUrl: item.imageUrl }]));
      }
    }, { tenant, locale, item, orderingEnabled });
    await context.route("**/*", route => {
      const req = route.request();
      if (req.method() !== "GET") return route.abort();
      const target = new URL(req.url());
      if (data.restaurant.logoUrl && (target.href === data.restaurant.logoUrl || target.searchParams.get("url") === data.restaurant.logoUrl)) {
        if (variant === "failed") return route.abort();
        if (variant === "rectangle") return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect width="160" height="80" fill="teal"/></svg>'
        });
      }
      return route.continue();
    });
    const page = await context.newPage();
    const reference = {};
    const pages = [];
    async function check(view) {
      await page.locator('.public-screen[dir="' + (locale === "ar" ? "rtl" : "ltr") + '"]').waitFor();
      await page.locator('link[rel="manifest"][href^="blob:"]').waitFor({ state: "attached" });
      const product = view === "product";
      assert.equal(await page.locator(logo).count(), product ? 0 : 1, view + " logo");
      if (product || view === "cart" || view === "nested") await page.locator(back).waitFor();
      if (!product) {
        if (!data.restaurant.logoUrl) await page.locator(logo + " .public-header-logo-fallback").waitFor();
        else if (variant === "failed") await page.locator(logo + " .public-header-logo-fallback").waitFor();
        else await page.waitForFunction(({ logo, variant }) => {
          const image = document.querySelector(logo + " img");
          return image?.naturalWidth > 0 && (variant !== "rectangle" || image.naturalWidth === 2 * image.naturalHeight);
        }, { logo, variant });
      }
      for (const [key, selector] of [["logo", logo], ["image", logo + " > *"], ["back", back], ["icon", back + " svg"]]) {
        const element = page.locator(selector);
        if (!await element.count()) continue;
        assert.equal(await element.count(), 1, view + " " + key);
        await element.waitFor();
        const value = await styles(element, key === "icon" ? [...properties, "strokeWidth", "transform"] : properties);
        if (reference[key]) assert.deepEqual(value, reference[key], view + " " + key);
        else reference[key] = value;
        if (key === "icon") assert.equal(value.transform === "none", locale === "ar");
        else {
          assert.equal(value.width, value.height);
          assert.equal(value.borderRadius, "50%");
          if (key === "image") assert.equal(value.objectFit, "cover");
        }
      }
      if (width === 390) {
        for (const selector of [logo, back]) {
          const button = page.locator(selector);
          if (!await button.count()) continue;
          await page.keyboard.press("Tab");
          await button.focus();
          assert.equal((await styles(button, ["outlineStyle"])).outlineStyle, "solid");
          await button.hover();
          assert.equal((await styles(button, ["filter"])).filter, "brightness(0.97)");
          await page.mouse.down();
          try {
            assert.equal((await styles(button, ["opacity"])).opacity, "0.8");
          } finally {
            await page.mouse.move(0, 0);
            await page.mouse.up();
          }
          await button.evaluate(node => node.blur());
        }
      }
      const screen = page.locator(".public-screen");
      await screen.evaluate(node => node.style.setProperty("--public-logo-size", "52px"));
      if (!product) {
        assert.equal((await styles(page.locator(logo))).width, "52px");
        assert.equal((await styles(page.locator(logo + " > *"))).width, "52px");
      }
      await screen.evaluate(node => node.style.removeProperty("--public-logo-size"));
      if (out && variant === "original" && width === 390 && ["home", "menu", "cart"].includes(view)) {
        fs.mkdirSync(out, { recursive: true });
        await page.screenshot({ path: path.join(out, [tenant, view, locale].join("-") + ".png") });
      }
      pages.push(view);
    }
    async function open(route, view) {
      await page.goto(origin + route, { waitUntil: "domcontentloaded" });
      await page.locator(".public-screen.view-" + view).waitFor();
      await check(view);
    }
    await open("/", homeView);
    await open("/menu", "menu");
    const category = page.locator(".category-landing-list > button").first();
    if (await category.isVisible()) {
      await category.click();
      await page.locator(".public-screen.menu-nested").waitFor();
      await check("nested");
      await page.locator(back).click();
      await category.waitFor();
    }
    await open("/product/" + encodeURIComponent(productSlug), "product");
    await page.locator(back).click();
    await page.waitForURL(url => !url.pathname.includes("/product/"), { waitUntil: "commit" });
    if (orderingEnabled) await open("/cart", "cart");
    else {
      await page.goto(origin + "/cart", { waitUntil: "domcontentloaded" });
      await page.locator(".public-screen.view-home, .public-screen.view-menu").waitFor();
      pages.push("cart-disabled");
    }
    const storage = () => page.evaluate(tenant => ["language:" + tenant, "cart:" + tenant + ":main"].map(k => localStorage.getItem(k)), tenant);
    const before = await storage();
    if (orderingEnabled) assert.equal(JSON.parse(before[1]).items[0].quantity, 1);
    await page.locator(logo).click();
    await page.locator(".public-screen.view-" + homeView).waitFor();
    assert.deepEqual(await storage(), before);
    console.log(tenant, locale, width, pages.join(","));
  } finally {
    await context.close();
  }
}

(async () => {
  const local = new URL(origin).hostname.endsWith(".ordersawa.test");
  const browser = await chromium.launch({
    channel: process.env.CHROME_CHANNEL || "chrome",
    args: local ? ["--host-resolver-rules=MAP *.ordersawa.test 127.0.0.1", "--no-proxy-server"] : []
  });
  try {
    const api = process.env.HEADER_TEST_API || origin + "/api";
    const response = await fetch(api + "/public/menus/" + encodeURIComponent(tenant));
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.restaurant.slug, tenant);
    for (const locale of ["ar", "en"]) {
      for (const width of [360, 390, 430, 1280]) await run(browser, locale, width, data);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
