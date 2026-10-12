import { describe, expect, it } from "vitest";
import { calculatePrice, validateConfiguration, type ProductSelectionV1 } from "@menu/shared";
import { buildSelection } from "./configuration-preview";
import { comboDemo, includedQuantityDemo, pizzaMargheritaDemo, selectComboDemoSources } from "./demos";
import {
  appendChildGroup,
  appendRootGroup,
  configurationsEqual,
  createEmptyConfiguration,
  draftStorageKey,
  findNode,
  moveNode,
  parseDraft,
  prepareDraft,
  removeNode,
  serializeDraft
} from "./editor-model";
import type { ProductCandidate, ProductConfigurationEnvelope } from "./types";

const envelope: ProductConfigurationEnvelope = {
  productId: "product-1",
  mode: "LEGACY",
  configurationVersion: 0,
  configurationTree: null,
  basePrice: null,
  isAvailable: true,
  capability: { key: "PRODUCT_CONFIGURATION", assigned: true, canRead: true, canWrite: true },
  orderabilityState: "LEGACY"
};

describe("product configuration editor model", () => {
  it("preserves the difference between null and an explicit zero Base", () => {
    const empty = createEmptyConfiguration(envelope);
    expect(empty.basePrice).toBeNull();
    expect(configurationsEqual(empty, { ...empty, basePrice: "0" })).toBe(false);
    expect(validateConfiguration({ ...empty, basePrice: "0" })).toEqual([]);
  });

  it("adds, moves, nests, and removes stable nodes without mutating the source", () => {
    const empty = createEmptyConfiguration(envelope);
    const first = appendRootGroup(empty, "OPTIONS");
    const second = appendRootGroup(first, "SIZE");
    const firstId = second.groups[0].id;
    const moved = moveNode(second, { kind: "group", id: firstId }, 1);
    expect(moved.groups[1].id).toBe(firstId);
    expect(second.groups[0].id).toBe(firstId);

    const optionGroup = second.groups[0];
    if (optionGroup.type !== "OPTIONS") throw new Error("Expected options group");
    const optionId = optionGroup.options[0].id;
    const nested = appendChildGroup(second, optionId, "OPTIONS");
    expect(findNode(nested, optionId)?.ref.kind).toBe("option");
    expect((findNode(nested, optionId)?.node as { children?: unknown[] }).children).toHaveLength(1);
    expect(findNode(removeNode(nested, { kind: "option", id: optionId }), optionId)).toBeNull();
  });

  it("serializes a restaurant-scoped resumable local draft", () => {
    const draft = prepareDraft(envelope);
    const parsed = parseDraft(serializeDraft(draft), envelope.productId);
    expect(parsed).toMatchObject({ expectedVersion: 0, configuration: { productId: "product-1", revision: 1 } });
    expect(parseDraft(serializeDraft(draft), "another-product")).toBeNull();
    expect(draftStorageKey("restaurant-a", "product-1")).toContain("restaurant-a:product-1");
  });
});

describe("Stage 4 demo fixtures", () => {
  it("creates a valid nested pizza demo with full size prices and overrides", () => {
    const demo = pizzaMargheritaDemo("product-1", 1);
    expect(validateConfiguration(demo)).toEqual([]);
    expect(demo.basePrice).toBeNull();
    expect(demo.groups[0].type).toBe("SIZE");
  });

  it("uses the size-specific override and exact decimal strings in preview pricing", () => {
    const demo = pizzaMargheritaDemo("product-1", 1);
    const selection = buildSelection(demo, new Map());
    const size = selection.groups[0];
    if (size.type !== "SIZE") throw new Error("Expected size selection");
    const toppings = size.children?.find((group) => group.groupId === "demo-pizza-toppings-small");
    if (!toppings || toppings.type !== "OPTIONS") throw new Error("Expected topping selection");
    toppings.instances.push({
      instanceId: "cheese-1",
      optionId: "demo-extra-cheese-small",
      children: [{ type: "OPTIONS", groupId: "demo-cheese-finish-small", instances: [] }]
    });
    const result = calculatePrice(demo, selection, { catalogId: "restaurant-a", linkedProducts: new Map() });
    expect(result.valid).toBe(true);
    expect(result.total).toBe("90");
    expect(result.lines.find((line) => line.nodeId === "demo-extra-cheese-small")?.amount).toBe("10");
  });

  it("prices Included Quantity by exempting the highest-priced selected units", () => {
    const demo = includedQuantityDemo("product-1", 1);
    const selection: ProductSelectionV1 = {
      schemaVersion: 1,
      productId: "product-1",
      configurationRevision: 1,
      groups: [{
        type: "OPTIONS",
        groupId: "demo-included-toppings",
        instances: [
          { instanceId: "mushroom-1", optionId: "demo-included-mushroom" },
          { instanceId: "cheese-1", optionId: "demo-included-cheese" },
          { instanceId: "meat-1", optionId: "demo-included-meat" }
        ]
      }]
    };
    const result = calculatePrice(demo, selection, { catalogId: "restaurant-a", linkedProducts: new Map() });
    expect(result.valid).toBe(true);
    expect(result.total).toBe("115");
    expect(result.lines.filter((line) => line.included).map((line) => line.amount)).toEqual(["30", "50"]);
  });

  it("creates a valid combo with ORIGINAL, CUSTOM, and a repeated source", () => {
    const sourceConfiguration = pizzaMargheritaDemo("source-network", 3);
    const networkEnvelope: ProductConfigurationEnvelope = {
      ...envelope,
      productId: "source-network",
      mode: "NETWORK",
      configurationVersion: 3,
      configurationTree: sourceConfiguration,
      basePrice: null,
      orderabilityState: "PUBLIC_INTEGRATION_PENDING"
    };
    const legacyEnvelope: ProductConfigurationEnvelope = { ...envelope, productId: "source-legacy", basePrice: "25" };
    const networkProduct: ProductCandidate = { id: "source-network", name: "بيتزا المصدر", basePrice: null, currency: "EGP", isAvailable: true, configurationMode: "NETWORK", configurationVersion: 3 };
    const legacyProduct: ProductCandidate = { id: "source-legacy", name: "مشروب قديم", basePrice: 25, currency: "EGP", isAvailable: true, configurationMode: "LEGACY", configurationVersion: 0 };
    const demo = comboDemo("product-1", 1, { product: networkProduct, envelope: networkEnvelope }, { product: legacyProduct, envelope: legacyEnvelope });
    expect(validateConfiguration(demo)).toEqual([]);
    const group = demo.groups[0];
    if (group.type !== "OPTIONS") throw new Error("Expected options group");
    expect(group.options.map((option) => option.linkedProduct?.sourceProductId)).toEqual(["source-network", "source-network", "source-legacy"]);
    expect(group.options[2].linkedProduct?.mode).toBe("CUSTOM");
    expect(group.options[2].linkedProduct?.customConfiguration?.basePrice).toBe("25");

    const sources = new Map([
      ["source-network", networkEnvelope],
      ["source-legacy", legacyEnvelope]
    ]);
    const selection = buildSelection(demo, sources);
    const linkedProducts = new Map([
      ["source-network", { productId: "source-network", catalogId: "restaurant-a", configuration: sourceConfiguration, available: true, orderable: true }],
      ["source-legacy", { productId: "source-legacy", catalogId: "restaurant-a", configuration: legacyEnvelope.configurationTree ?? { schemaVersion: 1 as const, productId: "source-legacy", revision: 0, basePrice: "25", groups: [] }, available: true, orderable: true }]
    ]);
    expect(calculatePrice(demo, selection, { catalogId: "restaurant-a", linkedProducts })).toMatchObject({ valid: true, total: "240" });
  });

  it("prefers an explicit Legacy source for the CUSTOM demo even when Network is listed first", () => {
    const sourceConfiguration = pizzaMargheritaDemo("source-network", 3);
    const networkEnvelope: ProductConfigurationEnvelope = {
      ...envelope,
      productId: "source-network",
      mode: "NETWORK",
      configurationVersion: 3,
      configurationTree: sourceConfiguration,
      basePrice: null,
      orderabilityState: "PUBLIC_INTEGRATION_PENDING"
    };
    const legacyEnvelope: ProductConfigurationEnvelope = { ...envelope, productId: "source-legacy", basePrice: "25" };
    const selected = selectComboDemoSources([
      {
        product: { id: "source-network", name: "Network", basePrice: null, currency: "EGP", isAvailable: true, configurationMode: "NETWORK", configurationVersion: 3 },
        envelope: networkEnvelope
      },
      {
        product: { id: "source-legacy", name: "Legacy", basePrice: 25, currency: "EGP", isAvailable: true, configurationMode: "LEGACY", configurationVersion: 0 },
        envelope: legacyEnvelope
      }
    ]);
    expect(selected.original?.product.id).toBe("source-network");
    expect(selected.custom?.product.id).toBe("source-legacy");
    expect(selected.custom?.envelope.mode).toBe("LEGACY");
  });
});
