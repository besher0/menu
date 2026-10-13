import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NetworkOrdersService } from "../orders/network-orders.service";
import { PublicMenuService } from "./public-menu.service";

// Audit-only: never point this suite at an existing OrderSawa database.
const databaseUrl = process.env.NETWORK_READINESS_AUDIT_DATABASE_URL;
const expectedDatabase = "ordersawa_stage3_stage6c_stage6d3b_audit";
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55440" || parsed.pathname !== `/${expectedDatabase}`) {
    throw new Error("Stage 6D.3B audit refuses a non-disposable database URL");
  }
}
const integration = databaseUrl ? describe : describe.skip;

integration("Stage 6D.3B disposable database audit", () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const restaurantId = "s6d3b-audit-restaurant";
  const ownerId = "s6d3b-audit-pizza";
  const selection = { schemaVersion: 1, productId: ownerId, configurationRevision: 1,
    groups: [{ type: "SIZE", groupId: "sizes", sizeChoiceId: "medium" }] };
  const configuration = { schemaVersion: 1, productId: ownerId, revision: 1, basePrice: null,
    groups: [{ type: "SIZE", id: "sizes", label: "Sizes", sizes: [
      { id: "small", label: "Small", price: "100" },
      { id: "medium", label: "Medium", price: "120.000001" }
    ] }] };

  beforeAll(async () => {
    await prisma.$connect();
    const [target] = await prisma.$queryRaw<{ name: string; address: string | null; port: number | null }[]>`
      SELECT current_database() AS name, host(inet_server_addr()) AS address, inet_server_port() AS port
    `;
    if (target?.name !== expectedDatabase || target.address !== "127.0.0.1" || target.port !== 55440) {
      throw new Error("Stage 6D.3B audit is not connected to its dedicated disposable PostgreSQL database");
    }
    await prisma.product.deleteMany({ where: { restaurantId } });
    await prisma.category.deleteMany({ where: { restaurantId } });
    await prisma.restaurantSubscription.deleteMany({ where: { restaurantId } });
    await prisma.subscriptionFeature.deleteMany({ where: { planId: "s6d3b-audit-plan" } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: "s6d3b-audit-plan" } });
    await prisma.restaurant.deleteMany({ where: { id: restaurantId } });
    await prisma.restaurant.create({ data: { id: restaurantId, slug: "s6d3b-audit", name: "Disposable Audit", currency: "EGP" } });
    await prisma.subscriptionPlan.create({ data: { id: "s6d3b-audit-plan", key: "S6D3B_AUDIT", name: "Disposable audit plan",
      features: { create: { id: "s6d3b-audit-feature", key: "PRODUCT_CONFIGURATION", enabled: true } } } });
    await prisma.restaurantSubscription.create({ data: { id: "s6d3b-audit-sub", restaurantId,
      planId: "s6d3b-audit-plan", status: "ACTIVE", startsAt: new Date("2026-01-01T00:00:00Z") } });
    await prisma.product.create({ data: { id: ownerId, restaurantId, slug: "pizza", name: "Audit Pizza",
      currency: "EGP", basePrice: null, configurationVersion: 1, configurationTree: configuration } });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it("keeps both concurrent first-read all-category requests successful after the fix", async () => {
    await prisma.category.deleteMany({ where: { restaurantId, slug: "all" } });
    let reads = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const category = {
      findUnique: async (args: Parameters<typeof prisma.category.findUnique>[0]) => {
        const result = await prisma.category.findUnique(args);
        if (reads < 2) {
          reads += 1;
          if (reads === 2) release();
          await gate; // Both requests observe the missing row before either INSERT.
        }
        return result;
      },
      create: (args: Parameters<typeof prisma.category.create>[0]) => prisma.category.create(args),
      update: (args: Parameters<typeof prisma.category.update>[0]) => prisma.category.update(args)
    };
    const service = new PublicMenuService({ category } as any, {} as any, {} as any);
    const results = await Promise.allSettled([
      (service as any).ensureAllCategory(restaurantId),
      (service as any).ensureAllCategory(restaurantId)
    ]);
    expect(reads).toBe(2);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(0);
    expect(await prisma.category.count({ where: { restaurantId, slug: "all" } })).toBe(1);
  });

  it("restores a soft-deleted all category without allocating another ID", async () => {
    await prisma.category.upsert({
      where: { restaurantId_slug: { restaurantId, slug: "all" } },
      create: { restaurantId, slug: "all", name: "الكل" },
      update: { deletedAt: null }
    });
    const original = await prisma.category.findUniqueOrThrow({
      where: { restaurantId_slug: { restaurantId, slug: "all" } }
    });
    await prisma.category.updateMany({ where: { restaurantId, slug: "all" }, data: { deletedAt: new Date() } });
    const service = new PublicMenuService(prisma as any, {} as any, {} as any);
    await expect((service as any).ensureAllCategory(restaurantId)).resolves.toBeUndefined();
    const restored = await prisma.category.findUniqueOrThrow({
      where: { restaurantId_slug: { restaurantId, slug: "all" } }
    });
    expect(restored.id).toBe(original.id);
    expect(restored.deletedAt).toBeNull();
    await prisma.category.deleteMany({ where: { restaurantId, slug: "all" } });
  });

  it("maps exhausted Serializable retries in Prepare to a structured conflict", async () => {
    let attempts = 0;
    const exhausted = new Prisma.PrismaClientKnownRequestError("serialization failure", {
      code: "P2034", clientVersion: "5.22.0"
    });
    const service = new NetworkOrdersService({
      $queryRaw: async () => [{ name: expectedDatabase, address: "127.0.0.1", port: 55440 }],
      $transaction: async () => { attempts += 1; throw exhausted; }
    } as any);
    await expect(service.prepare("s6d3b-audit", { locale: "en", items: [
      { productId: ownerId, quantity: 1, selection }
    ] })).rejects.toMatchObject({ status: 409, response: {
      error: "NETWORK_ORDER_CONCURRENT_UPDATE", message: "Catalog changed concurrently; retry with a new quote."
    } });
    expect(attempts).toBe(3);
  });

  it("measures full-catalog Quote and Serializable Prepare at 10, 100, and 1000 products", async () => {
    const flags = { canUseAssignedFeature: async () => true };
    const menu = new PublicMenuService(prisma as any, flags as any, {} as any);
    const orders = new NetworkOrdersService(prisma as any);
    const quoteRequest = { selection };
    const orderRequest = { locale: "en", items: [{ productId: ownerId, quantity: 1, selection }] };
    let count = 1;
    const measurements: Array<{ products: number; quoteMedianMs: number; quoteMaxMs: number;
      prepareMedianMs: number; prepareMaxMs: number; rssMb: number }> = [];
    for (const target of [10, 100, 1000]) {
      const batch = Array.from({ length: target - count }, (_, index) => {
        const id = `s6d3b-legacy-${count + index}`;
        return { id, restaurantId, slug: id, name: `Legacy ${count + index}`, currency: "EGP", basePrice: "1" };
      });
      if (batch.length) await prisma.product.createMany({ data: batch });
      count = target;
      const quoteTimes: number[] = [];
      const prepareTimes: number[] = [];
      for (let iteration = 0; iteration < 6; iteration += 1) {
        let start = performance.now();
        const quote = await menu.productQuote("s6d3b-audit", ownerId, quoteRequest);
        if (iteration > 0) quoteTimes.push(performance.now() - start);
        expect(quote.trustedTotal).toBe("120.000001");
        start = performance.now();
        const prepared = await orders.prepare("s6d3b-audit", orderRequest);
        if (iteration > 0) prepareTimes.push(performance.now() - start);
        expect(prepared.draft.totalAmount).toBe("120.000001");
      }
      const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
      measurements.push({ products: target, quoteMedianMs: +median(quoteTimes).toFixed(2),
        quoteMaxMs: +Math.max(...quoteTimes).toFixed(2), prepareMedianMs: +median(prepareTimes).toFixed(2),
        prepareMaxMs: +Math.max(...prepareTimes).toFixed(2), rssMb: +(process.memoryUsage().rss / 1024 / 1024).toFixed(1) });
    }
    console.log("STAGE_6D_3B_BENCHMARK", JSON.stringify(measurements));
  }, 120_000);
});
