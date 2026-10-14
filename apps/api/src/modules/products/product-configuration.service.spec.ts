import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ProductConfigurationV1 } from "@menu/shared";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { ProductConfigurationService } from "./product-configuration.service";

function configuration(
  productId = "product-1",
  revision = 1,
  basePrice: string | null = "12.345678"
): ProductConfigurationV1 {
  return {
    schemaVersion: 1,
    productId,
    revision,
    basePrice,
    groups: [
      {
        type: "OPTIONS",
        id: "group-1",
        label: "Extras",
        min: 0,
        max: 3,
        includedQuantity: 1,
        options: [{ id: "option-1", label: "Cheese", price: "0.100001", maxQuantity: 3 }]
      }
    ]
  };
}

function createHarness() {
  const transaction = {
    restaurant: { findUnique: vi.fn().mockResolvedValue({ currency: "EGP" }) },
    restaurantSubscription: {
      findUnique: vi.fn().mockResolvedValue({
        plan: { features: [{ key: "PRODUCT_CONFIGURATION", enabled: true }] }
      })
    },
    product: {
      findFirst: vi.fn().mockResolvedValue({ configurationVersion: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    productConfigurationDependency: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 })
    }
  };
  const prisma = {
    product: { findFirst: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction))
  };
  const featureFlags = {
    canUseAssignedFeature: vi.fn().mockResolvedValue(true),
    assertAssignedFeature: vi.fn().mockResolvedValue(undefined)
  };
  return {
    prisma,
    transaction,
    featureFlags,
    service: new ProductConfigurationService(prisma as any, featureFlags as any)
  };
}

describe("ProductConfigurationService", () => {
  it("distinguishes a legacy product and preserves a zero base price", async () => {
    const { service, prisma } = createHarness();
    prisma.product.findFirst.mockResolvedValue({
      id: "product-1",
      basePrice: new Prisma.Decimal("0.000000"),
      configurationTree: null,
      configurationVersion: 0,
      isAvailable: true
    });

    await expect(service.get("restaurant-1", "product-1")).resolves.toMatchObject({
      mode: "LEGACY",
      basePrice: "0",
      configurationVersion: 0,
      orderabilityState: "LEGACY"
    });
  });

  it("preserves null base and exposes configured data after capability loss", async () => {
    const { service, prisma, featureFlags } = createHarness();
    featureFlags.canUseAssignedFeature.mockResolvedValue(false);
    prisma.product.findFirst.mockResolvedValue({
      id: "product-1",
      basePrice: null,
      configurationTree: configuration("product-1", 4, null),
      configurationVersion: 4,
      isAvailable: false
    });

    await expect(service.get("restaurant-1", "product-1")).resolves.toMatchObject({
      mode: "NETWORK",
      basePrice: null,
      configurationVersion: 4,
      capability: { canRead: true, canWrite: false },
      orderabilityState: "ACTION_REQUIRED_CAPABILITY"
    });
  });

  it("does not disclose another tenant's product", async () => {
    const { service, prisma } = createHarness();
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(service.get("restaurant-other", "product-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("saves a valid six-decimal configuration with the atomic persistence helper", async () => {
    const { service, prisma, transaction } = createHarness();
    prisma.product.findFirst
      .mockResolvedValueOnce({ id: "product-1" })
      .mockResolvedValueOnce({
        id: "product-1",
        basePrice: new Prisma.Decimal("12.345678"),
        configurationTree: configuration(),
        configurationVersion: 1,
        isAvailable: false
      });
    await expect(service.save("restaurant-1", "product-1", {
      expectedVersion: 0,
      configuration: configuration()
    })).resolves.toMatchObject({ mode: "NETWORK", configurationVersion: 1, basePrice: "12.345678" });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.product.updateMany.mock.calls[0][0].data).not.toHaveProperty("isAvailable");
  });

  it("rejects malformed, self-linked, mismatched, and skipped-revision requests before persistence", async () => {
    const { service } = createHarness();
    const selfLinked = configuration();
    selfLinked.groups = [{
      type: "OPTIONS",
      id: "links",
      label: "Links",
      min: 0,
      max: 1,
      includedQuantity: 0,
      options: [{
        id: "self",
        label: "Self",
        price: "0",
        maxQuantity: 1,
        linkedProduct: { sourceProductId: "product-1", mode: "ORIGINAL" }
      }]
    }];

    const cases = [
      { expectedVersion: 0, configuration: [] as any },
      { expectedVersion: 0, configuration: selfLinked },
      { expectedVersion: 0, configuration: configuration("other-product") },
      { expectedVersion: 0, configuration: configuration("product-1", 2) }
    ];

    for (const dto of cases) {
      try {
        await service.save("restaurant-1", "product-1", dto);
        throw new Error("Expected validation failure");
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          error: "PRODUCT_CONFIGURATION_VALIDATION_FAILED"
        });
      }
    }
    expect((service as any).prisma.$transaction).not.toHaveBeenCalled();
  });

  it("denies writes when the package capability is absent", async () => {
    const { service, featureFlags } = createHarness();
    featureFlags.assertAssignedFeature.mockRejectedValue(new ForbiddenException("locked"));
    await expect(service.save("restaurant-1", "product-1", {
      expectedVersion: 0,
      configuration: configuration()
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect((service as any).prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rechecks capability assignment inside the atomic transaction", async () => {
    const { service, prisma, transaction } = createHarness();
    prisma.product.findFirst.mockResolvedValue({ id: "product-1" });
    transaction.restaurantSubscription.findUnique.mockResolvedValue({
      plan: { features: [{ key: "PRODUCT_CONFIGURATION", enabled: false }] }
    });

    await expect(service.save("restaurant-1", "product-1", {
      expectedVersion: 0,
      configuration: configuration()
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.product.updateMany).not.toHaveBeenCalled();
  });

  it("maps optimistic revision and dependency conflicts to HTTP 409", async () => {
    const { service, prisma, transaction } = createHarness();
    prisma.product.findFirst.mockResolvedValue({ id: "product-1" });
    transaction.product.findFirst.mockResolvedValue({ configurationVersion: 2 });

    try {
      await service.save("restaurant-1", "product-1", {
        expectedVersion: 0,
        configuration: configuration()
      });
      throw new Error("Expected conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getStatus()).toBe(409);
    }
  });

  it("retries serializable transaction conflicts and then succeeds", async () => {
    const { service, prisma } = createHarness();
    prisma.product.findFirst
      .mockResolvedValueOnce({ id: "product-1" })
      .mockResolvedValueOnce({
        id: "product-1",
        basePrice: new Prisma.Decimal("12.345678"),
        configurationTree: configuration(),
        configurationVersion: 1,
        isAvailable: false
      });
    const serializableError = new Prisma.PrismaClientKnownRequestError("write conflict", {
      code: "P2034",
      clientVersion: "5.22.0"
    });
    const transactionImplementation = prisma.$transaction.getMockImplementation()!;
    prisma.$transaction
      .mockRejectedValueOnce(serializableError)
      .mockImplementation(transactionImplementation);

    await service.save("restaurant-1", "product-1", {
      expectedVersion: 0,
      configuration: configuration()
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
