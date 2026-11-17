import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ProductConfigurationV2 } from "@menu/shared";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { ProductConfigurationService } from "./product-configuration.service";

function configuration(
  productId = "product-1",
  revision = 1,
  basePrice: string | null = "12.345678"
): ProductConfigurationV2 {
  return {
    schemaVersion: 2,
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

  // Old standalone-save success/retry cases are retired: transaction/CAS behavior is now
  // exercised by product-editor.integration.spec.ts and v2-customer-ordering.integration.spec.ts.
  it("directs both contracts to Unified Editor without opening a transaction", async () => {
    const { service, prisma } = createHarness();prisma.product.findFirst.mockResolvedValue({id:"product-1"});
    for (const schemaVersion of [1,2]) {
      await expect(service.save("restaurant-1","product-1",{expectedVersion:0,configuration:{...configuration(),schemaVersion} as never}))
        .rejects.toMatchObject({status:410,response:{error:"UNIFIED_PRODUCT_EDITOR_REQUIRED"}});
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.product.findFirst).toHaveBeenCalledWith({where:{id:"product-1",restaurantId:"restaurant-1",deletedAt:null},select:{id:true}});
  });
  it("checks capability before disclosing the retirement or looking up a product", async () => {
    const {service,prisma,featureFlags}=createHarness();featureFlags.assertAssignedFeature.mockRejectedValue(new ForbiddenException());
    await expect(service.save("restaurant-1","product-1",{expectedVersion:0,configuration:configuration()})).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.product.findFirst).not.toHaveBeenCalled();expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("keeps another tenant's missing owner indistinguishable on retired writes", async () => {
    const {service,prisma}=createHarness();prisma.product.findFirst.mockResolvedValue(null);
    await expect(service.save("other","product-1",{expectedVersion:0,configuration:configuration()})).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("exposes V2 configured and unpriced setup states without a pending-integration state", async () => {
    const {service,prisma}=createHarness();prisma.product.findFirst.mockResolvedValue({id:"product-1",basePrice:null,configurationVersion:1,configurationTree:configuration(),isAvailable:true});
    expect((await service.get("restaurant-1","product-1")).orderabilityState).toBe("CONFIGURED_V2");
    prisma.product.findFirst.mockResolvedValue({id:"product-1",basePrice:null,configurationVersion:1,configurationTree:{schemaVersion:2,productId:"product-1",revision:1,basePrice:null,groups:[]},isAvailable:false});
    expect((await service.get("restaurant-1","product-1")).orderabilityState).toBe("SETUP_INCOMPLETE");
  });
});
