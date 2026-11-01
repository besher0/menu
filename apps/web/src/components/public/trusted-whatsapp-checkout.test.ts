import { describe, expect, it } from "vitest";
import { PublicWhatsappCheckoutError, type PublicWhatsappCheckoutDraft, type PublicWhatsappCheckoutRequest } from "@/lib/api";
import { buildTrustedCheckoutRequest, compareTrustedDraft, trustedCheckoutErrorMessage } from "./trusted-whatsapp-checkout";

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
  itemsSubtotal: "12.625000", deliveryFee: null, totalAmount: "12.625000", requiresExplicitAcceptance: true
};

const compare = (value: PublicWhatsappCheckoutDraft, displayed = "12.625000") =>
  compareTrustedDraft(value, request, displayed, "demo", "ar");

describe("trusted checkout visible-invoice acceptance", () => {
  it("accepts only a matching server draft, preserving six-decimal precision", () => {
    expect(compare(draft)).toBe("CURRENT");
    expect(compare({ ...draft, itemsSubtotal: "12.625001", totalAmount: "12.625001" })).toBe("PRICE_CHANGED");
    expect(compare({ ...draft, items: [draft.items[0], { ...draft.items[1], unitPrice: "10.125001" }] })).toBe("PRICE_CHANGED");
  });

  it("requires acceptance when the server delivery fee changes, including pending versus free", () => {
    const delivery = { ...request, fulfillmentType: "delivery" as const };
    expect(compareTrustedDraft({ ...draft, deliveryFee: "0", totalAmount: "12.625000" }, delivery,
      "12.625000", "demo", "ar", null)).toBe("PRICE_CHANGED");
    expect(compareTrustedDraft({ ...draft, deliveryFee: "5", totalAmount: "17.625000" }, delivery,
      "12.625000", "demo", "ar", "0")).toBe("PRICE_CHANGED");
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

describe("checkout delivery fields and customer-safe errors", () => {
  const details = {
    customerName: "", customerPhone: "", fulfillmentType: "delivery" as const,
    deliveryArea: " حلب ", deliveryNear: " الباسل ", pickupTime: "old pickup time", orderNote: ""
  };

  it("sends only the active fulfillment fields, even when stale state contains a pickup time", () => {
    const delivery = buildTrustedCheckoutRequest([], "ar", details);
    expect(delivery).toMatchObject({ fulfillmentType: "delivery", deliveryArea: "حلب", deliveryNear: "الباسل" });
    expect(delivery).not.toHaveProperty("deliveryBeside");
    expect(delivery).not.toHaveProperty("pickupTime");
    const pickup = buildTrustedCheckoutRequest([], "ar", { ...details, fulfillmentType: "pickup" });
    expect(pickup.pickupTime).toBe("old pickup time");
    expect(pickup).not.toHaveProperty("deliveryArea");
    expect(pickup).not.toHaveProperty("deliveryNear");
  });

  it("never shows raw server field names or English validation text on an Arabic menu", () => {
    const staleServer = new PublicWhatsappCheckoutError(
      "Delivery requires area, near and beside; pickupTime is not applicable.", 400, "INVALID_NETWORK_ORDER_DETAILS");
    const message = trustedCheckoutErrorMessage(staleServer, "ar", details);
    expect(message).toContain("عنوان التوصيل");
    expect(message).not.toMatch(/beside|pickupTime|Delivery/);
    expect(trustedCheckoutErrorMessage(staleServer, "ar", { ...details, deliveryArea: "" })).toBe("يرجى إدخال منطقة التوصيل.");
    expect(trustedCheckoutErrorMessage(staleServer, "en", { ...details, deliveryNear: "" })).toBe("Enter a nearby landmark for delivery.");
    expect(trustedCheckoutErrorMessage(new PublicWhatsappCheckoutError("internal SQL detail", 500, "UNKNOWN"), "ar", details))
      .not.toContain("SQL");
  });
});
