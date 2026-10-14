import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  createConfigurationSnapshot,
  DEFAULT_ENGINE_LIMITS,
  multiplyMoney,
  sumMoney,
  validateMoneyString,
  type PriceLine,
  type ProductConfigurationContext,
  type ProductSelectionV1
} from "@menu/shared";
import { PrismaService } from "../prisma/prisma.service";
import { formatNetworkOrderWhatsappMessage } from "./network-order-whatsapp-formatter";
import { assertNetworkOrderCompletenessGuard, NETWORK_ORDER_COMPLETENESS_CONSTRAINT } from "./network-order-db-guard";
import { resolvePublicProductConfiguration, type PublicConfigurationProductRecord } from "../public-menu/public-product-configuration";
import { quotePublicProductConfiguration } from "../public-menu/public-product-quote";
import {
  issueAcceptanceToken,
  parseNetworkOrderRequest,
  sha256,
  stableJson,
  verifyAcceptanceToken,
  type NetworkOrderSnapshotDetails,
  type NetworkOrderCreateRequest,
  type NetworkOrderDraftRequest
} from "./network-order-contract";

type LockedRestaurant = { id: string; slug: string; name: string; currency: string };
type DraftLine = {
  productId: string;
  productName: string;
  productSlug: string;
  note?: string;
  quantity: number;
  configurationRevision: number;
  canonicalSelection: ProductSelectionV1;
  selectionKey: string;
  linkedSourceRevisions: { sourceProductId: string; mode: "NETWORK" | "LEGACY"; configurationRevision: number }[];
  unitPrice: string;
  lineTotal: string;
  priceBreakdown: PriceLine[];
  baseIgnored: boolean;
  configurationTree: unknown;
  linkedSources: { productId: string; productName: string; mode: "NETWORK" | "LEGACY"; configurationRevision: number; configurationTree: unknown }[];
};

type Draft = {
  schemaVersion: 1;
  restaurantId: string;
  restaurantSlug: string;
  currency: string;
  locale: "ar" | "en";
  orderDetails: NetworkOrderSnapshotDetails;
  items: DraftLine[];
  totalAmount: string;
  orderingEnabled: false;
};

type StoredNetworkOrder = Prisma.OrderGetPayload<{ include: { items: true } }>;

function isSealedStoredOrder(order: StoredNetworkOrder): boolean {
  const snapshot = order.cartSnapshot;
  if (order.source !== "NETWORK_TEST" || order.status !== "VALIDATED_TEST"
    || !order.networkSnapshotSealedAt || !snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
  const saved = snapshot as Record<string, unknown>;
  if (saved.snapshotVersion !== 1 || saved.mode !== "NETWORK" || saved.currency !== order.currency
    || saved.totalAmount !== order.totalAmount.toString() || !Array.isArray(saved.items)
    || saved.items.length < 1 || saved.items.length !== order.items.length) return false;
  const evidence = new Map<string, number>();
  for (const item of saved.items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const key = stableJson(item);
    evidence.set(key, (evidence.get(key) ?? 0) + 1);
  }
  for (const item of order.items) {
    if (!item.productId || !item.options || typeof item.options !== "object" || Array.isArray(item.options)) return false;
    const line = item.options as Record<string, unknown>;
    if (line.productId !== item.productId || line.productName !== item.name
      || line.quantity !== item.quantity || (line.note ?? null) !== item.note
      || line.currency !== order.currency || line.unitPrice !== item.unitPrice.toString()
      || line.lineTotal !== item.totalPrice.toString()) return false;
    const key = stableJson(line);
    const count = evidence.get(key) ?? 0;
    if (count === 0) return false;
    evidence.set(key, count - 1);
  }
  return [...evidence.values()].every((count) => count === 0);
}

function isGuardError(error: unknown): boolean {
  return error instanceof ServiceUnavailableException
    && (error.getResponse() as { error?: string }).error === "NETWORK_ORDER_DB_GUARD_UNAVAILABLE";
}

function moneyFitsDatabase(value: string, path: string) {
  const issues = validateMoneyString(value, path, DEFAULT_ENGINE_LIMITS);
  if (issues.length) {
    throw new BadRequestException({ error: "ORDER_AMOUNT_EXCEEDS_DECIMAL_24_6", message: "Amount does not fit DECIMAL(24,6) without rounding.", issues });
  }
}

function isSerializationConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === "P2034" || (error.code === "P2010"
      && (error.meta?.code === "40001" || error.meta?.code === "40P01")));
}

@Injectable()
export class NetworkOrdersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async assertDisposableOnly() {
    if (process.env.NODE_ENV === "production" || process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS !== "1") {
      throw new ForbiddenException({ error: "NETWORK_ORDERING_DISABLED", message: "Network order creation is disabled outside isolated tests." });
    }
    const rows = await this.prisma.$queryRaw<{ name: string; address: string | null; port: number | null }[]>`
      SELECT current_database() AS name, host(inet_server_addr()) AS address, inet_server_port() AS port
    `;
    const target = rows[0];
    if (!target || !target.name.startsWith("ordersawa_stage3_stage6c_")
      || target.address !== "127.0.0.1" || target.port !== 55440) {
      throw new ForbiddenException({ error: "NETWORK_ORDER_TEST_DATABASE_REQUIRED", message: "An isolated Stage 6C PostgreSQL database is required." });
    }
  }

  private async runSerializable<T>(work: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 20_000
        });
      } catch (error) {
        if (isSerializationConflict(error) && attempt < 2) continue;
        throw error;
      }
    }
    throw new ConflictException({ error: "NETWORK_ORDER_CONCURRENT_UPDATE", message: "Please retry after the catalog update completes." });
  }

  private async lockRestaurant(transaction: Prisma.TransactionClient, restaurantSlug: string): Promise<LockedRestaurant> {
    const restaurants = await transaction.$queryRaw<LockedRestaurant[]>`
      SELECT "id", "slug", "name", "currency" FROM "Restaurant"
      WHERE "slug" = ${restaurantSlug} AND "isActive" = true AND "deletedAt" IS NULL
      FOR SHARE
    `;
    const restaurant = restaurants[0];
    if (!restaurant) throw new NotFoundException("Restaurant not found");
    return restaurant;
  }

  private async lockCatalog(transaction: Prisma.TransactionClient, restaurantId: string): Promise<PublicConfigurationProductRecord[]> {
    const subscriptions = await transaction.$queryRaw<{ planId: string }[]>`
      SELECT "planId" FROM "RestaurantSubscription" WHERE "restaurantId" = ${restaurantId} FOR SHARE
    `;
    const subscription = subscriptions[0];
    if (!subscription) throw new ForbiddenException({ error: "PRODUCT_CONFIGURATION_CAPABILITY_UNAVAILABLE" });
    const featureRows = await transaction.$queryRaw<{ enabled: boolean }[]>`
      SELECT "enabled" FROM "SubscriptionFeature"
      WHERE "planId" = ${subscription.planId} AND "key" = 'PRODUCT_CONFIGURATION' FOR SHARE
    `;
    if (!featureRows[0]?.enabled) {
      throw new ForbiddenException({ error: "PRODUCT_CONFIGURATION_CAPABILITY_UNAVAILABLE", message: "Product Configuration capability is unavailable." });
    }

    // Row locks conflict with ordinary UPDATE/DELETE writers, not only Serializable writers.
    // Lock every possible linked source before reading the pricing catalog snapshot.
    await transaction.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Product" WHERE "restaurantId" = ${restaurantId} ORDER BY "id" FOR SHARE
    `;
    const products = await transaction.product.findMany({
      where: { restaurantId },
      select: {
        id: true, slug: true, name: true, basePrice: true, configurationTree: true,
        configurationVersion: true, isActive: true, isAvailable: true, deletedAt: true
      }
    });
    return products;
  }

  private buildDraft(
    restaurant: LockedRestaurant,
    products: PublicConfigurationProductRecord[],
    request: NetworkOrderDraftRequest
  ): Draft {
    const items: DraftLine[] = request.items.map((line, index) => {
      const owner = products.find((product) => product.id === line.productId);
      if (!owner) throw new NotFoundException("Product is not available in this restaurant");
      const result = quotePublicProductConfiguration({
        restaurantId: restaurant.id, owner, catalogProducts: products,
        capabilityEnabled: true, currency: restaurant.currency, selection: line.selection
      });
      if (!result.ok) {
        const payload = { error: result.error.code, message: result.error.message,
          issues: result.error.issues, currentRevision: result.error.currentRevision, lineIndex: index };
        if (result.error.status === 409) throw new ConflictException(payload);
        throw new BadRequestException(payload);
      }
      const resolved = resolvePublicProductConfiguration({
        restaurantId: restaurant.id, owner, catalogProducts: products, capabilityEnabled: true,
        currency: restaurant.currency
      });
      if (!resolved || !resolved.orderable) {
        throw new ConflictException({ error: "CONFIGURATION_NOT_ORDERABLE", lineIndex: index });
      }
      const context: ProductConfigurationContext = {
        catalogId: restaurant.id,
        linkedProducts: new Map(resolved.linkedProducts.map((source) => [source.productId, {
          productId: source.productId, catalogId: restaurant.id,
          configuration: source.configuration, available: source.available, orderable: source.orderable
        }]))
      };
      const snapshot = createConfigurationSnapshot({
        configuration: resolved.configuration, selection: result.quote.canonicalSelection,
        context, productName: owner.name, currency: restaurant.currency,
        createdAt: new Date().toISOString()
      });
      if (!snapshot.valid || !snapshot.snapshot || snapshot.snapshot.total !== result.quote.trustedTotal) {
        throw new ConflictException({ error: "ORDER_SNAPSHOT_PRICE_MISMATCH", lineIndex: index });
      }
      const unitPrice = result.quote.trustedTotal;
      const lineTotal = multiplyMoney(unitPrice, line.quantity);
      moneyFitsDatabase(unitPrice, `$items[${index}].unitPrice`);
      moneyFitsDatabase(lineTotal, `$items[${index}].lineTotal`);
      return {
        productId: owner.id, productSlug: owner.slug, productName: owner.name,
        ...(line.note ? { note: line.note } : {}),
        quantity: line.quantity, configurationRevision: result.quote.configurationRevision,
        canonicalSelection: result.quote.canonicalSelection, selectionKey: result.quote.selectionKey,
        linkedSourceRevisions: result.quote.linkedSourceRevisions,
        unitPrice, lineTotal, priceBreakdown: snapshot.snapshot.priceLines,
        baseIgnored: result.quote.baseIgnored,
        configurationTree: resolved.configuration,
        linkedSources: resolved.linkedProducts.map((source) => ({
          productId: source.productId, productName: source.name, mode: source.mode,
          configurationRevision: source.configuration.revision, configurationTree: source.configuration
        }))
      };
    });
    const totalAmount = sumMoney(items.map((item) => item.lineTotal));
    moneyFitsDatabase(totalAmount, "$order.totalAmount");
    return {
      schemaVersion: 1, restaurantId: restaurant.id, restaurantSlug: restaurant.slug,
      currency: restaurant.currency, locale: request.locale, items, totalAmount,
      orderDetails: {
        restaurantName: restaurant.name,
        ...(request.customerName ? { customerName: request.customerName } : {}),
        ...(request.customerPhone ? { customerPhone: request.customerPhone } : {}),
        ...(request.fulfillmentType ? { fulfillmentType: request.fulfillmentType } : {}),
        ...(request.deliveryArea ? { deliveryArea: request.deliveryArea } : {}),
        ...(request.deliveryNear ? { deliveryNear: request.deliveryNear } : {}),
        ...(request.deliveryBeside ? { deliveryBeside: request.deliveryBeside } : {}),
        ...(request.pickupTime ? { pickupTime: request.pickupTime } : {}),
        ...(request.orderNote ? { orderNote: request.orderNote } : {})
      },
      orderingEnabled: false
    };
  }

  async prepare(restaurantSlug: string, body: unknown) {
    await this.assertDisposableOnly();
    const request = parseNetworkOrderRequest(body, false);
    try {
      return await this.runSerializable(async (transaction) => {
        const restaurant = await this.lockRestaurant(transaction, restaurantSlug);
        const products = await this.lockCatalog(transaction, restaurant.id);
        const draft = this.buildDraft(restaurant, products, request);
        return { draft, acceptanceToken: issueAcceptanceToken(restaurant.id, sha256(draft)),
          requiresExplicitAcceptance: true, orderingEnabled: false };
      });
    } catch (error) {
      if (isSerializationConflict(error)) {
        throw new ConflictException({ error: "NETWORK_ORDER_CONCURRENT_UPDATE", message: "Catalog changed concurrently; retry with a new quote." });
      }
      throw error;
    }
  }

  /** Read only after the write transaction has ended; never create a new order from this result. */
  private async findCommittedOrder(
    restaurantId: string, request: NetworkOrderCreateRequest, requestHash: string, acceptanceTokenHash: string,
    expectedSnapshot?: unknown
  ) {
    const existing = await this.prisma.order.findUnique({
      where: { restaurantId_idempotencyKey: { restaurantId, idempotencyKey: request.idempotencyKey } },
      include: { items: true }
    });
    if (existing) {
      if (existing.restaurantId !== restaurantId || existing.idempotencyKey !== request.idempotencyKey
        || existing.requestHash !== requestHash || existing.acceptanceTokenHash !== acceptanceTokenHash) {
        throw new ConflictException({ error: "IDEMPOTENCY_KEY_REUSED", message: "This key belongs to a different request." });
      }
      if (!isSealedStoredOrder(existing)
        || (expectedSnapshot !== undefined && stableJson(existing.cartSnapshot) !== stableJson(expectedSnapshot))) {
        throw new ServiceUnavailableException({ error: "NETWORK_ORDER_COMMIT_UNCONFIRMED", message: "The saved test order could not be verified." });
      }
      return { orderId: existing.id, totalAmount: existing.totalAmount.toString(), currency: existing.currency,
        status: existing.status, replayed: true, orderingEnabled: false };
    }
    const usedToken = await this.prisma.order.findUnique({
      where: { restaurantId_acceptanceTokenHash: { restaurantId, acceptanceTokenHash } },
      select: { id: true }
    });
    if (usedToken) throw new ConflictException({ error: "ACCEPTANCE_TOKEN_ALREADY_USED" });
    return null;
  }

  private async confirmAfterFailure(
    restaurantSlug: string, request: NetworkOrderCreateRequest, requestHash: string, acceptanceTokenHash: string
  ) {
    try {
      const restaurant = await this.prisma.restaurant.findFirst({
        where: { slug: restaurantSlug, isActive: true, deletedAt: null }, select: { id: true }
      });
      return restaurant ? this.findCommittedOrder(restaurant.id, request, requestHash, acceptanceTokenHash) : null;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException({ error: "NETWORK_ORDER_COMMIT_UNCONFIRMED", message: "The test order outcome could not be verified." });
    }
  }

  async create(restaurantSlug: string, body: unknown) {
    await this.assertDisposableOnly();
    const request = parseNetworkOrderRequest(body, true);
    const requestHash = sha256(request);
    const acceptanceTokenHash = sha256(request.acceptanceToken);
    let written: { restaurantId: string; orderId: string; snapshot: Prisma.InputJsonValue };
    try {
      written = await this.runSerializable(async (transaction) => {
        await assertNetworkOrderCompletenessGuard(transaction);
        const restaurant = await this.lockRestaurant(transaction, restaurantSlug);
        const products = await this.lockCatalog(transaction, restaurant.id);
        const draft = this.buildDraft(restaurant, products, request);
        if (!verifyAcceptanceToken(request.acceptanceToken, restaurant.id, sha256(draft))) {
          throw new ConflictException({
            error: "NETWORK_ORDER_REQUIRES_NEW_ACCEPTANCE",
            message: "The accepted quote expired or current configuration/price changed.",
            requiresCustomerAcceptance: true,
            changedQuote: draft,
            acceptanceToken: issueAcceptanceToken(restaurant.id, sha256(draft))
          });
        }
        const createdAt = new Date().toISOString();
        const snapshots = draft.items.map((item) => ({
          snapshotVersion: 1, mode: "NETWORK", locale: draft.locale, currency: draft.currency,
          ...item, createdAt
        }));
        const snapshot = { snapshotVersion: 1, mode: "NETWORK", locale: draft.locale,
          orderDetails: draft.orderDetails, totalAmount: draft.totalAmount, currency: draft.currency,
          items: snapshots, createdAt } as Prisma.InputJsonValue;
        const order = await transaction.order.create({
          data: {
            restaurantId: restaurant.id, totalAmount: new Prisma.Decimal(draft.totalAmount),
            customerName: draft.orderDetails.customerName, customerPhone: draft.orderDetails.customerPhone,
            currency: restaurant.currency, status: "VALIDATED_TEST", source: "NETWORK_TEST",
            idempotencyKey: request.idempotencyKey, requestHash, acceptanceTokenHash,
            cartSnapshot: snapshot,
            items: { create: snapshots.map((item) => ({
              productId: item.productId, name: item.productName, quantity: item.quantity,
              note: item.note,
              unitPrice: new Prisma.Decimal(item.unitPrice), totalPrice: new Prisma.Decimal(item.lineTotal),
              options: item as Prisma.InputJsonValue
            })) }
          }
        });
        await transaction.order.update({
          where: { id: order.id }, data: { networkSnapshotSealedAt: new Date() }
        });
        // Prisma 5.22 can resolve the callback despite a deferred COMMIT rollback.
        await transaction.$executeRawUnsafe(`SET CONSTRAINTS ${NETWORK_ORDER_COMPLETENESS_CONSTRAINT} IMMEDIATE`);
        return { restaurantId: restaurant.id, orderId: order.id, snapshot };
      });
    } catch (error) {
      if (isGuardError(error)) throw error;
      // A failed write, lost response or stale Draft may still be an exact replay of a committed order.
      const confirmed = await this.confirmAfterFailure(restaurantSlug, request, requestHash, acceptanceTokenHash);
      if (confirmed) return confirmed;
      if (isSerializationConflict(error)) {
        throw new ConflictException({ error: "NETWORK_ORDER_CONCURRENT_UPDATE", message: "Catalog changed concurrently; retry with a new quote." });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ServiceUnavailableException({ error: "NETWORK_ORDER_UNRESOLVED_UNIQUE_CONFLICT", message: "The test order conflict could not be verified." });
      }
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException({ error: "NETWORK_ORDER_PERSISTENCE_FAILED", message: "The test order was not saved or could not be confirmed." });
    }
    try {
      const confirmed = await this.findCommittedOrder(
        written.restaurantId, request, requestHash, acceptanceTokenHash, written.snapshot
      );
      if (!confirmed || confirmed.orderId !== written.orderId) {
        throw new ServiceUnavailableException({ error: "NETWORK_ORDER_COMMIT_UNCONFIRMED", message: "The test order commit was not confirmed." });
      }
      return { ...confirmed, replayed: false };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException({ error: "NETWORK_ORDER_COMMIT_UNCONFIRMED", message: "The test order commit was not confirmed." });
    }
  }

  async preview(restaurantSlug: string, orderId: string) {
    await this.assertDisposableOnly();
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { slug: restaurantSlug, isActive: true, deletedAt: null }, select: { id: true }
    });
    if (!restaurant) throw new NotFoundException("Restaurant not found");
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId: restaurant.id, source: "NETWORK_TEST", networkSnapshotSealedAt: { not: null } },
      select: { id: true, cartSnapshot: true, totalAmount: true, currency: true }
    });
    if (!order) throw new NotFoundException("Saved test order not found");
    return {
      orderId: order.id, message: formatNetworkOrderWhatsappMessage(order.cartSnapshot),
      totalAmount: order.totalAmount.toString(), currency: order.currency,
      fromSealedSnapshot: true, orderingEnabled: false
    };
  }
}
