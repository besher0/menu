import { describe, expect, it } from "vitest";
import { createSelectionKey, type ProductSelectionV1 } from "@menu/shared";
import type { PublicProduct, PublicProductQuoteResponse } from "@/lib/api";
import {
  acceptNetworkRecheck,
  addOrEditNetworkCartItem,
  applyNetworkRecheck,
  cartNeedsPreviewGate,
  networkCartItemFromQuote,
  putLegacyCartItem,
  restoreCartStorage,
  serializeCartStorage,
  updateCartLineQuantity
} from "./cart-model";

const product: PublicProduct = { id: "pizza", slug: "pizza", name: "بيتزا", basePrice: null, currency: "EGP" };

function selection(size = "medium", revision = 1, instanceId = "unit-1", linkedSize = "small"): ProductSelectionV1 {
  return { schemaVersion: 1, productId: "pizza", configurationRevision: revision, groups: [
    { type: "SIZE", groupId: "sizes", sizeChoiceId: size },
    { type: "OPTIONS", groupId: "toppings", instances: [{ instanceId, optionId: "linked", children: [{ type: "OPTIONS", groupId: "sauces", instances: [{ instanceId: `${instanceId}-sauce`, optionId: "bbq" }] }],
      linkedSelection: { schemaVersion: 1, productId: "source", configurationRevision: 1, groups: [{ type: "SIZE", groupId: "source-sizes", sizeChoiceId: linkedSize }] }
    }] }
  ] };
}

function quote(selected = selection(), total = "280.000001", sourceRevision = 1): PublicProductQuoteResponse {
  return {
    schemaVersion: 1, productId: "pizza", configurationRevision: selected.configurationRevision,
    selectionKey: createSelectionKey(selected), canonicalSelection: selected, currency: "EGP", trustedTotal: total,
    baseIgnored: true,
    priceBreakdown: [
      { kind: "SIZE", path: "$selection.groups.sizes", nodeId: "medium", label: "Medium", amount: "200", chargedAmount: "200", included: false },
      { kind: "OPTION", path: "$selection.groups.toppings.unit-1.linked", nodeId: "linked", label: "Pizza slot", sourceProductId: "source", instanceId: "unit-1", amount: "80.000001", chargedAmount: "80.000001", included: false }
    ],
    linkedSourceRevisions: [{ sourceProductId: "source", mode: "NETWORK", configurationRevision: sourceRevision }],
    configurationOrderable: true, previewOnly: true, orderAction: "STAGE_6_REQUIRED", orderingEnabled: false,
    runtimeContext: { scope: "RESTAURANT", outletDifferentialApplied: false, serviceModeApplied: false, productScheduleApplied: false }
  };
}

function item(selected = selection(), total = "280.000001", sourceRevision = 1, lineId = "line-1") {
  const value = networkCartItemFromQuote({ product, restaurantSlug: "restaurant-a", quote: quote(selected, total, sourceRevision), lineId });
  if (!value) throw new Error("Expected valid fixture quote");
  return value;
}

describe("versioned public cart model", () => {
  it("adds one Network product and merges semantically equal selections with different unit IDs", () => {
    const first = item();
    const equivalent = item(selection("medium", 1, "another-instance"), "280.000001", 1, "line-2");
    expect(first.selectionKey).toBe(equivalent.selectionKey);
    const merged = addOrEditNetworkCartItem([first], equivalent);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ mode: "NETWORK", quantity: 2, lineId: "line-1" });
    expect((merged[0] as typeof first).selection.groups[1]).toMatchObject({ type: "OPTIONS", instances: [expect.objectContaining({ instanceId: "unit-1" })] });
  });

  it("keeps different sizes, revisions, linked child choices, source revisions, restaurants, and currencies apart", () => {
    const first = item();
    const variants = [
      item(selection("large"), "300", 1, "size"),
      item(selection("medium", 2), "280", 1, "revision"),
      item(selection("medium", 1, "another", "large"), "290", 1, "linked-child"),
      item(selection(), "280", 2, "source-revision"),
      networkCartItemFromQuote({ product, restaurantSlug: "restaurant-b", quote: quote(), lineId: "other-tenant" })!,
      networkCartItemFromQuote({ product: { ...product, currency: "USD" }, restaurantSlug: "restaurant-a", quote: { ...quote(), currency: "USD" }, lineId: "other-currency" })!
    ];
    const cart = variants.reduce((current, variant) => addOrEditNetworkCartItem(current, variant), [first] as ReturnType<typeof addOrEditNetworkCartItem>);
    expect(cart).toHaveLength(7);
    expect(new Set(cart.map((line) => line.mode === "NETWORK" ? line.identity : line.lineId)).size).toBe(7);
  });

  it("edits a line without mutating the old selection and merges if the new identity already exists", () => {
    const first = item();
    const large = item(selection("large"), "300", 1, "line-large");
    const edited = addOrEditNetworkCartItem([first, large], { ...large, lineId: "fresh" }, first.lineId);
    expect(edited).toHaveLength(1);
    expect(edited[0]).toMatchObject({ lineId: "line-large", quantity: 2 });
    expect(first.selection.groups[0]).toMatchObject({ sizeChoiceId: "medium" });
  });

  it("restores old Legacy arrays including explicit zero and safely rejects null price/corrupt entries", () => {
    const restored = restoreCartStorage(JSON.stringify([
      { slug: "zero", name: "Zero", quantity: 2, price: 0, currency: "EGP" },
      { slug: "null", name: "No base", quantity: 1, price: null, currency: "EGP" },
      { slug: "broken", quantity: -1, price: 7 }
    ]), "restaurant-a", "EGP");
    expect(restored).toEqual([expect.objectContaining({ mode: "LEGACY", slug: "zero", price: 0, quantity: 2 })]);
    expect(restoreCartStorage("not-json", "restaurant-a", "EGP")).toEqual([]);
  });

  it("persists Network selection instances and restores every quote as untrusted CHECKING", () => {
    const first = item();
    const restored = restoreCartStorage(serializeCartStorage([first], "restaurant-a"), "restaurant-a", "EGP");
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ mode: "NETWORK", status: "CHECKING", lineId: first.lineId, identity: first.identity });
    expect((restored[0] as typeof first).selection).toEqual(first.selection);
    expect(restoreCartStorage(serializeCartStorage([first], "restaurant-a"), "restaurant-b", "EGP")).toEqual([]);
    expect(restoreCartStorage(serializeCartStorage([first], "restaurant-a"), "restaurant-a", "USD")).toEqual([]);
  });

  it("shows changed prices or sources without automatic acceptance, then accepts only the same re-quoted proposal", () => {
    const first = item();
    const proposed = quote(selection(), "285.000001", 2);
    const changed = applyNetworkRecheck(first, proposed);
    expect(changed).toMatchObject({ status: "CHANGED", acceptedQuote: { total: "280.000001" }, proposedQuote: { total: "285.000001" } });
    const movedAgain = acceptNetworkRecheck(changed, quote(selection(), "290", 2));
    expect(movedAgain).toMatchObject({ status: "CHANGED", acceptedQuote: { total: "280.000001" }, proposedQuote: { total: "290" } });
    const accepted = acceptNetworkRecheck(changed, proposed);
    expect(accepted).toMatchObject({ status: "CURRENT", acceptedQuote: { total: "285.000001" } });
    expect(accepted.identity).not.toBe(first.identity);
    const differentMode = { ...proposed, linkedSourceRevisions: [{ sourceProductId: "source", mode: "LEGACY" as const, configurationRevision: 2 }] };
    expect(acceptNetworkRecheck(changed, differentMode).status).toBe("CHANGED");
  });

  it("rejects a forged quote contract before cart insertion", () => {
    expect(networkCartItemFromQuote({ product, restaurantSlug: "restaurant-a", quote: { ...quote(), trustedTotal: "1", selectionKey: "tampered" }, lineId: "forged" })).toBeNull();
    expect(networkCartItemFromQuote({ product, restaurantSlug: "restaurant-a", quote: { ...quote(), orderingEnabled: true as false }, lineId: "forged" })).toBeNull();
  });

  it("keeps Legacy add, edit, delete and explicit zero price independent from Network lines", () => {
    const legacyProduct: PublicProduct = { id: "water", slug: "water", name: "ماء", basePrice: 0, currency: "EGP" };
    const network = item();
    const added = putLegacyCartItem([network], legacyProduct, 0, null, 1);
    expect(added).toHaveLength(2);
    expect(added[1]).toMatchObject({ mode: "LEGACY", quantity: 1, price: 0 });
    const updated = putLegacyCartItem(added, legacyProduct, 0, null, 3);
    expect(updated[1]).toMatchObject({ mode: "LEGACY", quantity: 3, price: 0 });
    expect(updateCartLineQuantity(updated, network.lineId, 2)[0]).toMatchObject({ mode: "NETWORK", quantity: 2 });
    expect(updateCartLineQuantity(updated, "legacy:water", 0)).toEqual([network]);
    expect(putLegacyCartItem(updated, legacyProduct, 0, null, 0)).toEqual([network]);
  });

  it("blocks old checkout when Network exists or a stored Legacy line became Network", () => {
    const legacy = restoreCartStorage(JSON.stringify([{ slug: "water", name: "Water", price: 0, quantity: 1 }]), "restaurant-a", "EGP");
    expect(cartNeedsPreviewGate(legacy, [{ id: "water", slug: "water", name: "Water", basePrice: 0, currency: "EGP" }])).toBe(false);
    expect(cartNeedsPreviewGate([...legacy, item()], [])).toBe(true);
    expect(cartNeedsPreviewGate(legacy, [{ id: "water", slug: "water", name: "Water", basePrice: null, currency: "EGP", productConfiguration: {
      mode: "NETWORK", configurationRevision: 1, orderable: true, previewOnly: true,
      minimumPrice: "0", priceDisplay: "EXACT", issueCodes: []
    } }])).toBe(true);
  });
});
