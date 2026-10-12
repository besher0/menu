import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ProductsService } from "./products.service";

function createService(prisma: Record<string, any>) {
  return new ProductsService(
    prisma as any,
    { getFeatureLimit: vi.fn().mockResolvedValue(null) } as any,
    {} as any,
    { get: vi.fn() } as any
  );
}

describe("ProductsService product-configuration compatibility", () => {
  it("blocks soft deletion when another configuration depends on the product", async () => {
    const prisma = {
      product: {
        findFirst: vi.fn().mockResolvedValue({ id: "source" }),
        update: vi.fn()
      },
      productConfigurationDependency: {
        findMany: vi.fn().mockResolvedValue([{
          productId: "owner",
          optionId: "combo-slot",
          path: "$configuration.groups[0].options[0]",
          owner: { name: "Combo" }
        }])
      },
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) => callback(prisma))
    };

    await expect(createService(prisma).delete("restaurant-1", "source")).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it("blocks quick price changes while keeping operational availability independent", async () => {
    const product = {
      id: "configured",
      basePrice: null,
      configurationTree: { schemaVersion: 1 },
      configurationVersion: 1,
      isAvailable: false
    };
    const prisma = {
      product: {
        findFirst: vi.fn().mockResolvedValue(product),
        update: vi.fn().mockResolvedValue({ ...product, isAvailable: true })
      }
    };
    const service = createService(prisma);

    await expect(service.updatePrice("restaurant-1", "configured", 0)).rejects.toBeInstanceOf(ConflictException);
    await service.toggleAvailability("restaurant-1", "configured");
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: "configured" },
      data: { isAvailable: true }
    });
  });

  it("keeps legacy quick pricing and preserves null instead of coercing it to zero", async () => {
    const prisma = {
      product: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ id: "legacy", configurationTree: null, configurationVersion: 0 })
          .mockResolvedValueOnce({
            id: "network",
            slug: "network",
            name: "Network",
            basePrice: null,
            configurationTree: { schemaVersion: 1 },
            configurationVersion: 1,
            images: [],
            options: []
          }),
        update: vi.fn().mockResolvedValue({
          id: "legacy",
          slug: "legacy",
          name: "Legacy",
          basePrice: new Prisma.Decimal("9.500000"),
          configurationTree: null,
          configurationVersion: 0,
          images: [],
          options: []
        })
      }
    };
    const service = createService(prisma);

    await expect(service.updatePrice("restaurant-1", "legacy", 9.5)).resolves.toMatchObject({
      basePrice: 9.5,
      configurationMode: "LEGACY"
    });
    await expect(service.findOne("restaurant-1", "network")).resolves.toMatchObject({
      basePrice: null,
      configurationMode: "NETWORK",
      configurationVersion: 1
    });
  });

  it("prevents generic product updates from changing network-managed pricing", async () => {
    const configured = {
      id: "configured",
      restaurantId: "restaurant-1",
      slug: "configured",
      name: "Configured",
      currency: "EGP",
      basePrice: new Prisma.Decimal("10.000000"),
      configurationTree: { schemaVersion: 1 },
      configurationVersion: 1,
      images: [],
      options: []
    };
    const prisma = {
      product: {
        findFirst: vi.fn().mockResolvedValue(configured),
        update: vi.fn()
      }
    };

    await expect(createService(prisma).update("restaurant-1", "configured", {
      name: "Configured",
      basePrice: 11
    })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
});
