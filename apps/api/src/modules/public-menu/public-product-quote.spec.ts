import { describe, expect, it } from "vitest";
import type { ProductConfigurationV1, ProductSelectionV1 } from "@menu/shared";
import { quotePublicProductConfiguration, parsePublicQuoteSelection } from "./public-product-quote";
import type { PublicConfigurationProductRecord } from "./public-product-configuration";

function product(id: string, configurationTree: ProductConfigurationV1 | null, overrides: Partial<PublicConfigurationProductRecord> = {}): PublicConfigurationProductRecord {
  return {
    id, slug: id, name: id, basePrice: configurationTree?.basePrice ?? "0", configurationTree,
    configurationVersion: configurationTree?.revision ?? 0, isActive: true, isAvailable: true, deletedAt: null,
    ...overrides
  };
}

const pizza: ProductConfigurationV1 = {
  schemaVersion: 1, productId: "pizza", revision: 2, basePrice: null,
  groups: [
    { type: "SIZE", id: "sizes", label: "Size", sizes: [{ id: "small", label: "Small", price: "100" }, { id: "medium", label: "Medium", price: "200.000001" }] },
    { type: "OPTIONS", id: "toppings", label: "Toppings", min: 0, max: 3, includedQuantity: 1, options: [{
      id: "cheese", label: "Cheese", price: "30.000001", maxQuantity: 3,
      children: [{ type: "OPTIONS", id: "sauces", label: "Sauces", min: 0, max: 1, includedQuantity: 0, options: [{ id: "bbq", label: "BBQ", price: "5.000001", maxQuantity: 1 }] }]
    }] }
  ]
};

const pizzaSelection: ProductSelectionV1 = {
  schemaVersion: 1, productId: "pizza", configurationRevision: 2,
  groups: [
    { type: "SIZE", groupId: "sizes", sizeChoiceId: "medium" },
    { type: "OPTIONS", groupId: "toppings", instances: [
      { instanceId: "c3", optionId: "cheese" },
      { instanceId: "c2", optionId: "cheese" },
      { instanceId: "c1", optionId: "cheese", children: [{ type: "OPTIONS", groupId: "sauces", instances: [{ instanceId: "s1", optionId: "bbq" }] }] }
    ] }
  ]
};

function quote(configuration: ProductConfigurationV1, selection: unknown, catalogProducts: PublicConfigurationProductRecord[], capabilityEnabled = true) {
  return quotePublicProductConfiguration({ restaurantId: "restaurant-a", owner: catalogProducts[0], catalogProducts, capabilityEnabled, currency: "EGP", selection });
}

describe("Stage 6A pure server quote", () => {
  it("uses Shared size, nested, included-unit and decimal pricing with a canonical selection", () => {
    const result = quote(pizza, pizzaSelection, [product("pizza", pizza)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote).toMatchObject({
      trustedTotal: "265.000004", baseIgnored: true, configurationOrderable: true,
      previewOnly: true, orderingEnabled: false, orderAction: "STAGE_6_REQUIRED"
    });
    expect(result.quote.canonicalSelection.groups[1]).toMatchObject({ type: "OPTIONS", instances: [{ instanceId: "c1" }, { instanceId: "c2" }, { instanceId: "c3" }] });
    expect(result.quote.priceBreakdown.filter((line) => line.included)).toHaveLength(1);
    expect(result.quote.priceBreakdown.find((line) => line.nodeId === "bbq")?.chargedAmount).toBe("5.000001");
  });

  it("rejects a stale owner revision and stale linked revisions", () => {
    const stale = quote(pizza, { ...pizzaSelection, configurationRevision: 1 }, [product("pizza", pizza)]);
    expect(stale).toMatchObject({ ok: false, error: { status: 409, code: "CONFIGURATION_REVISION_CHANGED", currentRevision: 2 } });

    const source: ProductConfigurationV1 = { schemaVersion: 1, productId: "source", revision: 3, basePrice: "1", groups: [] };
    const combo: ProductConfigurationV1 = { schemaVersion: 1, productId: "combo", revision: 1, basePrice: "0", groups: [{
      type: "OPTIONS", id: "slots", label: "Slots", min: 1, max: 1, includedQuantity: 0,
      options: [{ id: "linked", label: "Linked", price: "2", maxQuantity: 1, linkedProduct: { sourceProductId: "source", mode: "ORIGINAL" } }]
    }] };
    const linkedStale = quote(combo, {
      schemaVersion: 1, productId: "combo", configurationRevision: 1,
      groups: [{ type: "OPTIONS", groupId: "slots", instances: [{ instanceId: "slot1", optionId: "linked", linkedSelection: { schemaVersion: 1, productId: "source", configurationRevision: 2, groups: [] } }] }]
    }, [product("combo", combo), product("source", source)]);
    expect(linkedStale).toMatchObject({ ok: false, error: { status: 409, code: "LINKED_CONFIGURATION_REVISION_CHANGED" } });
  });

  it("quotes repeated ORIGINAL instances independently and a CUSTOM instance without source sale price", () => {
    const source: ProductConfigurationV1 = { schemaVersion: 1, productId: "source", revision: 3, basePrice: null, groups: [{
      type: "SIZE", id: "source-sizes", label: "Source sizes", sizes: [{ id: "source-small", label: "Small", price: "100" }, { id: "source-large", label: "Large", price: "200" }]
    }] };
    const custom: ProductConfigurationV1 = { schemaVersion: 1, productId: "source", revision: 1, basePrice: null, groups: [{
      type: "SIZE", id: "custom-sizes", label: "Custom sizes", sizes: [{ id: "custom-one", label: "One", price: "7" }]
    }] };
    const combo: ProductConfigurationV1 = { schemaVersion: 1, productId: "combo", revision: 1, basePrice: "0", groups: [{
      type: "OPTIONS", id: "slots", label: "Slots", min: 3, max: 3, includedQuantity: 0,
      options: [
        { id: "original", label: "Original", price: "10", maxQuantity: 2, linkedProduct: { sourceProductId: "source", mode: "ORIGINAL", originalPriceOverrides: { "source-small": "5", "source-large": "8" } } },
        { id: "custom", label: "Custom", price: "3", maxQuantity: 1, linkedProduct: { sourceProductId: "source", mode: "CUSTOM", customConfiguration: custom } }
      ]
    }] };
    const selection: ProductSelectionV1 = { schemaVersion: 1, productId: "combo", configurationRevision: 1, groups: [{
      type: "OPTIONS", groupId: "slots", instances: [
        { instanceId: "first", optionId: "original", linkedSelection: { schemaVersion: 1, productId: "source", configurationRevision: 3, groups: [{ type: "SIZE", groupId: "source-sizes", sizeChoiceId: "source-small" }] } },
        { instanceId: "second", optionId: "original", linkedSelection: { schemaVersion: 1, productId: "source", configurationRevision: 3, groups: [{ type: "SIZE", groupId: "source-sizes", sizeChoiceId: "source-large" }] } },
        { instanceId: "third", optionId: "custom", linkedSelection: { schemaVersion: 1, productId: "source", configurationRevision: 1, groups: [{ type: "SIZE", groupId: "custom-sizes", sizeChoiceId: "custom-one" }] } }
      ]
    }] };
    const result = quote(combo, selection, [product("combo", combo), product("source", source)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.trustedTotal).toBe("43");
    expect(result.quote.priceBreakdown.filter((line) => line.sourceProductId === "source")).toHaveLength(3);
  });

  it("rejects tampered amounts, unknown fields, unavailable sources and capability loss", () => {
    const tampered = parsePublicQuoteSelection({ ...pizzaSelection, trustedTotal: "1" });
    expect(tampered.issues).toContainEqual(expect.objectContaining({ code: "UNEXPECTED_SELECTION_FIELD", path: "$selection.trustedTotal" }));
    const nestedTamper = parsePublicQuoteSelection({ ...pizzaSelection, groups: [{ type: "SIZE", groupId: "sizes", sizeChoiceId: "medium", price: "1" }] });
    expect(nestedTamper.issues).toContainEqual(expect.objectContaining({ code: "UNEXPECTED_SELECTION_FIELD" }));
    expect(quote(pizza, pizzaSelection, [product("pizza", pizza)], false)).toMatchObject({ ok: false, error: { code: "CONFIGURATION_NOT_ORDERABLE" } });
    expect(quote(pizza, pizzaSelection, [product("pizza", pizza, { isAvailable: false })])).toMatchObject({ ok: false, error: { code: "CONFIGURATION_NOT_ORDERABLE" } });
  });

  it("signals a selected optional linked source becoming unavailable as a change", () => {
    const source: ProductConfigurationV1 = { schemaVersion: 1, productId: "source", revision: 1, basePrice: "100", groups: [] };
    const owner: ProductConfigurationV1 = { schemaVersion: 1, productId: "owner", revision: 1, basePrice: "10", groups: [{
      type: "OPTIONS", id: "extras", label: "Extras", min: 0, max: 1, includedQuantity: 0,
      options: [{ id: "linked", label: "Linked", price: "1", maxQuantity: 1, linkedProduct: { sourceProductId: "source", mode: "CUSTOM", customConfiguration: { schemaVersion: 1, productId: "source", revision: 1, basePrice: "0", groups: [] } } }]
    }] };
    const selection = { schemaVersion: 1, productId: "owner", configurationRevision: 1, groups: [{ type: "OPTIONS", groupId: "extras", instances: [{ instanceId: "unit-1", optionId: "linked" }] }] };
    const result = quote(owner, selection, [product("owner", owner), product("source", source, { isAvailable: false })]);
    expect(result).toMatchObject({ ok: false, error: { status: 409, code: "CONFIGURATION_CHANGED", issues: expect.arrayContaining([expect.objectContaining({ code: "LINKED_PRODUCT_UNAVAILABLE" })]) } });
  });
});
