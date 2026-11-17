// Execute on the staging server with --env-file pointing to its private configuration.
// Never submits orders, reviews, complaints or WhatsApp messages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const env = process.env;
require('../apps/api/dist/common/security/production-config').validateProductionConfig(env);
assert.equal(env.ORDERSAWA_ENV, 'staging');
assert(env.STAGING_SMOKE_EMAIL && env.STAGING_SMOKE_PASSWORD && env.STAGING_SMOKE_RESTAURANT_SLUG);
const { chromium } = require(env.PLAYWRIGHT_MODULE || 'playwright');
const menuOrigin = 'https://' + env.STAGING_SMOKE_RESTAURANT_SLUG + '.' + env.ROOT_DOMAIN;
const output = path.resolve(env.SMOKE_OUTPUT || 'dist/staging-smoke');
fs.mkdirSync(output, { recursive: true });
let browser;
(async () => {
  browser = await chromium.launch({ headless: true, ...(env.V62_BROWSER_EXECUTABLE ? { executablePath: env.V62_BROWSER_EXECUTABLE } : {}) });
  const results = [];
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 600, hasTouch: width < 600 });
    const errors = [], serverErrors = [];
    // Any attempt to send an order or open an external messaging service is blocked.
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (!['https:','http:'].includes(url.protocol)) return route.continue();
      if (![env.WEB_ORIGIN, menuOrigin].includes(url.origin) || /\/checkout\/whatsapp\/confirm$/.test(url.pathname)) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', () => errors.push('pageerror'));
    page.on('response', r => { if (r.status() >= 500) serverErrors.push(r.status()); });
    await page.goto(env.WEB_ORIGIN + '/login');
    await page.getByLabel('البريد الإلكتروني').fill(env.STAGING_SMOKE_EMAIL);
    await page.getByLabel('كلمة المرور').fill(env.STAGING_SMOKE_PASSWORD);
    await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
    await page.waitForURL('**/dashboard');
    await page.getByText('زيارات اليوم', { exact: true }).waitFor();
    await page.goto(env.WEB_ORIGIN + '/dashboard/products');
    await page.getByRole('region', { name: 'إدارة الأصناف' }).waitFor();
    assert.equal(await page.locator('a[href="/dashboard/categories"]').count(), 0);
    const response = await context.request.get(menuOrigin + '/api/public/menus/' + env.STAGING_SMOKE_RESTAURANT_SLUG + '?track=0');
    assert(response.ok());
    const data = (await response.json()).data;
    const product = data.products.find(p => p.slug === 'staging-test-product');
    assert(product, 'Bootstrap synthetic product required');
    await page.goto(menuOrigin + '/');
    await page.locator('.public-header').waitFor();
    await page.goto(menuOrigin + '/product/' + product.slug);
    await page.locator('.product-detail').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.product-detail img')].some(x => x.complete && x.naturalWidth > 0));
    await page.getByRole('button', { name: '+ ' + product.name, exact: true }).click();
    await page.goto(menuOrigin + '/cart');
    await page.locator('.cart-whatsapp').click();
    await page.locator('.cart-confirm-form').waitFor();
    assert.equal(await page.getByRole('button', { name: 'معاينة رسالة WhatsApp دون إرسال', exact: true }).count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []); assert.deepEqual(serverErrors, []);
    await page.screenshot({ path: path.join(output, 'checkout-' + width + '.png'), fullPage: true });
    results.push({ width, login: 'PASS', ownerProducts: 'PASS', publicImage: 'PASS', cart: 'PASS', checkout: 'PASS', sends: 0 });
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log('PASS staging browser smoke (mobile + desktop); no orders/messages sent');
})().catch(() => { console.error('FAIL browser smoke; STOP. Check private local diagnostics. Credentials suppressed.'); process.exitCode = 1; })
  .finally(async () => { await browser?.close(); });
