import { describe, expect, it } from "vitest";
import { calculatePrice, validateConfiguration } from "@menu/shared";
import { buildSelection } from "./configuration-preview";
import { includedQuantityDemo, pizzaMargheritaDemo } from "./demos";
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
import type { ProductConfigurationEnvelope } from "./types";

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
    expect(validateConfiguration({ ...empty, basePrice: "0" })).toEqual([expect.objectContaining({code:"UNSUPPORTED_CONFIGURATION_V1"})]);
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

// The old editor is not mounted. Its positive financial cases were ported to V2:
// v62-model.test.ts, public/product-configurator-model.test.ts and real ordering HTTP/browser acceptance.
// Keep a negative guard for historical drafts until their separately reviewed file retirement.
describe("retired V1 samples never activate customer pricing", () => {
  it.each([pizzaMargheritaDemo, includedQuantityDemo])("rejects historical sample %s rather than providing a V1 financial engine", factory => {
    const tree=factory("product-1",1), selected=buildSelection(tree,new Map());
    const result=calculatePrice(tree,selected,{catalogId:"restaurant-a",linkedProducts:new Map()});
    expect(result.valid).toBe(false);expect(result.total).toBeNull();
    expect(result.issues).toEqual([expect.objectContaining({code:"UNSUPPORTED_CONFIGURATION_V1"})]);
  });
});
