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
if (url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55440"
    || parsed.pathname !== "/ordersawa_stage3_stage6e2_checkout") throw new Error("Disposable Stage 6E.2 database required");
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

  beforeAll(async () => {
    process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT = "1";
    process.env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY = randomBytes(32).toString("hex");
    await prisma.$connect();
    const identity = await prisma.$queryRaw<{ name: string; address: string; port: number }[]>`
      SELECT current_database() AS name, host(inet_server_addr()) AS address, inet_server_port() AS port`;
    expect(identity[0]).toMatchObject({ name: "ordersawa_stage3_stage6e2_checkout", address: "127.0.0.1", port: 55440 });
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

  it("prepares Legacy-only and confirms exact Decimal prices without a stored Order", async () => {
    const before = await prisma.order.count();
    const payload = request([legacyLine], { customerName: "Demo Customer", orderNote: "Less salt" });
    const prepared = await prepare(payload);
    expect(prepared.status).toBe(200);
    expect(prepared.body.draft.totalAmount).toBe("24.000002");
    const sent = await confirm(payload, prepared.body.acceptanceToken);
    expect(sent.status).toBe(200);
    expect(sent.body.whatsappUrl).toContain("https://wa.me/201000000000?text=");
    expect(decodeURIComponent(sent.body.whatsappUrl)).toContain("Legacy Salad");
    expect(sent.body.message).toContain("24.000002 EGP");
    expect(await prisma.order.count()).toBe(before);
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
    const lines = Array.from({ length: 50 }, (_, index) => ({ ...legacyLine,
      lineId: `long-${index}`, quantity: 1, note: "Long note ".repeat(50) }));
    const response = await prepare(request(lines));
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("WHATSAPP_MESSAGE_TOO_LONG");
    expect(response.body.acceptanceToken).toBeUndefined();
  });

  it("requires fresh acceptance after a price change and never sends the stale total", async () => {
    const payload = request([legacyLine]);
    const prepared = await prepare(payload);
    await prisma.product.update({ where: { id: "s6e2-legacy" }, data: { basePrice: "13.000001" } });
    const stale = await confirm(payload, prepared.body.acceptanceToken);
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe("WHATSAPP_CHECKOUT_REQUIRES_ACCEPTANCE");
    expect(stale.body.changedDraft.totalAmount).toBe("26.000002");
    expect(stale.body.changedMessagePreview).toContain("26.000002 EGP");
    expect(stale.body.whatsappUrl).toBeUndefined();
    const accepted = await confirm(payload, stale.body.acceptanceToken);
    expect(accepted.status).toBe(200);
    expect(accepted.body.message).toContain("26.000002 EGP");
  });

  it("rejects stale revision, unavailable product, missing capability, foreign tenant and client totals", async () => {
    expect((await prepare(request([{ ...networkLine, selection: pizzaSelection(0) }]))).status).toBe(409);
    await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { isAvailable: false } });
    expect((await prepare(request([networkLine]))).status).toBe(409);
    await prisma.product.update({ where: { id: "s6e2-pizza" }, data: { isAvailable: true } });
    await prisma.subscriptionFeature.update({ where: { id: "s6e2-network" }, data: { enabled: false } });
    expect((await prepare(request([networkLine]))).status).toBe(403);
    expect((await prepare(request([{ ...legacyLine, productSlug: "foreign" }]))).status).toBe(409);
    expect((await prepare({ ...request([legacyLine]), totalAmount: "1" })).status).toBe(400);
    expect((await prepare(request([legacyLine]), "s6e2-r2")).status).toBe(409);
  });

  it("keeps the public feature OFF by default and refuses a missing signing key", async () => {
    delete process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT;
    expect((await prepare(request([legacyLine]))).status).toBe(403);
    process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT = "1";
    delete process.env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY;
    expect((await prepare(request([legacyLine]))).status).toBe(503);
    process.env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY = randomBytes(32).toString("hex");
  });

  it("rejects direct HTTP price injection, wrong token, oversized text and invalid choices", async () => {
    const tampered = await prepare(request([{ ...legacyLine, unitPrice: "0" }]));
    expect(tampered.status).toBe(400);
    const prepared = await prepare(request([legacyLine]));
    expect((await confirm(request([legacyLine]), "v1.invalid.invalid")).status).toBe(409);
    expect((await prepare(request([{ ...networkLine, selection: {
      ...pizzaSelection(), groups: [{ type: "SIZE", groupId: "sizes", sizeChoiceId: "missing" }]
    } }]))).status).toBe(400);
    expect((await prepare(request([legacyLine], { orderNote: "x".repeat(501) }))).status).toBe(400);
    expect((await prepare(request([legacyLine], { orderNote: "injected\nproduct" }))).status).toBe(400);
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
    const before = await prisma.order.count();
    const legacy = await fetch(`${origin}/public/menus/s6e2-r1/orders/whatsapp`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ productSlug: "legacy", quantity: 1 }], fulfillmentType: "pickup" })
    });
    expect(legacy.status).toBe(201);
    expect(await prisma.order.count()).toBe(before + 1);
    const network = await fetch(`${origin}/public/menus/s6e2-r1/orders/whatsapp`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ productSlug: "pizza", quantity: 1 }] })
    });
    expect(network.status).toBe(400);
    expect(await prisma.order.count()).toBe(before + 1);
  });

  it("rechecks quantity, notes, restaurant phone and confirmation binding", async () => {
    const payload = request([{ ...legacyLine, quantity: 3, note: "No onion" }], { customerName: "Sample", customerPhone: "0000000000" });
    const prepared = await prepare(payload);
    expect(prepared.body.draft.totalAmount).toBe("36.000003");
    expect((await confirm({ ...payload, items: [{ ...legacyLine, quantity: 2 }] }, prepared.body.acceptanceToken)).status).toBe(409);
    const confirmed = await confirm(payload, prepared.body.acceptanceToken);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.message).toContain("No onion");
    expect(confirmed.body.whatsappUrl).toContain("wa.me/201000000000");
    await prisma.restaurant.update({ where: { id: "s6e2-r1" }, data: { whatsappPhone: "201000000002" } });
    const stale = await confirm(payload, prepared.body.acceptanceToken);
    expect(stale.status).toBe(409);
    expect(stale.body.changedDraft).toBeDefined();
  });
});
