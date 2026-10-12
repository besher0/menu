import { describe, expect, it } from "vitest";
import type { OptionGroupSelection, ProductConfigurationV1 } from "@menu/shared";
import type { PublicProductConfigurationResponse } from "@/lib/api";
import { includedQuantityDemo, pizzaMargheritaDemo } from "../dashboard/product-configuration/demos";
import {
  buildInitialSelection,
  buildOptionInstance,
  canAddOptionInstance,
  calculatePublicPreview,
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
