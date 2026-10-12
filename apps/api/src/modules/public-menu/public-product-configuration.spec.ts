import { describe, expect, it } from "vitest";
import type { ProductConfigurationV1 } from "@menu/shared";
import {
  resolvePublicProductConfiguration,
  type PublicConfigurationProductRecord
} from "./public-product-configuration";

function product(
  id: string,
  configurationTree: ProductConfigurationV1 | null,
  overrides: Partial<PublicConfigurationProductRecord> = {}
): PublicConfigurationProductRecord {
  return {
    id,
    slug: id,
    name: id,
    basePrice: configurationTree?.basePrice ?? "20",
    configurationTree,
    configurationVersion: configurationTree?.revision ?? 0,
    isActive: true,
    isAvailable: true,
    deletedAt: null,
    ...overrides
  };
}

function pizza(productId = "pizza"): ProductConfigurationV1 {
  return {
    schemaVersion: 1,
    productId,
    revision: 2,
    basePrice: null,
    groups: [{
      type: "SIZE",
      id: `${productId}-size`,
      label: "الحجم",
      sizes: [
        { id: `${productId}-small`, label: "صغير", price: "80" },
        { id: `${productId}-large`, label: "كبير", price: "120" }
      ]
    }]
  };
}

describe("public product configuration resolver", () => {
  it("returns a decimal-safe minimum and preview-only contract", () => {
    const owner = product("pizza", pizza());
    const result = resolvePublicProductConfiguration({
      restaurantId: "r1",
      owner,
      catalogProducts: [owner],
      capabilityEnabled: true
    });

    expect(result).toMatchObject({
      productId: "pizza",
      configurationRevision: 2,
      minimumPrice: "80",
      maximumRequiredPrice: "120",
      priceDisplay: "STARTING_AT",
      orderable: true,
      previewOnly: true,
      orderAction: "STAGE_6_REQUIRED"
    });
  });

  it("preserves configuration but marks capability loss unavailable", () => {
    const owner = product("pizza", pizza());
    const result = resolvePublicProductConfiguration({
      restaurantId: "r1",
      owner,
      catalogProducts: [owner],
      capabilityEnabled: false
    });

    expect(result?.configuration.groups).toHaveLength(1);
    expect(result?.orderable).toBe(false);
    expect(result?.minimumPrice).toBeNull();
    expect(result?.issues.map((issue) => issue.code)).toContain("PRODUCT_CONFIGURATION_CAPABILITY_UNAVAILABLE");
  });

  it("rejects a missing required linked source without reducing Min", () => {
    const configuration: ProductConfigurationV1 = {
      schemaVersion: 1,
      productId: "combo",
      revision: 1,
      basePrice: "100",
      groups: [{
        type: "OPTIONS",
        id: "slots",
        label: "اختيارات الكومبو",
        min: 1,
        max: 1,
        includedQuantity: 0,
        options: [{
          id: "slot-one",
          label: "بيتزا",
          price: "25",
          minQuantity: 1,
          maxQuantity: 1,
          linkedProduct: { sourceProductId: "missing", mode: "ORIGINAL" }
        }]
      }]
    };
    const owner = product("combo", configuration);
    const result = resolvePublicProductConfiguration({
      restaurantId: "r1",
      owner,
      catalogProducts: [owner],
      capabilityEnabled: true
    });

    expect(result?.orderable).toBe(false);
    expect(result?.priceDisplay).toBe("UNAVAILABLE");
    expect(result?.issues.map((issue) => issue.code)).toContain("LINK_TARGET_NOT_FOUND");
  });

  it("supports a Legacy source only through an explicit CUSTOM snapshot", () => {
    const custom = pizza("legacy-source");
    const configuration: ProductConfigurationV1 = {
      schemaVersion: 1,
      productId: "combo",
      revision: 1,
      basePrice: "0",
      groups: [{
        type: "OPTIONS",
        id: "slots",
        label: "الكومبو",
        min: 1,
        max: 2,
        includedQuantity: 0,
        options: [{
          id: "legacy-slot",
          label: "بيتزا مخصصة",
          price: "15",
          minQuantity: 1,
          maxQuantity: 2,
          linkedProduct: {
            sourceProductId: "legacy-source",
            mode: "CUSTOM",
            customConfiguration: custom
          }
        }]
      }]
    };
    const owner = product("combo", configuration);
    const legacy = product("legacy-source", null);
    const result = resolvePublicProductConfiguration({
      restaurantId: "r1",
      owner,
      catalogProducts: [owner, legacy],
      capabilityEnabled: true
    });

    expect(result?.orderable).toBe(true);
    expect(result?.linkedProducts).toEqual([
      expect.objectContaining({ productId: "legacy-source", mode: "LEGACY", available: true })
    ]);
  });

  it("marks an unavailable linked source unorderable", () => {
    const source = product("source", pizza("source"), { isAvailable: false });
    const configuration: ProductConfigurationV1 = {
      schemaVersion: 1,
      productId: "combo",
      revision: 1,
      basePrice: "0",
      groups: [{
        type: "OPTIONS",
        id: "slot",
        label: "اختيار مطلوب",
        min: 1,
        max: 1,
        includedQuantity: 0,
        options: [{
          id: "linked",
          label: "مرتبط",
          price: "10",
          minQuantity: 1,
          maxQuantity: 1,
          linkedProduct: { sourceProductId: "source", mode: "ORIGINAL", originalPriceOverrides: { "source-small": "30", "source-large": "40" } }
        }]
      }]
    };
    const owner = product("combo", configuration);
    const result = resolvePublicProductConfiguration({
      restaurantId: "r1",
      owner,
      catalogProducts: [owner, source],
      capabilityEnabled: true
    });

    expect(result?.orderable).toBe(false);
    expect(result?.issues.map((issue) => issue.code)).toContain("LINKED_PRODUCT_UNAVAILABLE");
  });
});
