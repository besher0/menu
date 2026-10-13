import type { ProductSelectionV1, PriceLine } from "@menu/shared";
import type { CartItem } from "./cart-model";

export type TestOrderDetails = {
  customerName?: string;
  customerPhone?: string;
  fulfillmentType?: "pickup" | "delivery";
  deliveryArea?: string;
  deliveryNear?: string;
  deliveryBeside?: string;
  pickupTime?: string;
  orderNote?: string;
};

export type TestOrderRequest = TestOrderDetails & {
  locale: "ar" | "en";
  items: Array<{ productId: string; quantity: number; selection: ProductSelectionV1; note?: string }>;
};

export type TrustedTestDraft = {
  schemaVersion: 1;
  restaurantId: string;
  restaurantSlug: string;
  currency: string;
  locale: "ar" | "en";
  orderDetails: TestOrderDetails & { restaurantName: string };
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    note?: string;
    unitPrice: string;
    lineTotal: string;
    priceBreakdown: PriceLine[];
  }>;
  totalAmount: string;
  orderingEnabled: false;
};

/** Local Cart is selection transport only. No local price, name, or total enters the Order request. */
export function testOrderRequestFromCart(
  cart: readonly CartItem[], restaurantSlug: string, currency: string,
  locale: "ar" | "en", details: TestOrderDetails, notes: Record<string, string>
): TestOrderRequest {
  if (!cart.length || cart.some((line) => line.mode !== "NETWORK")) {
    throw new Error("NETWORK_ONLY_CART_REQUIRED");
  }
  const items = cart.map((line) => {
    if (line.mode !== "NETWORK" || line.restaurantSlug !== restaurantSlug || line.currency !== currency
      || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 100) {
      throw new Error("NETWORK_CART_CONTEXT_INVALID");
    }
    const note = notes[line.lineId]?.trim();
    return { productId: line.productId, quantity: line.quantity, selection: line.selection,
      ...(note ? { note } : {}) };
  });
  return { locale, items, ...Object.fromEntries(Object.entries(details).filter(([, value]) => Boolean(value?.trim()))) };
}

export function draftNeedsFreshAcceptance(previous: TrustedTestDraft, current: TrustedTestDraft): boolean {
  return previous.currency !== current.currency || previous.totalAmount !== current.totalAmount
    || JSON.stringify(previous.items) !== JSON.stringify(current.items)
    || JSON.stringify(previous.orderDetails) !== JSON.stringify(current.orderDetails);
}
