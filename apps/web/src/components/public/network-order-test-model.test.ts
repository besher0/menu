import { describe, expect, it } from "vitest";
import { createSelectionKey } from "@menu/shared";
import { draftNeedsFreshAcceptance, testOrderRequestFromCart, type TrustedTestDraft } from "./network-order-test-model";
import { isNetworkOrderTestHostAllowed } from "@/lib/network-order-test-guard";
import type { NetworkCartItem } from "./cart-model";

const selection = { schemaVersion: 1 as const, productId: "pizza", configurationRevision: 2,
  groups: [{ type: "SIZE" as const, groupId: "sizes", sizeChoiceId: "large" }] };
const item: NetworkCartItem = {
  mode: "NETWORK", lineId: "line-1", identity: "test", restaurantSlug: "demo", productId: "pizza", slug: "pizza",
  name: "Pizza", quantity: 2, currency: "EGP", selection, selectionKey: createSelectionKey(selection), configurationRevision: 2,
  runtimeContext: { scope: "RESTAURANT", outletDifferentialApplied: false, serviceModeApplied: false, productScheduleApplied: false },
  acceptedQuote: { total: "1.000001", priceBreakdown: [], linkedSourceRevisions: [] }, status: "CURRENT", issues: []
};

describe("isolated Network order request", () => {
  it("transports only selection and quantity, never Local Storage names, totals or prices", () => {
    const request = testOrderRequestFromCart([item], "demo", "EGP", "ar", { customerName: "Demo", fulfillmentType: "pickup" }, { "line-1": "No onion" });
    expect(request).toEqual({ locale: "ar", items: [{ productId: "pizza", quantity: 2, selection, note: "No onion" }],
      customerName: "Demo", fulfillmentType: "pickup" });
    expect(JSON.stringify(request)).not.toContain("1.000001");
    expect(JSON.stringify(request)).not.toContain("Pizza");
  });

  it("refuses mixed carts, wrong tenant/currency, and empty carts", () => {
    expect(() => testOrderRequestFromCart([], "demo", "EGP", "ar", {}, {})).toThrow();
    expect(() => testOrderRequestFromCart([item, { mode: "LEGACY", lineId: "legacy", slug: "old", name: "Old", quantity: 1, price: 2, currency: "EGP" }], "demo", "EGP", "ar", {}, {})).toThrow();
    expect(() => testOrderRequestFromCart([{ ...item, restaurantSlug: "other" }], "demo", "EGP", "ar", {}, {})).toThrow();
    expect(() => testOrderRequestFromCart([{ ...item, currency: "USD" }], "demo", "EGP", "ar", {}, {})).toThrow();
  });

  it("requires fresh acceptance for changed trusted totals or details", () => {
    const draft = { currency: "EGP", totalAmount: "10.000001", items: [{ unitPrice: "10.000001" }], orderDetails: { restaurantName: "Demo" } } as TrustedTestDraft;
    expect(draftNeedsFreshAcceptance(draft, { ...draft, totalAmount: "10.000002" })).toBe(true);
    expect(draftNeedsFreshAcceptance(draft, { ...draft, orderDetails: { restaurantName: "Demo", customerName: "Other" } })).toBe(true);
    expect(draftNeedsFreshAcceptance(draft, { ...draft })).toBe(false);
  });

  it("hides demo outside explicit local non-production server conditions", () => {
    expect(isNetworkOrderTestHostAllowed("development", "1", "localhost:3000", "http://127.0.0.1:5000")).toBe(true);
    expect(isNetworkOrderTestHostAllowed("production", "1", "localhost:3000", "http://127.0.0.1:5000")).toBe(false);
    expect(isNetworkOrderTestHostAllowed("development", undefined, "localhost:3000", "http://127.0.0.1:5000")).toBe(false);
    expect(isNetworkOrderTestHostAllowed("development", "1", "example.com", "http://127.0.0.1:5000")).toBe(false);
    expect(isNetworkOrderTestHostAllowed("development", "1", "localhost:3000", "https://api.example.com")).toBe(false);
  });
});
