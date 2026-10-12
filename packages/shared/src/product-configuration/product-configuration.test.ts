import { describe, expect, it } from "vitest";
import {
  ProductConfigurationContext,
  ProductConfigurationV1,
  ProductSelectionV1,
  PRODUCT_CONFIGURATION_SCHEMA_VERSION,
  PRODUCT_SELECTION_SCHEMA_VERSION
} from "./types";
import { addMoney, multiplyMoney, normalizeMoney } from "./money";
import { validateConfiguration } from "./validation";
import { validateSelection } from "./selection";
import { calculatePrice } from "./pricing";
import { calculateMinimumPrice } from "./minimum-price";
import { createConfigurationSnapshot, createSelectionKey } from "./snapshot";
import { validateDependencyGraph } from "./dependencies";

const context: ProductConfigurationContext = { catalogId: "catalog-1", linkedProducts: new Map() };

function config(groups: ProductConfigurationV1["groups"] = [], basePrice: string | null = "100", productId = "product-1"): ProductConfigurationV1 {
  return { schemaVersion: PRODUCT_CONFIGURATION_SCHEMA_VERSION, productId, revision: 1, basePrice, groups };
}

function selection(groups: ProductSelectionV1["groups"] = [], productId = "product-1", revision = 1): ProductSelectionV1 {
  return { schemaVersion: PRODUCT_SELECTION_SCHEMA_VERSION, productId, configurationRevision: revision, groups };
}

describe("decimal-safe money", () => {
  it("performs decimal arithmetic without floating point", () => {
    expect(addMoney("0.1", "0.2")).toBe("0.3");
    expect(multiplyMoney("12.340", 3)).toBe("37.02");
    expect(normalizeMoney("0.00")).toBe("0");
  });

  it("rejects scientific notation and numeric money", () => {
    expect(() => normalizeMoney("1e2")).toThrow();
    expect(validateConfiguration({ ...config(), basePrice: 10 as unknown as string }).map((issue) => issue.code)).toContain("INVALID_MONEY");
  });
});

describe("configuration and selection validation", () => {
  it("forbids Size after Size on one path", () => {
    const value = config([
      {
        type: "SIZE", id: "size-1", label: "First", sizes: [
          { id: "small", label: "Small", price: "10", children: [
            { type: "SIZE", id: "size-2", label: "Second", sizes: [{ id: "tiny", label: "Tiny", price: "5" }] }
          ] }
        ]
      }
    ]);
    expect(validateConfiguration(value).map((issue) => issue.code)).toContain("SIZE_AFTER_SIZE");
  });

  it("enforces numeric parent max and accepts null override fallback plus explicit zero", () => {
    const value = config([
      { type: "SIZE", id: "sizes", label: "Size", sizes: [{ id: "small", label: "Small", price: "20" }] },
      {
        type: "OPTIONS", id: "mods", label: "Mods", min: 0, max: 2, includedQuantity: 0,
        options: [{
          id: "cheese", label: "Cheese", price: "3", maxQuantity: 3,
          priceOverrides: [{ sizeChoiceId: "small", price: null }, { sizeChoiceId: "small", price: "0" }]
        }]
      }
    ]);
    const codes = validateConfiguration(value).map((issue) => issue.code);
    expect(codes).toContain("OPTION_MAX_EXCEEDS_GROUP_MAX");
    expect(codes).toContain("DUPLICATE_SIZE_PRICE_OVERRIDE");
    expect(codes).not.toContain("INVALID_MONEY");
  });

  it("counts total units and requires stable per-unit IDs", () => {
    const value = config([{
      type: "OPTIONS", id: "sauces", label: "Sauces", min: 2, max: 3, includedQuantity: 0,
      options: [{ id: "bbq", label: "BBQ", price: "5", maxQuantity: 3 }]
    }]);
    const selected = selection([{ type: "OPTIONS", groupId: "sauces", instances: [
      { instanceId: "same", optionId: "bbq" }, { instanceId: "same", optionId: "bbq" }
    ] }]);
    expect(validateSelection(value, selected, context).map((issue) => issue.code)).toContain("DUPLICATE_SELECTION_INSTANCE_ID");
    expect(validateSelection(value, selection([{ type: "OPTIONS", groupId: "sauces", instances: [{ instanceId: "one", optionId: "bbq" }] }]), context)
      .map((issue) => issue.code)).toContain("GROUP_MIN_NOT_MET");
  });

  it("requires exactly one Size and applies quantity/group safety caps (CFG-05/09/10/11/12)", () => {
    const sized = config([{
      type: "SIZE", id: "sizes", label: "Size", sizes: [
        { id: "s", label: "S", price: "150" }, { id: "m", label: "M", price: "200" }, { id: "l", label: "L", price: "260" }
      ]
    }]);
    expect(validateSelection(sized, selection(), context).map((issue) => issue.code)).toContain("SIZE_REQUIRED");
    expect(validateSelection(sized, selection([
      { type: "SIZE", groupId: "sizes", sizeChoiceId: "s" },
      { type: "SIZE", groupId: "sizes", sizeChoiceId: "m" }
    ]), context).map((issue) => issue.code)).toContain("DUPLICATE_GROUP_SELECTION");

    const quantified = config([{
      type: "OPTIONS", id: "q", label: "Quantity", min: 2, max: 4, includedQuantity: 0,
      options: [
        { id: "a", label: "A", price: "1", maxQuantity: 3 },
        { id: "b", label: "B", price: "1", maxQuantity: 3 }
      ]
    }]);
    const threeUnits = selection([{ type: "OPTIONS", groupId: "q", instances: [
      { instanceId: "a1", optionId: "a" }, { instanceId: "a2", optionId: "a" }, { instanceId: "b1", optionId: "b" }
    ] }]);
    expect(validateSelection(quantified, threeUnits, context)).toEqual([]);
    const fourA = selection([{ type: "OPTIONS", groupId: "q", instances: [0, 1, 2, 3].map((index) => ({ instanceId: `a${index}`, optionId: "a" })) }]);
    expect(validateSelection(quantified, fourA, context).map((issue) => issue.code)).toContain("OPTION_MAX_EXCEEDED");

    const unbounded = config([{
      type: "OPTIONS", id: "cap", label: "Cap", min: 0, max: null, includedQuantity: 0,
      options: [{ id: "x", label: "X", price: "0", maxQuantity: 100 }]
    }]);
    const tooMany = selection([{ type: "OPTIONS", groupId: "cap", instances: Array.from({ length: 101 }, (_, index) => ({ instanceId: `x${index}`, optionId: "x" })) }]);
    expect(validateSelection(unbounded, tooMany, context).map((issue) => issue.code)).toEqual(expect.arrayContaining(["GROUP_MAX_EXCEEDED", "OPTION_MAX_EXCEEDED"]));
  });

  it("validates required nested groups", () => {
    const value = config([{
      type: "OPTIONS", id: "meal", label: "Meal", min: 1, max: 1, includedQuantity: 0,
      options: [{ id: "combo", label: "Combo", price: "10", maxQuantity: 1, children: [
        { type: "OPTIONS", id: "drink", label: "Drink", min: 1, max: 1, includedQuantity: 0,
          options: [{ id: "cola", label: "Cola", price: "2", maxQuantity: 1 }] }
      ] }]
    }]);
    const selected = selection([{ type: "OPTIONS", groupId: "meal", instances: [{ instanceId: "combo-1", optionId: "combo" }] }]);
    expect(validateSelection(value, selected, context).map((issue) => issue.code)).toContain("GROUP_MIN_NOT_MET");
  });

  it("does not silently shift or reduce unavailable option minima", () => {
    const value = config([{
      type: "OPTIONS", id: "required", label: "Required", min: 0, max: 1, includedQuantity: 0,
      options: [{ id: "sold-out", label: "Sold out", price: "5", minQuantity: 1, maxQuantity: 1, available: false }]
    }]);
    expect(validateSelection(value, selection(), context).map((issue) => issue.code)).toContain("OPTION_MIN_NOT_MET");
    expect(calculateMinimumPrice(value, context)).toMatchObject({ orderable: false, display: "UNAVAILABLE" });
  });
});

describe("pricing rules", () => {
  it("keeps an exact Base when only optional upsells exist (CFG-01)", () => {
    const value = config([{
      type: "OPTIONS", id: "sauce", label: "Sauce", min: 0, max: 1, includedQuantity: 0,
      options: [{ id: "hot", label: "Hot", price: "10", maxQuantity: 1 }]
    }]);
    expect(calculatePrice(value, selection(), context).total).toBe("100");
    expect(calculateMinimumPrice(value, context)).toMatchObject({ minimum: "100", maximumRequired: "100", display: "EXACT" });
  });

  it("derives a null Base from a required payable path and preserves explicit zero (CFG-02/03)", () => {
    const required = config([{
      type: "OPTIONS", id: "required", label: "Required", min: 1, max: 1, includedQuantity: 0,
      options: [{ id: "choice", label: "Choice", price: "25", maxQuantity: 1 }]
    }], null);
    expect(calculateMinimumPrice(required, context)).toMatchObject({ minimum: "25", display: "EXACT", orderable: true });
    expect(calculatePrice(config([], "0"), selection(), context).total).toBe("0");
    expect(calculateMinimumPrice(config([], null), context).orderable).toBe(false);
  });

  it("ignores Base whenever Sizes exist and adds independent full Size contributions (CFG-04/06)", () => {
    const value = config([
      { type: "SIZE", id: "pizza", label: "Pizza", sizes: [{ id: "large", label: "Large", price: "200" }] },
      { type: "SIZE", id: "drink", label: "Drink", sizes: [{ id: "can", label: "Can", price: "50" }] }
    ], "100");
    const selected = selection([
      { type: "SIZE", groupId: "pizza", sizeChoiceId: "large" },
      { type: "SIZE", groupId: "drink", sizeChoiceId: "can" }
    ]);
    expect(calculatePrice(value, selected, context)).toMatchObject({ total: "250", baseIgnored: true, valid: true });
  });

  it("uses null override fallback and honors explicit zero override (CFG-14/15)", () => {
    const make = (override: string | null) => config([
      { type: "SIZE", id: "sizes", label: "Size", sizes: [{ id: "large", label: "Large", price: "100" }] },
      { type: "OPTIONS", id: "mods", label: "Mods", min: 1, max: 1, includedQuantity: 0,
        options: [{ id: "cheese", label: "Cheese", price: "30", maxQuantity: 1, priceOverrides: [{ sizeChoiceId: "large", price: override }] }] }
    ]);
    const selected = selection([
      { type: "SIZE", groupId: "sizes", sizeChoiceId: "large" },
      { type: "OPTIONS", groupId: "mods", instances: [{ instanceId: "c1", optionId: "cheese" }] }
    ]);
    expect(calculatePrice(make(null), selected, context).total).toBe("130");
    expect(calculatePrice(make("0"), selected, context).total).toBe("100");
  });

  it("applies Included Count to highest parent units only (CFG-16/17/18)", () => {
    const value = config([{
      type: "OPTIONS", id: "toppings", label: "Toppings", min: 3, max: 3, includedQuantity: 2,
      options: [
        { id: "premium", label: "Premium", price: "50", maxQuantity: 1 },
        { id: "medium", label: "Medium", price: "30", maxQuantity: 1, children: [
          { type: "OPTIONS", id: "dip", label: "Dip", min: 1, max: 1, includedQuantity: 0,
            options: [{ id: "garlic", label: "Garlic", price: "8", maxQuantity: 1 }] }
        ] },
        { id: "basic", label: "Basic", price: "15", maxQuantity: 1 }
      ]
    }], "0");
    const selected = selection([{ type: "OPTIONS", groupId: "toppings", instances: [
      { instanceId: "p", optionId: "premium" },
      { instanceId: "m", optionId: "medium", children: [{ type: "OPTIONS", groupId: "dip", instances: [{ instanceId: "g", optionId: "garlic" }] }] },
      { instanceId: "b", optionId: "basic" }
    ] }]);
    const priced = calculatePrice(value, selected, context);
    expect(priced.total).toBe("23");
    expect(priced.lines.filter((line) => line.included).map((line) => line.amount)).toEqual(["50", "30"]);
  });

  it("charges two of three repeated units when Included Count is one (CFG-16)", () => {
    const value = config([{
      type: "OPTIONS", id: "cheese", label: "Cheese", min: 3, max: 3, includedQuantity: 1,
      options: [{ id: "portion", label: "Portion", price: "30", maxQuantity: 3 }]
    }], "0");
    const selected = selection([{ type: "OPTIONS", groupId: "cheese", instances: [0, 1, 2].map((index) => ({ instanceId: `c${index}`, optionId: "portion" })) }]);
    expect(calculatePrice(value, selected, context).total).toBe("60");
  });

  it("keeps repeated child charges when the included parent is free (CFG-18)", () => {
    const value = config([{
      type: "OPTIONS", id: "parent", label: "Parent", min: 1, max: 1, includedQuantity: 1,
      options: [{ id: "included", label: "Included", price: "40", maxQuantity: 1, children: [
        { type: "OPTIONS", id: "sauce", label: "Sauce", min: 2, max: 2, includedQuantity: 0,
          options: [{ id: "dip", label: "Dip", price: "8", maxQuantity: 2 }] }
      ] }]
    }], "0");
    const selected = selection([{ type: "OPTIONS", groupId: "parent", instances: [{
      instanceId: "parent-1", optionId: "included", children: [{
        type: "OPTIONS", groupId: "sauce", instances: [
          { instanceId: "dip-1", optionId: "dip" }, { instanceId: "dip-2", optionId: "dip" }
        ]
      }]
    }] }]);
    expect(calculatePrice(value, selected, context).total).toBe("16");
  });

  it("prices linked products locally without adding the standalone source Base (CFG-20)", () => {
    const source = config([], "300", "source");
    const linkedContext: ProductConfigurationContext = {
      catalogId: "catalog-1",
      linkedProducts: new Map([["source", { productId: "source", catalogId: "catalog-1", configuration: source, available: true, orderable: true }]])
    };
    const parent = config([{
      type: "OPTIONS", id: "combo", label: "Combo", min: 1, max: 1, includedQuantity: 0,
      options: [{ id: "linked", label: "Linked", price: "100", maxQuantity: 1, linkedProduct: { sourceProductId: "source", mode: "ORIGINAL" } }]
    }]);
    const selected = selection([{ type: "OPTIONS", groupId: "combo", instances: [{
      instanceId: "linked-1", optionId: "linked", linkedSelection: selection([], "source")
    }] }]);
    expect(calculatePrice(parent, selected, linkedContext).total).toBe("200");
  });

  it("uses live ORIGINAL structure with local overrides and CUSTOM snapshot prices", () => {
    const liveSource = config([{
      type: "OPTIONS", id: "source-group", label: "Source group", min: 1, max: 1, includedQuantity: 0,
      options: [{ id: "source-choice", label: "Source choice", price: "50", maxQuantity: 1 }]
    }], "300", "source");
    const linkedContext: ProductConfigurationContext = {
      catalogId: "catalog-1",
      linkedProducts: new Map([["source", { productId: "source", catalogId: "catalog-1", configuration: liveSource }]])
    };
    const sourceSelection = selection([{
      type: "OPTIONS", groupId: "source-group", instances: [{ instanceId: "source-unit", optionId: "source-choice" }]
    }], "source");
    const original = config([{
      type: "OPTIONS", id: "links", label: "Links", min: 1, max: 1, includedQuantity: 0,
      options: [{
        id: "original", label: "Original", price: "10", maxQuantity: 1,
        linkedProduct: { sourceProductId: "source", mode: "ORIGINAL", originalPriceOverrides: { "source-choice": "20" } }
      }]
    }], "0");
    const originalSelection = selection([{
      type: "OPTIONS", groupId: "links", instances: [{ instanceId: "link", optionId: "original", linkedSelection: sourceSelection }]
    }]);
    expect(calculatePrice(original, originalSelection, linkedContext).total).toBe("30");

    const customSource = config([{
      type: "OPTIONS", id: "custom-group", label: "Custom group", min: 1, max: 1, includedQuantity: 0,
      options: [{ id: "custom-choice", label: "Custom choice", price: "7", maxQuantity: 1 }]
    }], "999", "source");
    const custom = config([{
      type: "OPTIONS", id: "links", label: "Links", min: 1, max: 1, includedQuantity: 0,
      options: [{
        id: "custom", label: "Custom", price: "10", maxQuantity: 1,
        linkedProduct: { sourceProductId: "source", mode: "CUSTOM", customConfiguration: customSource }
      }]
    }], "0");
    const customSelection = selection([{
      type: "OPTIONS", groupId: "links", instances: [{
        instanceId: "custom-link", optionId: "custom",
        linkedSelection: selection([{
          type: "OPTIONS", groupId: "custom-group", instances: [{ instanceId: "custom-unit", optionId: "custom-choice" }]
        }], "source")
      }]
    }]);
    expect(calculatePrice(custom, customSelection, linkedContext).total).toBe("17");
  });

  it("makes a required linked branch unorderable when its live source is unavailable (CFG-27)", () => {
    const source = config([], "300", "source");
    const linkedContext: ProductConfigurationContext = {
      catalogId: "catalog-1",
      linkedProducts: new Map([["source", {
        productId: "source", catalogId: "catalog-1", configuration: source, available: false, orderable: false
      }]])
    };
    const parent = config([{
      type: "OPTIONS", id: "required-link", label: "Required", min: 1, max: 1, includedQuantity: 0,
      options: [{ id: "source-slot", label: "Source", price: "100", maxQuantity: 1, linkedProduct: { sourceProductId: "source", mode: "ORIGINAL" } }]
    }], "0");
    expect(calculateMinimumPrice(parent, linkedContext)).toMatchObject({ orderable: false, display: "UNAVAILABLE" });
  });
});

describe("minimum price, dependencies, and snapshots", () => {
  it("shows starting-at only when valid required totals vary", () => {
    const value = config([{
      type: "SIZE", id: "sizes", label: "Size", sizes: [
        { id: "small", label: "Small", price: "80" }, { id: "large", label: "Large", price: "120" }
      ]
    }]);
    expect(calculateMinimumPrice(value, context)).toMatchObject({ minimum: "80", maximumRequired: "120", display: "STARTING_AT" });
  });

  it("detects deep dependency cycles and cross-catalog links", () => {
    const linked = (productId: string, target: string) => config([{
      type: "OPTIONS", id: `g-${productId}`, label: "Link", min: 0, max: 1, includedQuantity: 0,
      options: [{ id: `o-${productId}`, label: "Target", price: "0", maxQuantity: 1, linkedProduct: { sourceProductId: target, mode: "ORIGINAL" } }]
    }], "0", productId);
    const issues = validateDependencyGraph([
      { productId: "a", catalogId: "one", configuration: linked("a", "b") },
      { productId: "b", catalogId: "one", configuration: linked("b", "c") },
      { productId: "c", catalogId: "two", configuration: linked("c", "a") }
    ]);
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["LINK_CYCLE", "CROSS_CATALOG_LINK"]));
  });

  it("creates an immutable, exact-price snapshot and a semantic selection key", () => {
    const value = config([{
      type: "OPTIONS", id: "mods", label: "Mods", min: 1, max: 2, includedQuantity: 0,
      options: [{ id: "x", label: "X", price: "0.1", maxQuantity: 2 }]
    }], "0.2");
    const first = selection([{ type: "OPTIONS", groupId: "mods", instances: [{ instanceId: "first", optionId: "x" }] }]);
    const second = selection([{ type: "OPTIONS", groupId: "mods", instances: [{ instanceId: "different", optionId: "x" }] }]);
    expect(createSelectionKey(first)).toBe(createSelectionKey(second));
    const result = createConfigurationSnapshot({
      configuration: value, selection: first, context, productName: "Pizza", currency: "EGP", createdAt: "2026-10-12T00:00:00.000Z"
    });
    expect(result).toMatchObject({ valid: true, snapshot: { total: "0.3", productName: "Pizza" } });
    expect(Object.isFrozen(result.snapshot)).toBe(true);
    expect(Object.isFrozen(result.snapshot?.selection)).toBe(true);
  });
});
