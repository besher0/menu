import { BadRequestException } from "@nestjs/common";
import { DEFAULT_ENGINE_LIMITS, validateMoneyString, type ProductSelectionV1 } from "@menu/shared";
import { parseNetworkOrderDetails, type NetworkOrderDetails } from "../orders/network-order-contract";
import { parsePublicQuoteSelection } from "./public-product-quote";

export type WhatsappCheckoutLine = {
  mode: "LEGACY" | "NETWORK";
  lineId: string;
  productSlug?: string;
  productId?: string;
  quantity: number;
  selection?: ProductSelectionV1;
  note?: string;
  expectedUnitPrice?: string;
  expectedLinkedSourceRevisions?: { sourceProductId: string; mode: "NETWORK" | "LEGACY"; configurationRevision: number }[];
};

export type WhatsappCheckoutRequest = NetworkOrderDetails & {
  locale: "ar" | "en";
  branchSlug?: string;
  items: WhatsappCheckoutLine[];
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(code: string, message: string): never {
  throw new BadRequestException({ error: code, message, issues: [{ code, path: "$request", message }] });
}

function optionalText(value: unknown, field: string, limit: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") fail("INVALID_WHATSAPP_CHECKOUT_FIELD", `${field} must be text.`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > limit || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(trimmed)) {
    fail("INVALID_WHATSAPP_CHECKOUT_FIELD", `${field} contains unsafe text or exceeds its limit.`);
  }
  return trimmed;
}

export function parseWhatsappCheckoutRequest(value: unknown): WhatsappCheckoutRequest {
  if (!record(value)) fail("INVALID_WHATSAPP_CHECKOUT_REQUEST", "Expected an object.");
  const allowed = ["locale", "branchSlug", "items", "customerName", "customerPhone", "fulfillmentType",
    "deliveryArea", "deliveryNear", "deliveryBeside", "pickupTime", "orderNote"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    fail("UNEXPECTED_WHATSAPP_CHECKOUT_FIELD", "Client totals, prices, and unknown fields are not accepted.");
  }
  if ((value.locale !== "ar" && value.locale !== "en") || !Array.isArray(value.items)
    || value.items.length < 1 || value.items.length > 50) {
    fail("INVALID_WHATSAPP_CHECKOUT_REQUEST", "Expected locale and 1-50 order lines.");
  }
  let units = 0;
  const ids = new Set<string>();
  const items = value.items.map((raw, index): WhatsappCheckoutLine => {
    if (!record(raw) || Object.keys(raw).some((key) => !["mode", "lineId", "productSlug", "productId", "quantity", "selection", "note", "expectedUnitPrice", "expectedLinkedSourceRevisions"].includes(key))
      || (raw.mode !== "LEGACY" && raw.mode !== "NETWORK")
      || typeof raw.lineId !== "string" || !/^[A-Za-z0-9:_-]{1,128}$/.test(raw.lineId)
      || ids.has(raw.lineId) || !Number.isSafeInteger(raw.quantity) || (raw.quantity as number) < 1 || (raw.quantity as number) > 100) {
      fail("INVALID_WHATSAPP_CHECKOUT_LINE", `Invalid line ${index}.`);
    }
    ids.add(raw.lineId);
    units += raw.quantity as number;
    if (units > 100) fail("WHATSAPP_CHECKOUT_UNIT_LIMIT", "Order unit safety limit exceeded.");
    const note = optionalText(raw.note, `items[${index}].note`, 500);
    if (raw.expectedUnitPrice !== undefined && validateMoneyString(raw.expectedUnitPrice, `$items[${index}].expectedUnitPrice`, DEFAULT_ENGINE_LIMITS).length) {
      fail("INVALID_WHATSAPP_EXPECTED_PRICE", "Expected price must be an exact decimal string.");
    }
    if (raw.mode === "LEGACY") {
      if (typeof raw.productSlug !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(raw.productSlug)
        || raw.productId !== undefined || raw.selection !== undefined || raw.expectedLinkedSourceRevisions !== undefined) fail("INVALID_WHATSAPP_CHECKOUT_LINE", `Invalid Legacy line ${index}.`);
      return { mode: "LEGACY", lineId: raw.lineId, productSlug: raw.productSlug, quantity: raw.quantity as number,
        ...(note ? { note } : {}), ...(raw.expectedUnitPrice !== undefined ? { expectedUnitPrice: raw.expectedUnitPrice as string } : {}) };
    }
    if (typeof raw.productId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(raw.productId) || raw.productSlug !== undefined) {
      fail("INVALID_WHATSAPP_CHECKOUT_LINE", `Invalid Network line ${index}.`);
    }
    const parsed = parsePublicQuoteSelection(raw.selection);
    if (!parsed.selection || parsed.selection.productId !== raw.productId) {
      throw new BadRequestException({ error: "INVALID_WHATSAPP_SELECTION", message: "Invalid Network selection.", issues: parsed.issues });
    }
    if (raw.expectedLinkedSourceRevisions !== undefined && (!Array.isArray(raw.expectedLinkedSourceRevisions)
      || raw.expectedLinkedSourceRevisions.length > DEFAULT_ENGINE_LIMITS.maxNodes
      || raw.expectedLinkedSourceRevisions.some((source) => !record(source)
        || Object.keys(source).some((key) => !["sourceProductId", "mode", "configurationRevision"].includes(key))
        || typeof source.sourceProductId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(source.sourceProductId)
        || (source.mode !== "NETWORK" && source.mode !== "LEGACY")
        || !Number.isSafeInteger(source.configurationRevision) || (source.configurationRevision as number) < 0))) {
      fail("INVALID_WHATSAPP_SOURCE_REVISIONS", "Linked source revisions are invalid.");
    }
    return { mode: "NETWORK", lineId: raw.lineId, productId: raw.productId, quantity: raw.quantity as number,
      selection: parsed.selection, ...(note ? { note } : {}),
      ...(raw.expectedUnitPrice !== undefined ? { expectedUnitPrice: raw.expectedUnitPrice as string } : {}),
      ...(raw.expectedLinkedSourceRevisions !== undefined ? { expectedLinkedSourceRevisions: raw.expectedLinkedSourceRevisions as WhatsappCheckoutLine["expectedLinkedSourceRevisions"] } : {}) };
  });
  if (!items.some((line) => line.mode === "NETWORK")) {
    fail("LEGACY_CHECKOUT_REQUIRED", "Legacy-only carts must use the existing WhatsApp order checkout.");
  }
  const branchSlug = optionalText(value.branchSlug, "branchSlug", 128);
  return { locale: value.locale as "ar" | "en", ...(branchSlug ? { branchSlug } : {}),
    ...parseNetworkOrderDetails(value), items };
}
