import { createHmac, timingSafeEqual } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { currencyDisplayReconciliation, formatCurrencyAmount, validateCurrencyAmount } from "@menu/shared";
import { compareMoney, createConfigurationSnapshot, createSelectionKey, multiplyMoney, sumMoney, type PriceLine, type ProductConfigurationContext, type ProductSelectionV1 } from "@menu/shared";
import { PrismaService } from "../prisma/prisma.service";
import { sha256, stableJson } from "../orders/network-order-contract";
import {
  buildNetworkWhatsappPreviewUrl, formatNetworkOrderDetails, formatNetworkSnapshotLine,
  formatWhatsappDisplayText, formatWhatsappMessageLines, NetworkOrderSnapshotFormatError
} from "../orders/network-order-whatsapp-formatter";
import { resolvePublicProductConfiguration } from "./public-product-configuration";
import { quotePublicProductConfiguration } from "./public-product-quote";
import { parseWhatsappCheckoutRequest, type WhatsappCheckoutRequest } from "./public-whatsapp-checkout.contract";
import { readDeliveryFee } from "./delivery-fee";
import { reserveDailyWhatsappOrderNumber } from "./daily-whatsapp-order-number";

type NetworkDisplayLine = {
  snapshotVersion: 1; mode: "NETWORK"; locale: "ar" | "en"; currency: string;
  productId: string; productName: string; quantity: number; note?: string;
  configurationRevision: number; canonicalSelection: ProductSelectionV1;
  unitPrice: string; lineTotal: string; priceBreakdown: PriceLine[];
  configurationTree: unknown;
  linkedSources: { productId: string; productName: string; mode: "NETWORK" | "LEGACY"; configurationTree: unknown }[];
};

type TrustedLine = {
  mode: "LEGACY" | "NETWORK"; lineId: string; productId: string; productName: string;
  quantity: number; note?: string; unitPrice: string; lineTotal: string; changed: boolean;
  configurationRevision?: number;
  linkedSourceRevisions?: { sourceProductId: string; mode: "NETWORK" | "LEGACY"; configurationRevision: number }[];
  display?: NetworkDisplayLine;
};

type TrustedDraft = {
  schemaVersion: 1; restaurantId: string; restaurantName: string; restaurantSlug: string;
  branchId?: string; branchName?: string; whatsappPhone: string; currency: string; locale: "ar" | "en";
  details: Omit<WhatsappCheckoutRequest, "items" | "locale" | "branchSlug">;
  items: TrustedLine[]; itemsSubtotal: string; deliveryFee: string | null; totalAmount: string | null;
};

function checkoutKey(): Buffer {
  const encoded = process.env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY;
  if (!encoded || !/^[0-9a-fA-F]{64,}$/.test(encoded) || encoded.length % 2 !== 0) {
    throw new ServiceUnavailableException({ error: "WHATSAPP_CHECKOUT_KEY_UNAVAILABLE", message: "WhatsApp checkout is not configured." });
  }
  return Buffer.from(encoded, "hex");
}

function publicDraft(draft: TrustedDraft) {
  return {
    restaurantName: draft.restaurantName, restaurantSlug: draft.restaurantSlug,
    ...(draft.branchName ? { branchName: draft.branchName } : {}),
    currency: draft.currency, locale: draft.locale, details: draft.details,
    items: draft.items.map(({ display, ...line }) => line), itemsSubtotal: draft.itemsSubtotal,
    deliveryFee: draft.deliveryFee, totalAmount: draft.totalAmount,
    requiresExplicitAcceptance: true as const
  };
}

function issueToken(key: Buffer, restaurantId: string, digest: string) {
  const payload = Buffer.from(JSON.stringify({ v: 1, restaurantId, digest, expiresAt: Date.now() + 10 * 60_000 })).toString("base64url");
  const signature = createHmac("sha256", key).update(`v1.${payload}`).digest("base64url");
  return `v1.${payload}.${signature}`;
}

function verifyToken(key: Buffer, token: string, restaurantId: string, digest: string) {
  if (token.length > 4096) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  try {
    const signature = createHmac("sha256", key).update(`v1.${parts[1]}`).digest();
    const supplied = Buffer.from(parts[2], "base64url");
    if (signature.length !== supplied.length || !timingSafeEqual(signature, supplied)) return false;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    return payload.v === 1 && payload.restaurantId === restaurantId && payload.digest === digest
      && Number.isSafeInteger(payload.expiresAt) && (payload.expiresAt as number) >= Date.now();
  } catch {
    return false;
  }
}

/** Presentation-only grouping: a new line is retained whenever any trusted choice, note or price differs. */
function groupedMessageLines(items: TrustedLine[]): TrustedLine[] {
  const grouped: TrustedLine[] = [];
  const byKey = new Map<string, TrustedLine>();
  for (const line of items) {
    if (line.mode === "NETWORK") {
      if (!line.display) throw new Error("NETWORK_DRAFT_DISPLAY_MISSING");
      const checked = formatNetworkSnapshotLine(line.display, line.display.locale, line.display.currency, grouped.length);
      if (compareMoney(checked.lineTotal, line.lineTotal) !== 0) throw new Error("NETWORK_DRAFT_LINE_MISMATCH");
    }
    if (compareMoney(multiplyMoney(line.unitPrice, line.quantity), line.lineTotal) !== 0) {
      throw new Error("WHATSAPP_DRAFT_LINE_MISMATCH");
    }
    const display = line.display;
    const key = stableJson({
      mode: line.mode, productId: line.productId, productName: line.productName,
      note: line.note ?? null, unitPrice: line.unitPrice,
      ...(line.mode === "NETWORK" && display ? {
        configurationRevision: line.configurationRevision,
        selectionKey: createSelectionKey(display.canonicalSelection),
        linkedSourceRevisions: line.linkedSourceRevisions,
        configurationTree: display.configurationTree,
        linkedSources: display.linkedSources,
        priceBreakdown: display.priceBreakdown.map(({ path: _path, instanceId: _instanceId, ...price }) => price)
      } : {})
    });
    const previous = byKey.get(key);
    if (previous && previous.quantity + line.quantity <= 100) {
      previous.quantity += line.quantity;
      previous.lineTotal = sumMoney([previous.lineTotal, line.lineTotal]);
      if (previous.display) {
        previous.display.quantity = previous.quantity;
        previous.display.lineTotal = previous.lineTotal;
      }
    } else {
      const copy: TrustedLine = { ...line, ...(display ? { display: { ...display } } : {}) };
      grouped.push(copy);
      byKey.set(key, copy);
    }
  }
  return grouped;
}

/** The message is assembled only from this request's trusted database-backed draft. */
export function formatTrustedWhatsappDraft(draft: TrustedDraft, orderNumber?: string): string {
  const ar = draft.locale === "ar";
  const details = formatNetworkOrderDetails({ restaurantName: draft.restaurantName, ...draft.details, orderNote: undefined }, draft.locale);
  const output = [orderNumber
    ? ar ? `🧾 طلب جديد رقم ${orderNumber} — OrderSawa` : `🧾 New order No. ${orderNumber} — OrderSawa`
    : ar ? "🧾 طلب جديد — OrderSawa" : "🧾 New order — OrderSawa", ...details.header];
  output.push("━━━━━━━━━━━━━━");
  for (const [index, line] of groupedMessageLines(draft.items).entries()) {
    if (line.mode === "NETWORK") {
      if (!line.display) throw new Error("NETWORK_DRAFT_DISPLAY_MISSING");
      const rendered = formatNetworkSnapshotLine(line.display, draft.locale, draft.currency, index, false);
      if (rendered.lineTotal !== line.lineTotal) throw new Error("NETWORK_DRAFT_LINE_MISMATCH");
      output.push(...rendered.lines);
    } else {
      output.push(`${line.quantity} × ${formatWhatsappDisplayText(line.productName, `$items[${index}].name`)}`);
      if (line.note) output.push(`*🔸️ ${ar ? "ملاحظة الصنف" : "Item note"}: ${formatWhatsappDisplayText(line.note, `$items[${index}].note`, 500)}*`);
      output.push(`${ar ? "إجمالي الصنف" : "Line total"}: ${formatCurrencyAmount(line.lineTotal, draft.currency)}`);
    }
    output.push("━━━━━━━━━━━━━━", "");
  }
  if (sumMoney(draft.items.map((item) => item.lineTotal)) !== draft.itemsSubtotal
    || draft.totalAmount !== (draft.details.fulfillmentType === "delivery" && draft.deliveryFee === null
      ? null : sumMoney([draft.itemsSubtotal, draft.deliveryFee ?? "0"]))) throw new Error("WHATSAPP_DRAFT_TOTAL_MISMATCH");
  const reconciliation = currencyDisplayReconciliation(draft.items.map((item) => item.lineTotal), draft.itemsSubtotal, draft.currency);
  if (draft.details.orderNote) {
    output.push(`*🔸️ ${ar ? "ملاحظات الطلب" : "Order notes"}: ${formatWhatsappDisplayText(draft.details.orderNote, "$details.orderNote", 500)}*`,
      "━━━━━━━━━━━━━━", "");
  }
  if (reconciliation) output.push(`${ar ? "فرق عرض التقريب" : "Display rounding difference"}: ${reconciliation}`);
  output.push(`${ar ? "مجموع الأصناف" : "Items subtotal"}: ${formatCurrencyAmount(draft.itemsSubtotal, draft.currency)}`);
  output.push(`${ar ? "رسوم التوصيل" : "Delivery fee"}: ${draft.details.fulfillmentType !== "delivery"
    ? ar ? "لا تُضاف للاستلام" : "Not charged for pickup"
    : draft.deliveryFee === null ? ar ? "تُحدّد حسب المنطقة" : "Determined by area"
    : draft.deliveryFee === "0" ? ar ? "مجاني" : "Free" : formatCurrencyAmount(draft.deliveryFee, draft.currency)}`);
  output.push(`${ar ? "💵 الإجمالي" : "💵 Total"}: ${draft.totalAmount === null
    ? ar ? "يُحدّد بعد رسوم التوصيل" : "Pending delivery fee"
    : formatCurrencyAmount(draft.totalAmount, draft.currency)}`);
  output.push("", ...details.footer);
  return formatWhatsappMessageLines(output, draft.locale);
}

@Injectable()
export class PublicWhatsappCheckoutService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  private enabled() {
    if (process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT !== "1") {
      throw new ForbiddenException({ error: "WHATSAPP_CHECKOUT_DISABLED", message: "This checkout is not enabled." });
    }
    return checkoutKey();
  }

  private async buildDraft(slug: string, request: WhatsappCheckoutRequest): Promise<TrustedDraft> {
    try {
      return await this.prisma.$transaction((tx) => this.buildDraftInTransaction(tx, slug, request),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError
        && (error.code === "P2034" || (error.code === "P2010"
          && (error.meta?.code === "40001" || error.meta?.code === "40P01")))) {
        throw new ConflictException({ error: "WHATSAPP_CHECKOUT_CONCURRENT_UPDATE",
          message: "The menu changed while preparing checkout. Please review and try again." });
      }
      throw error;
    }
  }

  private async buildDraftInTransaction(tx: Prisma.TransactionClient, slug: string,
    request: WhatsappCheckoutRequest, forWrite = false): Promise<TrustedDraft> {
      const restaurants = forWrite ? await tx.$queryRaw<{ id: string; slug: string; name: string; currency: string; whatsappPhone: string | null }[]>`
        SELECT "id", "slug", "name", "currency", "whatsappPhone" FROM "Restaurant"
        WHERE "slug" = ${slug} AND "isActive" = true AND "deletedAt" IS NULL FOR UPDATE
      ` : await tx.$queryRaw<{ id: string; slug: string; name: string; currency: string; whatsappPhone: string | null }[]>`
        SELECT "id", "slug", "name", "currency", "whatsappPhone" FROM "Restaurant"
        WHERE "slug" = ${slug} AND "isActive" = true AND "deletedAt" IS NULL FOR SHARE
      `;
      const restaurant = restaurants[0];
      if (!restaurant) throw new NotFoundException("Restaurant not found");
      const subscriptions = await tx.$queryRaw<{ planId: string; status: string }[]>`
        SELECT "planId", "status" FROM "RestaurantSubscription" WHERE "restaurantId" = ${restaurant.id} FOR SHARE
      `;
      const subscription = subscriptions[0];
      if (!subscription) throw new ForbiddenException({ error: "WHATSAPP_CAPABILITY_UNAVAILABLE" });
      const features = await tx.$queryRaw<{ key: string; enabled: boolean }[]>`
        SELECT "key", "enabled" FROM "SubscriptionFeature"
        WHERE "planId" = ${subscription.planId}
          AND "key" IN ('CART_ORDERING', 'WHATSAPP_ORDERING', 'PRODUCT_CONFIGURATION') FOR SHARE
      `;
      const enabled = (key: string) => features.some((feature) => feature.key === key && feature.enabled);
      if (!(["ACTIVE", "TRIALING"].includes(subscription.status) && enabled("WHATSAPP_ORDERING") && enabled("CART_ORDERING"))) {
        throw new ForbiddenException({ error: "WHATSAPP_CAPABILITY_UNAVAILABLE" });
      }
      const themeRows = await tx.$queryRaw<{ settings: unknown }[]>`
        SELECT "settings" FROM "RestaurantThemeSettings" WHERE "restaurantId" = ${restaurant.id} FOR SHARE
      `;
      const settings = themeRows[0]?.settings;
      const dashboardSettings = settings && typeof settings === "object" && !Array.isArray(settings)
        ? (settings as { dashboardSettings?: unknown }).dashboardSettings : undefined;
      if (settings && typeof settings === "object" && !Array.isArray(settings)
        && (settings as { publicUi?: { whatsappOrderingEnabled?: unknown } }).publicUi?.whatsappOrderingEnabled === false) {
        throw new ForbiddenException({ error: "WHATSAPP_ORDERING_DISABLED", message: "WhatsApp ordering is disabled for this menu." });
      }
      if (settings && typeof settings === "object" && !Array.isArray(settings)
        && (settings as { dashboardSettings?: { showPrices?: unknown } }).dashboardSettings?.showPrices === false) {
        throw new ForbiddenException({ error: "WHATSAPP_PRICES_HIDDEN", message: "WhatsApp checkout is unavailable while menu prices are hidden." });
      }
      const branches = await tx.$queryRaw<{ id: string; slug: string; name: string; whatsappPhone: string | null }[]>`
        SELECT "id", "slug", "name", "whatsappPhone" FROM "Branch"
        WHERE "restaurantId" = ${restaurant.id} AND "isActive" = true AND "deletedAt" IS NULL
        ORDER BY "createdAt" ASC FOR SHARE
      `;
      const branch = request.branchSlug ? branches.find((candidate) => candidate.slug === request.branchSlug) : branches[0];
      if (request.branchSlug && !branch) throw new BadRequestException({ error: "WHATSAPP_BRANCH_UNAVAILABLE" });
      const phone = request.branchSlug ? branch?.whatsappPhone ?? restaurant.whatsappPhone
        : restaurant.whatsappPhone ?? branch?.whatsappPhone;
      if (!phone) throw new ConflictException({ error: "WHATSAPP_PHONE_UNAVAILABLE", message: "Restaurant WhatsApp number is unavailable." });
      const digits = phone.replace(/[\s()+-]/g, "");
      if (!/^[1-9]\d{6,14}$/.test(digits)) throw new ConflictException({ error: "WHATSAPP_PHONE_INVALID", message: "Restaurant WhatsApp number is not a valid international number." });

      // The Network resolver needs the full same-restaurant catalog. Lock all rows to
      // prevent linked source updates between revalidation and draft construction.
      await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Product" WHERE "restaurantId" = ${restaurant.id} ORDER BY "id" FOR SHARE`;
      const catalog = await tx.product.findMany({ where: { restaurantId: restaurant.id }, select: {
        id: true, slug: true, name: true, currency: true, basePrice: true, configurationTree: true,
        configurationVersion: true, isActive: true, isAvailable: true, deletedAt: true
      } });
      const needsNetwork = request.items.some((line) => line.mode === "NETWORK");
      const capability = needsNetwork ? enabled("PRODUCT_CONFIGURATION") : false;
      if (needsNetwork && !capability) throw new ForbiddenException({ error: "PRODUCT_CONFIGURATION_CAPABILITY_UNAVAILABLE" });
      const lineErrors: { lineId: string; code: string; issues: { code: string; path: string; message: string }[] }[] = [];
      const lineErrorStatuses: number[] = [];
      const lines: TrustedLine[] = request.items.flatMap<TrustedLine>((line) => {
        try {
        const product = catalog.find((candidate) => line.mode === "LEGACY"
          ? candidate.slug === line.productSlug : candidate.id === line.productId);
        if (!product || !product.isActive || !product.isAvailable || product.deletedAt) {
          throw new ConflictException({ error: "WHATSAPP_PRODUCT_UNAVAILABLE", lineId: line.lineId });
        }
        if (product.currency !== restaurant.currency) {
          throw new ConflictException({ error: "WHATSAPP_CURRENCY_MISMATCH", lineId: line.lineId });
        }
        const note = line.note ? { note: line.note } : {};
        if (line.mode === "LEGACY") {
          if (product.configurationTree !== null || product.configurationVersion !== 0 || product.basePrice === null) {
            throw new ConflictException({ error: "WHATSAPP_PRODUCT_TYPE_CHANGED", lineId: line.lineId });
          }
          const unitPrice = product.basePrice.toString();
          if (validateCurrencyAmount(unitPrice, restaurant.currency, "$product.basePrice").length) {
            throw new ConflictException({ error: "INVALID_CURRENCY_PRICE", lineId: line.lineId,
              message: "This product has an invalid price for the restaurant currency." });
          }
          const lineTotal = multiplyMoney(unitPrice, line.quantity);
          return [{ mode: "LEGACY" as const, lineId: line.lineId, productId: product.id, productName: product.name,
            quantity: line.quantity, ...note, unitPrice, lineTotal,
            changed: line.expectedUnitPrice === undefined || compareMoney(line.expectedUnitPrice, unitPrice) !== 0 }];
        }
        if (product.configurationTree === null || product.configurationVersion < 1) {
          throw new ConflictException({ error: "WHATSAPP_PRODUCT_TYPE_CHANGED", lineId: line.lineId });
        }
        const result = quotePublicProductConfiguration({ restaurantId: restaurant.id, owner: product,
          catalogProducts: catalog, capabilityEnabled: capability, currency: restaurant.currency, selection: line.selection });
        if (!result.ok) {
          const payload = { error: result.error.code, message: result.error.message,
            issues: result.error.issues, currentRevision: result.error.currentRevision, lineId: line.lineId };
          if (result.error.status === 409) throw new ConflictException(payload);
          throw new BadRequestException(payload);
        }
        const resolved = resolvePublicProductConfiguration({ restaurantId: restaurant.id, owner: product,
          catalogProducts: catalog, capabilityEnabled: capability, currency: restaurant.currency });
        if (!resolved?.orderable) throw new ConflictException({ error: "CONFIGURATION_NOT_ORDERABLE", lineId: line.lineId });
        const context: ProductConfigurationContext = { catalogId: restaurant.id,
          linkedProducts: new Map(resolved.linkedProducts.map((source) => [source.productId, {
            productId: source.productId, catalogId: restaurant.id, configuration: source.configuration,
            available: source.available, orderable: source.orderable
          }])) };
        const snapshot = createConfigurationSnapshot({ configuration: resolved.configuration,
          selection: result.quote.canonicalSelection, context, productName: product.name,
          currency: restaurant.currency, createdAt: new Date().toISOString() });
        if (!snapshot.valid || !snapshot.snapshot || snapshot.snapshot.total !== result.quote.trustedTotal) {
          throw new ConflictException({ error: "WHATSAPP_SNAPSHOT_PRICE_MISMATCH", lineId: line.lineId });
        }
        const unitPrice = result.quote.trustedTotal;
        const lineTotal = multiplyMoney(unitPrice, line.quantity);
        const display: NetworkDisplayLine = { snapshotVersion: 1, mode: "NETWORK", locale: request.locale,
          currency: restaurant.currency, productId: product.id, productName: product.name,
          quantity: line.quantity, ...note, configurationRevision: result.quote.configurationRevision,
          canonicalSelection: result.quote.canonicalSelection, unitPrice, lineTotal,
          priceBreakdown: snapshot.snapshot.priceLines, configurationTree: resolved.configuration,
          linkedSources: resolved.linkedProducts.map((source) => ({ productId: source.productId,
            productName: source.name, mode: source.mode, configurationTree: source.configuration })) };
        return [{ mode: "NETWORK" as const, lineId: line.lineId, productId: product.id, productName: product.name,
          quantity: line.quantity, ...note, unitPrice, lineTotal,
          changed: line.expectedUnitPrice === undefined || compareMoney(line.expectedUnitPrice, unitPrice) !== 0
            || (line.expectedLinkedSourceRevisions !== undefined
              && stableJson(line.expectedLinkedSourceRevisions) !== stableJson(result.quote.linkedSourceRevisions)),
          configurationRevision: result.quote.configurationRevision,
          linkedSourceRevisions: result.quote.linkedSourceRevisions, display }];
        } catch (error) {
          if (!(error instanceof HttpException) || ![400, 409].includes(error.getStatus())) throw error;
          const response = error.getResponse();
          if (!response || typeof response !== "object" || Array.isArray(response)) throw error;
          const payload = response as Record<string, unknown>;
          if (payload.lineId !== line.lineId || typeof payload.error !== "string") throw error;
          const issues = Array.isArray(payload.issues) ? payload.issues.filter((issue): issue is { code: string; path: string; message: string } =>
            Boolean(issue && typeof issue === "object" && typeof issue.code === "string"
              && typeof issue.path === "string" && typeof issue.message === "string")) : [];
          lineErrors.push({ lineId: line.lineId, code: payload.error, issues });
          lineErrorStatuses.push(error.getStatus());
          return [];
        }
      });
      if (lineErrors.length) {
        const priceChanges = lines.flatMap((valid) => {
          const requested = request.items.find((item) => item.lineId === valid.lineId);
          return requested?.expectedUnitPrice !== undefined
            && compareMoney(requested.expectedUnitPrice, valid.unitPrice) !== 0
            ? [{ lineId: valid.lineId, previousUnitPrice: requested.expectedUnitPrice,
              currentUnitPrice: valid.unitPrice, quantity: valid.quantity }] : [];
        });
        const payload = { error: lineErrors.length === 1 ? lineErrors[0].code : "WHATSAPP_CART_REVIEW_REQUIRED",
          lineErrors, priceChanges };
        if (lineErrorStatuses.every((status) => status === 400)) throw new BadRequestException(payload);
        throw new ConflictException(payload);
      }
      const { items: _items, locale: _locale, branchSlug: _branchSlug, ...details } = request;
      const itemsSubtotal = sumMoney(lines.map((line) => line.lineTotal));
      const deliveryFee = request.fulfillmentType === "delivery" ? readDeliveryFee(dashboardSettings, restaurant.currency) : null;
      const totalAmount = request.fulfillmentType === "delivery" && deliveryFee === null
        ? null : sumMoney([itemsSubtotal, deliveryFee ?? "0"]);
      if (validateCurrencyAmount(itemsSubtotal, restaurant.currency, "$draft.itemsSubtotal").length
        || (totalAmount !== null && validateCurrencyAmount(totalAmount, restaurant.currency, "$draft.totalAmount").length)) {
        throw new ConflictException({ error: "INVALID_CURRENCY_TOTAL", message: "The order total is invalid for the restaurant currency." });
      }
      return { schemaVersion: 1, restaurantId: restaurant.id, restaurantName: restaurant.name,
        restaurantSlug: restaurant.slug, ...(branch ? { branchId: branch.id, branchName: branch.name } : {}),
        whatsappPhone: digits, currency: restaurant.currency, locale: request.locale, details,
        items: lines, itemsSubtotal, deliveryFee, totalAmount };
  }

  async prepare(slug: string, body: unknown) {
    const key = this.enabled();
    const request = parseWhatsappCheckoutRequest(body);
    const draft = await this.buildDraft(slug, request);
    const digest = sha256({ request, draft });
    const messagePreview = this.renderMessage(draft);
    return { draft: publicDraft(draft), messagePreview, acceptanceToken: issueToken(key, draft.restaurantId, digest) };
  }

  private renderMessage(draft: TrustedDraft) {
    try {
      const message = formatTrustedWhatsappDraft(draft);
      // Fail before asking for acceptance when the resulting link cannot be opened safely.
      buildNetworkWhatsappPreviewUrl(draft.whatsappPhone, message);
      return message;
    } catch (error) {
      if (error instanceof NetworkOrderSnapshotFormatError && error.code === "WHATSAPP_URL_TOO_LONG") {
        throw new ConflictException({ error: "WHATSAPP_MESSAGE_TOO_LONG", message: "This order is too long for a safe WhatsApp link." });
      }
      throw new ServiceUnavailableException({ error: "WHATSAPP_MESSAGE_UNAVAILABLE", message: "The trusted message could not be prepared." });
    }
  }

  async confirm(slug: string, body: unknown) {
    const key = this.enabled();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException({ error: "INVALID_WHATSAPP_CONFIRMATION" });
    const fields = body as Record<string, unknown>;
    if (Object.keys(fields).some((field) => !["request", "acceptanceToken", "idempotencyKey"].includes(field))
      || typeof fields.acceptanceToken !== "string"
      || (fields.idempotencyKey !== undefined && (typeof fields.idempotencyKey !== "string"
        || !/^[A-Za-z0-9:_-]{16,128}$/.test(fields.idempotencyKey)))) {
      throw new BadRequestException({ error: "INVALID_WHATSAPP_CONFIRMATION" });
    }
    // Older clients have no explicit key; bind their replay to the accepted token.
    const idempotencyKey = typeof fields.idempotencyKey === "string" ? fields.idempotencyKey
      : `legacy:${sha256(fields.acceptanceToken).slice(0, 64)}`;
    const request = parseWhatsappCheckoutRequest(fields.request);
    const requestHash = sha256(request);
    const restaurant = await this.prisma.restaurant.findFirst({ where: { slug, isActive: true, deletedAt: null }, select: { id: true } });
    if (!restaurant) throw new NotFoundException("Restaurant not found");
    const replay = async () => {
      const existing = await this.prisma.order.findUnique({ where: { restaurantId_idempotencyKey: {
        restaurantId: restaurant.id, idempotencyKey
      } } });
      if (!existing) return null;
      if (existing.requestHash !== requestHash) throw new ConflictException({ error: "IDEMPOTENCY_KEY_REUSED" });
      const snapshot = existing.cartSnapshot as Record<string, unknown> | null;
      if (snapshot?.whatsappCheckoutVersion !== 1 || typeof snapshot.orderNumber !== "string"
        || typeof snapshot.whatsappPhone !== "string" || !snapshot.draft || !existing.whatsappMessage) {
        throw new ServiceUnavailableException({ error: "WHATSAPP_ORDER_REPLAY_UNAVAILABLE" });
      }
      return { orderId: existing.id, orderNumber: snapshot.orderNumber, draft: snapshot.draft,
        message: existing.whatsappMessage,
        whatsappUrl: buildNetworkWhatsappPreviewUrl(snapshot.whatsappPhone, existing.whatsappMessage), replayed: true };
    };
    const alreadyCommitted = await replay();
    if (alreadyCommitted) return alreadyCommitted;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Restaurant" WHERE "id" = ${restaurant.id} FOR UPDATE`;
        const existing = await tx.order.findUnique({ where: { restaurantId_idempotencyKey: {
          restaurantId: restaurant.id, idempotencyKey
        } } });
        if (existing) {
          if (existing.requestHash !== requestHash) throw new ConflictException({ error: "IDEMPOTENCY_KEY_REUSED" });
          const snapshot = existing.cartSnapshot as Record<string, unknown> | null;
          if (snapshot?.whatsappCheckoutVersion !== 1 || typeof snapshot.orderNumber !== "string"
            || typeof snapshot.whatsappPhone !== "string" || !snapshot.draft || !existing.whatsappMessage) {
            throw new ServiceUnavailableException({ error: "WHATSAPP_ORDER_REPLAY_UNAVAILABLE" });
          }
          return { orderId: existing.id, orderNumber: snapshot.orderNumber, draft: snapshot.draft,
            message: existing.whatsappMessage,
            whatsappUrl: buildNetworkWhatsappPreviewUrl(snapshot.whatsappPhone, existing.whatsappMessage), replayed: true };
        }
        const draft = await this.buildDraftInTransaction(tx, slug, request, true);
        const digest = sha256({ request, draft });
        if (!verifyToken(key, fields.acceptanceToken as string, draft.restaurantId, digest)) {
          throw new ConflictException({ error: "WHATSAPP_CHECKOUT_REQUIRES_ACCEPTANCE",
            message: "The checkout changed or approval expired. Review the current prices and accept again.",
            changedDraft: publicDraft(draft), changedMessagePreview: this.renderMessage(draft),
            acceptanceToken: issueToken(key, draft.restaurantId, digest) });
        }
        const orderNumber = await reserveDailyWhatsappOrderNumber(tx, draft.restaurantId);
        const message = formatTrustedWhatsappDraft(draft, orderNumber);
        const whatsappUrl = buildNetworkWhatsappPreviewUrl(draft.whatsappPhone, message);
        const storedDraft = publicDraft(draft);
        const snapshot = JSON.parse(JSON.stringify({ whatsappCheckoutVersion: 1, orderNumber,
          whatsappPhone: draft.whatsappPhone, draft: storedDraft, request })) as Prisma.InputJsonValue;
        const order = await tx.order.create({ data: {
          restaurantId: draft.restaurantId, branchId: draft.branchId,
          customerName: draft.details.customerName, customerPhone: draft.details.customerPhone,
          totalAmount: new Prisma.Decimal(draft.totalAmount ?? draft.itemsSubtotal), currency: draft.currency,
          status: "PENDING_WHATSAPP", source: "WHATSAPP", whatsappMessage: message, cartSnapshot: snapshot,
          idempotencyKey, requestHash,
          items: { create: draft.items.map((line) => ({
            productId: line.productId, name: line.productName, quantity: line.quantity, note: line.note,
            unitPrice: new Prisma.Decimal(line.unitPrice), totalPrice: new Prisma.Decimal(line.lineTotal),
            options: line.display ? JSON.parse(JSON.stringify(line.display)) as Prisma.InputJsonValue : Prisma.JsonNull
          })) }
        } });
        await tx.analyticsEvent.create({ data: { restaurantId: draft.restaurantId, branchId: draft.branchId,
          type: "WHATSAPP_ORDER_CLICKED", metadata: { orderId: order.id, orderNumber, totalAmount: draft.totalAmount,
            finalTotalKnown: draft.totalAmount !== null } } });
        return { orderId: order.id, orderNumber, draft: storedDraft, message, whatsappUrl, replayed: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 20_000 });
    } catch (error) {
      const committed = await replay();
      if (committed) return committed;
      if (error instanceof BadRequestException || error instanceof ConflictException
        || error instanceof ForbiddenException || error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException({ error: "WHATSAPP_ORDER_PERSISTENCE_FAILED" });
    }
  }
}
