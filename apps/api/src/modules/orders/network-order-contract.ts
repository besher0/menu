import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { parsePublicQuoteSelection } from "../public-menu/public-product-quote";
import type { ProductSelectionV1 } from "@menu/shared";

export type NetworkOrderLineRequest = {
  productId: string;
  quantity: number;
  selection: ProductSelectionV1;
};

export type NetworkOrderDraftRequest = {
  locale: "ar" | "en";
  items: NetworkOrderLineRequest[];
};

export type NetworkOrderCreateRequest = NetworkOrderDraftRequest & {
  idempotencyKey: string;
  acceptanceToken: string;
};

const signingKey = randomBytes(32);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(code: string, message: string): never {
  throw new BadRequestException({ error: code, message, issues: [{ code, path: "$request", message }] });
}

export function parseNetworkOrderRequest(body: unknown, create: false): NetworkOrderDraftRequest;
export function parseNetworkOrderRequest(body: unknown, create: true): NetworkOrderCreateRequest;
export function parseNetworkOrderRequest(body: unknown, create: boolean): NetworkOrderDraftRequest | NetworkOrderCreateRequest {
  if (!object(body)) fail("INVALID_NETWORK_ORDER_REQUEST", "Expected an object.");
  const allowed = create ? ["locale", "items", "idempotencyKey", "acceptanceToken"] : ["locale", "items"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    fail("UNEXPECTED_NETWORK_ORDER_FIELD", "Client totals, prices, or unknown fields are not accepted.");
  }
  if ((body.locale !== "ar" && body.locale !== "en") || !Array.isArray(body.items)
    || body.items.length < 1 || body.items.length > 50) {
    fail("INVALID_NETWORK_ORDER_REQUEST", "Expected locale and 1–50 order lines.");
  }
  let units = 0;
  const items = body.items.map((raw, index): NetworkOrderLineRequest => {
    if (!object(raw) || Object.keys(raw).some((key) => !["productId", "quantity", "selection"].includes(key))
      || typeof raw.productId !== "string" || !ID_PATTERN.test(raw.productId)
      || !Number.isSafeInteger(raw.quantity) || Number(raw.quantity) < 1 || Number(raw.quantity) > 100) {
      fail("INVALID_NETWORK_ORDER_LINE", `Invalid order line ${index}.`);
    }
    units += Number(raw.quantity);
    const parsed = parsePublicQuoteSelection(raw.selection);
    if (!parsed.selection || parsed.selection.productId !== raw.productId) {
      throw new BadRequestException({ error: "INVALID_NETWORK_ORDER_SELECTION", message: "Invalid or mismatched selection.", issues: parsed.issues });
    }
    return { productId: raw.productId, quantity: raw.quantity as number, selection: parsed.selection };
  });
  if (units > 100) fail("NETWORK_ORDER_UNIT_LIMIT", "Order unit safety limit exceeded.");
  const draft: NetworkOrderDraftRequest = { locale: body.locale as "ar" | "en", items };
  if (!create) return draft;
  if (typeof body.idempotencyKey !== "string" || !IDEMPOTENCY_PATTERN.test(body.idempotencyKey)
    || typeof body.acceptanceToken !== "string" || body.acceptanceToken.length > 4096) {
    fail("INVALID_NETWORK_ORDER_ACCEPTANCE", "Idempotency key and acceptance token are required.");
  }
  return { ...draft, idempotencyKey: body.idempotencyKey as string, acceptanceToken: body.acceptanceToken as string };
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

type AcceptancePayload = { v: 1; restaurantId: string; digest: string; expiresAt: number };

export function issueAcceptanceToken(restaurantId: string, digest: string, now = Date.now()): string {
  const payload: AcceptancePayload = { v: 1, restaurantId, digest, expiresAt: now + 10 * 60_000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", signingKey).update(`v1.${encoded}`).digest("base64url");
  return `v1.${encoded}.${signature}`;
}

export function verifyAcceptanceToken(token: string, restaurantId: string, digest: string, now = Date.now()): boolean {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  try {
    const expected = createHmac("sha256", signingKey).update(`v1.${parts[1]}`).digest();
    const received = Buffer.from(parts[2], "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as AcceptancePayload;
    return payload.v === 1 && payload.restaurantId === restaurantId && payload.digest === digest
      && Number.isSafeInteger(payload.expiresAt) && payload.expiresAt >= now;
  } catch {
    return false;
  }
}
