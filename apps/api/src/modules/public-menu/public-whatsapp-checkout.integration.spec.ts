import { INestApplication, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { ABO_MALEK_THEME } from "@menu/shared";
import { randomBytes, randomUUID } from "node:crypto";
import { ProductsService } from "../products/products.service";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { DashboardService } from "../dashboard/dashboard.service";
import { PrismaService } from "../prisma/prisma.service";
import { PublicMenuController } from "./public-menu.controller";
import { PublicMenuService } from "./public-menu.service";
import { PublicWhatsappCheckoutService } from "./public-whatsapp-checkout.service";

const url = process.env.WHATSAPP_CHECKOUT_TEST_DATABASE_URL;
const disposableDatabase = url ? new URL(url) : undefined;
if (url) {
  const allowed = (disposableDatabase?.port === "55440" && disposableDatabase?.pathname === "/ordersawa_stage3_stage6e2_checkout")
    || (disposableDatabase?.port === "55447" && disposableDatabase?.pathname === "/ordersawa_stage3_showprices_guard")
    || (disposableDatabase?.port === "55448" && /^\/ordersawa_demo_release_checkout_[0-9]{14}_[0-9a-f]{6}$/.test(disposableDatabase?.pathname ?? ""));
  if (disposableDatabase?.hostname !== "127.0.0.1" || !allowed) throw new Error("Disposable checkout test database required");
}
const integration = url ? describe : describe.skip;

const pizza = { schemaVersion: 2, productId: "s6e2-pizza", revision: 1, basePrice: null,
  groups: [
    { type: "SIZE", id: "sizes", label: "Sizes", sizes: [
      { id: "small", label: "Small", price: "100" }, { id: "medium", label: "Medium", price: "200.000001" },
      { id: "large", label: "Large", price: "300" }
    ] },
    { type: "OPTIONS", id: "toppings", label: "Toppings", min: 0, max: 3, includedQuantity: 1,
      options: [{ id: "cheese", label: "Cheese", price: "30.000001", maxQuantity: 3,
        children: [{ type: "OPTIONS", id: "sauces", label: "Sauces", min: 0, max: 1, includedQuantity: 0,
          options: [{ id: "bbq", label: "BBQ", price: "5.000001", maxQuantity: 1 }] }] }] }
  ] };
const source = { schemaVersion: 2, productId: "s6e2-source", revision: 1, basePrice: null,
  groups: [{ type: "SIZE", id: "source-sizes", label: "Source sizes", sizes: [
    { id: "source-small", label: "Small", price: "100" }, { id: "source-large", label: "Large", price: "200" }
  ] }] };
const combo = { schemaVersion: 2, productId: "s6e2-combo", revision: 1, basePrice: "0",
  groups: [{ type: "OPTIONS", id: "slots", label: "Slots", min: 3, max: 3, includedQuantity: 0, options: [
    { id: "original", label: "First pizza", price: "10", maxQuantity: 1,
      linkedProduct: { sourceProductId: "s6e2-source", mode: "ORIGINAL", originalPriceOverrides: { "source-small": { price: "5" }, "source-large": { price: "8" } } } },
    { id: "second-original", label: "Second pizza", price: "10", maxQuantity: 1,
      linkedProduct: { sourceProductId: "s6e2-source", mode: "ORIGINAL", originalPriceOverrides: { "source-small": { price: "5" }, "source-large": { price: "8" } } } },
    { id: "custom", label: "Extra pizza", price: "3", maxQuantity: 1,
      linkedProduct: { sourceProductId: "s6e2-source", mode: "CUSTOM", customConfiguration: {
        schemaVersion: 2, productId: "s6e2-source", revision: 1, basePrice: null,
        groups: [{ type: "SIZE", id: "custom-sizes", label: "Pizza sizes", sizes: [{ id: "custom-one", label: "Medium", price: "7" }] }]
      } } }
  ] }] };
const pizzaSelection = (revision = 1) => ({ schemaVersion: 2, productId: "s6e2-pizza", configurationRevision: revision, groups: [
  { type: "SIZE", groupId: "sizes", sizeChoiceId: "medium" },
  { type: "OPTIONS", groupId: "toppings", instances: [
    { instanceId: "cheese-1", optionId: "cheese", children: [{ type: "OPTIONS", groupId: "sauces", instances: [{ instanceId: "sauce-1", optionId: "bbq" }] }] },
    { instanceId: "cheese-2", optionId: "cheese" }, { instanceId: "cheese-3", optionId: "cheese" }
  ] }
] });
const comboSelection = () => ({ schemaVersion: 2, productId: "s6e2-combo", configurationRevision: 1, groups: [{
  type: "OPTIONS", groupId: "slots", instances: [
    { instanceId: "z-first", optionId: "original", linkedSelection: { schemaVersion: 2, productId: "s6e2-source", configurationRevision: 1,
      groups: [{ type: "SIZE", groupId: "source-sizes", sizeChoiceId: "source-small" }] } },
    { instanceId: "z-second", optionId: "second-original", linkedSelection: { schemaVersion: 2, productId: "s6e2-source", configurationRevision: 1,
      groups: [{ type: "SIZE", groupId: "source-sizes", sizeChoiceId: "source-large" }] } },
    { instanceId: "a-third", optionId: "custom", linkedSelection: { schemaVersion: 2, productId: "s6e2-source", configurationRevision: 1,
      groups: [{ type: "SIZE", groupId: "custom-sizes", sizeChoiceId: "custom-one" }] } }
  ]
}] });

const legacyLine = { mode: "LEGACY", lineId: "legacy:legacy", productId: "s6e2-legacy", productSlug: "legacy", quantity: 2, expectedUnitPrice: "12.000001" };
const networkLine = { mode: "NETWORK", lineId: "network-pizza", productId: "s6e2-pizza", quantity: 2,
  selection: pizzaSelection(), expectedUnitPrice: "265.000004" };
const comboLine = { mode: "NETWORK", lineId: "network-combo", productId: "s6e2-combo", quantity: 1,
  selection: comboSelection(), expectedUnitPrice: "43" };
const request = (items: unknown[], other: Record<string, unknown> = {}) => ({ locale: "ar", fulfillmentType: "pickup", items, ...other });

integration("Stage 6E.2 trusted mixed WhatsApp checkout on disposable PostgreSQL", () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  let app: INestApplication;
  let origin: string;
  const oldFlag = process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT;
  const oldKey = process.env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY;
  async function post(action: "prepare" | "confirm", body: unknown, slug = "s6e2-r1") {
    const response = await fetch(`${origin}/public/menus/${slug}/checkout/whatsapp/${action}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() as Record<string, any> };
  }
  const prepare = (body: unknown, slug?: string) => post("prepare", body, slug);
  const confirm = (body: unknown, token: string, slug?: string, idempotencyKey?: string) => post("confirm",
    { request: body, acceptanceToken: token, ...(idempotencyKey ? { idempotencyKey } : {}) }, slug);
  const setShowPrices = (showPrices: boolean) => prisma.restaurantThemeSettings.update({
    where: { restaurantId: "s6e2-r1" },
    data: { settings: { ...ABO_MALEK_THEME, dashboardSettings: { showPrices }, publicUi: { whatsappOrderingEnabled: true } } }
  });
  const setDeliveryFee = (deliveryFee: string | null) => prisma.restaurantThemeSettings.update({
    where: { restaurantId: "s6e2-r1" },
    data: { settings: { ...ABO_MALEK_THEME, dashboardSettings: { showPrices: true, deliveryFee },
      publicUi: { whatsappOrderingEnabled: true } } }
  });

  beforeAll(async () => {
    process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT = "1";
    process.env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY = randomBytes(32).toString("hex");
    await prisma.$connect();
    const identity = await prisma.$queryRaw<{ name: string; address: string; port: number }[]>`
      SELECT current_database() AS name, host(inet_server_addr()) AS address, inet_server_port() AS port`;
    expect(identity[0]).toMatchObject({ name: disposableDatabase?.pathname.slice(1), address: "127.0.0.1", port: Number(disposableDatabase?.port) });
    const checks = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_constraint WHERE conname LIKE 'Product_%check' AND convalidated`;
    expect(Number(checks[0].count)).toBeGreaterThanOrEqual(5);
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.analyticsEvent.deleteMany();
    await prisma.productConfigurationDependency.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.restaurantThemeSettings.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.restaurantSubscription.deleteMany();
    await prisma.subscriptionFeature.deleteMany();
    await prisma.subscriptionPlan.deleteMany();
    await prisma.restaurant.deleteMany();
    await prisma.restaurant.createMany({ data: [
      { id: "s6e2-r1", slug: "s6e2-r1", name: "Pizza Restaurant", currency: "EGP", whatsappPhone: "201000000000" },
      { id: "s6e2-r2", slug: "s6e2-r2", name: "Other Restaurant", currency: "EGP", whatsappPhone: "201000000001" }
    ] });
    await prisma.restaurantThemeSettings.createMany({ data: [
      { id: "s6e2-theme1", restaurantId: "s6e2-r1", settings: { ...ABO_MALEK_THEME, publicUi: { whatsappOrderingEnabled: true } } },
      { id: "s6e2-theme2", restaurantId: "s6e2-r2", settings: { ...ABO_MALEK_THEME, publicUi: { whatsappOrderingEnabled: true } } }
    ] });
    await prisma.subscriptionPlan.create({ data: { id: "s6e2-plan", key: "S6E2_TEST", name: "Stage 6E2",
      features: { create: [
        { id: "s6e2-cart", key: "CART_ORDERING", enabled: true },
        { id: "s6e2-wa", key: "WHATSAPP_ORDERING", enabled: true },
        { id: "s6e2-network", key: "PRODUCT_CONFIGURATION", enabled: true }
      ] } } });
    await prisma.restaurantSubscription.createMany({ data: [
      { id: "s6e2-sub1", restaurantId: "s6e2-r1", planId: "s6e2-plan", status: "ACTIVE", startsAt: new Date() },
      { id: "s6e2-sub2", restaurantId: "s6e2-r2", planId: "s6e2-plan", status: "ACTIVE", startsAt: new Date() }
    ] });
    await prisma.product.createMany({ data: [
      { id: "s6e2-pizza", restaurantId: "s6e2-r1", slug: "pizza", name: "Pizza Margherita", currency: "EGP", basePrice: null, configurationVersion: 1, configurationTree: pizza },
      { id: "s6e2-source", restaurantId: "s6e2-r1", slug: "source", name: "Source Pizza", currency: "EGP", basePrice: null, configurationVersion: 1, configurationTree: source },
      { id: "s6e2-combo", restaurantId: "s6e2-r1", slug: "combo", name: "Family Combo", currency: "EGP", basePrice: "0", configurationVersion: 1, configurationTree: combo },
      { id: "s6e2-legacy", restaurantId: "s6e2-r1", slug: "legacy", name: "Legacy Salad", currency: "EGP", basePrice: "12.000001", configurationVersion: 0 },
      { id: "s6e2-foreign", restaurantId: "s6e2-r2", slug: "foreign", name: "Foreign Item", currency: "EGP", basePrice: "1", configurationVersion: 0 }
    ] });
    @Module({ controllers: [PublicMenuController], providers: [
      PublicWhatsappCheckoutService, PublicMenuService, FeatureFlagsService,
      { provide: PrismaService, useValue: prisma }, { provide: ConfigService, useValue: { get: () => undefined } }
    ] })
    class TestModule {}
    app = await NestFactory.create(TestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    origin = await app.getUrl();
  });

  beforeEach(async () => {
    await setShowPrices(true);
    await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { deletedAt: null, name: "Pizza Margherita", configurationTree: pizza, configurationVersion: 1, isAvailable: true } });
    await prisma.product.update({ where: { id: "s6e2-source" }, data: { configurationTree: source, configurationVersion: 1, isAvailable: true } });
    await prisma.product.update({ where: { id: "s6e2-legacy" }, data: { basePrice: "12.000001", isAvailable: true } });
    await prisma.subscriptionFeature.update({ where: { id: "s6e2-network" }, data: { enabled: true } });
    await prisma.restaurant.update({ where: { id: "s6e2-r1" }, data: { whatsappPhone: "201000000000" } });
  });

  afterAll(async () => {
    if (app) await app.close();
    await prisma.$disconnect();
    if (oldFlag === undefined) delete process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT;
    else process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT = oldFlag;
    if (oldKey === undefined) delete process.env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY;
    else process.env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY = oldKey;
  });

  it("returns the same grouped catalog on both reads when category ranks tie or change", async () => {
    const restaurantId = "catalog-order-test";
    await prisma.restaurant.create({ data: { id: restaurantId, slug: restaurantId, name: "Ordering", currency: "EUR" } });
    await prisma.category.createMany({ data: ["combos", "pizza", "other"].map(slug => ({
      id: "test-cat-" + slug, restaurantId, slug, name: slug, sortOrder: slug === "other" ? 2 : 1
    })) });
    const source = ["combos", "pizza", "combos", "other", "pizza", "combos", null, "pizza", "pizza"];
    await prisma.product.createMany({ data: source.map((slug, i) => ({
      id: "ordered-" + i, slug: "ordered-" + i, name: String(9 - i), restaurantId,
      categoryId: slug && "test-cat-" + slug, sortOrder: i, basePrice: "10", currency: "EUR",
      isActive: i !== 7, isAvailable: i !== 8
    })) });
    async function check(expected: number[]) {
      const menu = await (await fetch(origin + "/public/menus/" + restaurantId)).json();
      const products = await (await fetch(origin + "/public/menus/" + restaurantId + "/products")).json();
      for (const list of [menu.products, products]) {
        expect(list.map((p: { id: string }) => p.id)).toEqual(expected.map(i => "ordered-" + i));
      }
    }
    await check([0, 2, 5, 1, 4, 3, 6]);
    await prisma.category.update({ where: { id: "test-cat-pizza" }, data: { sortOrder: 0 } });
    await check([1, 4, 0, 2, 5, 3, 6]);
  });

  it("rejects Legacy-only on both trusted endpoints before creating a draft or Order", async () => {
    const before = await prisma.order.count();
    const payload = request([legacyLine], { customerName: "Demo Customer", orderNote: "Less salt" });
    const prepared = await prepare(payload);
    expect(prepared.status).toBe(400);
    expect(prepared.body.error).toBe("LEGACY_CHECKOUT_REQUIRED");
    expect(prepared.body).not.toHaveProperty("acceptanceToken");
    const mixed = await prepare(request([legacyLine, networkLine]));
    expect(mixed.status).toBe(200);
    const sent = await confirm(payload, mixed.body.acceptanceToken);
    expect(sent.status).toBe(400);
    expect(sent.body.error).toBe("LEGACY_CHECKOUT_REQUIRED");
    expect(sent.body).not.toHaveProperty("whatsappUrl");
    expect(await prisma.order.count()).toBe(before);
  });

  it("rejects Network and Mixed prepare when stored menu prices are hidden without side effects", async () => {
    const beforeOrders = await prisma.order.count();
    const beforeEvents = await prisma.analyticsEvent.count();
    await setShowPrices(false);
    for (const payload of [request([networkLine]), request([legacyLine, networkLine])]) {
      const result = await prepare(payload);
      expect(result.status).toBe(403);
      expect(result.body.error).toBe("WHATSAPP_PRICES_HIDDEN");
      expect(result.body).not.toHaveProperty("acceptanceToken");
      expect(result.body).not.toHaveProperty("messagePreview");
      expect(result.body).not.toHaveProperty("whatsappUrl");
    }
    expect(await prisma.order.count()).toBe(beforeOrders);
    expect(await prisma.analyticsEvent.count()).toBe(beforeEvents);
  });

  it("rejects an already issued Network or Mixed token after prices are hidden", async () => {
    const beforeOrders = await prisma.order.count();
    const beforeEvents = await prisma.analyticsEvent.count();
    for (const payload of [request([networkLine]), request([legacyLine, networkLine])]) {
      await setShowPrices(true);
      const prepared = await prepare(payload);
      expect(prepared.status).toBe(200);
      await setShowPrices(false);
      const result = await confirm(payload, prepared.body.acceptanceToken);
      expect(result.status).toBe(403);
      expect(result.body.error).toBe("WHATSAPP_PRICES_HIDDEN");
      expect(result.body).not.toHaveProperty("whatsappUrl");
      expect(result.body).not.toHaveProperty("messagePreview");
    }
    expect(await prisma.order.count()).toBe(beforeOrders);
    expect(await prisma.analyticsEvent.count()).toBe(beforeEvents);
  });

  it("keeps Network and Mixed checkout available when prices are shown", async () => {
    for (const payload of [request([networkLine]), request([legacyLine, networkLine])]) {
      const prepared = await prepare(payload);
      expect(prepared.status).toBe(200);
      const confirmed = await confirm(payload, prepared.body.acceptanceToken);
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.whatsappUrl).toMatch(/^https:\/\/wa\.me\//);
    }
  });

  it("leaves the Legacy-only trusted contract unchanged when prices are hidden", async () => {
    await setShowPrices(false);
    const payload = request([legacyLine]);
    const prepared = await prepare(payload);
    expect(prepared.status).toBe(400);
    expect(prepared.body.error).toBe("LEGACY_CHECKOUT_REQUIRED");
    const confirmed = await confirm(payload, "invalid-token");
    expect(confirmed.status).toBe(400);
    expect(confirmed.body.error).toBe("LEGACY_CHECKOUT_REQUIRED");
  });

  it("quotes Pizza size, nested sauce, included quantity and a Mixed cart", async () => {
    const payload = request([legacyLine, networkLine], { fulfillmentType: "delivery", deliveryArea: "Area A", deliveryNear: "School", deliveryBeside: "Building 5" });
    const prepared = await prepare(payload);
    expect(prepared.status).toBe(200);
    expect(prepared.body.draft.items.map((line: any) => line.lineTotal)).toEqual(["24.000002", "530.000008"]);
    expect(prepared.body.draft.itemsSubtotal).toBe("554.00001");
    expect(prepared.body.draft.deliveryFee).toBeNull();
    expect(prepared.body.draft.totalAmount).toBeNull();
    expect(prepared.body.messagePreview).toContain("Pizza Margherita");
    expect(prepared.body.messagePreview).toContain("BBQ");
    expect(prepared.body.messagePreview).toContain("مجموع الأصناف: 554.00001 EGP");
    expect(prepared.body.messagePreview).toContain("رسوم التوصيل: تُحدّد حسب المنطقة");
    expect(prepared.body.messagePreview).not.toContain("إجمالي الطلب:");
    const sent = await confirm(payload, prepared.body.acceptanceToken);
    expect(sent.status).toBe(200);
    expect(sent.body.message).toContain("Pizza Margherita");
    expect(sent.body.message).toContain("Cheese");
    expect(sent.body.message).toContain("BBQ");
    expect(sent.body.message).toContain("Area A");
    expect(sent.body.message).toContain("مجموع الأصناف: 554.00001 EGP");
  });

  it("binds the actual fee to trusted acceptance and saves only the accepted checkout", async () => {
    const payload = request([legacyLine, networkLine], { fulfillmentType: "delivery",
      deliveryArea: "Area A", deliveryNear: "School", deliveryBeside: "Building 5" });
    const before = await prisma.order.count();
    await setDeliveryFee("10");
    const fixed = await prepare(payload);
    expect(fixed.status).toBe(200);
    expect(fixed.body.draft.itemsSubtotal).toBe("554.00001");
    expect(fixed.body.draft.deliveryFee).toBe("10");
    expect(fixed.body.draft.totalAmount).toBe("564.00001");
    expect(fixed.body.messagePreview).toContain("رسوم التوصيل: 10 EGP");
    await setDeliveryFee("0");
    const stale = await confirm(payload, fixed.body.acceptanceToken);
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe("WHATSAPP_CHECKOUT_REQUIRES_ACCEPTANCE");
    expect(stale.body.whatsappUrl).toBeUndefined();
    expect(stale.body.changedDraft.deliveryFee).toBe("0");
    const accepted = await confirm(payload, stale.body.acceptanceToken);
    expect(accepted.status).toBe(200);
    expect(accepted.body.message).toContain("رسوم التوصيل: مجاني");
    expect(await prisma.order.count()).toBe(before + 1);
    await setDeliveryFee(null);
  });

  it("serializes distinct deliveries across two independent database clients and remembers suppressed receipts", async () => {
    const other = new PrismaClient({ datasourceUrl: url });
    const tenant = "s6e2-r1";
    const clientId = randomUUID();
    const event = () => ({ type: "MENU_VIEWED", clientId, eventId: randomUUID(), path: "/m/s6e2-r1/menu" });
    const track = (body: ReturnType<typeof event>) => app.get(PublicMenuService).track(tenant, body, "Mozilla");
    const count = () => prisma.analyticsEvent.count({ where: { restaurantId: tenant, type: "MENU_VIEWED" } });
    const before = await count();
    const home = { ...event(), path: "/m/s6e2-r1" };
    const menu = event();
    try {
      const secondApi = new PublicMenuService(other as unknown as PrismaService, app.get(FeatureFlagsService), app.get(ConfigService));
      await Promise.all([track(home), secondApi.track(tenant, menu, "Mozilla")]);
      expect(await count()).toBe(before + 1);
      const key = await prisma.menuVisitWindow.findFirstOrThrow({ where: { restaurantId: tenant }, orderBy: { lastAcceptedAt: "desc" } });
      const age = async (minutes: number) => {
        await prisma.$executeRaw`UPDATE "MenuVisitWindow" SET "lastAcceptedAt" = clock_timestamp() - ${minutes} * interval '1 minute'
          WHERE "restaurantId" = ${tenant} AND "browserKey" = ${key.browserKey}`;
      };
      for (const minutes of [1, 29]) {
        await age(minutes);
        const where = { restaurantId_browserKey: { restaurantId: tenant, browserKey: key.browserKey } };
        const prior = await prisma.menuVisitWindow.findUniqueOrThrow({ where });
        await track(event());
        expect((await prisma.menuVisitWindow.findUniqueOrThrow({ where })).lastAcceptedAt).toEqual(prior.lastAcceptedAt);
        expect(await count()).toBe(before + 1);
      }
      await age(30);
      await track(home);
      await track(menu);
      expect(await count()).toBe(before + 1);
      await track(event());
      await track({ ...event(), clientId: randomUUID() });
      expect(await count()).toBe(before + 3);
    } finally {
      await other.$disconnect();
    }
  });

  it("returns actionable review counts and only three public feedback fields plus ID", async () => {
    const tenant = "merchant-home-fixture";
    await prisma.restaurant.create({ data: { id: tenant, slug: tenant, name: "QA", currency: "SYP" } });
    const service = new DashboardService(prisma as unknown as PrismaService, app.get(FeatureFlagsService));
    const read = async (owner = true) => {
      const data = await service.overview(tenant, "1", owner);
      if (!("feedback" in data)) throw new Error("Expected home detail");
      return data;
    };
    const empty = await read();
    expect(empty).toMatchObject({ zone: "Asia/Damascus", views: 0, visits: 0, feedback: [],
      missingImage: { count: 0, items: [] }, unavailable: { count: 0, items: [] } });
    const item = await prisma.product.create({ data: { restaurantId: tenant, name: "QA", slug: "qa", basePrice: 10, isAvailable: false } });
    for (let i = 1; i <= 4; i++) {
      await prisma.restaurantFeedback.create({ data: { restaurantId: tenant, stars: i, comment: "QA",
        createdAt: new Date(i * 86400000), requestId: randomUUID(), dedupeKey: String(i).padStart(64, "0") } });
    }
    const full = await read();
    expect(full.unavailable.count).toBe(1);
    expect(full.missingImage.items[0].id).toBe(item.id);
    expect(full.feedback?.map(row => row.stars)).toEqual([4,3,2]);
    expect(full.feedback?.[0]).not.toHaveProperty("customerPhone");
    expect((await read(false)).feedback).toBeNull();
    await prisma.product.update({ where: { id: item.id }, data: { isAvailable: true, images: { create: { url: "/assets/qa.jpg" } } } });
    expect(await read()).toMatchObject({ unavailable: { count: 0 }, missingImage: { count: 0 } });
  });

  it("paginates all review matches for the tenant and removes resolved issues", async () => {
    const tenant = "review-pagination";
    await prisma.restaurant.create({ data: { id: tenant, name: tenant, slug: tenant } });
    const dashboard = new DashboardService(prisma as unknown as PrismaService, app.get(FeatureFlagsService));
    const products = new ProductsService(prisma as unknown as PrismaService, app.get(FeatureFlagsService), {} as never, app.get(ConfigService));
    const ids: string[] = [];
    for (const count of [0, 1, 3, 48, 107]) {
      const batch = Array.from({ length: count - ids.length }, (_, i) => {
        const id = tenant + "-" + (ids.length + i);
        return { id, restaurantId: tenant, slug: id, name: id, basePrice: 10, isAvailable: false, isActive: true };
      });
      if (batch.length) await prisma.product.createMany({ data: batch });
      ids.push(...batch.map(product => product.id));
      const overview = await dashboard.overview(tenant, "1");
      if (!("missingImage" in overview)) throw Error("Missing review details");
      for (const review of ["missingImage", "unavailable"] as const) {
        expect(overview[review].count).toBe(count);
        expect(overview[review].items).toHaveLength(Math.min(3, count));
        const seen: string[] = [];
        for (let page = 1; page <= Math.max(1, Math.ceil(count / 10)); page++) {
          const result = await products.list(tenant, { page, limit: 10, review, sort: "name", search: tenant });
          expect(result.meta.total).toBe(count);
          seen.push(...result.data.map(product => product.id));
        }
        expect(seen.sort()).toEqual([...ids].sort());
      }
    }
    const image = await prisma.productImage.create({ data: { productId: ids[0], url: "/assets/test.jpg", isActive: false } });
    expect((await products.list(tenant, { review: "missingImage", limit: 1 })).meta.total).toBe(107);
    await prisma.productImage.update({ where: { id: image.id }, data: { isActive: true } });
    expect((await products.list(tenant, { review: "missingImage", limit: 1 })).meta.total).toBe(106);
    await expect(dashboard.createCategory(tenant, { name: "  اَلْكُلّ ", slug: "other" })).rejects.toThrow("الكل");
    const category = await dashboard.createCategory(tenant, { name: "لكل الأذواق", slug: "variety" });
    await expect(dashboard.updateCategory(tenant, category.id, { name: "ＡＬＬ" })).rejects.toThrow("الكل");
  });

  it("uses restaurant-local calendar boundaries across midnight and DST", async () => {
    const tenant = "s6e2-r1";
    const service = new DashboardService(prisma as unknown as PrismaService, app.get(FeatureFlagsService));
    const { country } = await prisma.restaurant.findUniqueOrThrow({ where: { id: tenant } });
    try {
      await prisma.restaurant.update({ where: { id: tenant }, data: { country: "DE" } });
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-03-29T22:05:00Z")); // Monday 00:05 after the spring transition
      for (const [days, start] of [["1","2026-03-29T22:00:00.000Z"],["7","2026-03-23T23:00:00.000Z"],["30","2026-02-28T23:00:00.000Z"]]) {
        expect((await service.overview(tenant, days)).start.toISOString()).toBe(start);
      }
      await prisma.restaurant.update({ where: { id: tenant }, data: { country: "سوريا" } });
      expect((await service.overview(tenant)).start.toISOString()).toBe("2026-03-29T21:00:00.000Z");
    } finally {
      vi.useRealTimers();
      await prisma.restaurant.update({ where: { id: tenant }, data: { country } });
    }
  });

  it("ranks the whole period by ID and excludes deleted or foreign products", async () => {
    const tenant = "s6e2-r1";
    const service = new DashboardService(prisma as unknown as PrismaService, app.get(FeatureFlagsService));
    const now = new Date();
    const fiveDaysAgo = new Date(+now - 5 * 86400000);
    try {
      for (const id of ["s6e2-legacy", "s6e2-pizza"]) {
        await prisma.analyticsEvent.createMany({ data: Array.from({ length: 510 }, () => ({
          restaurantId: tenant, type: "PRODUCT_VIEWED", metadata: { productId: id }, createdAt: fiveDaysAgo
        })) });
      }
      const today = await service.overview(tenant);
      expect(today.lists.topViewedProducts).toEqual([]);
      for (const days of ["7", "30"]) {
        const result = await service.overview(tenant, days);
        expect(result.lists.topViewedProducts.map(p => [p.id,p.views])).toEqual([["s6e2-legacy",510],["s6e2-pizza",510]]);
      }
      await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { deletedAt: now } });
      expect((await service.overview(tenant, "30")).lists.topViewedProducts.map(p => p.id)).toEqual(["s6e2-legacy"]);
      expect((await service.overview("s6e2-r2", "30")).lists.topViewedProducts).toEqual([]);
    } finally {
      await prisma.analyticsEvent.deleteMany({ where: { restaurantId: tenant, type: "PRODUCT_VIEWED", createdAt: fiveDaysAgo } });
      await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { deletedAt: null } });
    }
  });

  it("attributes valid product views to reports, without accepting foreign or mismatched product identities", async () => {
    const tenant = "s6e2-r1";
    const send = (productSlug: string, productId: string, eventId = randomUUID(), pathSlug = productSlug) =>
      fetch(`${origin}/public/menus/${tenant}/track`, { method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Mozilla" },
        body: JSON.stringify({ type: "PRODUCT_VIEWED", path: `/m/${tenant}/product/${pathSlug}`,
          eventId, metadata: { productId, productSlug, ignoredClientField: true } }) });
    const dashboard = new DashboardService(prisma as unknown as PrismaService, app.get(FeatureFlagsService));
    const products = new ProductsService(prisma as unknown as PrismaService, app.get(FeatureFlagsService), {} as never, app.get(ConfigService));
    const visitsBefore = (await dashboard.analytics(tenant)).visits;
    const historical = await prisma.analyticsEvent.create({ data: { restaurantId: tenant, type: "PRODUCT_VIEWED" } });
    await prisma.analyticsEvent.create({ data: { restaurantId: tenant, type: "PRODUCT_VIEWED", metadata: { productSlug: "legacy" } } });
    const first = randomUUID();
    expect((await send("legacy", "s6e2-legacy", first)).ok).toBe(true);
    expect((await send("legacy", "s6e2-legacy", first)).ok).toBe(true);
    expect((await send("pizza", "s6e2-pizza")).ok).toBe(true);
    expect((await send("legacy", "s6e2-foreign")).status).toBe(400);
    expect((await send("foreign", "s6e2-foreign")).status).toBe(400);
    expect((await send("legacy", "s6e2-legacy", randomUUID(), "pizza")).status).toBe(400);
    expect((await send("absent", "missing")).status).toBe(400);
    const overview = await dashboard.overview(tenant);
    expect(overview.lists.topViewedProducts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "s6e2-legacy", views: 2 }), expect.objectContaining({ id: "s6e2-pizza", views: 1 })
    ]));
    expect(overview.lists.topViewedProducts.filter(p => p.id === "s6e2-legacy")).toHaveLength(1);
    const listed = await products.list(tenant);
    expect(listed.data.find(p => p.id === "s6e2-legacy")?.views).toBe(2);
    const stored = await prisma.analyticsEvent.findMany({ where: { restaurantId: tenant, type: "PRODUCT_VIEWED", id: { not: historical.id } } });
    expect(stored.map(row => row.metadata)).toContainEqual({ productId: "s6e2-legacy", productSlug: "legacy" });
    const totals = await dashboard.analytics(tenant);
    expect(totals.visits).toBe(visitsBefore);
    expect(totals.conversionRate).toBe(totals.visits ? Number((100 * totals.whatsappClicks / totals.visits).toFixed(1)) : 0);
    expect((await dashboard.analytics("s6e2-r2")).conversionRate).toBe(0);
  });

  it("P0 tracks visible views idempotently across concurrent retries and tenants, never on reads/prefetch", async () => {
    const eventId = '11111111-1111-4111-8111-111111111111';
    const send = (slug: string, headers = {}) => fetch(`${origin}/public/menus/${slug}/track`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0', ...headers },
      body: JSON.stringify({ type: 'MENU_VIEWED', path: `/m/${slug}/menu`, eventId, clientId: '22222222-2222-4222-8222-222222222222' })
    });
    const before = await prisma.analyticsEvent.count({ where: { type: 'MENU_VIEWED' } });
    for (const suffix of ['', '?track=0', '?track=1']) {
      expect((await fetch(`${origin}/public/menus/s6e2-r1${suffix}`)).status).toBe(200);
    }
    await send('s6e2-r1', { purpose: 'prefetch' });
    await send('s6e2-r1', { 'user-agent': 'Googlebot' });
    expect(await prisma.analyticsEvent.count({ where: { type: 'MENU_VIEWED' } })).toBe(before);
    const responses = await Promise.all([send('s6e2-r1'), send('s6e2-r1'), send('s6e2-r1')]);
    expect(responses.every(r => r.ok)).toBe(true);
    await send('s6e2-r2');
    expect(await prisma.analyticsEvent.count({ where: { type: 'MENU_VIEWED' } })).toBe(before + 2);
  });

  it("saves and reloads a fixed delivery fee through the Dashboard settings service", async () => {
    const dashboard = new DashboardService(prisma as any, { assertFeature: async () => undefined } as any);
    const saved = await dashboard.updateSettings("s6e2-r1", { deliveryFee: "15.000000" });
    expect(saved.restaurant.deliveryFee).toBe("15");
    expect((await dashboard.settings("s6e2-r1")).restaurant.deliveryFee).toBe("15");
    const menu = await fetch(`${origin}/public/menus/s6e2-r1?track=0`);
    expect(menu.status).toBe(200);
    const menuBody = await menu.json() as Record<string, any>;
    expect(menuBody.restaurant?.deliveryFee ?? menuBody.data?.restaurant?.deliveryFee).toBe("15");
    const payload = request([networkLine], { fulfillmentType: "delivery", deliveryArea: "Area A",
      deliveryNear: "School", deliveryBeside: "Building 5" });
    const prepared = await prepare(payload);
    expect(prepared.status).toBe(200);
    expect(prepared.body.draft.deliveryFee).toBe("15");
    await dashboard.updateSettings("s6e2-r1", { deliveryFee: null });
    expect((await dashboard.settings("s6e2-r1")).restaurant.deliveryFee).toBeNull();
  });

  it("renders Network-only and Mixed HTTP messages in Arabic and English without repeated sizes or option prices", async () => {
    for (const locale of ["ar", "en"] as const) {
      for (const lines of [[networkLine], [legacyLine, networkLine]]) {
        const payload = request(lines, { locale, customerName: "Synthetic Customer" });
        const prepared = await prepare(payload);
        expect(prepared.status).toBe(200);
        const confirmed = await confirm(payload, prepared.body.acceptanceToken);
        expect(confirmed.status).toBe(200);
        const message = confirmed.body.message as string;
        expect(message).toContain("2 × ⁨Pizza Margherita⁩ — ⁨Medium⁩");
        expect(message).not.toMatch(/\d+\. 2 ×|📏 ⁨Sizes⁩ — ⁨Medium⁩/);
        expect(message).not.toMatch(/Cheese⁩ × \d+ —|BBQ⁩ × \d+ —|included|مشمول|مجاني/);
        expect(message).toContain("Cheese");
        expect(message).toContain("BBQ");
        expect(message).toContain("554.00001 EGP".replace("554.00001", lines.length === 1 ? "530.000008" : "554.00001"));
        expect(decodeURIComponent((confirmed.body.whatsappUrl as string).split("?text=")[1])).toBe(message);
      }
    }
  });

  it("uses stored Arabic product and option names in the confirmed HTTP message", async () => {
    const arabicPizza = structuredClone(pizza);
    if (!arabicPizza.groups[0].sizes || !arabicPizza.groups[1].options) throw new Error("Malformed pizza fixture");
    arabicPizza.groups[0].label = "الأحجام";
    arabicPizza.groups[0].sizes[1].label = "وسط";
    arabicPizza.groups[1].label = "الإضافات";
    arabicPizza.groups[1].options[0].label = "جبنة إضافية";
    arabicPizza.groups[1].options[0].children[0].label = "الصوصات";
    arabicPizza.groups[1].options[0].children[0].options[0].label = "صوص حار";
    await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { name: "بيتزا مارغريتا", configurationTree: arabicPizza } });
    for (const lines of [[networkLine], [legacyLine, networkLine]]) {
      const payload = request(lines, { customerName: "زبون تجريبي" });
      const prepared = await prepare(payload);
      expect(prepared.status).toBe(200);
      const confirmed = await confirm(payload, prepared.body.acceptanceToken);
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.message).toContain("2 × ⁨بيتزا مارغريتا⁩ — ⁨وسط⁩");
      expect(confirmed.body.message).toContain("جبنة إضافية");
      expect(confirmed.body.message).toContain("صوص حار");
      expect(confirmed.body.message).not.toMatch(/📏 ⁨الأحجام⁩ — ⁨وسط⁩|مجاني|مشمول/);
    }
  });

  it("formats repeated ORIGINAL and CUSTOM linked instances independently", async () => {
    const payload = request([comboLine]);
    const prepared = await prepare(payload);
    expect(prepared.status).toBe(200);
    expect(prepared.body.draft.totalAmount).toBe("43");
    const sent = await confirm(payload, prepared.body.acceptanceToken);
    expect(sent.status).toBe(200);
    expect(sent.body.message).toContain("Family Combo");
    expect(sent.body.message).toContain("Source Pizza");
    expect(sent.body.message).toContain("Small");
    expect(sent.body.message).toContain("Large");
    expect(sent.body.message.indexOf("First pizza")).toBeLessThan(sent.body.message.indexOf("Extra pizza"));
    expect(sent.body.message.indexOf("First pizza")).toBeLessThan(sent.body.message.indexOf("Second pizza"));
    expect(sent.body.message.indexOf("Second pizza")).toBeLessThan(sent.body.message.indexOf("Extra pizza"));
    expect(sent.body.message.match(/• 1 × ⁨(?:First|Second|Extra) pizza⁩ — ⁨Source Pizza⁩/g)).toHaveLength(3);
  });

  it("keeps identical trusted lines grouped beneath the WhatsApp URL limit", async () => {
    const lines = Array.from({ length: 49 }, (_, index) => ({ ...legacyLine,
      lineId: `long-${index}`, quantity: 1, note: "Long note ".repeat(50) }));
    const response = await prepare(request([...lines, networkLine]));
    expect(response.status).toBe(200);
    expect(response.body.messagePreview.match(/Legacy Salad/g)).toHaveLength(1);
    expect(response.body.messagePreview).toContain("49 × ⁨Legacy Salad⁩");
    expect(response.body.acceptanceToken).toBeDefined();
  });

  it("rejects a genuinely long ungroupable WhatsApp URL before acceptance", async () => {
    const lines = Array.from({ length: 49 }, (_, index) => ({ ...legacyLine,
      lineId: `long-${index}`, quantity: 1, note: `${"Long note ".repeat(48)}${index}` }));
    const before = await prisma.order.count();
    const response = await prepare(request([...lines, networkLine]));
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("WHATSAPP_MESSAGE_TOO_LONG");
    expect(response.body.acceptanceToken).toBeUndefined();
    expect(response.body.whatsappUrl).toBeUndefined();
    expect(await prisma.order.count()).toBe(before);
  });

  it("requires fresh acceptance after a price change and never sends the stale total", async () => {
    const payload = request([legacyLine, networkLine]);
    const prepared = await prepare(payload);
    await prisma.product.update({ where: { id: "s6e2-legacy" }, data: { basePrice: "13.000001" } });
    const stale = await confirm(payload, prepared.body.acceptanceToken);
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe("WHATSAPP_CHECKOUT_REQUIRES_ACCEPTANCE");
    expect(stale.body.changedDraft.totalAmount).toBe("556.00001");
    expect(stale.body.changedMessagePreview).toContain("556.00001 EGP");
    expect(stale.body.whatsappUrl).toBeUndefined();
    const accepted = await confirm(payload, stale.body.acceptanceToken);
    expect(accepted.status).toBe(200);
    expect(accepted.body.message).toContain("556.00001 EGP");
  });

  it("rejects stale revision, unavailable product, missing capability, foreign tenant and client totals", async () => {
    expect((await prepare(request([{ ...networkLine, selection: pizzaSelection(0) }]))).status).toBe(409);
    await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { isAvailable: false } });
    expect((await prepare(request([networkLine]))).status).toBe(409);
    await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { isAvailable: true } });
    await prisma.subscriptionFeature.update({ where: { id: "s6e2-network" }, data: { enabled: false } });
    expect((await prepare(request([networkLine]))).status).toBe(403);
    await prisma.subscriptionFeature.update({ where: { id: "s6e2-network" }, data: { enabled: true } });
    expect((await prepare(request([{ ...legacyLine, productSlug: "foreign" }, networkLine]))).status).toBe(409);
    expect((await prepare({ ...request([legacyLine, networkLine]), totalAmount: "1" })).status).toBe(400);
    expect((await prepare(request([legacyLine, networkLine]), "s6e2-r2")).status).toBe(409);
  });

  it("reports every invalid line and valid-line price drift without creating an Order", async () => {
    const before = await prisma.order.count();
    await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { isAvailable: false } });
    await prisma.product.update({ where: { id: "s6e2-source" }, data: { isAvailable: false } });
    await prisma.product.update({ where: { id: "s6e2-legacy" }, data: { basePrice: "13.000001" } });
    const result = await prepare(request([networkLine, comboLine, legacyLine]));
    expect(result.status).toBe(409);
    expect(result.body.error).toBe("WHATSAPP_CART_REVIEW_REQUIRED");
    expect(result.body.lineErrors).toEqual([
      expect.objectContaining({ lineId: networkLine.lineId, code: "WHATSAPP_PRODUCT_UNAVAILABLE" }),
      expect.objectContaining({ lineId: comboLine.lineId })
    ]);
    expect(result.body.priceChanges).toEqual([{
      lineId: legacyLine.lineId, previousUnitPrice: "12.000001", currentUnitPrice: "13.000001", quantity: 2
    }]);
    expect(result.body.acceptanceToken).toBeUndefined();
    expect(result.body.whatsappUrl).toBeUndefined();
    expect(await prisma.order.count()).toBe(before);
  });

  it("attributes one unavailable line without blaming the remaining mixed-cart lines", async () => {
    await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { isAvailable: false } });
    const result = await prepare(request([legacyLine, networkLine]));
    expect(result.status).toBe(409);
    expect(result.body.error).toBe("WHATSAPP_PRODUCT_UNAVAILABLE");
    expect(result.body.lineErrors).toEqual([expect.objectContaining({ lineId: networkLine.lineId })]);
    expect(result.body.priceChanges).toEqual([]);
  });

  it("prepares and confirms a six-line Mixed cart with two pizza configurations, linked combo, notes and quantities", async () => {
    const secondPizza = { ...networkLine, lineId: "network-pizza-large", quantity: 1,
      selection: { ...pizzaSelection(), groups: [
        { type: "SIZE", groupId: "sizes", sizeChoiceId: "large" },
        { type: "OPTIONS", groupId: "toppings", instances: [] }
      ] }, expectedUnitPrice: "300" };
    const sixLines = [
      { ...networkLine, lineId: "network-pizza-medium", quantity: 3, note: "test item note" },
      { ...comboLine, quantity: 3 },
      { ...networkLine, lineId: "network-pizza-small", quantity: 1,
        selection: { ...pizzaSelection(), groups: [
          { type: "SIZE", groupId: "sizes", sizeChoiceId: "small" },
          { type: "OPTIONS", groupId: "toppings", instances: [] }
        ] }, expectedUnitPrice: "100" },
      { ...legacyLine, quantity: 4 },
      secondPizza,
      { ...legacyLine, lineId: "legacy:second", quantity: 1, note: "second test note" }
    ];
    for (const fulfillmentType of ["pickup", "delivery"] as const) {
      const payload = request(sixLines, fulfillmentType === "delivery"
        ? { fulfillmentType, deliveryArea: "Test Area", deliveryNear: "Test Landmark" }
        : { fulfillmentType, pickupTime: "18:00" });
      const prepared = await prepare(payload);
      expect(prepared.status).toBe(200);
      expect(prepared.body.draft.items).toHaveLength(6);
      expect(prepared.body.draft.items.map((line: { lineId: string }) => line.lineId))
        .toEqual(sixLines.map((line) => line.lineId));
      expect(prepared.body.draft.items[0]).toMatchObject({ quantity: 3, note: "test item note" });
      const confirmed = await confirm(payload, prepared.body.acceptanceToken);
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.draft.items).toHaveLength(6);
      expect(confirmed.body.message).toContain(fulfillmentType === "delivery" ? "Test Area" : "18:00");
    }
  });

  it("keeps the public feature OFF by default and refuses a missing signing key", async () => {
    delete process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT;
    expect((await prepare(request([networkLine]))).status).toBe(403);
    process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT = "1";
    delete process.env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY;
    expect((await prepare(request([networkLine]))).status).toBe(503);
    process.env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY = randomBytes(32).toString("hex");
  });

  it("rejects direct HTTP price injection, wrong token, oversized text and invalid choices", async () => {
    const tampered = await prepare(request([{ ...legacyLine, unitPrice: "0" }, networkLine]));
    expect(tampered.status).toBe(400);
    const prepared = await prepare(request([legacyLine, networkLine]));
    expect(prepared.status).toBe(200);
    expect((await confirm(request([legacyLine, networkLine]), "v1.invalid.invalid")).status).toBe(409);
    expect((await prepare(request([{ ...networkLine, selection: {
      ...pizzaSelection(), groups: [{ type: "SIZE", groupId: "sizes", sizeChoiceId: "missing" }]
    } }]))).status).toBe(400);
    expect((await prepare(request([legacyLine, networkLine], { orderNote: "x".repeat(501) }))).status).toBe(400);
    expect((await prepare(request([legacyLine, networkLine], { orderNote: "injected\nproduct" }))).status).toBe(400);
  });

  it("fails closed when revision, availability, linked source or capability changes after prepare", async () => {
    const pizzaRequest = request([networkLine]);
    const prepared = await prepare(pizzaRequest);
    await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { configurationTree: { ...pizza, revision: 2 }, configurationVersion: 2 } });
    expect((await confirm(pizzaRequest, prepared.body.acceptanceToken)).status).toBe(409);
    await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { configurationTree: pizza, configurationVersion: 1 } });
    const available = await prepare(pizzaRequest);
    await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { isAvailable: false } });
    expect((await confirm(pizzaRequest, available.body.acceptanceToken)).status).toBe(409);
    await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { isAvailable: true } });
    const comboRequest = request([comboLine]);
    const linked = await prepare(comboRequest);
    await prisma.product.update({ where: { id: "s6e2-source" }, data: { configurationTree: { ...source, revision: 2 }, configurationVersion: 2 } });
    expect((await confirm(comboRequest, linked.body.acceptanceToken)).status).toBe(409);
    await prisma.product.update({ where: { id: "s6e2-source" }, data: { configurationTree: source, configurationVersion: 1 } });
    const enabled = await prepare(pizzaRequest);
    await prisma.subscriptionFeature.update({ where: { id: "s6e2-network" }, data: { enabled: false } });
    expect((await confirm(pizzaRequest, enabled.body.acceptanceToken)).status).toBe(403);
  });

  it("preserves the separate Legacy WhatsApp endpoint and rejects Network there", async () => {
    await setShowPrices(false);
    await prisma.restaurant.update({ where: { id: "s6e2-r1" }, data: { whatsappPhone: "+201000000000" } });
    const before = await prisma.order.count();
    const beforeEvents = await prisma.analyticsEvent.count({ where: { restaurantId: "s6e2-r1", type: "WHATSAPP_ORDER_CLICKED" } });
    const legacyBody = { items: [{ productSlug: "legacy", productId: "s6e2-legacy", expectedUnitPrice: "12.000001", quantity: 1 }], fulfillmentType: "pickup",
      customerName: "Synthetic Customer", customerPhone: "0000000000", orderNote: "Synthetic note" };
    const originalFlag = process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT;
    process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT = "0";
    const legacyOff = await fetch(`${origin}/public/menus/s6e2-r1/orders/whatsapp`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(legacyBody)
    });
    process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT = "1";
    const legacyOn = await fetch(`${origin}/public/menus/s6e2-r1/orders/whatsapp`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(legacyBody)
    });
    process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT = originalFlag;
    expect(legacyOff.status).toBe(201);
    expect(legacyOn.status).toBe(201);
    expect((await legacyOff.json() as { whatsappUrl: string }).whatsappUrl).toMatch(/^https:\/\/wa\.me\/201000000000\?text=/);
    expect((await legacyOn.json() as { whatsappUrl: string }).whatsappUrl).toMatch(/^https:\/\/wa\.me\/201000000000\?text=/);
    expect(await prisma.order.count()).toBe(before + 2);
    expect(await prisma.analyticsEvent.count({ where: { restaurantId: "s6e2-r1", type: "WHATSAPP_ORDER_CLICKED" } })).toBe(beforeEvents + 2);
    const saved = await prisma.order.findMany({ where: { restaurantId: "s6e2-r1", customerName: "Synthetic Customer" },
      orderBy: { createdAt: "desc" }, take: 2, include: { items: true } });
    expect(saved).toHaveLength(2);
    expect(saved.every((order) => order.items.length === 1 && order.customerPhone === "0000000000"
      && order.whatsappMessage?.includes("Synthetic note") && order.status === "PENDING_WHATSAPP")).toBe(true);
    const network = await fetch(`${origin}/public/menus/s6e2-r1/orders/whatsapp`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ productSlug: "pizza", productId: "s6e2-pizza", expectedUnitPrice: "100", quantity: 1 }] })
    });
    expect(network.status).toBe(400);
    expect(await prisma.order.count()).toBe(before + 2);
  });

  it("persists the unchanged Legacy order route with fixed, free and pending delivery fee messages", async () => {
    const body = { items: [{ productSlug: "legacy", productId: "s6e2-legacy", expectedUnitPrice: "12.000001", quantity: 1 }], fulfillmentType: "delivery",
      deliveryArea: "Area A", deliveryNear: "School", deliveryBeside: "Building 5" };
    const submitLegacy = async () => {
      const response = await fetch(`${origin}/public/menus/s6e2-r1/orders/whatsapp`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
      });
      return { status: response.status, body: await response.json() as Record<string, any> };
    };
    const before = await prisma.order.count();
    await setDeliveryFee("5");
    const fixed = await submitLegacy();
    expect(fixed.status).toBe(201);
    expect(fixed.body.message).toContain("رسوم التوصيل: 5 EGP");
    expect(fixed.body.message).toContain("الإجمالي: 17.00 EGP");
    await setDeliveryFee("0");
    const free = await submitLegacy();
    expect(free.status).toBe(201);
    expect(free.body.message).toContain("رسوم التوصيل: مجاني");
    await setDeliveryFee(null);
    const pending = await submitLegacy();
    expect(pending.status).toBe(201);
    expect(pending.body.message).toContain("رسوم التوصيل: تُحدّد حسب المنطقة");
    expect(pending.body.message).toContain("الإجمالي: يُحدّد بعد رسوم التوصيل");
    expect(await prisma.order.count()).toBe(before + 3);
  });

  it("rechecks quantity, notes, restaurant phone and confirmation binding", async () => {
    const payload = request([{ ...legacyLine, quantity: 3, note: "No onion" }, networkLine], { customerName: "Sample", customerPhone: "0000000000" });
    const prepared = await prepare(payload);
    expect(prepared.body.draft.items[0].lineTotal).toBe("36.000003");
    expect((await confirm({ ...payload, items: [{ ...legacyLine, quantity: 2 }, networkLine] }, prepared.body.acceptanceToken)).status).toBe(409);
    const confirmed = await confirm(payload, prepared.body.acceptanceToken);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.message).toContain("No onion");
    expect(confirmed.body.whatsappUrl).toContain("wa.me/201000000000");
    await prisma.restaurant.update({ where: { id: "s6e2-r1" }, data: { whatsappPhone: "201000000002" } });
    const stale = await confirm(payload, prepared.body.acceptanceToken);
    expect(stale.status).toBe(200);
    expect(stale.body.orderId).toBe(confirmed.body.orderId);
    expect(stale.body.whatsappUrl).toContain("wa.me/201000000000");
  });

  it("keeps a small concurrent trusted checkout wave numbered without duplicate numbers", async () => {
    const before = await prisma.order.count();
    const payload = request([legacyLine, networkLine]);
    const prepared = await Promise.all(Array.from({ length: 5 }, () => prepare(payload)));
    expect(prepared.some((result) => result.status === 200)).toBe(true);
    for (const result of prepared) {
      expect([200, 409]).toContain(result.status);
      if (result.status === 200) {
        expect(result.body.draft.totalAmount).toBe("554.00001");
      } else {
        expect(result.body.error).toBe("WHATSAPP_CHECKOUT_CONCURRENT_UPDATE");
        expect(JSON.stringify(result.body)).not.toMatch(/Prisma|P2034|40001|SELECT /);
      }
    }
    const confirmed = await Promise.all(prepared.filter((result) => result.status === 200)
      .map((result) => confirm(payload, result.body.acceptanceToken)));
    for (const result of confirmed) {
      expect([200, 409]).toContain(result.status);
      if (result.status === 200) expect(result.body.draft.totalAmount).toBe("554.00001");
      else expect(result.body.error).toBe("WHATSAPP_CHECKOUT_CONCURRENT_UPDATE");
    }
    const successful = confirmed.filter((result) => result.status === 200);
    expect(await prisma.order.count()).toBe(before + successful.length);
    expect(new Set(successful.map((result) => result.body.orderNumber)).size).toBe(successful.length);
  });

  it("replays one numbered Network order for concurrent confirms and response-loss retry", async () => {
    const payload = request([networkLine]);
    const prepared = await prepare(payload);
    expect(prepared.status).toBe(200);
    const key = `network-retry-${randomBytes(12).toString("hex")}`;
    const beforeOrders = await prisma.order.count();
    const beforeEvents = await prisma.analyticsEvent.count({ where: { type: "WHATSAPP_ORDER_CLICKED" } });
    const concurrent = await Promise.all(Array.from({ length: 3 }, () => confirm(payload, prepared.body.acceptanceToken, undefined, key)));
    expect(concurrent.every((result) => result.status === 200)).toBe(true);
    expect(new Set(concurrent.map((result) => result.body.orderId)).size).toBe(1);
    expect(new Set(concurrent.map((result) => result.body.orderNumber)).size).toBe(1);
    expect(concurrent[0].body.message).toContain(`طلب جديد رقم ${concurrent[0].body.orderNumber}`);
    expect(await prisma.order.count()).toBe(beforeOrders + 1);
    expect(await prisma.analyticsEvent.count({ where: { type: "WHATSAPP_ORDER_CLICKED" } })).toBe(beforeEvents + 1);
    const historical = concurrent[0].body.message + "\nالوقت: 2026/11/22، 12:45 م";
    await prisma.order.update({ where: { id: concurrent[0].body.orderId }, data: { whatsappMessage: historical } });
    const replayed = await confirm(payload, prepared.body.acceptanceToken, undefined, key);
    expect(replayed.body.message).toBe(historical);
    expect(replayed.body.orderId).toBe(concurrent[0].body.orderId);
    expect(replayed.body.replayed).toBe(true);
    const changed = await confirm({ ...payload, orderNote: "Changed" }, prepared.body.acceptanceToken, undefined, key);
    expect(changed.status).toBe(409);
    expect(changed.body.error).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("replays one numbered Legacy order for a double click and keeps a separate Mixed number", async () => {
    const key = `legacy-retry-${randomBytes(12).toString("hex")}`;
    const payload = { items: [{ productSlug: "legacy", productId: "s6e2-legacy", expectedUnitPrice: "12.000001", quantity: 1 }], fulfillmentType: "pickup", idempotencyKey: key };
    const beforeOrders = await prisma.order.count();
    const beforeEvents = await prisma.analyticsEvent.count({ where: { type: "WHATSAPP_ORDER_CLICKED" } });
    const legacy = await Promise.all(Array.from({ length: 2 }, () => fetch(`${origin}/public/menus/s6e2-r1/orders/whatsapp`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
    }).then(async (response) => ({ status: response.status, body: await response.json() as Record<string, any> }))));
    expect(legacy.every((result) => result.status === 201)).toBe(true);
    expect(legacy[0].body.orderId).toBe(legacy[1].body.orderId);
    expect(legacy[0].body.orderNumber).toBe(legacy[1].body.orderNumber);
    const mixedPayload = request([legacyLine, networkLine]);
    const prepared = await prepare(mixedPayload);
    const mixed = await confirm(mixedPayload, prepared.body.acceptanceToken, undefined,
      `mixed-${randomBytes(12).toString("hex")}`);
    expect(mixed.status).toBe(200);
    expect(mixed.body.orderNumber).not.toBe(legacy[0].body.orderNumber);
    expect(legacy[0].body.message).not.toMatch(/(?:الوقت|Time):/);
    expect(mixed.body.message).not.toMatch(/(?:الوقت|Time):/);
    expect(mixed.body.message).toContain(`طلب جديد رقم ${mixed.body.orderNumber}`);
    expect(await prisma.order.count()).toBe(beforeOrders + 2);
    expect(await prisma.analyticsEvent.count({ where: { type: "WHATSAPP_ORDER_CLICKED" } })).toBe(beforeEvents + 2);
  });

  it("rejects historical fractional SYP prices and formats a valid mixed draft without changing exact totals", async () => {
    const before = await prisma.order.count();
    const wholePizza = structuredClone(pizza);
    if (!wholePizza.groups[0].sizes || !wholePizza.groups[1].options) throw new Error("Malformed pizza fixture");
    wholePizza.groups[0].sizes[1].price = "200";
    wholePizza.groups[1].options[0].price = "30";
    wholePizza.groups[1].options[0].children[0].options[0].price = "5";
    try {
      await prisma.restaurant.update({ where: { id: "s6e2-r1" }, data: { currency: "SYP" } });
      await prisma.product.updateMany({ where: { restaurantId: "s6e2-r1" }, data: { currency: "SYP" } });
      const historicalInvalid = await prepare(request([legacyLine, networkLine]));
      expect(historicalInvalid.status).toBe(409);
      expect(historicalInvalid.body.lineErrors).toEqual(expect.arrayContaining([
        expect.objectContaining({ lineId: legacyLine.lineId, code: "INVALID_CURRENCY_PRICE" })
      ]));

      await prisma.product.update({ where: { id: "s6e2-legacy" }, data: { basePrice: "12" } });
      await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { configurationTree: wholePizza } });
      const valid = await prepare(request([
        { ...legacyLine, expectedUnitPrice: "12" },
        { ...networkLine, expectedUnitPrice: "265" }
      ]));
      expect(valid.status).toBe(200);
      expect(valid.body.draft.totalAmount).toBe("554");
      expect(valid.body.messagePreview).toContain("554 ل.س");
      expect(valid.body.messagePreview).not.toMatch(/554\.00|SYP/);

      const legacyOrder = await fetch(`${origin}/public/menus/s6e2-r1/orders/whatsapp`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: [{ productSlug: "legacy", productId: "s6e2-legacy", expectedUnitPrice: "12", quantity: 2 }], fulfillmentType: "pickup",
          customerName: "Synthetic SYP Customer", customerPhone: "0000000000" })
      });
      expect(legacyOrder.status).toBe(201);
      const legacyPayload = await legacyOrder.json() as { message: string };
      expect(legacyPayload.message).toContain("24 ل.س");
      expect(await prisma.order.count()).toBe(before + 1);

      await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { configurationTree: pizza } });
      const invalidNetwork = await prepare(request([networkLine]));
      expect(invalidNetwork.status).toBe(409);
      expect(await prisma.order.count()).toBe(before + 1);
    } finally {
      await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { configurationTree: pizza } });
      await prisma.product.update({ where: { id: "s6e2-legacy" }, data: { basePrice: "12.000001" } });
      await prisma.product.updateMany({ where: { restaurantId: "s6e2-r1" }, data: { currency: "EGP" } });
      await prisma.restaurant.update({ where: { id: "s6e2-r1" }, data: { currency: "EGP" } });
    }
  });
});
