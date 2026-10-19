import { describe, expect, it } from "vitest";
import type { OptionGroupSelection, ProductConfigurationV1 } from "@menu/shared";
import type { PublicProductConfigurationResponse } from "@/lib/api";
import { includedQuantityDemo, pizzaMargheritaDemo } from "../dashboard/product-configuration/demos";
import {
  buildInitialSelection,
  buildOptionInstance,
  canAddOptionInstance,
  calculatePublicPreview,
  changeSizeSelection,
  LatestQuoteGate,
  updateOptionGroup
} from "./product-configurator-model";

describe("canAddOptionInstance", () => {
  it("allows replacing the selected value in a full single-choice group", () => {
    expect(canAddOptionInstance({
      available: true,
      optionCount: 0,
      optionMax: 1,
      groupCount: 1,
      groupMax: 1,
      radioMode: true
    })).toBe(true);

    expect(canAddOptionInstance({
      available: true,
      optionCount: 0,
      optionMax: 1,
      groupCount: 1,
      groupMax: 1,
      radioMode: false
    })).toBe(false);
  });
});

describe("LatestQuoteGate", () => {
  it("ignores an older Quote response after the selection changes or another request starts", async () => {
    const gate = new LatestQuoteGate();
    const applied: string[] = [];
    let resolveOld!: (value: string) => void;
    let resolveNew!: (value: string) => void;
    const old = new Promise<string>((resolve) => { resolveOld = resolve; });
    const newest = new Promise<string>((resolve) => { resolveNew = resolve; });
    const oldToken = gate.next();
    const oldWork = old.then((value) => { if (gate.isCurrent(oldToken)) applied.push(value); });
    gate.invalidate();
    const newToken = gate.next();
    const newWork = newest.then((value) => { if (gate.isCurrent(newToken)) applied.push(value); });
    resolveNew("latest");
    resolveOld("stale");
    await Promise.all([oldWork, newWork]);
    expect(applied).toEqual(["latest"]);
  });
});

function ids() {
  let value = 0;
  return (prefix: string) => `${prefix}-${++value}`;
}

function envelope(configuration: ProductConfigurationV1): PublicProductConfigurationResponse {
  return {
    schemaVersion: 1,
    productId: configuration.productId,
    productSlug: configuration.productId,
    productName: configuration.productId,
    configurationRevision: configuration.revision,
    configuration,
    linkedProducts: [],
    orderable: true,
    previewOnly: true,
    orderAction: "STAGE_6_REQUIRED",
    minimumPrice: null,
    maximumRequiredPrice: null,
    priceDisplay: "EXACT",
    issues: [],
    runtimeContext: {
      scope: "RESTAURANT",
      outletDifferentialApplied: false,
      serviceModeApplied: false,
      productScheduleApplied: false
    }
  };
}

describe("public product configurator model", () => {
  it("keeps olives, cheese, nested choices and stable instances through Small → Large → Medium → Small", () => {
    const configuration = pizzaMargheritaDemo("pizza", 4);
    const sizeGroup = configuration.groups[0];
    if (sizeGroup.type !== "SIZE") throw new Error("Missing size group");
    const small = sizeGroup.sizes[0];
    const toppings = small.children?.[0];
    if (!toppings || toppings.type !== "OPTIONS") throw new Error("Missing toppings");
    const cheese = toppings.options[0];
    const olives = toppings.options[1];
    const sources = new Map();
    const createId = ids();
    let selection = buildInitialSelection(configuration, sources, createId);
    const cheeseInstance = buildOptionInstance(cheese, sources, createId);
    const nested = cheese.children?.[0];
    if (!nested || nested.type !== "OPTIONS") throw new Error("Missing nested group");
    cheeseInstance.children = [{ type: "OPTIONS", groupId: nested.id,
      instances: [buildOptionInstance(nested.options[0], sources, createId)] }];
    const instances = [buildOptionInstance(olives, sources, createId), buildOptionInstance(olives, sources, createId), cheeseInstance];
    selection = { ...selection, groups: selection.groups.map((group) => group.type === "SIZE"
      ? { ...group, children: [{ type: "OPTIONS", groupId: toppings.id, instances }] } : group) };
    for (const [sizeId, expectedTotal] of [
      ["demo-size-large", "188.5"], ["demo-size-medium", "146"], ["demo-size-small", "111"]
    ] as const) {
      const changed = changeSizeSelection(selection, sizeGroup, sizeId, sources, createId);
      expect(changed.error).toBeUndefined();
      selection = changed.selection!;
      const selectedSize = selection.groups[0];
      if (selectedSize.type !== "SIZE") throw new Error("Missing selection");
      const selectedToppings = selectedSize.children?.[0];
      if (selectedToppings?.type !== "OPTIONS") throw new Error("Missing selected toppings");
      expect(selectedToppings.instances.map((entry) => entry.instanceId)).toEqual(instances.map((entry) => entry.instanceId));
      expect(selectedToppings.instances[2].children?.[0].type).toBe("OPTIONS");
      expect(calculatePublicPreview(envelope(configuration), "restaurant", selection)).toMatchObject({ valid: true, total: expectedTotal });
    }
  });

  it("blocks an incompatible size without silently discarding selected units", () => {
    const configuration = pizzaMargheritaDemo("pizza", 1);
    const sizeGroup = configuration.groups[0];
    if (sizeGroup.type !== "SIZE") throw new Error("Missing size group");
    const toppings = sizeGroup.sizes[0].children?.[0];
    if (!toppings || toppings.type !== "OPTIONS") throw new Error("Missing toppings");
    const sources = new Map();
    const createId = ids();
    const initial = buildInitialSelection(configuration, sources, createId);
    const selection = { ...initial, groups: initial.groups.map((group) => group.type === "SIZE"
      ? { ...group, children: [{ type: "OPTIONS" as const, groupId: toppings.id,
        instances: [buildOptionInstance(toppings.options[1], sources, createId), buildOptionInstance(toppings.options[1], sources, createId)] }] }
      : group) };
    const large = sizeGroup.sizes[2];
    const targetToppings = large.children?.[0];
    if (!targetToppings || targetToppings.type !== "OPTIONS") throw new Error("Missing target toppings");
    targetToppings.options[1].maxQuantity = 1;
    expect(changeSizeSelection(selection, sizeGroup, large.id, sources, createId)).toEqual({ error: "زيتون" });
    expect((selection.groups[0] as { sizeChoiceId: string }).sizeChoiceId).toBe("demo-size-small");
    targetToppings.options[1].maxQuantity = 2;
    targetToppings.options[1].available = false;
    expect(changeSizeSelection(selection, sizeGroup, large.id, sources, createId)).toEqual({ error: "زيتون" });
  });

  it("keeps an independent linked selection inside a size-specific option branch", () => {
    const source = pizzaMargheritaDemo("linked-pizza", 2);
    const configuration: ProductConfigurationV1 = {
      schemaVersion: 1, productId: "parent", revision: 1, basePrice: null,
      groups: [{ type: "SIZE", id: "parent-size", label: "الوجبة", sizes: ["small", "large"].map((name) => ({
        id: name, label: name, price: name === "small" ? "80" : "120", children: [{
          type: "OPTIONS" as const, id: `linked-group-${name}`, label: "المكوّن", min: 1, max: 1, includedQuantity: 0,
          options: [{ id: `linked-choice-${name}`, label: "بيتزا", price: "0", minQuantity: 1, maxQuantity: 1,
            linkedProduct: { sourceProductId: "linked-pizza", mode: "ORIGINAL" as const } }]
        }]
      })) }]
    };
    const response = envelope(configuration);
    response.linkedProducts = [{ productId: "linked-pizza", slug: "linked-pizza", name: "بيتزا",
      mode: "NETWORK", available: true, orderable: true, configuration: source }];
    const sources = new Map(response.linkedProducts.map((entry) => [entry.productId, entry]));
    const createId = ids();
    const selection = buildInitialSelection(configuration, sources, createId);
    const group = configuration.groups[0];
    if (group.type !== "SIZE") throw new Error("Missing parent size");
    const old = selection.groups[0];
    if (old.type !== "SIZE" || old.children?.[0].type !== "OPTIONS") throw new Error("Missing linked choice");
    const originalInstance = old.children[0].instances[0];
    const changed = changeSizeSelection(selection, group, "large", sources, createId);
    const next = changed.selection?.groups[0];
    if (next?.type !== "SIZE" || next.children?.[0].type !== "OPTIONS") throw new Error("Missing mapped choice");
    expect(next.children[0].instances[0].instanceId).toBe(originalInstance.instanceId);
    expect(next.children[0].instances[0].linkedSelection).toEqual(originalInstance.linkedSelection);
    expect(calculatePublicPreview(response, "restaurant", changed.selection!)).toMatchObject({ valid: true, total: "120" });
  });

  it("uses full Size price and a Size-specific option override", () => {
    const configuration = pizzaMargheritaDemo("pizza", 4);
    const sourceMap = new Map();
    const createId = ids();
    let selection = buildInitialSelection(configuration, sourceMap, createId);
    const sizeGroup = configuration.groups[0];
    if (!sizeGroup || sizeGroup.type !== "SIZE") throw new Error("Missing sizes fixture");
    const medium = sizeGroup.sizes.find((size) => size.id === "demo-size-medium")!;
    const nested = buildInitialSelection({ ...configuration, groups: medium.children ?? [] }, sourceMap, createId);
    selection = {
      ...selection,
      groups: selection.groups.map((group) => group.type === "SIZE"
        ? { ...group, sizeChoiceId: medium.id, children: nested.groups }
        : group)
    };
    const toppings = medium.children?.find((group) => group.id === "demo-pizza-toppings-medium");
    if (!toppings || toppings.type !== "OPTIONS") throw new Error("Missing toppings fixture");
    const cheese = toppings.options.find((option) => option.id === "demo-extra-cheese-medium")!;
    selection = {
      ...selection,
      groups: selection.groups.map((group) => group.type === "SIZE"
        ? { ...group, children: updateOptionGroup({ ...selection, groups: group.children ?? [] }, toppings.id, [buildOptionInstance(cheese, sourceMap, createId)]).groups }
        : group)
    };

    const result = calculatePublicPreview(envelope(configuration), "restaurant", selection);
    expect(result.valid).toBe(true);
    expect(result.total).toBe("125");
    expect(result.baseIgnored).toBe(true);
  });

  it("keeps child charges when the highest-priced parent units are included", () => {
    const configuration = includedQuantityDemo("included", 1);
    const sourceMap = new Map();
    const createId = ids();
    let selection = buildInitialSelection(configuration, sourceMap, createId);
    const group = configuration.groups[0];
    if (!group || group.type !== "OPTIONS") throw new Error("Missing Included Quantity fixture");
    const instances = group.options.map((option) => buildOptionInstance(option, sourceMap, createId));
    selection = updateOptionGroup(selection, group.id, instances);

    const result = calculatePublicPreview(envelope(configuration), "restaurant", selection);
    expect(result.valid).toBe(true);
    expect(result.total).toBe("115");
    expect(result.lines.filter((line) => line.included).map((line) => line.amount).sort()).toEqual(["30", "50"]);
  });

  it("creates stable independent instances for repeated linked products", () => {
    const linked = pizzaMargheritaDemo("linked-pizza", 2);
    const configuration: ProductConfigurationV1 = {
      schemaVersion: 1,
      productId: "combo",
      revision: 1,
      basePrice: "0",
      groups: [{
        type: "OPTIONS",
        id: "combo-slots",
        label: "اختيارات الكومبو",
        min: 2,
        max: 2,
        includedQuantity: 0,
        options: [{
          id: "pizza-slot",
          label: "بيتزا",
          price: "50",
          minQuantity: 2,
          maxQuantity: 2,
          linkedProduct: { sourceProductId: "linked-pizza", mode: "ORIGINAL" }
        }]
      }]
    };
    const response = envelope(configuration);
    response.linkedProducts = [{
      productId: "linked-pizza",
      slug: "linked-pizza",
      name: "بيتزا مرتبطة",
      mode: "NETWORK",
      available: true,
      orderable: true,
      configuration: linked
    }];
    const sources = new Map(response.linkedProducts.map((source) => [source.productId, source]));
    const selection = buildInitialSelection(configuration, sources, ids());
    const group = selection.groups[0] as OptionGroupSelection;

    expect(group.instances).toHaveLength(2);
    expect(group.instances[0].instanceId).not.toBe(group.instances[1].instanceId);
    expect(group.instances[0].linkedSelection).not.toBe(group.instances[1].linkedSelection);
    expect(calculatePublicPreview(response, "restaurant", selection)).toMatchObject({ valid: true, total: "100" });
  });

  it("does not produce a price when the server marks a required source unavailable", () => {
    const configuration = pizzaMargheritaDemo("pizza", 1);
    const response = envelope(configuration);
    response.orderable = false;
    response.issues = [{ code: "LINKED_PRODUCT_UNAVAILABLE", path: "$configuration", message: "Unavailable" }];
    const selection = buildInitialSelection(configuration, new Map(), ids());
    const result = calculatePublicPreview(response, "restaurant", selection);

    expect(result.valid).toBe(false);
    expect(result.total).toBeNull();
    expect(result.issues[0].code).toBe("LINKED_PRODUCT_UNAVAILABLE");
  });

  it("keeps null Base distinct from explicit zero", () => {
    const nullBase = pizzaMargheritaDemo("null-base", 1);
    const zeroBase: ProductConfigurationV1 = { ...nullBase, productId: "zero-base", basePrice: "0" };
    expect(nullBase.basePrice).toBeNull();
    expect(zeroBase.basePrice).toBe("0");
  });
});
