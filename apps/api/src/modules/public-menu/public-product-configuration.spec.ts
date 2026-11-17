import { describe, expect, it } from "vitest";
import type { ProductConfigurationV2 } from "@menu/shared";
import {
  preparePublicConfigurationCatalog,
  resolveProductFromCatalog,
  resolvePublicProductConfiguration,
  type PublicConfigurationProductRecord
} from "./public-product-configuration";

function product(
  id: string,
  configurationTree: ProductConfigurationV2 | null,
  overrides: Partial<PublicConfigurationProductRecord> = {}
): PublicConfigurationProductRecord {
  return {
    id,
    restaurantId: "r1", currency: "SYP",
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

function pizza(productId = "pizza"): ProductConfigurationV2 {
  return {
    schemaVersion: 2,
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
  it("keeps linked availability scoped to the current restaurant snapshot", () => {
    const owner = product("combo", {
      schemaVersion: 2, productId: "combo", revision: 1, basePrice: "0",
      groups: [{ type: "OPTIONS", id: "slots", label: "Slots", min: 1, max: 1, includedQuantity: 0,
        options: [{ id: "pick", label: "Pizza", minQuantity: 1, maxQuantity: 1, price: "0",
          linkedProduct: { sourceProductId: "pizza", mode: "ORIGINAL" } }] }]
    });
    const source = product("pizza", pizza());
    const input = { restaurantId: "r1", catalogProducts: [owner, source], capabilityEnabled: true, currency: "SYP" };
    const first = preparePublicConfigurationCatalog(input);
    const other = preparePublicConfigurationCatalog({
      ...input, restaurantId: "second", catalogProducts: [owner, { ...source, isAvailable: false }]
    });
    expect(resolveProductFromCatalog(owner, other)).toBeNull();
    expect(resolveProductFromCatalog(owner, first)?.orderable).toBe(true);
    expect(resolveProductFromCatalog(owner, first)).toEqual(resolvePublicProductConfiguration({ ...input, owner }));
  });

  it("does not treat an unpriced Network setup as an orderable linked source even if availability is forced on", () => {
    const source = product("source", {schemaVersion:2,productId:"source",revision:1,basePrice:null,groups:[]}, { basePrice: null });
    const owner = product("combo", {
      schemaVersion: 2, productId: "combo", revision: 1, basePrice: "0",
      groups: [{ type: "OPTIONS", id: "slots", label: "Slots", min: 1, max: 1, includedQuantity: 0, options: [{
        id: "slot", label: "Source", price: "10", minQuantity: 1, maxQuantity: 1,
        linkedProduct: { sourceProductId: "source", mode: "ORIGINAL" }
      }] }]
    });
    const result = resolvePublicProductConfiguration({
      restaurantId: "r1", currency: "SYP", owner, catalogProducts: [owner, source], capabilityEnabled: true
    });
    expect(result?.linkedProducts).toEqual([expect.objectContaining({ productId: "source", orderable: false })]);
    expect(result?.orderable).toBe(false);
  });

  it("returns an exact V2 minimum and customer configuration contract", () => {
    const owner = product("pizza", pizza());
    const result = resolvePublicProductConfiguration({
      restaurantId: "r1", currency: "SYP",
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
      schemaVersion: 2, currency: "SYP"
    });
  });

  it("preserves configuration but marks capability loss unavailable", () => {
    const owner = product("pizza", pizza());
    const result = resolvePublicProductConfiguration({
      restaurantId: "r1", currency: "SYP",
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
    const configuration: ProductConfigurationV2 = {
      schemaVersion: 2,
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
      restaurantId: "r1", currency: "SYP",
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
    const configuration: ProductConfigurationV2 = {
      schemaVersion: 2,
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
      restaurantId: "r1", currency: "SYP",
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
    const configuration: ProductConfigurationV2 = {
      schemaVersion: 2,
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
          linkedProduct: { sourceProductId: "source", mode: "ORIGINAL", originalPriceOverrides: { "source-small": {price:"30"}, "source-large": {price:"40"} } }
        }]
      }]
    };
    const owner = product("combo", configuration);
    const result = resolvePublicProductConfiguration({
      restaurantId: "r1", currency: "SYP",
      owner,
      catalogProducts: [owner, source],
      capabilityEnabled: true
    });

    expect(result?.orderable).toBe(false);
    expect(result?.issues.map((issue) => issue.code)).toContain("LINKED_PRODUCT_UNAVAILABLE");
  });
});
