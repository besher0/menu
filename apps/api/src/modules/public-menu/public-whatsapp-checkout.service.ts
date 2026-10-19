import { createHmac, timingSafeEqual } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { currencyDisplayReconciliation, formatCurrencyAmount, validateCurrencyAmount } from "@menu/shared";
import { compareMoney, createConfigurationSnapshot, createSelectionKey, multiplyMoney, sumMoney, type PriceLine, type ProductConfigurationContext, type ProductSelectionV1 } from "@menu/shared";
import { PrismaService } from "../prisma/prisma.service";
import { sha256, stableJson } from "../orders/network-order-contract";
import {
  buildNetworkWhatsappPreviewUrl, formatNetworkOrderDetails, formatNetworkSnapshotLine,
  formatWhatsappDisplayText, NetworkOrderSnapshotFormatError
} from "../orders/network-order-whatsapp-formatter";
import { resolvePublicProductConfiguration } from "./public-product-configuration";
import { quotePublicProductConfiguration } from "./public-product-quote";
import { parseWhatsappCheckoutRequest, type WhatsappCheckoutRequest } from "./public-whatsapp-checkout.contract";

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
  branchName?: string; whatsappPhone: string; currency: string; locale: "ar" | "en";
  details: Omit<WhatsappCheckoutRequest, "items" | "locale" | "branchSlug">;
  items: TrustedLine[]; totalAmount: string;
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
    items: draft.items.map(({ display, ...line }) => line), totalAmount: draft.totalAmount,
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
export function formatTrustedWhatsappDraft(draft: TrustedDraft): string {
  const ar = draft.locale === "ar";
  const details = formatNetworkOrderDetails({ restaurantName: draft.restaurantName, ...draft.details }, draft.locale);
  const output = [ar ? "🧾 طلب جديد — OrderSawa" : "🧾 New order — OrderSawa", ...details.header];
  if (draft.branchName) output.push(`${ar ? "الفرع" : "Branch"}: ${formatWhatsappDisplayText(draft.branchName, "$branchName")}`);
  output.push("");
  for (const [index, line] of groupedMessageLines(draft.items).entries()) {
    if (line.mode === "NETWORK") {
      if (!line.display) throw new Error("NETWORK_DRAFT_DISPLAY_MISSING");
      const rendered = formatNetworkSnapshotLine(line.display, draft.locale, draft.currency, index);
      if (rendered.lineTotal !== line.lineTotal) throw new Error("NETWORK_DRAFT_LINE_MISMATCH");
      output.push(...rendered.lines);
    } else {
      output.push(`${index + 1}. ${line.quantity} × ${formatWhatsappDisplayText(line.productName, `$items[${index}].name`)}`);
      if (line.note) output.push(`${ar ? "ملاحظة الصنف" : "Item note"}: ${formatWhatsappDisplayText(line.note, `$items[${index}].note`, 500)}`);
      output.push(`${ar ? "سعر الوحدة" : "Unit price"}: ${formatCurrencyAmount(line.unitPrice, draft.currency)}`);
      output.push(`${ar ? "إجمالي الصنف" : "Line total"}: ${formatCurrencyAmount(line.lineTotal, draft.currency)}`);
    }
    output.push("━━━━━━━━━━━━━━", "");
  }
  if (sumMoney(draft.items.map((item) => item.lineTotal)) !== draft.totalAmount) throw new Error("WHATSAPP_DRAFT_TOTAL_MISMATCH");
  const reconciliation = currencyDisplayReconciliation(draft.items.map((item) => item.lineTotal), draft.totalAmount, draft.currency);
  if (reconciliation) output.push(`${ar ? "فرق عرض التقريب" : "Display rounding difference"}: ${reconciliation}`);
  output.push(`${ar ? "💵 إجمالي الطلب" : "💵 Order total"}: ${formatCurrencyAmount(draft.totalAmount, draft.currency)}`);
  output.push(...details.footer);
  return output.join("\n");
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
      return await this.prisma.$transaction(async (tx) => {
      const restaurants = await tx.$queryRaw<{ id: string; slug: string; name: string; currency: string; whatsappPhone: string | null }[]>`
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
      if (settings && typeof settings === "object" && !Array.isArray(settings)
        && (settings as { publicUi?: { whatsappOrderingEnabled?: unknown } }).publicUi?.whatsappOrderingEnabled === false) {
        throw new ForbiddenException({ error: "WHATSAPP_ORDERING_DISABLED", message: "WhatsApp ordering is disabled for this menu." });
      }
      if (settings && typeof settings === "object" && !Array.isArray(settings)
        && (settings as { dashboardSettings?: { showPrices?: unknown } }).dashboardSettings?.showPrices === false) {
        throw new ForbiddenException({ error: "WHATSAPP_PRICES_HIDDEN", message: "WhatsApp checkout is unavailable while menu prices are hidden." });
      }
      const branches = await tx.$queryRaw<{ slug: string; name: string; whatsappPhone: string | null }[]>`
        SELECT "slug", "name", "whatsappPhone" FROM "Branch"
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
      const lines: TrustedLine[] = request.items.map((line, index) => {
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
          return { mode: "LEGACY", lineId: line.lineId, productId: product.id, productName: product.name,
            quantity: line.quantity, ...note, unitPrice, lineTotal,
            changed: line.expectedUnitPrice === undefined || compareMoney(line.expectedUnitPrice, unitPrice) !== 0 };
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
        return { mode: "NETWORK", lineId: line.lineId, productId: product.id, productName: product.name,
          quantity: line.quantity, ...note, unitPrice, lineTotal,
          changed: line.expectedUnitPrice === undefined || compareMoney(line.expectedUnitPrice, unitPrice) !== 0
            || (line.expectedLinkedSourceRevisions !== undefined
              && stableJson(line.expectedLinkedSourceRevisions) !== stableJson(result.quote.linkedSourceRevisions)),
          configurationRevision: result.quote.configurationRevision,
          linkedSourceRevisions: result.quote.linkedSourceRevisions, display };
      });
      const { items: _items, locale: _locale, branchSlug: _branchSlug, ...details } = request;
      const totalAmount = sumMoney(lines.map((line) => line.lineTotal));
      if (validateCurrencyAmount(totalAmount, restaurant.currency, "$draft.totalAmount").length) {
        throw new ConflictException({ error: "INVALID_CURRENCY_TOTAL", message: "The order total is invalid for the restaurant currency." });
      }
      return { schemaVersion: 1, restaurantId: restaurant.id, restaurantName: restaurant.name,
        restaurantSlug: restaurant.slug, ...(branch ? { branchName: branch.name } : {}),
        whatsappPhone: digits, currency: restaurant.currency, locale: request.locale, details,
        items: lines, totalAmount };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 });
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
    if (Object.keys(fields).some((field) => !["request", "acceptanceToken"].includes(field))
      || typeof fields.acceptanceToken !== "string") throw new BadRequestException({ error: "INVALID_WHATSAPP_CONFIRMATION" });
    const request = parseWhatsappCheckoutRequest(fields.request);
    const draft = await this.buildDraft(slug, request);
    const digest = sha256({ request, draft });
    if (!verifyToken(key, fields.acceptanceToken, draft.restaurantId, digest)) {
      throw new ConflictException({ error: "WHATSAPP_CHECKOUT_REQUIRES_ACCEPTANCE",
        message: "The checkout changed or approval expired. Review the current prices and accept again.",
        changedDraft: publicDraft(draft), changedMessagePreview: this.renderMessage(draft),
        acceptanceToken: issueToken(key, draft.restaurantId, digest) });
    }
    const message = this.renderMessage(draft);
    const whatsappUrl = buildNetworkWhatsappPreviewUrl(draft.whatsappPhone, message);
    return { draft: publicDraft(draft), message, whatsappUrl };
  }
}
