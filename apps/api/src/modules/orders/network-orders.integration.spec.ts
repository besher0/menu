import { INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaClient, type Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NetworkOrderLoopbackGuard, NetworkOrdersController } from "./network-orders.controller";
import { NetworkOrdersService } from "./network-orders.service";
import { PrismaService } from "../prisma/prisma.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PublicMenuService } from "../public-menu/public-menu.service";
import { formatNetworkOrderWhatsappMessage } from "./network-order-whatsapp-formatter";

const databaseUrl = process.env.NETWORK_ORDER_TEST_DATABASE_URL;
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (!(["127.0.0.1", "localhost"].includes(parsed.hostname) && parsed.port === "55440"
    && parsed.pathname.startsWith("/ordersawa_stage3_stage6c_"))) {
    throw new Error("Stage 6C tests refuse non-disposable database URLs");
  }
}
const integration = databaseUrl ? describe : describe.skip;

const pizza = {
  schemaVersion: 1, productId: "s6c-pizza", revision: 1, basePrice: null,
  groups: [
    { type: "SIZE", id: "sizes", label: "Sizes", sizes: [
      { id: "small", label: "Small", price: "100" },
      { id: "medium", label: "Medium", price: "200.000001" }
    ] },
    { type: "OPTIONS", id: "toppings", label: "Toppings", min: 0, max: 3, includedQuantity: 1,
      options: [{ id: "cheese", label: "Cheese", price: "30.000001", maxQuantity: 3,
        children: [{ type: "OPTIONS", id: "sauces", label: "Sauces", min: 0, max: 1, includedQuantity: 0,
          options: [{ id: "bbq", label: "BBQ", price: "5.000001", maxQuantity: 1 }] }] }] }
  ]
};
const source = { schemaVersion: 1, productId: "s6c-source", revision: 1, basePrice: null,
  groups: [{ type: "SIZE", id: "source-sizes", label: "Source sizes", sizes: [
    { id: "source-small", label: "Small", price: "100" },
    { id: "source-large", label: "Large", price: "200" }
  ] }] };
const combo = { schemaVersion: 1, productId: "s6c-combo", revision: 1, basePrice: "0",
  groups: [{ type: "OPTIONS", id: "slots", label: "Slots", min: 3, max: 3, includedQuantity: 0, options: [
    { id: "original", label: "First pizza", price: "10", maxQuantity: 2,
      linkedProduct: { sourceProductId: "s6c-source", mode: "ORIGINAL", originalPriceOverrides: { "source-small": "5", "source-large": "8" } } },
    { id: "custom", label: "Extra pizza", price: "3", maxQuantity: 1,
      linkedProduct: { sourceProductId: "s6c-source", mode: "CUSTOM", customConfiguration: {
        schemaVersion: 1, productId: "s6c-source", revision: 1, basePrice: null,
        groups: [{ type: "SIZE", id: "custom-sizes", label: "Pizza sizes", sizes: [{ id: "custom-one", label: "Medium", price: "7" }] }]
      } } }
  ] }] };

function pizzaSelection(revision = 1) {
  return { schemaVersion: 1, productId: "s6c-pizza", configurationRevision: revision, groups: [
    { type: "SIZE", groupId: "sizes", sizeChoiceId: "medium" },
    { type: "OPTIONS", groupId: "toppings", instances: [
      { instanceId: "cheese-1", optionId: "cheese", children: [{ type: "OPTIONS", groupId: "sauces", instances: [{ instanceId: "sauce-1", optionId: "bbq" }] }] },
      { instanceId: "cheese-2", optionId: "cheese" },
      { instanceId: "cheese-3", optionId: "cheese" }
    ] }
  ] };
}

function comboSelection() {
  return { schemaVersion: 1, productId: "s6c-combo", configurationRevision: 1, groups: [{
    type: "OPTIONS", groupId: "slots", instances: [
      { instanceId: "original-1", optionId: "original", linkedSelection: { schemaVersion: 1, productId: "s6c-source", configurationRevision: 1, groups: [{ type: "SIZE", groupId: "source-sizes", sizeChoiceId: "source-small" }] } },
      { instanceId: "original-2", optionId: "original", linkedSelection: { schemaVersion: 1, productId: "s6c-source", configurationRevision: 1, groups: [{ type: "SIZE", groupId: "source-sizes", sizeChoiceId: "source-large" }] } },
      { instanceId: "custom-1", optionId: "custom", linkedSelection: { schemaVersion: 1, productId: "s6c-source", configurationRevision: 1, groups: [{ type: "SIZE", groupId: "custom-sizes", sizeChoiceId: "custom-one" }] } }
    ]
  }] };
}

const pizzaDraft = () => ({ locale: "ar", items: [{ productId: "s6c-pizza", quantity: 2, selection: pizzaSelection() }] });
const comboDraft = () => ({ locale: "ar", items: [{ productId: "s6c-combo", quantity: 1, selection: comboSelection() }] });

integration("Stage 6C disposable PostgreSQL HTTP and transaction integration", () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  let app: INestApplication;
  let origin: string;
  const previousFlag = process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS;

  async function post(path: string, body: unknown) {
    const response = await fetch(`${origin}/public/menus/${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() as Record<string, any> };
  }
  const prepare = (body: unknown = pizzaDraft(), restaurant = "s6c-r1") => post(`${restaurant}/orders/network-test/prepare`, body);
  const create = (body: unknown, restaurant = "s6c-r1") => post(`${restaurant}/orders/network-test`, body);
  async function preview(orderId: string, restaurant = "s6c-r1") {
    const response = await fetch(`${origin}/public/menus/${restaurant}/orders/network-test/${encodeURIComponent(orderId)}/preview`);
    return { status: response.status, body: await response.json() as Record<string, any> };
  }

  beforeAll(async () => {
    process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS = "1";
    await prisma.$connect();
    await prisma.$executeRawUnsafe('TRUNCATE "OrderItem", "Order" RESTART IDENTITY CASCADE');
    await prisma.analyticsEvent.deleteMany();
    await prisma.productConfigurationDependency.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.restaurantSubscription.deleteMany();
    await prisma.subscriptionFeature.deleteMany();
    await prisma.subscriptionPlan.deleteMany();
    await prisma.restaurant.deleteMany();
    await prisma.restaurant.createMany({ data: [
      { id: "s6c-r1", slug: "s6c-r1", name: "Stage 6C Restaurant", currency: "EGP", whatsappPhone: "201000000000" },
      { id: "s6c-r2", slug: "s6c-r2", name: "Other Restaurant", currency: "EGP" }
    ] });
    await prisma.subscriptionPlan.create({ data: {
      id: "s6c-plan", key: "S6C_TEST", name: "Stage 6C disposable plan",
      features: { create: [
        { id: "s6c-feature", key: "PRODUCT_CONFIGURATION", enabled: true },
        { id: "s6c-whatsapp-feature", key: "WHATSAPP_ORDERING", enabled: true }
      ] }
    } });
    await prisma.restaurantSubscription.create({ data: {
      id: "s6c-sub", restaurantId: "s6c-r1", planId: "s6c-plan", status: "ACTIVE", startsAt: new Date("2026-01-01T00:00:00Z")
    } });
    await prisma.product.createMany({ data: [
      { id: "s6c-pizza", restaurantId: "s6c-r1", slug: "pizza", name: "Pizza Margherita", currency: "EGP", basePrice: null, configurationVersion: 1, configurationTree: pizza },
      { id: "s6c-source", restaurantId: "s6c-r1", slug: "source", name: "Source Pizza", currency: "EGP", basePrice: null, configurationVersion: 1, configurationTree: source },
      { id: "s6c-combo", restaurantId: "s6c-r1", slug: "combo", name: "Combo", currency: "EGP", basePrice: "0", configurationVersion: 1, configurationTree: combo },
      { id: "s6c-legacy", restaurantId: "s6c-r1", slug: "legacy", name: "Legacy Zero", currency: "EGP", basePrice: "0", configurationVersion: 0 },
      { id: "s6c-foreign", restaurantId: "s6c-r2", slug: "foreign", name: "Foreign", currency: "EGP", basePrice: "1" }
    ] });
    @Module({ controllers: [NetworkOrdersController], providers: [NetworkOrdersService, NetworkOrderLoopbackGuard, { provide: PrismaService, useValue: prisma }] })
    class TestModule {}
    app = await NestFactory.create(TestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    origin = await app.getUrl();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "OrderItem", "Order" RESTART IDENTITY CASCADE');
    await prisma.product.update({ where: { id: "s6c-pizza" }, data: {
      name: "Pizza Margherita", configurationTree: pizza, configurationVersion: 1, isAvailable: true, isActive: true, deletedAt: null
    } });
    await prisma.product.update({ where: { id: "s6c-source" }, data: {
      configurationTree: source, configurationVersion: 1, isAvailable: true, isActive: true, deletedAt: null
    } });
    await prisma.product.update({ where: { id: "s6c-combo" }, data: {
      configurationTree: combo, configurationVersion: 1, isAvailable: true, isActive: true, deletedAt: null
    } });
    await prisma.subscriptionFeature.update({ where: { id: "s6c-feature" }, data: { enabled: true } });
    await prisma.restaurant.update({ where: { id: "s6c-r1" }, data: { name: "Stage 6C Restaurant", currency: "EGP" } });
  });

  afterAll(async () => {
    if (app) await app.close();
    await prisma.$disconnect();
    if (previousFlag === undefined) delete process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS;
    else process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS = previousFlag;
  });

  it("creates a decimal-safe Pizza order with nested, included, quantity, and immutable snapshot", async () => {
    const prepared = await prepare();
    expect(prepared.status).toBe(200);
    expect(prepared.body.draft.items[0]).toMatchObject({ unitPrice: "265.000004", lineTotal: "530.000008", configurationRevision: 1 });
    const result = await create({ ...pizzaDraft(), idempotencyKey: randomUUID(), acceptanceToken: prepared.body.acceptanceToken });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ totalAmount: "530.000008", status: "VALIDATED_TEST", orderingEnabled: false });
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: result.body.orderId }, include: { items: true } });
    expect(stored.totalAmount.toString()).toBe("530.000008");
    expect(stored.whatsappMessage).toBeNull();
    expect(stored.items[0].options).toMatchObject({
      mode: "NETWORK", configurationRevision: 1, productName: "Pizza Margherita",
      canonicalSelection: { groups: expect.arrayContaining([expect.objectContaining({ type: "SIZE" })]) },
      priceBreakdown: expect.arrayContaining([expect.objectContaining({ label: "Cheese", included: true })])
    });
    await prisma.product.update({ where: { id: "s6c-pizza" }, data: { name: "Renamed Pizza" } });
    const historic = await prisma.orderItem.findUniqueOrThrow({ where: { id: stored.items[0].id } });
    expect(historic.name).toBe("Pizza Margherita");
    expect(historic.options).toEqual(stored.items[0].options);
    const historicalMessage = formatNetworkOrderWhatsappMessage(stored.cartSnapshot);
    expect(historicalMessage).toContain("Pizza Margherita");
    expect(historicalMessage).toContain("Cheese");
    expect(historicalMessage).not.toContain("Renamed Pizza");
    await expect(prisma.orderItem.update({ where: { id: historic.id }, data: { name: "tampered" } })).rejects.toThrow();
    await expect(prisma.orderItem.update({ where: { id: historic.id }, data: { productId: null } })).rejects.toThrow();
    await expect(prisma.order.update({ where: { id: stored.id }, data: { totalAmount: "1" } })).rejects.toThrow();
    await expect(prisma.order.delete({ where: { id: stored.id } })).rejects.toThrow();
    await expect(prisma.orderItem.delete({ where: { id: historic.id } })).rejects.toThrow();
    await expect(prisma.orderItem.create({ data: {
      orderId: stored.id, productId: "s6c-pizza", name: "Late item", quantity: 1,
      unitPrice: "1", totalPrice: "1"
    } })).rejects.toThrow();
  });

  it("stores repeated ORIGINAL instances and CUSTOM snapshot independently", async () => {
    const prepared = await prepare(comboDraft());
    expect(prepared.status).toBe(200);
    const line = prepared.body.draft.items[0];
    expect(line.canonicalSelection.groups[0].instances).toHaveLength(3);
    expect(line.linkedSources).toEqual(expect.arrayContaining([expect.objectContaining({ productName: "Source Pizza" })]));
    const result = await create({ ...comboDraft(), idempotencyKey: randomUUID(), acceptanceToken: prepared.body.acceptanceToken });
    expect(result.status).toBe(201);
    const savedOrder = await prisma.order.findUniqueOrThrow({ where: { id: result.body.orderId } });
    const comboMessage = formatNetworkOrderWhatsappMessage(savedOrder.cartSnapshot);
    expect(comboMessage).toContain("اختيارات المكوّن 1");
    expect(comboMessage).toContain("اختيارات المكوّن 2");
    expect(comboMessage).toContain("اختيارات المكوّن 3");
    expect(comboMessage).toContain("Source Pizza");
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: result.body.orderId } });
    expect((item.options as any).canonicalSelection.groups[0].instances.map((instance: any) => instance.instanceId)).toEqual(["custom-1", "original-1", "original-2"]);
    expect((item.options as any).configurationTree.groups[0].options).toEqual(expect.arrayContaining([expect.objectContaining({ linkedProduct: expect.objectContaining({ mode: "CUSTOM" }) })]));
  });

  it("persists two differently configured lines for one Product ID without slug deduplication", async () => {
    const small = { ...pizzaSelection(), groups: [
      { type: "SIZE", groupId: "sizes", sizeChoiceId: "small" },
      { type: "OPTIONS", groupId: "toppings", instances: [] }
    ] };
    const request = { locale: "ar", items: [
      { productId: "s6c-pizza", quantity: 1, selection: pizzaSelection() },
      { productId: "s6c-pizza", quantity: 1, selection: small }
    ] };
    const prepared = await prepare(request);
    expect(prepared.status).toBe(200);
    expect(prepared.body.draft.totalAmount).toBe("365.000004");
    const created = await create({ ...request, idempotencyKey: randomUUID(), acceptanceToken: prepared.body.acceptanceToken });
    expect(created.status).toBe(201);
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: created.body.orderId }, include: { items: true } });
    expect(stored.items).toHaveLength(2);
    expect(new Set(stored.items.map((item) => (item.options as any).selectionKey)).size).toBe(2);
  });

  it.each([[10, "2650.00004"], [50, "13250.0002"]])(
    "persists and seals %i independently validated Network lines", async (lineCount, expectedTotal) => {
      const request = { locale: "ar", items: Array.from({ length: lineCount }, () => ({
        productId: "s6c-pizza", quantity: 1, selection: pizzaSelection()
      })) };
      const prepared = await prepare(request);
      expect(prepared.status).toBe(200);
      expect(prepared.body.draft.totalAmount).toBe(expectedTotal);
      const created = await create({ ...request, idempotencyKey: randomUUID(), acceptanceToken: prepared.body.acceptanceToken });
      expect(created.status).toBe(201);
      expect(created.body.totalAmount).toBe(expectedTotal);
      const saved = await prisma.order.findUniqueOrThrow({ where: { id: created.body.orderId }, include: { items: true } });
      expect(saved.networkSnapshotSealedAt).not.toBeNull();
      expect(saved.totalAmount.toString()).toBe(expectedTotal);
      expect(saved.items).toHaveLength(lineCount);
      expect((saved.cartSnapshot as any).items).toHaveLength(lineCount);
      expect(saved.items.every((item) => (item.options as any).unitPrice === "265.000004")).toBe(true);
    }
  );

  it("persists fictitious customer, delivery, address and notes in the sealed snapshot and previews the saved Pizza", async () => {
    const request = { ...pizzaDraft(), customerName: "Demo Customer", customerPhone: "0000000000",
      fulfillmentType: "delivery", deliveryArea: "Demo district", deliveryNear: "Park", deliveryBeside: "Gate",
      orderNote: "Pack sauce separately", items: [{ ...pizzaDraft().items[0], note: "No onion" }] };
    const prepared = await prepare(request);
    expect(prepared.status).toBe(200);
    const created = await create({ ...request, idempotencyKey: randomUUID(), acceptanceToken: prepared.body.acceptanceToken });
    expect(created.status).toBe(201);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: created.body.orderId }, include: { items: true } });
    expect(saved.customerName).toBe("Demo Customer");
    expect(saved.customerPhone).toBe("0000000000");
    expect(saved.items[0].note).toBe("No onion");
    expect((saved.cartSnapshot as any).orderDetails).toMatchObject({ restaurantName: "Stage 6C Restaurant",
      fulfillmentType: "delivery", deliveryArea: "Demo district", orderNote: "Pack sauce separately" });
    await prisma.restaurant.update({ where: { id: "s6c-r1" }, data: { name: "New restaurant name" } });
    const message = formatNetworkOrderWhatsappMessage(saved.cartSnapshot);
    const httpPreview = await preview(saved.id);
    expect(httpPreview.status).toBe(200);
    expect(httpPreview.body).toMatchObject({ message, totalAmount: "530.000008", fromSealedSnapshot: true, orderingEnabled: false });
    expect((await preview(saved.id, "s6c-r2")).status).toBe(404);
    expect((await preview("missing-order")).status).toBe(404);
    expect(message).toContain("Stage 6C Restaurant");
    expect(message).not.toContain("New restaurant name");
    expect(message).toContain("Demo Customer");
    expect(message).toContain("No onion");
    expect(message).toContain("530.000008 EGP");
    await expect(prisma.order.update({ where: { id: saved.id }, data: { customerName: "Changed" } })).rejects.toThrow();
    await expect(prisma.order.update({ where: { id: saved.id }, data: { cartSnapshot: { changed: true } } })).rejects.toThrow();
    if (process.env.PRINT_NETWORK_ORDER_PREVIEW === "1") process.stdout.write(`\n--- STORED PIZZA ---\n${message}\n`);
  });

  it("persists pickup details for an independently selected repeated Combo", async () => {
    const request = { ...comboDraft(), customerName: "Demo Guest", fulfillmentType: "pickup", pickupTime: "6 PM" };
    const prepared = await prepare(request);
    expect(prepared.status).toBe(200);
    const created = await create({ ...request, idempotencyKey: randomUUID(), acceptanceToken: prepared.body.acceptanceToken });
    expect(created.status).toBe(201);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: created.body.orderId } });
    const message = formatNetworkOrderWhatsappMessage(saved.cartSnapshot);
    expect(message).toContain("Demo Guest");
    expect(message).toContain("6 PM");
    expect(message).toContain("اختيارات المكوّن 3");
    expect(message).not.toContain("CUSTOM");
    if (process.env.PRINT_NETWORK_ORDER_PREVIEW === "1") process.stdout.write(`\n--- STORED COMBO ---\n${message}\n`);
  });

  it("binds customer details to explicit acceptance and rejects malformed address input before persistence", async () => {
    const request = { ...pizzaDraft(), customerName: "Demo Guest", fulfillmentType: "pickup" };
    const prepared = await prepare(request);
    expect(prepared.status).toBe(200);
    const changed = await create({ ...request, customerName: "Other Guest", idempotencyKey: randomUUID(),
      acceptanceToken: prepared.body.acceptanceToken });
    expect(changed.status).toBe(409);
    expect(changed.body.error).toBe("NETWORK_ORDER_REQUIRES_NEW_ACCEPTANCE");
    expect(await prisma.order.count()).toBe(0);
    expect((await prepare({ ...request, fulfillmentType: "delivery" })).status).toBe(400);
    expect((await prepare({ ...request, orderNote: "Forged\nline" })).status).toBe(400);
    expect(await prisma.order.count()).toBe(0);
  });

  it("rejects client monetary fields and cross-restaurant or Legacy products", async () => {
    expect((await prepare({ ...pizzaDraft(), totalAmount: "1" })).status).toBe(400);
    expect((await prepare({ locale: "ar", items: [{ productId: "s6c-pizza", quantity: 1, selection: { ...pizzaSelection(), trustedTotal: "1" } }] })).status).toBe(400);
    expect((await prepare({ locale: "ar", items: [{ productId: "s6c-foreign", quantity: 1,
      selection: { schemaVersion: 1, productId: "s6c-foreign", configurationRevision: 1, groups: [] } }] })).status).toBe(404);
    expect((await prepare({ locale: "ar", items: [{ productId: "s6c-legacy", quantity: 1,
      selection: { schemaVersion: 1, productId: "s6c-legacy", configurationRevision: 0, groups: [] } }] })).status).toBe(409);
    expect(await prisma.order.count()).toBe(0);
  });

  it("rejects missing and cross-restaurant linked sources without creating an order", async () => {
    for (const sourceProductId of ["does-not-exist", "s6c-foreign"]) {
      const altered = structuredClone(combo) as any;
      altered.groups[0].options[0].linkedProduct.sourceProductId = sourceProductId;
      altered.groups[0].options[1].linkedProduct.sourceProductId = sourceProductId;
      await prisma.product.update({ where: { id: "s6c-combo" }, data: { configurationTree: altered } });
      const selected = comboSelection() as any;
      for (const instance of selected.groups[0].instances) instance.linkedSelection.productId = sourceProductId;
      const result = await prepare({ locale: "ar", items: [{ productId: "s6c-combo", quantity: 1, selection: selected }] });
      expect(result.status).toBe(409);
      expect(await prisma.order.count()).toBe(0);
    }
  });

  it("requires exact signed acceptance and reports a new quote after a price change", async () => {
    const prepared = await prepare();
    const changed = structuredClone(pizza);
    changed.groups[0].sizes[1].price = "210.000001";
    await prisma.product.update({ where: { id: "s6c-pizza" }, data: { configurationTree: changed } });
    const attempt = await create({ ...pizzaDraft(), idempotencyKey: randomUUID(), acceptanceToken: prepared.body.acceptanceToken });
    expect(attempt.status).toBe(409);
    expect(attempt.body).toMatchObject({ error: "NETWORK_ORDER_REQUIRES_NEW_ACCEPTANCE", requiresCustomerAcceptance: true,
      changedQuote: { totalAmount: "550.000008" } });
    expect(await prisma.order.count()).toBe(0);
    const accepted = await create({ ...pizzaDraft(), idempotencyKey: randomUUID(), acceptanceToken: attempt.body.acceptanceToken });
    expect(accepted.status).toBe(201);
  });

  it("returns conflicts for revision, availability, source changes, capability loss and unsatisfiable requirements", async () => {
    const prepared = await prepare();
    await prisma.product.update({ where: { id: "s6c-pizza" }, data: { configurationTree: { ...pizza, revision: 2 }, configurationVersion: 2 } });
    expect((await create({ ...pizzaDraft(), idempotencyKey: randomUUID(), acceptanceToken: prepared.body.acceptanceToken })).status).toBe(409);
    await prisma.product.update({ where: { id: "s6c-pizza" }, data: { configurationTree: pizza, configurationVersion: 1, isAvailable: false } });
    expect((await prepare()).status).toBe(409);
    await prisma.product.update({ where: { id: "s6c-pizza" }, data: { isAvailable: true } });
    const comboPrepared = await prepare(comboDraft());
    expect(comboPrepared.status).toBe(200);
    await prisma.product.update({ where: { id: "s6c-source" }, data: { configurationTree: { ...source, revision: 2 }, configurationVersion: 2 } });
    expect((await create({ ...comboDraft(), idempotencyKey: randomUUID(), acceptanceToken: comboPrepared.body.acceptanceToken })).status).toBe(409);
    await prisma.product.update({ where: { id: "s6c-source" }, data: { isAvailable: false } });
    expect((await prepare(comboDraft())).status).toBe(409);
    await prisma.subscriptionFeature.update({ where: { id: "s6c-feature" }, data: { enabled: false } });
    expect((await prepare()).status).toBe(403);
    expect(await prisma.order.count()).toBe(0);
  });

  it("replays the same idempotency key after timeout or capability loss and rejects changed payloads", async () => {
    const prepared = await prepare();
    const key = randomUUID();
    const request = { ...pizzaDraft(), idempotencyKey: key, acceptanceToken: prepared.body.acceptanceToken };
    const first = await create(request);
    expect(first.status).toBe(201);
    await prisma.subscriptionFeature.update({ where: { id: "s6c-feature" }, data: { enabled: false } });
    const replay = await create(request);
    expect(replay.body).toMatchObject({ orderId: first.body.orderId, replayed: true });
    expect((await create({ ...request, locale: "en" })).status).toBe(409);
    expect(await prisma.order.count()).toBe(1);
  });

  it("handles two concurrent submissions and prevents reusing an acceptance token with a new key", async () => {
    const prepared = await prepare();
    const request = { ...pizzaDraft(), idempotencyKey: randomUUID(), acceptanceToken: prepared.body.acceptanceToken };
    const [first, second] = await Promise.all([create(request), create(request)]);
    expect([first.status, second.status].sort()).toEqual([201, 201]);
    expect(first.body.orderId).toBe(second.body.orderId);
    expect((await create({ ...request, idempotencyKey: randomUUID() })).status).toBe(409);
    expect(await prisma.order.count()).toBe(1);
  });

  it("does not save an order when an ordinary Product update wins the row lock race", async () => {
    const prepared = await prepare();
    let release!: () => void;
    let locked!: () => void;
    const lockedSignal = new Promise<void>((resolve) => { locked = resolve; });
    const releaseSignal = new Promise<void>((resolve) => { release = resolve; });
    const writer = prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = 's6c-pizza' FOR UPDATE`;
      locked();
      await releaseSignal;
      await transaction.product.update({ where: { id: "s6c-pizza" }, data: {
        configurationTree: { ...pizza, revision: 2 }, configurationVersion: 2
      } });
    }, { timeout: 10_000 });
    await lockedSignal;
    const pending = create({ ...pizzaDraft(), idempotencyKey: randomUUID(), acceptanceToken: prepared.body.acceptanceToken });
    await new Promise((resolve) => setTimeout(resolve, 60));
    release();
    await writer;
    const result = await pending;
    expect(result.status).toBe(409);
    expect(await prisma.order.count()).toBe(0);
  });

  it("does not save a Combo when a linked source changes concurrently", async () => {
    const prepared = await prepare(comboDraft());
    let release!: () => void;
    let locked!: () => void;
    const lockedSignal = new Promise<void>((resolve) => { locked = resolve; });
    const releaseSignal = new Promise<void>((resolve) => { release = resolve; });
    const writer = prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = 's6c-source' FOR UPDATE`;
      locked();
      await releaseSignal;
      await transaction.product.update({ where: { id: "s6c-source" }, data: {
        configurationTree: { ...source, revision: 2 }, configurationVersion: 2
      } });
    }, { timeout: 10_000 });
    await lockedSignal;
    const pending = create({ ...comboDraft(), idempotencyKey: randomUUID(), acceptanceToken: prepared.body.acceptanceToken });
    await new Promise((resolve) => setTimeout(resolve, 60));
    release();
    await writer;
    expect((await pending).status).toBe(409);
    expect(await prisma.order.count()).toBe(0);
  });

  it("does not save an order when Product availability or package capability changes concurrently", async () => {
    for (const target of ["PRODUCT", "CAPABILITY"] as const) {
      const prepared = await prepare();
      let release!: () => void;
      let locked!: () => void;
      const lockedSignal = new Promise<void>((resolve) => { locked = resolve; });
      const releaseSignal = new Promise<void>((resolve) => { release = resolve; });
      const writer = prisma.$transaction(async (transaction) => {
        if (target === "PRODUCT") {
          await transaction.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = 's6c-pizza' FOR UPDATE`;
        } else {
          await transaction.$queryRaw`SELECT "id" FROM "SubscriptionFeature" WHERE "id" = 's6c-feature' FOR UPDATE`;
        }
        locked();
        await releaseSignal;
        if (target === "PRODUCT") await transaction.product.update({ where: { id: "s6c-pizza" }, data: { isAvailable: false } });
        else await transaction.subscriptionFeature.update({ where: { id: "s6c-feature" }, data: { enabled: false } });
      }, { timeout: 10_000 });
      await lockedSignal;
      const pending = create({ ...pizzaDraft(), idempotencyKey: randomUUID(), acceptanceToken: prepared.body.acceptanceToken });
      await new Promise((resolve) => setTimeout(resolve, 60));
      release();
      await writer;
      expect([403, 409]).toContain((await pending).status);
      expect(await prisma.order.count()).toBe(0);
      await prisma.product.update({ where: { id: "s6c-pizza" }, data: { isAvailable: true } });
      await prisma.subscriptionFeature.update({ where: { id: "s6c-feature" }, data: { enabled: true } });
    }
  });

  it("rolls the entire order back if an OrderItem insert fails", async () => {
    const prepared = await prepare();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION stage6c_reject_item() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced item failure'; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER stage6c_reject_item_trigger BEFORE INSERT ON "OrderItem" FOR EACH ROW EXECUTE FUNCTION stage6c_reject_item()`);
    try {
      const result = await create({ ...pizzaDraft(), idempotencyKey: randomUUID(), acceptanceToken: prepared.body.acceptanceToken });
      expect(result.status).toBe(503);
      expect(result.body.error).toBe("NETWORK_ORDER_PERSISTENCE_FAILED");
      expect(await prisma.order.count()).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER stage6c_reject_item_trigger ON "OrderItem"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION stage6c_reject_item()`);
    }
  });

  it("is disabled without the explicit test flag and never returns a WhatsApp action", async () => {
    delete process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS;
    try {
      expect((await prepare()).status).toBe(403);
      expect((await preview("missing-order")).status).toBe(403);
    } finally {
      process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS = "1";
    }
    const prepared = await prepare();
    expect(prepared.body.orderingEnabled).toBe(false);
    const result = await create({ ...pizzaDraft(), idempotencyKey: randomUUID(), acceptanceToken: prepared.body.acceptanceToken });
    expect(result.body.orderingEnabled).toBe(false);
    expect(result.body.whatsappUrl).toBeUndefined();
  });

  it("preserves the separate Legacy WhatsApp path and rejects Network products there", async () => {
    const flags = new FeatureFlagsService(prisma as any);
    const legacyService = new PublicMenuService(prisma as any, flags, { get: () => undefined } as any);
    const legacy = await legacyService.createWhatsappOrder("s6c-r1", { items: [{ productSlug: "legacy", quantity: 1 }] });
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: legacy.orderId } });
    expect(stored.source).toBe("WHATSAPP");
    expect(stored.totalAmount.toString()).toBe("0");
    await expect(legacyService.createWhatsappOrder("s6c-r1", { items: [{ productSlug: "pizza", quantity: 1 }] })).rejects.toThrow();
    expect(await prisma.order.count()).toBe(1);
  });
});
