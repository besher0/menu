import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  convertLegacyProduct,
  LegacyProduct
} from "./product-configuration-backfill";

function legacyProduct(overrides: Partial<LegacyProduct> = {}): LegacyProduct {
  return {
    id: "legacy-product",
    restaurantId: "restaurant-1",
    categoryId: null,
    name: "Legacy product",
    slug: "legacy-product",
    description: null,
    basePrice: new Prisma.Decimal("100.12"),
    configurationTree: null,
    configurationVersion: 0,
    currency: "TEST",
    isActive: true,
    isAvailable: true,
    isFeatured: false,
    isNew: false,
    isPopular: false,
    moodKey: null,
    ingredients: null,
    nutrition: null,
    sortOrder: 0,
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    options: [{
      id: "group-1",
      productId: "legacy-product",
      name: "Add-ons",
      type: "SINGLE",
      required: true,
      minSelect: null,
      maxSelect: 1,
      sortOrder: 0,
      options: [{
        id: "option-1",
        groupId: "group-1",
        name: "Cheese",
        priceDelta: new Prisma.Decimal("10.25"),
        isActive: true,
        sortOrder: 0
      }]
    }],
    ...overrides
  };
}

describe("legacy product configuration conversion", () => {
  it("keeps the obsolete V1 backfill closed instead of silently converting ordinary products", () => {
    expect(convertLegacyProduct(legacyProduct())).toEqual({status:"QUARANTINE",reasons:["$configuration: UNSUPPORTED_CONFIGURATION_V1"]});
  });

  it("quarantines an ambiguous legacy SINGLE max", () => {
    const product = legacyProduct();
    product.options[0].maxSelect = 2;
    const result = convertLegacyProduct(product);
    expect(result).toEqual({
      status: "QUARANTINE",
      reasons: ["group-1: SINGLE maxSelect must be 1 or null"]
    });
  });

  it("skips products without legacy option groups", () => {
    expect(convertLegacyProduct(legacyProduct({ options: [] }))).toEqual({
      status: "SKIP",
      reason: "NO_LEGACY_GROUPS"
    });
  });
});
