import { describe, expect, it, vi } from "vitest";
import { createSelectionKeyV2 as createSelectionKey, subtractMoney, type ProductSelectionV2 } from "@menu/shared";
import type { PublicProduct, PublicProductQuoteResponse } from "@/lib/api";
import {
  acceptNetworkRecheck,
  addOrEditNetworkCartItem,
  applyNetworkRecheck,
  applyRebasedNetworkRecheck,
  cartNeedsPreviewGate,
  createNetworkCartLineId,
  networkCartItemFromQuote,
  putLegacyCartItem,
  restoreCartStorage,
  serializeCartStorage,
  shouldUseTrustedWhatsappCheckout,
  updateCartLineQuantity,
  updateCartLineNote
} from "./cart-model";

const product: PublicProduct = { id: "pizza", slug: "pizza", name: "بيتزا", basePrice: null, currency: "EGP" };

function selection(size = "medium", revision = 1, instanceId = "unit-1", linkedSize = "small"): ProductSelectionV2 {
  return { schemaVersion: 2, productId: "pizza", configurationRevision: revision, groups: [
    { type: "SIZE", groupId: "sizes", sizeChoiceId: size },
    { type: "OPTIONS", groupId: "toppings", instances: [{ instanceId, optionId: "linked", children: [{ type: "OPTIONS", groupId: "sauces", instances: [{ instanceId: `${instanceId}-sauce`, optionId: "bbq" }] }],
      linkedSelection: { schemaVersion: 2, productId: "source", configurationRevision: 1, groups: [{ type: "SIZE", groupId: "source-sizes", sizeChoiceId: linkedSize }] }
    }] }
  ] };
}

function quote(selected = selection(), total = "280.000001", sourceRevision = 1, currency = "EGP", sizePrice = "200"): PublicProductQuoteResponse {
  const result = {
    schemaVersion: 2 as const, productId: "pizza", configurationRevision: selected.configurationRevision,
    selectionKey: createSelectionKey(selected), canonicalSelection: selected, currency, trustedTotal: total,
    baseIgnored: true,
    priceBreakdown: [
      { kind: "SIZE", path: "$selection.groups.sizes", nodeId: "medium", label: "Medium", amount: sizePrice, chargedAmount: sizePrice, included: false },
      { kind: "OPTION", path: "$selection.groups.toppings.unit-1.linked", nodeId: "linked", label: "Pizza slot", sourceProductId: "source", instanceId: "unit-1", amount: subtractMoney(total, sizePrice), chargedAmount: subtractMoney(total, sizePrice), included: false }
    ],
    linkedSourceRevisions: [{ sourceProductId: "source", mode: "NETWORK", configurationRevision: sourceRevision }],
    configurationOrderable: true as const,
    runtimeContext: { scope: "RESTAURANT" as const, outletDifferentialApplied: false as const, serviceModeApplied: false as const, productScheduleApplied: false as const }
  };
  return {...result,snapshot:{snapshotVersion:2,productId:result.productId,productName:product.name,currency,
    configurationRevision:selected.configurationRevision,selectionKey:result.selectionKey,selection:selected,total,
    baseIgnored:true,priceLines:result.priceBreakdown as PublicProductQuoteResponse["priceBreakdown"],createdAt:"2026-11-15T00:00:00Z"}} as PublicProductQuoteResponse;
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
    expect((merged[0] as typeof first).selection.groups[1]).toMatchObject({ type: "OPTIONS", instances: [expect.objectContaining({ instanceId: "another-instance" })] });
  });

  it("keeps different sizes, revisions, linked child choices, source revisions, restaurants, and currencies apart", () => {
    const first = item();
    const variants = [
      item(selection("large"), "300", 1, "size"),
      item(selection("medium", 2), "280", 1, "revision"),
      item(selection("medium", 1, "another", "large"), "290", 1, "linked-child"),
      item(selection(), "280", 2, "source-revision"),
      networkCartItemFromQuote({ product, restaurantSlug: "restaurant-b", quote: quote(), lineId: "other-tenant" })!,
      networkCartItemFromQuote({ product: { ...product, currency: "USD" }, restaurantSlug: "restaurant-a", quote: quote(selection(), "280", 1, "USD"), lineId: "other-currency" })!
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

  it("adds the selected draft quantity without merging different configurations", () => {
    const first = item();
    const different = item(selection("large"), "300", 1, "line-large");
    const cart = addOrEditNetworkCartItem([first], different, undefined, 3);
    expect(cart).toHaveLength(2);
    expect(cart[0]).toMatchObject({ lineId: first.lineId, quantity: 1 });
    expect(cart[1]).toMatchObject({ lineId: different.lineId, quantity: 3 });
    const edited = addOrEditNetworkCartItem(cart, { ...different, lineId: "replacement" }, different.lineId, 2);
    expect(edited.find((line) => line.lineId === different.lineId)).toMatchObject({ quantity: 2 });
    expect(addOrEditNetworkCartItem(cart, different, undefined, 99)).toEqual(cart);
  });

  it("keeps independently noted configurations separate and preserves a note through editing", () => {
    const first = { ...item(), note: "بدون ملح" };
    const second = { ...item(selection("medium", 1, "other"), "280.000001", 1, "line-2"), note: "حار" };
    const separate = addOrEditNetworkCartItem([first], second);
    expect(separate).toHaveLength(2);
    expect(separate.map((line) => line.note)).toEqual(["بدون ملح", "حار"]);
    const edited = addOrEditNetworkCartItem(separate, { ...item(selection("large"), "300", 1, "new"), note: "بدون ملح" }, first.lineId, 2);
    expect(edited).toHaveLength(2);
    expect(edited.find((line) => line.lineId === first.lineId)).toMatchObject({ quantity: 2, note: "بدون ملح" });
    expect(edited.find((line) => line.lineId === second.lineId)).toMatchObject({ quantity: 1, note: "حار" });
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

  it("generates checkout-compatible Network IDs even when clock and random output repeat", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1792936393075);
    const random = vi.spyOn(Math, "random").mockReturnValue(0.7452965834847075);
    try {
      const first = createNetworkCartLineId();
      const second = createNetworkCartLineId([first]);
      expect(first).toMatch(/^[A-Za-z0-9:_-]{1,128}$/);
      expect(second).toMatch(/^[A-Za-z0-9:_-]{1,128}$/);
      expect(second).not.toBe(first);
    } finally {
      clock.mockRestore();
      random.mockRestore();
    }
  });

  it("repairs old dotted and duplicate IDs without losing or merging independent configurations", () => {
    const first = { ...item(selection("small"), "200", 1, "network-1-0.123"), quantity: 3, note: "first" };
    const second = { ...item(selection("large"), "300", 1, "network-1-0.123"), quantity: 2, note: "second" };
    const third = item(selection("medium"), "280", 1, "valid-id");
    const restored = restoreCartStorage(serializeCartStorage([first, second, third], "restaurant-a"), "restaurant-a", "EGP");
    expect(restored).toHaveLength(3);
    expect(new Set(restored.map((line) => line.lineId)).size).toBe(3);
    expect(restored.every((line) => /^[A-Za-z0-9:_-]{1,128}$/.test(line.lineId))).toBe(true);
    expect(restored.map((line) => line.quantity)).toEqual([3, 2, 1]);
    expect(restored.map((line) => line.mode === "NETWORK" ? line.note : undefined)).toEqual(["first", "second", undefined]);
    expect(restored.map((line) => line.mode === "NETWORK" ? line.identity : "")).toEqual([first.identity, second.identity, third.identity]);
    expect(restored[2].lineId).toBe("valid-id");
    const reloaded = restoreCartStorage(serializeCartStorage(restored, "restaurant-a"), "restaurant-a", "EGP");
    expect(reloaded.map((line) => line.lineId)).toEqual(restored.map((line) => line.lineId));
  });

  it("shows changed prices or sources without automatic acceptance, then accepts only the same re-quoted proposal", () => {
    const first = { ...item(), note: "بدون بصل", quantity: 2 };
    const proposed = quote(selection(), "285.000001", 2);
    const changed = applyNetworkRecheck(first, proposed);
    expect(changed).toMatchObject({ status: "CHANGED", acceptedQuote: { total: "280.000001" }, proposedQuote: { total: "285.000001" } });
    const movedAgain = acceptNetworkRecheck(changed, quote(selection(), "290", 2));
    expect(movedAgain).toMatchObject({ status: "CHANGED", acceptedQuote: { total: "280.000001" }, proposedQuote: { total: "290" } });
    const accepted = acceptNetworkRecheck(changed, proposed);
    expect(accepted).toMatchObject({ status: "CURRENT", acceptedQuote: { total: "285.000001" } });
    expect(accepted).toMatchObject({ lineId: first.lineId, quantity: 2, note: "بدون بصل" });
    expect(accepted.identity).not.toBe(first.identity);
    const differentMode = { ...proposed, linkedSourceRevisions: [{ sourceProductId: "source", mode: "LEGACY" as const, configurationRevision: 2 }] };
    expect(acceptNetworkRecheck(changed, differentMode).status).toBe("CHANGED");
  });

  it("keeps revision-changed prices pending explicit acceptance without changing choices, note, or quantity", () => {
    const first = { ...item(), quantity: 3, note: "لا بصل" };
    const rebased = { ...first.selection, configurationRevision: 2 };
    const currentQuote = quote(rebased, "285.000001", 2, "EGP", "205");
    const changed = applyRebasedNetworkRecheck(first, currentQuote, rebased);
    expect(changed).toMatchObject({ status: "CHANGED", selectionKey: first.selectionKey,
      proposedSelection: { configurationRevision: 2 }, proposedQuote: { total: "285.000001" } });
    expect(acceptNetworkRecheck(changed, quote(rebased, "290", 2)).status).toBe("CHANGED");
    const accepted = acceptNetworkRecheck(changed, currentQuote);
    expect(accepted).toMatchObject({ status: "CURRENT", configurationRevision: 2, quantity: 3, note: "لا بصل" });
    expect(accepted.selectionKey).toBe(createSelectionKey(rebased));
    expect(accepted.selection.groups).toEqual(first.selection.groups);
    const renamed = { ...currentQuote, priceBreakdown: currentQuote.priceBreakdown.map((line, index) => index === 0
      ? { ...line, label: "New size name" } : line) };
    expect(applyRebasedNetworkRecheck(first, renamed, rebased).status).toBe("INVALID");
  });

  it("requires explicit acceptance even when a configuration revision changes without changing its price", () => {
    const first=item(),rebased={...first.selection,configurationRevision:2};
    const samePrice=quote(rebased,first.acceptedQuote.total,1);
    const changed=applyRebasedNetworkRecheck(first,samePrice,rebased);
    expect(changed.status).toBe("CHANGED");expect(changed.configurationRevision).toBe(1);
    expect(acceptNetworkRecheck(changed,samePrice).configurationRevision).toBe(2);
  });
  it.each(["snapshot-selection","snapshot-revision","breakdown-sum"])("rejects inconsistent V2 response %s before insertion", kind => {
    const q=structuredClone(quote());
    if(kind==="snapshot-selection")q.snapshot.selection={...q.snapshot.selection,configurationRevision:99};
    if(kind==="snapshot-revision")q.snapshot.configurationRevision=99;
    if(kind==="breakdown-sum"){q.priceBreakdown[0].chargedAmount="201";q.snapshot.priceLines=q.priceBreakdown;}
    expect(networkCartItemFromQuote({product,restaurantSlug:"restaurant-a",quote:q,lineId:"inconsistent"})).toBeNull();
  });

  it("rejects a forged quote contract before cart insertion", () => {
    expect(networkCartItemFromQuote({ product, restaurantSlug: "restaurant-a", quote: { ...quote(), trustedTotal: "1", selectionKey: "tampered" }, lineId: "forged" })).toBeNull();
    expect(networkCartItemFromQuote({ product, restaurantSlug: "restaurant-a", quote: { ...quote(), snapshot: { ...quote().snapshot, snapshotVersion: 1 as 2 } }, lineId: "forged" })).toBeNull();
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

  it("changes only the selected Network line, enforces the existing 100-unit cart limit, and removes at zero", () => {
    const small = item(selection("small"), "200", 1, "line-small");
    const large = item(selection("large"), "300", 1, "line-large");
    const cart = [small, large];
    const increased = updateCartLineQuantity(cart, small.lineId, 2);
    expect(increased).toMatchObject([{ lineId: "line-small", quantity: 2 }, { lineId: "line-large", quantity: 1 }]);
    expect(increased[1]).toBe(large);
    expect(updateCartLineQuantity(increased, small.lineId, 100)).toEqual(increased);
    expect(updateCartLineQuantity(increased, small.lineId, 0)).toEqual([large]);
    expect(cart).toMatchObject([{ quantity: 1 }, { quantity: 1 }]);
  });

  it("blocks old checkout when Network exists or a stored Legacy line became Network", () => {
    const legacy = restoreCartStorage(JSON.stringify([{ slug: "water", name: "Water", price: 0, quantity: 1 }]), "restaurant-a", "EGP");
    expect(cartNeedsPreviewGate(legacy, [{ id: "water", slug: "water", name: "Water", basePrice: 0, currency: "EGP" }])).toBe(false);
    expect(cartNeedsPreviewGate([...legacy, item()], [])).toBe(true);
    expect(cartNeedsPreviewGate(legacy, [{ id: "water", slug: "water", name: "Water", basePrice: null, currency: "EGP", productConfiguration: {
      mode: "NETWORK", configurationRevision: 1, orderable: true,
      minimumPrice: "0", priceDisplay: "EXACT", issueCodes: []
    } }])).toBe(true);
  });

  it("restores a mixed cart with exact Legacy price hints and independent item notes", () => {
    const legacyProduct: PublicProduct = {
      id: "water", slug: "water", name: "Water", basePrice: 1.25,
      basePriceExact: "1.250001", currency: "EGP"
    };
    const legacy = putLegacyCartItem([], legacyProduct, 1.25, null, 2);
    const network = addOrEditNetworkCartItem(legacy, item());
    const noted = updateCartLineNote(updateCartLineNote(network, "legacy:water", "Cold"), "line-1", "No onion");
    const restored = restoreCartStorage(serializeCartStorage(noted, "restaurant-a"), "restaurant-a", "EGP");
    expect(restored).toHaveLength(2);
    expect(restored[0]).toMatchObject({ mode: "LEGACY", priceText: "1.250001", note: "Cold", quantity: 2 });
    expect(restored[1]).toMatchObject({ mode: "NETWORK", note: "No onion", status: "CHECKING" });
  });

  it("routes Legacy-only to the persisted checkout regardless of the Network flag", () => {
    const legacy = putLegacyCartItem([], { id: "water", slug: "water", name: "Water", basePrice: 0,
      currency: "EGP" }, 0, null, 1);
    const network = item();
    expect(shouldUseTrustedWhatsappCheckout(legacy, false)).toBe(false);
    expect(shouldUseTrustedWhatsappCheckout(legacy, true)).toBe(false);
    expect(shouldUseTrustedWhatsappCheckout([network], false)).toBe(false);
    expect(shouldUseTrustedWhatsappCheckout([network], true)).toBe(true);
    expect(shouldUseTrustedWhatsappCheckout([...legacy, network], true)).toBe(true);
  });
});
