import { ProductConfigurationV1 } from "@menu/shared";
import { describe, expect, it, vi } from "vitest";
import {
  findDependencyCycle,
  persistProductConfiguration,
  ProductConfigurationConflictError,
  ProductConfigurationValidationError
} from "./product-configuration.persistence";

function configuration(productId = "owner", revision = 1): ProductConfigurationV1 {
  return {
    schemaVersion: 1,
    productId,
    revision,
    basePrice: null,
    groups: [{
      type: "OPTIONS",
      id: "group",
      label: "Combo",
      min: 0,
      max: 1,
      includedQuantity: 0,
      options: [{ id: "plain", label: "Plain", price: "0.000001", maxQuantity: 1 }]
    }]
  };
}

function transactionHarness(args?: {
  ownerVersion?: number;
  sources?: Array<{ id: string; configurationTree: object | null; configurationVersion: number }>;
  existingEdges?: Array<{ productId: string; sourceProductId: string }>;
}) {
  const transaction = {
    product: {
      findFirst: vi.fn().mockResolvedValue({ configurationVersion: args?.ownerVersion ?? 0 }),
      findMany: vi.fn().mockResolvedValue(args?.sources ?? []),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    productConfigurationDependency: {
      findMany: vi.fn().mockResolvedValue(args?.existingEdges ?? []),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 })
    }
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction))
  };
  return { prisma, transaction };
}

describe("product configuration persistence preparation", () => {
  it("detects a linked-product cycle", () => {
    expect(findDependencyCycle([
      { productId: "a", sourceProductId: "b" },
      { productId: "b", sourceProductId: "c" },
      { productId: "c", sourceProductId: "a" }
    ])).toEqual(["a", "b", "c", "a"]);
  });

  it("accepts an acyclic dependency graph", () => {
    expect(findDependencyCycle([
      { productId: "a", sourceProductId: "b" },
      { productId: "a", sourceProductId: "c" },
      { productId: "b", sourceProductId: "c" }
    ])).toBeNull();
  });

  it("writes tree, base, version, availability guard, and dependency replacement atomically", async () => {
    const { prisma, transaction } = transactionHarness();
    const value = configuration();

    await expect(persistProductConfiguration(prisma as any, {
      restaurantId: "restaurant-1",
      productId: "owner",
      expectedVersion: 0,
      configuration: value,
      disablePublicOrdering: true
    })).resolves.toEqual({ productId: "owner", configurationVersion: 1, dependencyCount: 0 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ restaurantId: "restaurant-1", configurationVersion: 0 }),
      data: expect.objectContaining({ basePrice: null, configurationVersion: 1, isAvailable: false })
    }));
    expect(transaction.productConfigurationDependency.deleteMany).toHaveBeenCalledWith({
      where: { productId: "owner" }
    });
  });

  it("requires a single next revision", async () => {
    const { prisma } = transactionHarness();
    await expect(persistProductConfiguration(prisma as any, {
      restaurantId: "restaurant-1",
      productId: "owner",
      expectedVersion: 0,
      configuration: configuration("owner", 2)
    })).rejects.toBeInstanceOf(ProductConfigurationConflictError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an invalid self-link before opening a transaction", async () => {
    const { prisma } = transactionHarness();
    const value = configuration();
    value.groups = [{
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
        linkedProduct: { sourceProductId: "owner", mode: "ORIGINAL" }
      }]
    }];

    await expect(persistProductConfiguration(prisma as any, {
      restaurantId: "restaurant-1",
      productId: "owner",
      expectedVersion: 0,
      configuration: value
    })).rejects.toBeInstanceOf(ProductConfigurationValidationError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects missing/cross-restaurant sources and unconfigured ORIGINAL sources before update", async () => {
    const linked = configuration();
    linked.groups = [{
      type: "OPTIONS",
      id: "links",
      label: "Links",
      min: 0,
      max: 1,
      includedQuantity: 0,
      options: [{
        id: "slot",
        label: "Pizza",
        price: "10",
        maxQuantity: 1,
        linkedProduct: { sourceProductId: "source", mode: "ORIGINAL" }
      }]
    }];

    const missing = transactionHarness({ sources: [] });
    await expect(persistProductConfiguration(missing.prisma as any, {
      restaurantId: "restaurant-1",
      productId: "owner",
      expectedVersion: 0,
      configuration: linked
    })).rejects.toThrow("missing or outside the restaurant");
    expect(missing.transaction.product.updateMany).not.toHaveBeenCalled();

    const unconfigured = transactionHarness({
      sources: [{ id: "source", configurationTree: null, configurationVersion: 0 }]
    });
    await expect(persistProductConfiguration(unconfigured.prisma as any, {
      restaurantId: "restaurant-1",
      productId: "owner",
      expectedVersion: 0,
      configuration: linked
    })).rejects.toThrow("require a saved configuration");
    expect(unconfigured.transaction.product.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a deep cycle before replacing dependency edges", async () => {
    const linked = configuration();
    linked.groups = [{
      type: "OPTIONS",
      id: "links",
      label: "Links",
      min: 0,
      max: 1,
      includedQuantity: 0,
      options: [{
        id: "slot",
        label: "B",
        price: "0",
        maxQuantity: 1,
        linkedProduct: { sourceProductId: "b", mode: "ORIGINAL" }
      }]
    }];
    const { prisma, transaction } = transactionHarness({
      sources: [{ id: "b", configurationTree: {}, configurationVersion: 1 }],
      existingEdges: [
        { productId: "b", sourceProductId: "c" },
        { productId: "c", sourceProductId: "owner" }
      ]
    });

    await expect(persistProductConfiguration(prisma as any, {
      restaurantId: "restaurant-1",
      productId: "owner",
      expectedVersion: 0,
      configuration: linked
    })).rejects.toThrow("cycle detected");
    expect(transaction.productConfigurationDependency.deleteMany).not.toHaveBeenCalled();
  });
});
