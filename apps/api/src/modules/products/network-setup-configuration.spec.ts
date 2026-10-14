import { calculateMinimumPrice, calculatePrice, validateConfiguration } from "@menu/shared";
import { describe, expect, it } from "vitest";
import { initialNetworkSetupConfiguration, isUnpricedNetworkSetup } from "./network-setup-configuration";

describe("persisted Network setup contract", () => {
  it("is structurally valid but has no sale price or orderable selection", () => {
    const configuration = initialNetworkSetupConfiguration("setup-product");
    expect(validateConfiguration(configuration)).toEqual([]);
    expect(isUnpricedNetworkSetup(configuration)).toBe(true);
    const context = { catalogId: "restaurant", linkedProducts: new Map() };
    expect(calculatePrice(configuration, {
      schemaVersion: 1, productId: "setup-product", configurationRevision: 1, groups: []
    }, context)).toMatchObject({ valid: false, total: null, issues: [{ code: "MISSING_PRICE_SOURCE" }] });
    expect(calculateMinimumPrice(configuration, context)).toMatchObject({ orderable: false, minimum: null });
    expect(isUnpricedNetworkSetup({ ...configuration, basePrice: "0" })).toBe(false);
  });
});
