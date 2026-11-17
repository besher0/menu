import { INestApplication, Module } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { NetworkOrderLoopbackGuard, NetworkOrdersController } from "./network-orders.controller";
import { NetworkOrdersService } from "./network-orders.service";

const databaseUrl = process.env.NETWORK_ORDER_PREPARE_CONFLICT_TEST_DATABASE_URL;
const expectedDatabase = "ordersawa_stage3_stage6c_stage6d3c2_conflict";
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55440" || parsed.pathname !== `/${expectedDatabase}`) {
    throw new Error("Stage 6D.3C2 tests refuse a non-disposable database URL");
  }
}
const integration = databaseUrl ? describe : describe.skip;

const restaurantId = "s6d3c2-restaurant";
const productId = "s6d3c2-pizza";
const configuration = { schemaVersion: 1, productId, revision: 1, basePrice: null, groups: [
  { type: "SIZE", id: "sizes", label: "Sizes", sizes: [{ id: "medium", label: "Medium", price: "12.000001" }] }
] };
const request = { locale: "en", items: [{ productId, quantity: 1, selection: {
  schemaVersion: 1, productId, configurationRevision: 1,
  groups: [{ type: "SIZE", groupId: "sizes", sizeChoiceId: "medium" }]
} }] };

function prismaFailure(code: string, meta?: Record<string, string>) {
  return new Prisma.PrismaClientKnownRequestError("private SQL and connection details must not reach HTTP", {
    code, clientVersion: "5.22.0", meta
  });
}

integration("Stage 6D.3C2 Prepare Serializable conflict HTTP regression", () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const previousFlag = process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS;
  let app: INestApplication;
  let origin: string;
  let attempts = 0;
  let fault: { remaining: number; error: Prisma.PrismaClientKnownRequestError } | null = null;

  async function post(path: string, body: unknown) {
    const response = await fetch(`${origin}/public/menus/s6d3c2/orders/network-test${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() as Record<string, any> };
  }
  const prepare = () => post("/prepare", request);
  const create = (acceptanceToken: string, idempotencyKey: string) => post("", { ...request, acceptanceToken, idempotencyKey });
  const markerCount = () => prisma.category.count({ where: { restaurantId, slug: { startsWith: "injected-rollback-" } } });

  beforeAll(async () => {
    process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS = "1";
    await prisma.$connect();
    const [target] = await prisma.$queryRaw<{ name: string; address: string | null; port: number | null }[]>`
      SELECT current_database() AS name, host(inet_server_addr()) AS address, inet_server_port() AS port
    `;
    if (target?.name !== expectedDatabase || target.address !== "127.0.0.1" || target.port !== 55440) {
      throw new Error("Stage 6D.3C2 requires its dedicated disposable PostgreSQL database");
    }
    // Reset only this suite's fixtures after verifying the actual disposable database target.
    await prisma.$executeRawUnsafe('TRUNCATE "OrderItem", "Order" RESTART IDENTITY CASCADE');
    await prisma.product.deleteMany({ where: { restaurantId } });
    await prisma.category.deleteMany({ where: { restaurantId } });
    await prisma.restaurantSubscription.deleteMany({ where: { restaurantId } });
    await prisma.subscriptionFeature.deleteMany({ where: { planId: "s6d3c2-plan" } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: "s6d3c2-plan" } });
    await prisma.restaurant.deleteMany({ where: { id: restaurantId } });
    await prisma.restaurant.create({ data: { id: restaurantId, slug: "s6d3c2", name: "Disposable restaurant", currency: "EGP" } });
    await prisma.subscriptionPlan.create({ data: { id: "s6d3c2-plan", key: "S6D3C2_TEST", name: "Disposable plan",
      features: { create: { id: "s6d3c2-feature", key: "PRODUCT_CONFIGURATION", enabled: true } } } });
    await prisma.restaurantSubscription.create({ data: { id: "s6d3c2-sub", restaurantId, planId: "s6d3c2-plan",
      status: "ACTIVE", startsAt: new Date("2026-01-01T00:00:00Z") } });
    await prisma.product.create({ data: { id: productId, restaurantId, slug: "pizza", name: "Test Pizza", currency: "EGP",
      basePrice: null, configurationVersion: 1, configurationTree: configuration } });

    const db = new Proxy(prisma, { get(target, key) {
      if (key === "$transaction") return async (work: (transaction: Prisma.TransactionClient) => Promise<unknown>,
        options: { isolationLevel?: Prisma.TransactionIsolationLevel; maxWait?: number; timeout?: number }) => {
        attempts += 1;
        if (fault && fault.remaining > 0) {
          const injected = fault.error;
          fault.remaining -= 1;
          return target.$transaction(async (transaction) => {
            // Run the real Prepare/Create callback, then fail inside its real PG transaction.
            await work(transaction);
            await transaction.category.create({ data: { restaurantId, slug: `injected-rollback-${attempts}`, name: "rollback marker" } });
            throw injected;
          }, options);
        }
        return target.$transaction(work, options);
      };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    @Module({ controllers: [NetworkOrdersController], providers: [NetworkOrdersService, NetworkOrderLoopbackGuard,
      { provide: PrismaService, useValue: db }] })
    class TestModule {}
    app = await NestFactory.create(TestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    origin = await app.getUrl();
  });

  beforeEach(async () => {
    fault = null;
    attempts = 0;
    await prisma.$executeRawUnsafe('TRUNCATE "OrderItem", "Order" RESTART IDENTITY CASCADE');
    expect(await markerCount()).toBe(0);
  });

  afterAll(async () => {
    if (app) await app.close();
    await prisma.$disconnect();
    if (previousFlag === undefined) delete process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS;
    else process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS = previousFlag;
  });

  it("prepares a trusted draft without a conflict or an Order write", async () => {
    const response = await prepare();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ draft: { totalAmount: "12.000001", orderingEnabled: false },
      requiresExplicitAcceptance: true, orderingEnabled: false });
    expect(typeof response.body.acceptanceToken).toBe("string");
    expect(attempts).toBe(1);
    expect(await prisma.order.count()).toBe(0);
  });

  it("retries a transient P2034 once and returns a successful trusted draft", async () => {
    fault = { remaining: 1, error: prismaFailure("P2034") };
    const response = await prepare();
    expect(response.status).toBe(200);
    expect(response.body.draft.totalAmount).toBe("12.000001");
    expect(attempts).toBe(2);
    expect(await markerCount()).toBe(0);
    expect(await prisma.order.count()).toBe(0);
  });

  it.each([
    ["P2034", undefined],
    ["P2010 / 40001", { code: "40001", message: "private SQL 40001" }],
    ["P2010 / 40P01", { code: "40P01", message: "private SQL 40P01" }]
  ])("returns a safe structured 409 after three %s conflicts", async (label, meta) => {
    fault = { remaining: 3, error: prismaFailure(label === "P2034" ? "P2034" : "P2010", meta) };
    const response = await prepare();
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "NETWORK_ORDER_CONCURRENT_UPDATE",
      message: "Catalog changed concurrently; retry with a new quote." });
    expect(JSON.stringify(response.body)).not.toMatch(/Prisma|private SQL|P2034|P2010|40001|40P01|stack|connection/i);
    expect(attempts).toBe(3);
    expect(await markerCount()).toBe(0);
    expect(await prisma.order.count()).toBe(0);
  });

  it("does not map an unrelated database error to HTTP 409 or retry it", async () => {
    fault = { remaining: 1, error: prismaFailure("P2003") };
    const response = await prepare();
    expect(response.status).toBe(500);
    expect(response.body.error).not.toBe("NETWORK_ORDER_CONCURRENT_UPDATE");
    expect(attempts).toBe(1);
    expect(await markerCount()).toBe(0);
    expect(await prisma.order.count()).toBe(0);
  });

  it("keeps Create's existing conflict mapping and transaction rollback", async () => {
    const prepared = await prepare();
    expect(prepared.status).toBe(200);
    attempts = 0;
    fault = { remaining: 3, error: prismaFailure("P2034") };
    const response = await create(prepared.body.acceptanceToken, randomUUID());
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "NETWORK_ORDER_CONCURRENT_UPDATE",
      message: "Catalog changed concurrently; retry with a new quote." });
    expect(attempts).toBe(3);
    expect(await markerCount()).toBe(0);
    expect(await prisma.order.count()).toBe(0);
  });

  it("keeps Create's acceptance token and idempotent replay unchanged", async () => {
    const prepared = await prepare();
    expect(prepared.status).toBe(200);
    const key = randomUUID();
    const first = await create(prepared.body.acceptanceToken, key);
    const replay = await create(prepared.body.acceptanceToken, key);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body).toMatchObject({ orderId: first.body.orderId, replayed: true, orderingEnabled: false });
    expect(await prisma.order.count()).toBe(1);
  });

  it("rejects test-only Prepare when the disposable-order flag is absent", async () => {
    delete process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS;
    try {
      const response = await prepare();
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("NETWORK_ORDERING_DISABLED");
      expect(attempts).toBe(0);
      expect(await prisma.order.count()).toBe(0);
    } finally {
      process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS = "1";
    }
  });
});
