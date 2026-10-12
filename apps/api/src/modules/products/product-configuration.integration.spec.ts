import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ProductConfigurationV1 } from "@menu/shared";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { ProductConfigurationService } from "./product-configuration.service";
import { ProductsService } from "./products.service";

const databaseUrl = process.env.PRODUCT_CONFIGURATION_TEST_DATABASE_URL;

if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  const safeHost = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (!safeHost || parsed.port !== "55440" || !parsed.pathname.startsWith("/ordersawa_stage3_")) {
    throw new Error("Stage 3 integration tests refuse non-disposable database URLs");
  }
}

const integration = databaseUrl ? describe : describe.skip;

function baseConfiguration(productId: string, revision = 1, basePrice: string | null = null): ProductConfigurationV1 {
  return {
    schemaVersion: 1,
    productId,
    revision,
    basePrice,
    groups: [{
      type: "SIZE",
      id: `${productId}-sizes`,
      label: "Sizes",
      sizes: [
        { id: `${productId}-small`, label: "Small", price: "10.000001" },
        { id: `${productId}-large`, label: "Large", price: "15.999999" }
      ]
    }]
  };
}

function linkedConfiguration(
  productId: string,
  sourceProductId: string,
  revision = 1,
  mode: "ORIGINAL" | "CUSTOM" = "ORIGINAL"
): ProductConfigurationV1 {
  return {
    schemaVersion: 1,
    productId,
    revision,
    basePrice: "0",
    groups: [{
      type: "OPTIONS",
      id: `${productId}-combo`,
      label: "Combo",
      min: 1,
      max: 1,
      includedQuantity: 0,
      options: [{
        id: `${productId}-slot`,
        label: "Linked",
        price: "20.123456",
        maxQuantity: 1,
        linkedProduct: mode === "ORIGINAL"
          ? { sourceProductId, mode, originalPriceOverrides: { [`${sourceProductId}-small`]: "1.000001" } }
          : { sourceProductId, mode, customConfiguration: baseConfiguration(sourceProductId, 1, "3.000000") }
      }]
    }]
  };
}

integration("Product Configuration Stage 3 disposable PostgreSQL integration", () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const featureFlags = new FeatureFlagsService(prisma as any);
  const service = new ProductConfigurationService(prisma as any, featureFlags);
  const productsService = new ProductsService(
    prisma as any,
    featureFlags,
    {} as any,
    { get: () => undefined } as any
  );

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.productConfigurationDependency.deleteMany();
    await prisma.product.deleteMany();
    await prisma.restaurantSubscription.deleteMany();
    await prisma.subscriptionFeature.deleteMany();
    await prisma.subscriptionPlan.deleteMany();
    await prisma.restaurant.deleteMany();

    await prisma.restaurant.createMany({ data: [
      { id: "stage3-r1", name: "Restaurant One", slug: "stage3-r1", currency: "EGP" },
      { id: "stage3-r2", name: "Restaurant Two", slug: "stage3-r2", currency: "EGP" }
    ] });
    await prisma.subscriptionPlan.create({
      data: {
        id: "stage3-plan",
        name: "Stage 3 Test Plan",
        key: "STAGE3_TEST",
        features: { create: { id: "stage3-feature", key: "PRODUCT_CONFIGURATION", enabled: true } }
      }
    });
    await prisma.restaurantSubscription.create({
      data: {
        id: "stage3-subscription",
        restaurantId: "stage3-r1",
        planId: "stage3-plan",
        status: "CANCELED",
        startsAt: new Date("2026-01-01T00:00:00.000Z")
      }
    });

    const productIds = [
      "source-original",
      "source-custom",
      "owner-atomic",
      "owner-custom",
      "owner-rollback",
      "owner-concurrent",
      "cycle-b",
      "cycle-c",
      "owner-cycle",
      "legacy-null-zero"
    ];
    await prisma.product.createMany({
      data: productIds.map((id) => ({
        id,
        restaurantId: "stage3-r1",
        name: id,
        slug: id,
        basePrice: id === "legacy-null-zero" ? "0.000000" : "7.000000",
        currency: "EGP"
      }))
    });
    await prisma.product.create({
      data: {
        id: "foreign-source",
        restaurantId: "stage3-r2",
        name: "Foreign",
        slug: "foreign-source",
        basePrice: "9.000000",
        currency: "EGP"
      }
    });
    await prisma.product.update({
      where: { id: "source-original" },
      data: {
        configurationTree: baseConfiguration("source-original"),
        configurationVersion: 1,
        basePrice: null,
        isAvailable: false
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("atomically creates and updates a network tree and dependency index", async () => {
    const first = await service.save("stage3-r1", "owner-atomic", {
      expectedVersion: 0,
      configuration: linkedConfiguration("owner-atomic", "source-original")
    });
    expect(first).toMatchObject({
      mode: "NETWORK",
      configurationVersion: 1,
      basePrice: "0",
      isAvailable: false
    });
    expect(await prisma.productConfigurationDependency.count({
      where: { productId: "owner-atomic", sourceProductId: "source-original", configurationVersion: 1 }
    })).toBe(1);

    const updatedTree = linkedConfiguration("owner-atomic", "source-original", 2);
    updatedTree.basePrice = null;
    const second = await service.save("stage3-r1", "owner-atomic", {
      expectedVersion: 1,
      configuration: updatedTree
    });
    expect(second).toMatchObject({ configurationVersion: 2, basePrice: null });
    expect(await prisma.productConfigurationDependency.count({
      where: { productId: "owner-atomic", configurationVersion: 2 }
    })).toBe(1);
  });

  it("persists CUSTOM snapshots while retaining a live source dependency", async () => {
    await service.save("stage3-r1", "owner-custom", {
      expectedVersion: 0,
      configuration: linkedConfiguration("owner-custom", "source-custom", 1, "CUSTOM")
    });
    const edge = await prisma.productConfigurationDependency.findFirstOrThrow({
      where: { productId: "owner-custom" }
    });
    expect(edge).toMatchObject({ sourceProductId: "source-custom", mode: "CUSTOM" });
  });

  it("rejects cross-restaurant, missing, self, and unconfigured ORIGINAL sources without partial writes", async () => {
    for (const sourceId of ["foreign-source", "missing-source", "source-custom"]) {
      await expect(service.save("stage3-r1", "owner-rollback", {
        expectedVersion: 0,
        configuration: linkedConfiguration("owner-rollback", sourceId)
      })).rejects.toBeInstanceOf(ConflictException);
    }
    await expect(service.save("stage3-r1", "owner-rollback", {
      expectedVersion: 0,
      configuration: linkedConfiguration("owner-rollback", "owner-rollback")
    })).rejects.toHaveProperty("status", 400);

    const owner = await prisma.product.findUniqueOrThrow({ where: { id: "owner-rollback" } });
    expect(owner).toMatchObject({
      configurationTree: null,
      configurationVersion: 0,
      isAvailable: true
    });
    expect(owner.basePrice?.toString()).toBe("7");
    expect(await prisma.productConfigurationDependency.count({ where: { productId: "owner-rollback" } })).toBe(0);
  });

  it("detects a deep dependency cycle against existing edges", async () => {
    for (const id of ["cycle-b", "cycle-c"]) {
      await prisma.product.update({
        where: { id },
        data: { configurationTree: baseConfiguration(id), configurationVersion: 1, isAvailable: false }
      });
    }
    await prisma.productConfigurationDependency.createMany({ data: [
      {
        id: "cycle-edge-b-c",
        restaurantId: "stage3-r1",
        productId: "cycle-b",
        sourceProductId: "cycle-c",
        optionId: "b-to-c",
        path: "$configuration.groups[0].options[0]",
        mode: "ORIGINAL",
        configurationVersion: 1
      },
      {
        id: "cycle-edge-c-owner",
        restaurantId: "stage3-r1",
        productId: "cycle-c",
        sourceProductId: "owner-cycle",
        optionId: "c-to-owner",
        path: "$configuration.groups[0].options[0]",
        mode: "ORIGINAL",
        configurationVersion: 1
      }
    ] });

    await expect(service.save("stage3-r1", "owner-cycle", {
      expectedVersion: 0,
      configuration: linkedConfiguration("owner-cycle", "cycle-b")
    })).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: "owner-cycle" } })).configurationVersion).toBe(0);
  });

  it("allows only one of two concurrent optimistic updates", async () => {
    const value = baseConfiguration("owner-concurrent", 1, "1.234567");
    const results = await Promise.allSettled([
      service.save("stage3-r1", "owner-concurrent", { expectedVersion: 0, configuration: value }),
      service.save("stage3-r1", "owner-concurrent", { expectedVersion: 0, configuration: value })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: "owner-concurrent" } })).configurationVersion).toBe(1);
  });

  it("preserves stored data after capability loss and denies further writes", async () => {
    await prisma.subscriptionFeature.update({ where: { id: "stage3-feature" }, data: { enabled: false } });
    const readable = await service.get("stage3-r1", "owner-atomic");
    expect(readable).toMatchObject({
      mode: "NETWORK",
      capability: { canRead: true, canWrite: false },
      orderabilityState: "ACTION_REQUIRED_CAPABILITY"
    });
    await expect(service.save("stage3-r1", "owner-atomic", {
      expectedVersion: 2,
      configuration: linkedConfiguration("owner-atomic", "source-original", 3)
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: "owner-atomic" } })).configurationVersion).toBe(2);
    await prisma.subscriptionFeature.update({ where: { id: "stage3-feature" }, data: { enabled: true } });
  });

  it("protects linked sources from service soft-delete and database hard-delete", async () => {
    await expect(productsService.delete("stage3-r1", "source-original")).rejects.toBeInstanceOf(ConflictException);
    await expect(prisma.product.delete({ where: { id: "source-original" } })).rejects.toMatchObject({ code: "P2003" });
  });

  it("preserves legacy zero pricing and tenant isolation", async () => {
    const legacy = await productsService.findOne("stage3-r1", "legacy-null-zero");
    expect(legacy).toMatchObject({ basePrice: 0, configurationMode: "LEGACY", configurationVersion: 0 });
    await expect(service.get("stage3-r2", "owner-atomic")).rejects.toBeInstanceOf(NotFoundException);
  });
});
