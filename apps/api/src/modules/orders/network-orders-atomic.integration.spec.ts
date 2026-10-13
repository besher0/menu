import { INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NetworkOrderLoopbackGuard, NetworkOrdersController } from "./network-orders.controller";
import { NetworkOrdersService } from "./network-orders.service";
import { PrismaService } from "../prisma/prisma.service";

const baseUrl = process.env.NETWORK_ORDER_ATOMIC_TEST_DATABASE_URL;
const expectedName = "ordersawa_stage3_stage6c_stage6d3c3f_atomic";
const missingUrl = process.env.NETWORK_ORDER_NO_GUARD_TEST_DATABASE_URL;
const fakeUrl = process.env.NETWORK_ORDER_FAKE_GUARD_TEST_DATABASE_URL;
for (const [raw, name] of [[baseUrl, expectedName], [missingUrl, "ordersawa_stage3_stage6c_stage6d3c3f_no_guard"],
  [fakeUrl, "ordersawa_stage3_stage6c_stage6d3c3f_fake_guard"]] as const) {
  if (!raw) continue;
  const parsed = new URL(raw);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55440" || parsed.pathname !== `/${name}`) {
    throw new Error("Stage 6D.3C3F refuses a non-disposable test database");
  }
}
const integration = baseUrl && missingUrl && fakeUrl ? describe : describe.skip;

const restaurantId = "c3f-restaurant";
const productId = "c3f-pizza";
const otherRestaurantId = "c3f-other-restaurant";
const otherProductId = "c3f-other-pizza";
const config = { schemaVersion: 1, productId, revision: 1, basePrice: null, groups: [
  { type: "SIZE", id: "sizes", label: "Sizes", sizes: [{ id: "medium", label: "Medium", price: "12.000001" }] }
] };
const request = { locale: "en", items: [{ productId, quantity: 1, selection: {
  schemaVersion: 1, productId, configurationRevision: 1,
  groups: [{ type: "SIZE", groupId: "sizes", sizeChoiceId: "medium" }]
} }] };
const otherRequest = { locale: "en", items: [{ productId: otherProductId, quantity: 1, selection: {
  schemaVersion: 1, productId: otherProductId, configurationRevision: 1,
  groups: [{ type: "SIZE", groupId: "sizes", sizeChoiceId: "medium" }]
} }] };
type Fault = "missing_item" | "missing_snapshot" | "missing_seal" | "total_mismatch" | "options_mismatch"
  | "skip_immediate" | "finalization_failure" | "rollback_before_commit" | "lost_response"
  | "read_failure" | "serialization" | "serialization_wrapped" | "deadlock" | "unique_unrelated" | "unrelated";

function privatePrismaError(code: string, sqlstate?: string) {
  return new Prisma.PrismaClientKnownRequestError("private SQL and connection details", {
    code, clientVersion: "5.22.0", meta: sqlstate ? { code: sqlstate } : undefined
  });
}

async function appFor(client: PrismaClient | object) {
  @Module({ controllers: [NetworkOrdersController], providers: [NetworkOrdersService, NetworkOrderLoopbackGuard,
    { provide: PrismaService, useValue: client }] })
  class TestModule {}
  const app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  return { app, origin: await app.getUrl() };
}

integration("Stage 6D.3C3F guarded atomic HTTP create", () => {
  const prisma = new PrismaClient({ datasourceUrl: baseUrl });
  const noGuard = new PrismaClient({ datasourceUrl: missingUrl });
  const fakeGuard = new PrismaClient({ datasourceUrl: fakeUrl });
  const previousFlag = process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS;
  let app: INestApplication;
  let origin: string;
  let fault: Fault | null = null;
  let attempts = 0;
  let failReadOnce = false;

  const injected = new Proxy(prisma, { get(target, key) {
    if (key === "order") return new Proxy(target.order, { get(delegate, method) {
      if (method === "findUnique" && failReadOnce) return async () => {
        failReadOnce = false;
        throw new Error("private connection unavailable after commit");
      };
      const value = Reflect.get(delegate, method, delegate);
      return typeof value === "function" ? value.bind(delegate) : value;
    } });
    if (key === "$transaction") return async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) => {
      attempts += 1;
      const outcome = await target.$transaction(async (tx) => {
        const wrapped = new Proxy(tx, { get(transaction, method) {
          if (method === "order") return new Proxy(transaction.order, { get(delegate, operation) {
            if (operation === "create") return (args: any) => {
              if (fault === "missing_item" || fault === "skip_immediate") args = { ...args, data: { ...args.data, items: undefined } };
              if (fault === "missing_snapshot") args = { ...args, data: { ...args.data, cartSnapshot: Prisma.DbNull } };
              if (fault === "total_mismatch") args = { ...args, data: { ...args.data, totalAmount: "1" } };
              if (fault === "options_mismatch") args = { ...args, data: { ...args.data,
                items: { create: args.data.items.create.map((line: any) => ({ ...line, options: { ...line.options, tampered: true } })) } } };
              return delegate.create(args);
            };
            if (operation === "update" && fault === "missing_seal") return (args: any) => delegate.findUniqueOrThrow({ where: args.where });
            const value = Reflect.get(delegate, operation, delegate);
            return typeof value === "function" ? value.bind(delegate) : value;
          } });
          if (method === "$executeRawUnsafe") return (...args: unknown[]) => {
            if (fault === "skip_immediate") return Promise.resolve(0);
            if (fault === "finalization_failure") throw privatePrismaError("P2010", "23514");
            const value = transaction.$executeRawUnsafe as (...args: unknown[]) => Promise<unknown>;
            return value.apply(transaction, args);
          };
          const value = Reflect.get(transaction, method, transaction);
          return typeof value === "function" ? value.bind(transaction) : value;
        } });
        const result = await work(wrapped);
        if (fault === "rollback_before_commit") throw new Error("private pre-commit failure");
        if (fault === "serialization") throw privatePrismaError("P2034");
        if (fault === "serialization_wrapped") throw privatePrismaError("P2010", "40001");
        if (fault === "deadlock") throw privatePrismaError("P2010", "40P01");
        if (fault === "unique_unrelated") throw privatePrismaError("P2002");
        if (fault === "unrelated") throw privatePrismaError("P2003");
        return result;
      }, options as Parameters<PrismaClient["$transaction"]>[1]);
      if (fault === "lost_response") throw new Error("private response lost after commit");
      return outcome;
    };
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });

  async function post(target: string, body: unknown, server = origin, endpoint = "") {
    const response = await fetch(`${server}/public/menus/${target}/orders/network-test${endpoint}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() as Record<string, any> };
  }
  const prepare = () => post("c3f", request, origin, "/prepare");
  const create = (token: string, key = randomUUID()) => post("c3f", { ...request, acceptanceToken: token, idempotencyKey: key });

  beforeAll(async () => {
    process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS = "1";
    await Promise.all([prisma.$connect(), noGuard.$connect(), fakeGuard.$connect()]);
    const [identity] = await prisma.$queryRaw<{ name: string; address: string | null; port: number | null }[]>`
      SELECT current_database() AS name, host(inet_server_addr()) AS address, inet_server_port() AS port`;
    if (identity.name !== expectedName || identity.address !== "127.0.0.1" || identity.port !== 55440) {
      throw new Error("Atomic test database identity is not disposable");
    }
    const priorRestaurants = await prisma.restaurant.findMany({ select: { id: true } });
    if (priorRestaurants.some((row) => ![restaurantId, otherRestaurantId].includes(row.id))) {
      throw new Error("Refusing unrelated test fixtures");
    }
    // This exact isolated database is reusable for the suite, never a shared or existing OrderSawa DB.
    await prisma.$executeRawUnsafe('TRUNCATE "OrderItem", "Order" RESTART IDENTITY CASCADE');
    await prisma.product.deleteMany({ where: { restaurantId } });
    await prisma.product.deleteMany({ where: { restaurantId: otherRestaurantId } });
    await prisma.restaurantSubscription.deleteMany({ where: { restaurantId } });
    await prisma.restaurantSubscription.deleteMany({ where: { restaurantId: otherRestaurantId } });
    await prisma.subscriptionFeature.deleteMany({ where: { planId: "c3f-plan" } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: "c3f-plan" } });
    await prisma.restaurant.deleteMany({ where: { id: restaurantId } });
    await prisma.restaurant.deleteMany({ where: { id: otherRestaurantId } });
    await prisma.restaurant.create({ data: { id: restaurantId, slug: "c3f", name: "Synthetic Restaurant", currency: "EGP" } });
    await prisma.restaurant.create({ data: { id: otherRestaurantId, slug: "c3f-other", name: "Other Synthetic Restaurant", currency: "EGP" } });
    await prisma.subscriptionPlan.create({ data: { id: "c3f-plan", key: "C3F_TEST", name: "Synthetic plan",
      features: { create: { id: "c3f-feature", key: "PRODUCT_CONFIGURATION", enabled: true } } } });
    await prisma.restaurantSubscription.create({ data: { id: "c3f-sub", restaurantId, planId: "c3f-plan",
      status: "ACTIVE", startsAt: new Date("2026-01-01T00:00:00Z") } });
    await prisma.restaurantSubscription.create({ data: { id: "c3f-other-sub", restaurantId: otherRestaurantId,
      planId: "c3f-plan", status: "ACTIVE", startsAt: new Date("2026-01-01T00:00:00Z") } });
    await prisma.product.create({ data: { id: productId, restaurantId, slug: "pizza", name: "Synthetic Pizza", currency: "EGP",
      basePrice: null, configurationVersion: 1, configurationTree: config } });
    await prisma.product.create({ data: { id: otherProductId, restaurantId: otherRestaurantId, slug: "pizza",
      name: "Other Synthetic Pizza", currency: "EGP", basePrice: null, configurationVersion: 1,
      configurationTree: { ...config, productId: otherProductId } } });
    const started = await appFor(injected);
    app = started.app;
    origin = started.origin;
  });

  beforeEach(async () => {
    fault = null;
    attempts = 0;
    failReadOnce = false;
    await prisma.$executeRawUnsafe('TRUNCATE "OrderItem", "Order" RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    if (app) await app.close();
    await Promise.all([prisma.$disconnect(), noGuard.$disconnect(), fakeGuard.$disconnect()]);
    if (previousFlag === undefined) delete process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS;
    else process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS = previousFlag;
  });

  it("rejects missing and same-name fake completeness guards before any write", async () => {
    const prepared = await prepare();
    expect(prepared.status).toBe(200);
    for (const client of [noGuard, fakeGuard]) {
      const started = await appFor(client);
      try {
        const result = await post("c3f", { ...request, acceptanceToken: prepared.body.acceptanceToken,
          idempotencyKey: randomUUID() }, started.origin);
        expect(result.status).toBe(503);
        expect(result.body.error).toBe("NETWORK_ORDER_DB_GUARD_UNAVAILABLE");
        expect(await client.order.count()).toBe(0);
      } finally { await started.app.close(); }
    }
  });

  it.each(["missing_item", "missing_snapshot", "missing_seal", "total_mismatch", "options_mismatch",
    "skip_immediate", "finalization_failure", "rollback_before_commit"] as Fault[])(
    "fails closed and rolls back for %s", async (kind) => {
      const prepared = await prepare();
      fault = kind;
      const result = await create(prepared.body.acceptanceToken);
      expect(result.status).toBe(503);
      expect(result.body.error).toMatch(/^NETWORK_ORDER_(PERSISTENCE_FAILED|COMMIT_UNCONFIRMED)$/);
      expect(JSON.stringify(result.body)).not.toMatch(/Prisma|private SQL|stack|23514|P2010/i);
      expect(await prisma.order.count()).toBe(0);
      fault = null;
      const retried = await create(prepared.body.acceptanceToken);
      expect(retried.status).toBe(201);
      expect(await prisma.order.count()).toBe(1);
    }
  );

  it("replays a committed order after its response is lost", async () => {
    const prepared = await prepare();
    const key = randomUUID();
    fault = "lost_response";
    const first = await create(prepared.body.acceptanceToken, key);
    expect(first.status).toBe(201);
    expect(first.body.replayed).toBe(true);
    expect(await prisma.order.count()).toBe(1);
    fault = null;
    const replay = await create(prepared.body.acceptanceToken, key);
    expect(replay.status).toBe(201);
    expect(replay.body.orderId).toBe(first.body.orderId);
    expect(replay.body.replayed).toBe(true);
    expect(await prisma.order.count()).toBe(1);
  });

  it("never returns 201 if independent post-commit confirmation cannot read", async () => {
    const prepared = await prepare();
    const key = randomUUID();
    fault = "read_failure";
    failReadOnce = true;
    const result = await create(prepared.body.acceptanceToken, key);
    expect(result.status).toBe(503);
    expect(result.body.error).toBe("NETWORK_ORDER_COMMIT_UNCONFIRMED");
    expect(await prisma.order.count()).toBe(1);
    fault = null;
    const retry = await create(prepared.body.acceptanceToken, key);
    expect(retry.status).toBe(201);
    expect(retry.body.replayed).toBe(true);
    expect(await prisma.order.count()).toBe(1);
  });

  it.each(["serialization", "serialization_wrapped", "deadlock", "unique_unrelated", "unrelated"] as Fault[])(
    "maps %s without leaking database internals", async (kind) => {
    const prepared = await prepare();
    fault = kind;
    const result = await create(prepared.body.acceptanceToken);
    const unrelated = kind === "unrelated" || kind === "unique_unrelated";
    expect(result.status).toBe(unrelated ? 503 : 409);
    expect(result.body.error).toBe(kind === "unrelated" ? "NETWORK_ORDER_PERSISTENCE_FAILED"
      : kind === "unique_unrelated" ? "NETWORK_ORDER_UNRESOLVED_UNIQUE_CONFLICT" : "NETWORK_ORDER_CONCURRENT_UPDATE");
    expect(attempts).toBe(unrelated ? 2 : 4); // one Prepare plus Create retries
    expect(JSON.stringify(result.body)).not.toMatch(/Prisma|private SQL|stack|40P01|P2034/i);
    expect(await prisma.order.count()).toBe(0);
  });

  it("rejects bad acceptance and duplicate token while preserving exact-key replay", async () => {
    const prepared = await prepare();
    const key = randomUUID();
    expect((await create("bad-token", key)).status).toBe(409);
    const first = await create(prepared.body.acceptanceToken, key);
    expect(first.status).toBe(201);
    const replay = await create(prepared.body.acceptanceToken, key);
    expect(replay.status).toBe(201);
    expect(replay.body.orderId).toBe(first.body.orderId);
    expect((await create(prepared.body.acceptanceToken, randomUUID())).body.error).toBe("ACCEPTANCE_TOKEN_ALREADY_USED");
    const changed = await post("c3f", { ...request, locale: "ar", acceptanceToken: prepared.body.acceptanceToken,
      idempotencyKey: key });
    expect(changed.status).toBe(409);
    expect(changed.body.error).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await prisma.order.count()).toBe(1);
  });

  it.each([1, 5, 10, 25])("keeps %i distinct same-tenant HTTP Creates atomic", async (concurrency) => {
    const requests = await Promise.all(Array.from({ length: concurrency }, async (_, index) => {
      const body = { ...request, orderNote: `Distinct synthetic ${index}-${randomUUID()}` };
      const prepared = await post("c3f", body, origin, "/prepare");
      expect(prepared.status).toBe(200);
      return { ...body, idempotencyKey: randomUUID(), acceptanceToken: prepared.body.acceptanceToken };
    }));
    attempts = 0;
    const started = performance.now();
    const responses = await Promise.all(requests.map((body) => post("c3f", body)));
    const elapsed = performance.now() - started;
    const success = responses.filter((response) => response.status === 201);
    const conflicts = responses.filter((response) => response.status === 409);
    expect(success.length + conflicts.length).toBe(concurrency);
    expect(await prisma.order.count()).toBe(success.length);
    const saved = await prisma.order.findMany({ include: { items: true } });
    expect(saved.every((row) => row.restaurantId === restaurantId && row.networkSnapshotSealedAt
      && row.totalAmount.toString() === "12.000001" && row.items.length === 1)).toBe(true);
    process.stdout.write(`C3F_HTTP_WAVE=${JSON.stringify({ type: "distinct_same_tenant", concurrency,
      success: success.length, conflicts: conflicts.length, transactionAttempts: attempts,
      elapsedMs: +elapsed.toFixed(2) })}\n`);
  });

  it.each([5, 10, 25])("isolates %i distinct Creates across two restaurants", async (concurrency) => {
    const requests = await Promise.all(Array.from({ length: concurrency }, async (_, index) => {
      const other = index % 2 === 1;
      const slug = other ? "c3f-other" : "c3f";
      const body = { ...(other ? otherRequest : request), orderNote: `Cross-tenant synthetic ${index}-${randomUUID()}` };
      const prepared = await post(slug, body, origin, "/prepare");
      expect(prepared.status).toBe(200);
      return { slug, body: { ...body, idempotencyKey: randomUUID(), acceptanceToken: prepared.body.acceptanceToken } };
    }));
    attempts = 0;
    const started = performance.now();
    const responses = await Promise.all(requests.map(({ slug, body }) => post(slug, body)));
    const elapsed = performance.now() - started;
    const success = responses.filter((response) => response.status === 201);
    const conflicts = responses.filter((response) => response.status === 409);
    expect(success.length + conflicts.length).toBe(concurrency);
    expect(await prisma.order.count()).toBe(success.length);
    const saved = await prisma.order.findMany({ include: { items: true } });
    expect(saved.every((row) => [restaurantId, otherRestaurantId].includes(row.restaurantId)
      && row.networkSnapshotSealedAt && row.totalAmount.toString() === "12.000001"
      && row.items.length === 1 && (row.cartSnapshot as any).items[0].productId
        === (row.restaurantId === restaurantId ? productId : otherProductId))).toBe(true);
    process.stdout.write(`C3F_HTTP_WAVE=${JSON.stringify({ type: "distinct_two_tenants", concurrency,
      success: success.length, conflicts: conflicts.length, transactionAttempts: attempts,
      elapsedMs: +elapsed.toFixed(2) })}\n`);
  });

  it.each([5, 10, 25])("prevents duplicates for %i same-key and same-token submissions", async (concurrency) => {
    const prepared = await prepare();
    expect(prepared.status).toBe(200);
    const key = randomUUID();
    attempts = 0;
    const started = performance.now();
    const sameKey = await Promise.all(Array.from({ length: concurrency }, () =>
      create(prepared.body.acceptanceToken, key)));
    const sameKeyElapsed = performance.now() - started;
    expect(sameKey.every((response) => [201, 409].includes(response.status))).toBe(true);
    expect(await prisma.order.count()).toBe(1);
    expect(new Set(sameKey.filter((response) => response.status === 201).map((response) => response.body.orderId)).size).toBe(1);
    const tokenResponses = await Promise.all(Array.from({ length: concurrency }, () =>
      create(prepared.body.acceptanceToken, randomUUID())));
    expect(tokenResponses.every((response) => response.status === 409)).toBe(true);
    expect(await prisma.order.count()).toBe(1);
    process.stdout.write(`C3F_HTTP_WAVE=${JSON.stringify({ type: "duplicate_key_token", concurrency,
      sameKeySuccess: sameKey.filter((response) => response.status === 201).length,
      sameKey409: sameKey.filter((response) => response.status === 409).length,
      reusedToken409: tokenResponses.length, transactionAttempts: attempts,
      sameKeyElapsedMs: +sameKeyElapsed.toFixed(2) })}\n`);
  });

  it("rejects 10 concurrent changed payloads for one idempotency key", async () => {
    const key = randomUUID();
    const requests = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
      const body = { ...request, orderNote: `Different payload ${index}` };
      const prepared = await post("c3f", body, origin, "/prepare");
      expect(prepared.status).toBe(200);
      return { ...body, idempotencyKey: key, acceptanceToken: prepared.body.acceptanceToken };
    }));
    const responses = await Promise.all(requests.map((body) => post("c3f", body)));
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(9);
    expect(responses.filter((response) => response.status === 409).every((response) =>
      ["IDEMPOTENCY_KEY_REUSED", "NETWORK_ORDER_CONCURRENT_UPDATE"].includes(response.body.error))).toBe(true);
    expect(await prisma.order.count()).toBe(1);
  });
});
