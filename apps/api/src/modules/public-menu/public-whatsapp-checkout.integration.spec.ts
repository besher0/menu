import { INestApplication, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { ABO_MALEK_THEME } from "@menu/shared";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { PublicMenuController } from "./public-menu.controller";
import { PublicMenuService } from "./public-menu.service";
import { PublicWhatsappCheckoutService } from "./public-whatsapp-checkout.service";

const url = process.env.WHATSAPP_CHECKOUT_TEST_DATABASE_URL;
const disposableDatabase = url ? new URL(url) : undefined;
if (url) {
  const allowed = (disposableDatabase?.port === "55440" && disposableDatabase?.pathname === "/ordersawa_stage3_stage6e2_checkout")
    || (disposableDatabase?.port === "55447" && disposableDatabase?.pathname === "/ordersawa_stage3_showprices_guard");
  if (disposableDatabase?.hostname !== "127.0.0.1" || !allowed) throw new Error("Disposable checkout test database required");
}
const integration = url ? describe : describe.skip;

const pizza = { schemaVersion: 1, productId: "s6e2-pizza", revision: 1, basePrice: null,
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
const source = { schemaVersion: 1, productId: "s6e2-source", revision: 1, basePrice: null,
  groups: [{ type: "SIZE", id: "source-sizes", label: "Source sizes", sizes: [
    { id: "source-small", label: "Small", price: "100" }, { id: "source-large", label: "Large", price: "200" }
  ] }] };
const combo = { schemaVersion: 1, productId: "s6e2-combo", revision: 1, basePrice: "0",
  groups: [{ type: "OPTIONS", id: "slots", label: "Slots", min: 3, max: 3, includedQuantity: 0, options: [
    { id: "original", label: "First pizza", price: "10", maxQuantity: 2,
      linkedProduct: { sourceProductId: "s6e2-source", mode: "ORIGINAL", originalPriceOverrides: { "source-small": "5", "source-large": "8" } } },
    { id: "custom", label: "Extra pizza", price: "3", maxQuantity: 1,
      linkedProduct: { sourceProductId: "s6e2-source", mode: "CUSTOM", customConfiguration: {
        schemaVersion: 1, productId: "s6e2-source", revision: 1, basePrice: null,
        groups: [{ type: "SIZE", id: "custom-sizes", label: "Pizza sizes", sizes: [{ id: "custom-one", label: "Medium", price: "7" }] }]
      } } }
  ] }] };
const pizzaSelection = (revision = 1) => ({ schemaVersion: 1, productId: "s6e2-pizza", configurationRevision: revision, groups: [
  { type: "SIZE", groupId: "sizes", sizeChoiceId: "medium" },
  { type: "OPTIONS", groupId: "toppings", instances: [
    { instanceId: "cheese-1", optionId: "cheese", children: [{ type: "OPTIONS", groupId: "sauces", instances: [{ instanceId: "sauce-1", optionId: "bbq" }] }] },
    { instanceId: "cheese-2", optionId: "cheese" }, { instanceId: "cheese-3", optionId: "cheese" }
  ] }
] });
const comboSelection = () => ({ schemaVersion: 1, productId: "s6e2-combo", configurationRevision: 1, groups: [{
  type: "OPTIONS", groupId: "slots", instances: [
    { instanceId: "first", optionId: "original", linkedSelection: { schemaVersion: 1, productId: "s6e2-source", configurationRevision: 1,
      groups: [{ type: "SIZE", groupId: "source-sizes", sizeChoiceId: "source-small" }] } },
    { instanceId: "second", optionId: "original", linkedSelection: { schemaVersion: 1, productId: "s6e2-source", configurationRevision: 1,
      groups: [{ type: "SIZE", groupId: "source-sizes", sizeChoiceId: "source-large" }] } },
    { instanceId: "third", optionId: "custom", linkedSelection: { schemaVersion: 1, productId: "s6e2-source", configurationRevision: 1,
      groups: [{ type: "SIZE", groupId: "custom-sizes", sizeChoiceId: "custom-one" }] } }
  ]
}] });

const legacyLine = { mode: "LEGACY", lineId: "legacy:legacy", productSlug: "legacy", quantity: 2, expectedUnitPrice: "12.000001" };
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
  const confirm = (body: unknown, token: string, slug?: string) => post("confirm", { request: body, acceptanceToken: token }, slug);
  const setShowPrices = (showPrices: boolean) => prisma.restaurantThemeSettings.update({
    where: { restaurantId: "s6e2-r1" },
    data: { settings: { ...ABO_MALEK_THEME, dashboardSettings: { showPrices }, publicUi: { whatsappOrderingEnabled: true } } }
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
    await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { configurationTree: pizza, configurationVersion: 1, isAvailable: true } });
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
    expect(prepared.body.draft.totalAmount).toBe("554.00001");
    expect(prepared.body.messagePreview).toContain("Pizza Margherita");
    expect(prepared.body.messagePreview).toContain("BBQ");
    expect(prepared.body.messagePreview).toContain("554.00001 EGP");
    const sent = await confirm(payload, prepared.body.acceptanceToken);
    expect(sent.status).toBe(200);
    expect(sent.body.message).toContain("Pizza Margherita");
    expect(sent.body.message).toContain("Cheese");
    expect(sent.body.message).toContain("BBQ");
    expect(sent.body.message).toContain("Area A");
    expect(sent.body.message).toContain("554.00001 EGP");
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
  });

  it("rejects a WhatsApp URL that exceeds the safe length before acceptance", async () => {
    const lines = Array.from({ length: 49 }, (_, index) => ({ ...legacyLine,
      lineId: `long-${index}`, quantity: 1, note: "Long note ".repeat(50) }));
    const response = await prepare(request([...lines, networkLine]));
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("WHATSAPP_MESSAGE_TOO_LONG");
    expect(response.body.acceptanceToken).toBeUndefined();
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
    const before = await prisma.order.count();
    const beforeEvents = await prisma.analyticsEvent.count({ where: { restaurantId: "s6e2-r1", type: "WHATSAPP_ORDER_CLICKED" } });
    const legacyBody = { items: [{ productSlug: "legacy", quantity: 1 }], fulfillmentType: "pickup",
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
    expect(await prisma.order.count()).toBe(before + 2);
    expect(await prisma.analyticsEvent.count({ where: { restaurantId: "s6e2-r1", type: "WHATSAPP_ORDER_CLICKED" } })).toBe(beforeEvents + 2);
    const saved = await prisma.order.findMany({ where: { restaurantId: "s6e2-r1", customerName: "Synthetic Customer" },
      orderBy: { createdAt: "desc" }, take: 2, include: { items: true } });
    expect(saved).toHaveLength(2);
    expect(saved.every((order) => order.items.length === 1 && order.customerPhone === "0000000000"
      && order.whatsappMessage?.includes("Synthetic note") && order.status === "PENDING_WHATSAPP")).toBe(true);
    const network = await fetch(`${origin}/public/menus/s6e2-r1/orders/whatsapp`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ productSlug: "pizza", quantity: 1 }] })
    });
    expect(network.status).toBe(400);
    expect(await prisma.order.count()).toBe(before + 2);
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
    expect(stale.status).toBe(409);
    expect(stale.body.changedDraft).toBeDefined();
  });

  it("keeps a small concurrent trusted checkout wave safe without writing Orders", async () => {
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
    expect(await prisma.order.count()).toBe(before);
  });

  it("rejects historical fractional SYP prices and formats a valid mixed draft without changing exact totals", async () => {
    const before = await prisma.order.count();
    const wholePizza = JSON.parse(JSON.stringify(pizza)) as typeof pizza;
    wholePizza.groups[0].sizes[1].price = "200";
    wholePizza.groups[1].options[0].price = "30";
    wholePizza.groups[1].options[0].children[0].options[0].price = "5";
    try {
      await prisma.restaurant.update({ where: { id: "s6e2-r1" }, data: { currency: "SYP" } });
      await prisma.product.updateMany({ where: { restaurantId: "s6e2-r1" }, data: { currency: "SYP" } });
      const historicalInvalid = await prepare(request([legacyLine, networkLine]));
      expect(historicalInvalid.status).toBe(409);
      expect(historicalInvalid.body.error).toBe("INVALID_CURRENCY_PRICE");

      await prisma.product.update({ where: { id: "s6e2-legacy" }, data: { basePrice: "12" } });
      await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { configurationTree: wholePizza } });
      const valid = await prepare(request([
        { ...legacyLine, expectedUnitPrice: "12" },
        { ...networkLine, expectedUnitPrice: "265" }
      ]));
      expect(valid.status).toBe(200);
      expect(valid.body.draft.totalAmount).toBe("554");
      expect(valid.body.messagePreview).toContain("554 SYP");
      expect(valid.body.messagePreview).not.toContain("554.00 SYP");

      const legacyOrder = await fetch(`${origin}/public/menus/s6e2-r1/orders/whatsapp`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: [{ productSlug: "legacy", quantity: 2 }], fulfillmentType: "pickup",
          customerName: "Synthetic SYP Customer", customerPhone: "0000000000" })
      });
      expect(legacyOrder.status).toBe(201);
      const legacyPayload = await legacyOrder.json() as { message: string };
      expect(legacyPayload.message).toContain("24 SYP");
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
