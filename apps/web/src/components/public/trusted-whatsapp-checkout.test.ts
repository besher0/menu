import { describe, expect, it } from "vitest";
import type { PublicWhatsappCheckoutDraft, PublicWhatsappCheckoutRequest } from "@/lib/api";
import { compareTrustedDraft } from "./trusted-whatsapp-checkout";

const request: PublicWhatsappCheckoutRequest = {
  locale: "ar", fulfillmentType: "pickup",
  items: [
    { mode: "LEGACY", lineId: "old", productSlug: "water", quantity: 2, expectedUnitPrice: "1.250000" },
    { mode: "NETWORK", lineId: "pizza", productId: "pizza", quantity: 1, expectedUnitPrice: "10.125000" }
  ]
};
const draft: PublicWhatsappCheckoutDraft = {
  restaurantName: "تجريبي", restaurantSlug: "demo", currency: "USD", locale: "ar", details: {},
  items: [
    { mode: "LEGACY", lineId: "old", productName: "Water", quantity: 2, unitPrice: "1.250000", lineTotal: "2.500000", changed: false },
    { mode: "NETWORK", lineId: "pizza", productName: "بيتزا", quantity: 1, unitPrice: "10.125000", lineTotal: "10.125000", changed: false }
  ],
  totalAmount: "12.625000", requiresExplicitAcceptance: true
};

const compare = (value: PublicWhatsappCheckoutDraft, displayed = "12.625000") =>
  compareTrustedDraft(value, request, displayed, "demo", "ar");

describe("trusted checkout visible-invoice acceptance", () => {
  it("accepts only a matching server draft, preserving six-decimal precision", () => {
    expect(compare(draft)).toBe("CURRENT");
    expect(compare({ ...draft, totalAmount: "12.625001" })).toBe("PRICE_CHANGED");
    expect(compare({ ...draft, items: [draft.items[0], { ...draft.items[1], unitPrice: "10.125001" }] })).toBe("PRICE_CHANGED");
  });

  it("does not silently accept a changed linked source even when the total is equal", () => {
    expect(compare({ ...draft, items: [draft.items[0], { ...draft.items[1], changed: true }] })).toBe("SOURCE_CHANGED");
  });

  it("rejects a different restaurant, line identity, order, or quantity", () => {
    expect(compare({ ...draft, restaurantSlug: "another" })).toBe("INVALID");
    expect(compare({ ...draft, items: [...draft.items].reverse() })).toBe("INVALID");
    expect(compare({ ...draft, items: [{ ...draft.items[0], quantity: 3 }, draft.items[1]] })).toBe("INVALID");
    expect(compare({ ...draft, items: [{ ...draft.items[0], lineId: "other" }, draft.items[1]] })).toBe("INVALID");
  });
});
