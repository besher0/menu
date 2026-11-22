import { feedbackMode, googleMapsShareUrl } from "@menu/shared";
import { publicUploadUrl } from "../../common/public-upload-url";
import { checkoutSigningKey } from "../../common/security/production-config";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { currencyDisplayReconciliation, currencyDisplayScale, formatCurrencyAmount, formatDecimalForDisplay, indexPublicCatalog, DEFAULT_ENGINE_LIMITS, compareMoney, validateMoneyString, multiplyMoney, sumMoney, validateCurrencyAmount } from "@menu/shared";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateWhatsappOrderDto } from "./dto/create-whatsapp-order.dto";
import { readDeliveryFee } from "./delivery-fee";
import {
  preparePublicConfigurationCatalog,
  resolveProductFromCatalog,
  resolvePublicProductConfiguration,
  type PublicConfigurationProductRecord,
  type PublicProductConfigurationResponse
} from "./public-product-configuration";
import { quotePublicProductConfiguration } from "./public-product-quote";
import { formatWhatsappMessageLines } from "../orders/network-order-whatsapp-formatter";
import { sha256 } from "../orders/network-order-contract";
import { reserveDailyWhatsappOrderNumber } from "./daily-whatsapp-order-number";

function isolateWhatsappText(value: string): string {
  const safe = value.replace(/[\r\n\u2028\u2029\t\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ").trim();
  return `\u2068${safe}\u2069`;
}

function isolateWhatsappBoldText(value: string): string {
  return isolateWhatsappText(value.replace(/\*/g, "＊"));
}

// Network activation must not overwrite the merchant-controlled availability flag.
// The legacy order path requires both legacy persistence markers; the Network
// configurator is preview-only until trusted ordering is implemented in Stage 6.
const LEGACY_PUBLIC_PRODUCT_FILTER = {
  isActive: true,
  isAvailable: true,
  configurationVersion: 0,
  configurationTree: { equals: Prisma.DbNull },
  deletedAt: null
} satisfies Prisma.ProductWhereInput;

const PUBLIC_PRODUCT_CANDIDATE_FILTER = {
  isActive: true,
  isAvailable: true,
  deletedAt: null,
  OR: [
    {
      configurationVersion: 0,
      configurationTree: { equals: Prisma.DbNull }
    },
    {
      configurationVersion: { gt: 0 },
      configurationTree: { not: Prisma.DbNull }
    }
  ]
} satisfies Prisma.ProductWhereInput;

@Injectable()
export class PublicMenuService {
  private readonly analyticsLogger = new Logger("PublicMenuAnalytics");
  private pendingAnalytics = 0;
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FeatureFlagsService) private readonly featureFlags: FeatureFlagsService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  async menu(restaurantSlug: string, _userAgent?: string | string[], _trackView = false) {
    const restaurant = await this.findPublicRestaurant(restaurantSlug);

    // Reads (including metadata/prefetch/legacy track=1) never record a view.
    // The visible client sends an independently acknowledged, idempotent event.

    const [features, configurationCapabilityEnabled, menus] = await Promise.all([
      this.featureFlags.listFeatures(restaurant.id),
      this.featureFlags.canUseAssignedFeature(restaurant.id, "PRODUCT_CONFIGURATION"),
      this.prisma.menu.findMany({
        where: { restaurantId: restaurant.id, status: "PUBLISHED" },
        include: {
          pages: {
            where: { status: "PUBLISHED" },
            orderBy: { sortOrder: "asc" },
            include: {
              sections: {
                orderBy: { sortOrder: "asc" }
              }
            }
          }
        },
        orderBy: { createdAt: "asc" }
      })
    ]);

    const products = await this.serializeProducts(
      restaurant.id,
      restaurant.products,
      restaurant.categories,
      features,
      restaurant.currency,
      configurationCapabilityEnabled
    );

    return {
      restaurant: this.serializeRestaurant(restaurant),
      categories: restaurant.categories.map((category) => ({
        id: category.id,
        slug: category.slug,
        name: category.name,
        description: category.description,
        imageUrl: this.publicAssetUrl(category.imageUrl),
        imagePosition: category.imagePosition,
        imageWidth: category.imageWidth,
        imageHeight: category.imageHeight,
        color: category.color,
        backgroundType: category.backgroundType,
        backgroundValue: this.publicAssetUrl(category.backgroundValue),
        backgroundOverlay: category.backgroundOverlay,
        backgroundCss: category.backgroundCss,
        visualScrollEnabled: category.visualScrollEnabled,
        productsCount: category._count.products
      })),
      products,
      networkWhatsappCheckoutEnabled: process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT === "1"
        && Boolean(checkoutSigningKey(process.env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY)),
      theme: this.serializePublicThemeSettings(restaurant.themeSettings?.settings, features),
      menus: this.serializeMenus(menus)
    };
  }

  async menuByHost(hostHeader?: string, userAgent?: string | string[], trackView = true) {
    const host = this.normalizeHost(hostHeader);
    if (!host) {
      throw new NotFoundException("Host header is required");
    }

    const domain = await this.prisma.customDomain.findFirst({
      where: {
        domain: host,
        status: { in: ["ACTIVE", "VERIFIED", "SSL_ACTIVE"] },
        restaurant: { isActive: true, deletedAt: null }
      },
      include: { restaurant: true }
    });

    if (!domain) {
      throw new NotFoundException("Restaurant domain not found");
    }

    return this.menu(domain.restaurant.slug, userAgent, trackView);
  }

  async products(restaurantSlug: string) {
    const restaurant = await this.findPublicRestaurant(restaurantSlug);
    const [features, configurationCapabilityEnabled] = await Promise.all([
      this.featureFlags.listFeatures(restaurant.id),
      this.featureFlags.canUseAssignedFeature(restaurant.id, "PRODUCT_CONFIGURATION")
    ]);
    return this.serializeProducts(
      restaurant.id,
      restaurant.products,
      restaurant.categories,
      features,
      restaurant.currency,
      configurationCapabilityEnabled
    );
  }

  async productConfiguration(restaurantSlug: string, productId: string) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { slug: restaurantSlug, isActive: true, deletedAt: null },
      select: { id: true, currency: true }
    });
    if (!restaurant) throw new NotFoundException("Restaurant not found");

    const capabilityEnabled = await this.featureFlags.canUseAssignedFeature(
      restaurant.id,
      "PRODUCT_CONFIGURATION"
    );
    if (!capabilityEnabled) throw new NotFoundException("Product configuration is unavailable");

    const catalogProducts = await this.configurationCatalogProducts(restaurant.id);
    const owner = catalogProducts.find((product) => product.id === productId || product.slug === productId);
    if (!owner || !owner.isActive || !owner.isAvailable || owner.deletedAt !== null) {
      throw new NotFoundException("Product configuration is unavailable");
    }

    const resolved = resolvePublicProductConfiguration({
      restaurantId: restaurant.id,
      owner,
      catalogProducts,
      capabilityEnabled,
      currency: restaurant.currency
    });
    if (!resolved) throw new NotFoundException("Product configuration is unavailable");
    return resolved;
  }

  async productQuote(restaurantSlug: string, productId: string, body: unknown) {
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body, "selection")) {
      throw new BadRequestException({
        error: "INVALID_QUOTE_REQUEST",
        message: "Quote request must contain only selection; client prices and totals are not accepted.",
        issues: [{ code: "UNEXPECTED_QUOTE_FIELD", path: "$request", message: "Only selection is accepted." }]
      });
    }
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { slug: restaurantSlug, isActive: true, deletedAt: null },
      select: { id: true, currency: true }
    });
    if (!restaurant) throw new NotFoundException("Restaurant not found");

    const catalogProducts = await this.configurationCatalogProducts(restaurant.id);
    const owner = catalogProducts.find((product) => product.id === productId || product.slug === productId);
    if (!owner) throw new NotFoundException("Product configuration is unavailable");
    if (!owner.isActive || !owner.isAvailable || owner.deletedAt !== null) {
      throw new ConflictException({
        error: "PRODUCT_UNAVAILABLE",
        message: "Product is not currently available.",
        issues: [{ code: "PRODUCT_UNAVAILABLE", path: "$configuration", message: "Product is not currently available." }]
      });
    }
    if (owner.configurationVersion <= 0 || owner.configurationTree === null) {
      throw new NotFoundException("Network configuration is unavailable");
    }
    const capabilityEnabled = await this.featureFlags.canUseAssignedFeature(restaurant.id, "PRODUCT_CONFIGURATION");
    if (!capabilityEnabled) {
      throw new ForbiddenException({
        error: "PRODUCT_CONFIGURATION_CAPABILITY_UNAVAILABLE",
        message: "Product Configuration capability is not assigned to this restaurant.",
        issues: [{ code: "PRODUCT_CONFIGURATION_CAPABILITY_UNAVAILABLE", path: "$configuration", message: "Product Configuration capability is unavailable." }]
      });
    }

    const result = quotePublicProductConfiguration({
      restaurantId: restaurant.id,
      owner,
      catalogProducts,
      capabilityEnabled,
      currency: restaurant.currency,
      selection: (body as { selection: unknown }).selection
    });
    if (!result.ok) {
      const payload = { error: result.error.code, message: result.error.message, issues: result.error.issues, currentRevision: result.error.currentRevision };
      if (result.error.status === 409) throw new ConflictException(payload);
      throw new BadRequestException(payload);
    }
    return result.quote;
  }

  async theme(restaurantSlug: string) {
    const restaurant = await this.findPublicRestaurant(restaurantSlug);
    const features = await this.featureFlags.listFeatures(restaurant.id);
    return this.serializePublicThemeSettings(restaurant.themeSettings?.settings, features);
  }

  async track(
    restaurantSlug: string,
    body: { type?: string; path?: string; metadata?: Record<string, unknown>; eventId?: string; clientId?: string },
    userAgent?: string | string[]
  ) {
    const agent = Array.isArray(userAgent) ? userAgent[0] : userAgent;
    if (/bot|crawler|spider|headless|preview|facebookexternalhit/i.test(agent ?? "")) return { ignored: true };
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        (body.type !== undefined && (typeof body.type !== "string" || body.type.length > 64)) ||
        (body.path !== undefined && typeof body.path !== "string") ||
        (body.metadata !== undefined && (!body.metadata || typeof body.metadata !== "object" ||
          Array.isArray(body.metadata) || Buffer.byteLength(JSON.stringify(body.metadata)) > 4096))) {
      throw new BadRequestException("Invalid analytics event");
    }
    // Only views are client-authored. Checkout records its own events atomically.
    if (!body.type || !["MENU_VIEWED", "PRODUCT_VIEWED"].includes(body.type)) {
      throw new BadRequestException("Unsupported public analytics event");
    }
    if ((body.type === "MENU_VIEWED" || body.type === "PRODUCT_VIEWED") && !body.eventId) {
      throw new BadRequestException("View events require a retry-safe identifier");
    }
    if (body.eventId !== undefined && (typeof body.eventId !== "string" ||
        !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.eventId))) {
      throw new BadRequestException("Invalid analytics event identifier");
    }
    if (body.eventId && !["MENU_VIEWED", "PRODUCT_VIEWED"].includes(body.type ?? "")) {
      throw new BadRequestException("Invalid view event type");
    }
    if (body.path && (body.path.length > 512 || !body.path.startsWith(`/m/${restaurantSlug}/`) && body.path !== `/m/${restaurantSlug}`)) {
      throw new BadRequestException("Invalid analytics path");
    }
    if (body.type === "MENU_VIEWED" && (typeof body.clientId !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.clientId))) {
      throw new BadRequestException("Menu visits require a valid browser identifier");
    }
    if (this.pendingAnalytics >= 32) {
      this.analyticsLogger.warn("Analytics backpressure: retryable rejection");
      throw new ServiceUnavailableException("Analytics busy; retry later");
    }
    this.pendingAnalytics++;
    try {
      const restaurant = await this.prisma.restaurant.findFirst({
        where: { slug: restaurantSlug, isActive: true, deletedAt: null }, select: { id: true }
      });

      if (!restaurant) {
        throw new NotFoundException("Restaurant not found");
      }

      // Existing primary key provides persistent retry deduplication, even across
      // API restarts/instances. Include tenant and event type in its namespace.
      const id = body.eventId ? `view-${sha256(`${restaurant.id}:${body.type}:${body.eventId}`)}` : undefined;
      try {
        if (body.type === "MENU_VIEWED" && body.clientId && id) {
          const browserKey = sha256(JSON.stringify([restaurant.id, body.clientId.toLowerCase()]));
          return await this.prisma.$transaction(async tx => {
            // Remember suppressed deliveries too: a late retry must never start a window.
            const receipt = await tx.menuVisitReceipt.createMany({
              data: [{ id, restaurantId: restaurant.id }], skipDuplicates: true
            });
            if (!receipt.count) return { id, duplicate: true };
            const accepted = await tx.$queryRaw<{ lastAcceptedAt: Date }[]>`
              INSERT INTO "MenuVisitWindow" ("restaurantId", "browserKey", "lastAcceptedAt")
              VALUES (${restaurant.id}, ${browserKey}, clock_timestamp())
              ON CONFLICT ("restaurantId", "browserKey") DO UPDATE
                SET "lastAcceptedAt" = clock_timestamp()
                WHERE "MenuVisitWindow"."lastAcceptedAt" <= clock_timestamp() - INTERVAL '30 minutes'
              RETURNING "lastAcceptedAt"
            `;
            if (!accepted.length) return { id, suppressed: true };
            await tx.analyticsEvent.create({ data: {
              id, restaurantId: restaurant.id, type: "MENU_VIEWED", path: body.path,
              userAgent: agent, createdAt: accepted[0].lastAcceptedAt
            } });
            return { id };
          });
        }
        let metadata = body.metadata;
        if (body.type === "PRODUCT_VIEWED") {
          const prefix = `/m/${restaurantSlug}/product/`;
          const slug = body.path?.startsWith(prefix) ? body.path.slice(prefix.length) : "";
          if (!slug || slug.includes("/") || (metadata?.productSlug !== undefined && metadata.productSlug !== slug) ||
              (metadata?.productId !== undefined && typeof metadata.productId !== "string")) {
            throw new BadRequestException("Invalid product view");
          }
          const product = await this.prisma.product.findFirst({
            where: { restaurantId: restaurant.id, slug, id: metadata?.productId as string | undefined, deletedAt: null, isActive: true },
            select: { id: true, slug: true }
          });
          if (!product) throw new BadRequestException("Invalid product view");
          metadata = { productId: product.id, productSlug: product.slug };
        }
        const event = await this.prisma.analyticsEvent.create({
          data: {
            ...(id ? { id } : {}),
            restaurantId: restaurant.id,
            type: body.type ?? "PAGE_VIEWED",
            path: body.path,
            metadata: metadata as Prisma.InputJsonValue | undefined,
            userAgent: agent
          }
        });

        return { id: event.id };
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        if (id && (error as { code?: string }).code === "P2002") return { id, duplicate: true };
        this.analyticsLogger.warn("Analytics persistence failed; event may be retried with the same identifier");
        throw new ServiceUnavailableException("Analytics unavailable; retry later");
      }
    } finally { this.pendingAnalytics--; }
  }

  async createWhatsappOrder(restaurantSlug: string, dto: CreateWhatsappOrderDto) {
    if (dto.idempotencyKey !== undefined && !/^[A-Za-z0-9:_-]{16,128}$/.test(dto.idempotencyKey)) {
      throw new BadRequestException({ error: "INVALID_WHATSAPP_IDEMPOTENCY_KEY" });
    }
    const { idempotencyKey: _idempotencyKey, ...requestFields } = dto;
    const requestHash = sha256(requestFields);
    const restaurantId = await this.prisma.restaurant.findFirst({
      where: { slug: restaurantSlug, isActive: true, deletedAt: null }, select: { id: true }
    });
    if (!restaurantId) throw new NotFoundException("Restaurant not found");
    const replay = async () => {
      if (!dto.idempotencyKey) return null;
      const existing = await this.prisma.order.findUnique({ where: { restaurantId_idempotencyKey: {
        restaurantId: restaurantId.id, idempotencyKey: dto.idempotencyKey
      } } });
      if (!existing) return null;
      if (existing.requestHash !== requestHash) throw new ConflictException({ error: "IDEMPOTENCY_KEY_REUSED" });
      const snapshot = existing.cartSnapshot as Record<string, unknown> | null;
      if (!existing.whatsappMessage || typeof snapshot?.orderNumber !== "string" || typeof snapshot?.whatsappPhone !== "string") {
        throw new ConflictException({ error: "WHATSAPP_ORDER_REPLAY_UNAVAILABLE" });
      }
      return { orderId: existing.id, orderNumber: snapshot.orderNumber, message: existing.whatsappMessage,
        whatsappUrl: `https://wa.me/${snapshot.whatsappPhone}?text=${encodeURIComponent(existing.whatsappMessage)}`, replayed: true };
    };
    const alreadyCommitted = await replay();
    if (alreadyCommitted) return alreadyCommitted;
    try {
    return await this.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Restaurant" WHERE "id" = ${restaurantId.id} FOR UPDATE`;
    if (dto.idempotencyKey) {
      const existing = await tx.order.findUnique({ where: { restaurantId_idempotencyKey: {
        restaurantId: restaurantId.id, idempotencyKey: dto.idempotencyKey
      } } });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new ConflictException({ error: "IDEMPOTENCY_KEY_REUSED" });
        const snapshot = existing.cartSnapshot as Record<string, unknown> | null;
        if (!existing.whatsappMessage || typeof snapshot?.orderNumber !== "string" || typeof snapshot?.whatsappPhone !== "string") {
          throw new ConflictException({ error: "WHATSAPP_ORDER_REPLAY_UNAVAILABLE" });
        }
        return { orderId: existing.id, orderNumber: snapshot.orderNumber, message: existing.whatsappMessage,
          whatsappUrl: `https://wa.me/${snapshot.whatsappPhone}?text=${encodeURIComponent(existing.whatsappMessage)}`, replayed: true };
      }
    }
    const restaurant = await tx.restaurant.findFirst({
      where: { slug: restaurantSlug, isActive: true, deletedAt: null },
      include: {
        branches: true,
        themeSettings: true
      }
    });

    if (!restaurant) {
      throw new NotFoundException("Restaurant not found");
    }

    await this.featureFlags.assertFeature(restaurant.id, "WHATSAPP_ORDERING");
    if (restaurant.themeSettings?.settings && typeof restaurant.themeSettings.settings === "object" && !Array.isArray(restaurant.themeSettings.settings)) {
      const publicUi = (restaurant.themeSettings.settings as { publicUi?: { whatsappOrderingEnabled?: unknown } }).publicUi;
      if (publicUi?.whatsappOrderingEnabled === false) {
        throw new BadRequestException("WhatsApp ordering is disabled");
      }
    }

    const branch = dto.branchSlug
      ? restaurant.branches.find((candidate) => candidate.slug === dto.branchSlug)
      : restaurant.branches[0];

    if (dto.branchSlug && !branch) {
      throw new BadRequestException("Branch was not found");
    }

    const whatsappPhone = dto.branchSlug
      ? branch?.whatsappPhone ?? restaurant.whatsappPhone
      : restaurant.whatsappPhone ?? branch?.whatsappPhone;

    if (!whatsappPhone) {
      throw new BadRequestException("WhatsApp phone is not configured");
    }

    if (dto.items.some(item => !item.productId || typeof item.expectedUnitPrice !== "string" || validateMoneyString(item.expectedUnitPrice, "$item.expectedUnitPrice", DEFAULT_ENGINE_LIMITS).length)) {
      throw new BadRequestException({ error: "WHATSAPP_CART_IDENTITY_REQUIRED", message: "Remove historical items and add them again." });
    }
    const productSlugs = dto.items.map((item) => item.productSlug);
    await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "restaurantId" = ${restaurant.id} ORDER BY "id" FOR SHARE`;
    const products = await tx.product.findMany({
      where: {
        restaurantId: restaurant.id,
        slug: { in: productSlugs },
        ...LEGACY_PUBLIC_PRODUCT_FILTER
      }
    });

    if (products.length !== productSlugs.length) {
      throw new BadRequestException("One or more products are unavailable");
    }
    if (products.some((product) => product.basePrice === null)) {
      throw new BadRequestException("One or more products do not have a legacy price");
    }
    if (products.some((product) => validateCurrencyAmount(product.basePrice!.toString(), restaurant.currency, "$product.basePrice").length)) {
      throw new BadRequestException({ error: "INVALID_CURRENCY_PRICE", message: "A product has an invalid price for the restaurant currency." });
    }

    const items = dto.items.map((item) => {
      const product = products.find((candidate) => candidate.id === item.productId && candidate.slug === item.productSlug);
      if (!product) throw new ConflictException({ error: "WHATSAPP_PRODUCT_UNAVAILABLE" });
      if (compareMoney(item.expectedUnitPrice, product.basePrice!.toString()) !== 0) {
        throw new ConflictException({ error: "WHATSAPP_CART_REVIEW_REQUIRED", message: "The product price changed; review and accept the current price." });
      }
      const unitPrice = product.basePrice!.toString();
      const totalPrice = multiplyMoney(unitPrice, item.quantity);

      return {
        product,
        name: product.name,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
        options: item.options ?? [],
        note: item.note
      };
    });

    const itemsSubtotal = sumMoney(items.map((item) => item.totalPrice));
    const dashboardSettings = this.dashboardSettingsFromTheme(restaurant.themeSettings?.settings);
    const deliveryFee = dto.fulfillmentType === "delivery" ? readDeliveryFee(dashboardSettings, restaurant.currency) : null;
    const totalAmount = dto.fulfillmentType === "delivery" && deliveryFee !== null
      ? sumMoney([itemsSubtotal, deliveryFee]) : itemsSubtotal;
    const showPrices = dashboardSettings.showPrices ?? true;
    const orderNumber = await reserveDailyWhatsappOrderNumber(tx, restaurant.id);
    const createdAt = new Date();
    const message = this.buildWhatsappMessage({
      restaurantName: restaurant.name,
      branchName: branch?.name,
      orderNumber,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      orderNote: dto.orderNote,
      fulfillmentType: dto.fulfillmentType,
      deliveryArea: dto.deliveryArea,
      deliveryNear: dto.deliveryNear,
      deliveryBeside: dto.deliveryBeside,
      pickupTime: dto.pickupTime,
      currency: restaurant.currency,
      items,
      itemsSubtotal,
      deliveryFee,
      totalAmount,
      showPrices
    });

    const order = await tx.order.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch?.id,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        totalAmount,
        currency: restaurant.currency,
        status: "PENDING_WHATSAPP", createdAt,
        whatsappMessage: message,
        cartSnapshot: { ...dto, orderNumber, whatsappPhone: whatsappPhone.replace(/^\+/, ""),
          itemsSubtotal, deliveryFee, finalTotalKnown: dto.fulfillmentType !== "delivery" || deliveryFee !== null } as unknown as Prisma.InputJsonValue,
        ...(dto.idempotencyKey ? { idempotencyKey: dto.idempotencyKey, requestHash } : {}),
        items: {
          create: items.map((item) => ({
            productId: item.product.id,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            options: item.options,
            note: item.note
          }))
        }
      }
    });

    await tx.analyticsEvent.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch?.id,
        type: "WHATSAPP_ORDER_CLICKED",
        metadata: { orderId: order.id, orderNumber, totalAmount }
      }
    });

    return {
      orderId: order.id,
      orderNumber,
      message,
      whatsappUrl: `https://wa.me/${whatsappPhone.replace(/^\+/, "")}?text=${encodeURIComponent(message)}`,
      replayed: false
    };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 20_000 });
    } catch (error) {
      const committed = await replay();
      if (committed) return committed;
      throw error;
    }
  }

  async nextWhatsappOrderNumber(restaurantSlug: string) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { slug: restaurantSlug, isActive: true, deletedAt: null },
      select: { id: true }
    });

    if (!restaurant) {
      throw new NotFoundException("Restaurant not found");
    }

    const sequence = await this.nextDailyOrderSequence(restaurant.id);
    return { orderNumber: this.formatDailyOrderNumber(sequence) };
  }

  private async findPublicRestaurant(restaurantSlug: string) {
    const read = () => this.prisma.restaurant.findFirst({
      where: { slug: restaurantSlug, isActive: true, deletedAt: null },
      include: {
        branches: {
          where: { isActive: true, deletedAt: null },
          orderBy: { createdAt: "asc" },
          include: { openingHours: { orderBy: { day: "asc" } } }
        },
        categories: {
          where: { isActive: true, deletedAt: null },
          include: { _count: { select: { products: { where: { restaurant: { slug: restaurantSlug } } } } } },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
        },
        products: {
          where: PUBLIC_PRODUCT_CANDIDATE_FILTER,
          include: {
            category: true,
            images: {
              where: { isActive: true },
              orderBy: { sortOrder: "asc" },
              include: { media: { select: { restaurantId: true, url: true, width: true, height: true, type: true } } }
            },
            media3d: true,
            vrMedia: true,
            options: {
              orderBy: { sortOrder: "asc" },
              include: {
                options: {
                  where: { isActive: true },
                  orderBy: { sortOrder: "asc" }
                }
              }
            }
          },
          orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { createdAt: "desc" }, { id: "asc" }]
        },
        themeSettings: true
      }
    });

    let restaurant = await read();
    // Existing catalogues normally already have a healthy system category.
    // Keep legacy first-read repair and its uniqueness/race behavior for old data.
    if (restaurant && !restaurant.categories.some(row => row.slug === "all" && row.name === "الكل" && row.sortOrder === 0)) {
      await this.ensureAllCategory(restaurant.id);
      restaurant = await read();
    }
    if (!restaurant) {
      throw new NotFoundException("Restaurant not found");
    }

    const models = restaurant.products.filter(p => p.media3d?.isActive);
    if (models.length) {
      const assets = await this.prisma.mediaAsset.findMany({ where: { restaurantId:restaurant.id, type:"MODEL_3D",
        provider:"CLOUDINARY", url:{ in:models.map(p=>p.media3d!.url) }, validatedFormat:{ in:["GLB","GLTF"] } }, select:{url:true,validatedFormat:true} });
      const verified = new Map(assets.map(a=>[a.url,a.validatedFormat]));
      for (const product of models) {
        const format = verified.get(product.media3d!.url);
        if (!format) product.media3d = null;
        else product.media3d!.format = format;
      }
    }
    return restaurant;
  }

  private normalizeHost(hostHeader?: string) {
    return hostHeader?.split(":")[0]?.trim().toLowerCase();
  }

  private serializeRestaurant(restaurant: any) {
    const dashboardSettings = this.dashboardSettingsFromTheme(restaurant.themeSettings?.settings);

    return {
      id: restaurant.id,
      slug: restaurant.slug,
      name: restaurant.name,
      type: restaurant.type,
      description: restaurant.description,
      logoUrl: this.publicAssetUrl(restaurant.logoUrl),
      heroImageUrl: this.publicAssetUrl(restaurant.heroImageUrl),
      city: restaurant.city,
      country: restaurant.country,
      whatsappPhone: restaurant.whatsappPhone,
      phone: dashboardSettings.phone ?? null,
      email: dashboardSettings.email ?? null,
      instagramUrl: dashboardSettings.instagramUrl ?? null,
      facebookUrl: dashboardSettings.facebookUrl ?? null,
      tiktokUrl: dashboardSettings.tiktokUrl ?? null,
      whatsappUrl: dashboardSettings.whatsappUrl ?? null,
      feedbackMode: feedbackMode(dashboardSettings.feedbackMode),
      googleMapsUrl: googleMapsShareUrl(dashboardSettings.googleMapsUrl),
      showPrices: dashboardSettings.showPrices ?? true,
      deliveryFee: readDeliveryFee(dashboardSettings, restaurant.currency),
      productOpenMode: dashboardSettings.productOpenMode === "PAGE" ? "PAGE" : "MODAL",
      splashScreen: this.serializeSplashScreenSettings(
        dashboardSettings.splashScreen,
        restaurant.logoUrl,
        restaurant.heroImageUrl,
        restaurant.themeSettings?.settings
      ),
      currency: restaurant.currency,
      branches: restaurant.branches.map((branch: any) => ({
        id: branch.id,
        slug: branch.slug,
        name: branch.name,
        address: branch.address,
        latitude: branch.latitude ?? null,
        longitude: branch.longitude ?? null,
        city: branch.city,
        whatsappPhone: branch.whatsappPhone,
        openingHours: branch.openingHours?.map((hour: any) => ({
          day: hour.day,
          opensAt: hour.opensAt,
          closesAt: hour.closesAt,
          isClosed: hour.isClosed
        })) ?? []
      }))
    };
  }

  private serializeProduct(product: any, features: Array<{ key: string; enabled: boolean }>, currency: string) {
    const canUse3d = features.some((feature) => feature.key === "PRODUCT_3D_VIEWER" && feature.enabled);
    const canUseVr = features.some((feature) => feature.key === "PRODUCT_VR_VIEWER" && feature.enabled);
    const moodKeys = this.parseStoredMoodKeys(product.moodKey);

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      basePrice: product.basePrice === null ? null : Number(product.basePrice),
      basePriceExact: product.basePrice === null ? null : product.basePrice.toString(),
      currency,
      sortOrder: product.sortOrder,
      isFeatured: product.isFeatured,
      isNew: product.isNew,
      isPopular: product.isPopular,
      moodKey: moodKeys[0] ?? null,
      moodKeys,
      ingredients: this.serializePublicIngredients(product.ingredients),
      nutrition: this.serializeNutrition(product.nutrition),
      category: product.category && product.category.restaurantId === product.restaurantId
        ? {
            id: product.category.id,
            slug: product.category.slug,
            name: product.category.name
          }
        : null,
      imageUrl: this.publicAssetUrl(product.images[0]?.url),
      images: product.images.map(({ media, ...image }: any) => {
        const hasDimensions = media?.restaurantId === product.restaurantId && media?.url === image.url
          && media?.type === "IMAGE" && Number.isInteger(media.width) && media.width > 0
          && Number.isInteger(media.height) && media.height > 0;
        return {
          ...image, url: this.publicAssetUrl(image.url),
          ...(hasDimensions ? { width: media.width, height: media.height } : {})
        };
      }),
      options: product.options,
      media: {
        model3dUrl: canUse3d && product.media3d?.isActive ? this.publicAssetUrl(product.media3d.url) : null,
        model3dFormat: product.media3d?.format ?? null,
        vrUrl: canUseVr && product.vrMedia?.isActive ? this.publicAssetUrl(product.vrMedia.panoramaUrl) : null
      }
    };
  }

  private async serializeProducts(
    restaurantId: string,
    products: any[],
    categories: readonly { slug: string }[],
    features: Array<{ key: string; enabled: boolean }>,
    currency: string,
    capabilityEnabled: boolean
  ) {
    const hasNetworkCandidates = products.some(
      (product) => product.configurationVersion > 0 && product.configurationTree !== null
    );
    const catalog = capabilityEnabled && hasNetworkCandidates
      ? preparePublicConfigurationCatalog({
          restaurantId, currency, capabilityEnabled,
          catalogProducts: await this.configurationCatalogProducts(restaurantId)
        })
      : null;

    const visible = products.flatMap((product) => {
      const legacy = product.configurationVersion === 0 && product.configurationTree === null;
      if (legacy) {
        if (product.basePrice === null || validateCurrencyAmount(product.basePrice.toString(), currency, "$product.basePrice").length) return [];
        return [this.serializeProduct(product, features, currency)];
      }
      if (!catalog) return [];
      const owner = catalog.products.get(product.id);
      if (!owner) return [];
      const configuration = resolveProductFromCatalog(owner, catalog);
      if (!configuration) return [];

      return [{
        ...this.serializeProduct(product, features, currency),
        basePrice: null,
        price: configuration.minimumPrice,
        productConfiguration: this.configurationSummary(configuration)
      }];
    });
    return indexPublicCatalog(visible, categories).ordered;
  }

  private configurationSummary(configuration: PublicProductConfigurationResponse) {
    return {
      mode: "NETWORK" as const,
      configurationRevision: configuration.configurationRevision,
      orderable: configuration.orderable,
      minimumPrice: configuration.minimumPrice,
      priceDisplay: configuration.priceDisplay,
      issueCodes: configuration.issues.map((issue) => issue.code)
    };
  }

  private async configurationCatalogProducts(restaurantId: string): Promise<PublicConfigurationProductRecord[]> {
    return this.prisma.product.findMany({
      where: { restaurantId },
      select: {
        id: true,
        restaurantId: true,
        currency: true,
        slug: true,
        name: true,
        basePrice: true,
        configurationTree: true,
        configurationVersion: true,
        isActive: true,
        isAvailable: true,
        deletedAt: true
      }
    });
  }

  private parseStoredMoodKeys(value?: string | null) {
    const fallback = value?.trim();
    if (!fallback) return [];

    try {
      const parsed = JSON.parse(fallback);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
      }
    } catch {
      // Existing products store a single mood label directly.
    }

    return [fallback];
  }

  private serializeMenus(menus: any[]) {
    return menus.map((menu) => ({
      ...menu,
      pages: menu.pages?.map((page: any) => ({
        ...page,
        sections: page.sections?.map((section: any) => ({
          ...section,
          settings: this.serializeSectionSettings(section.settings)
        }))
      }))
    }));
  }

  private serializePublicThemeSettings(settings: any, features: Array<{ key: string; enabled: boolean }>) {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return settings ?? null;
    }

    const orderingFeaturesEnabled = ["CART_ORDERING", "WHATSAPP_ORDERING"].every((key) =>
      features.some((feature) => feature.key === key && feature.enabled)
    );
    const theme = { ...settings };

    if (!orderingFeaturesEnabled) {
      const currentPublicUi = theme.publicUi && typeof theme.publicUi === "object" && !Array.isArray(theme.publicUi)
        ? theme.publicUi
        : {};
      theme.publicUi = {
        ...currentPublicUi,
        whatsappOrderingEnabled: false
      };
    }

    return theme;
  }

  private serializeNutrition(nutrition: Prisma.JsonValue | null) {
    if (Array.isArray(nutrition)) return this.serializeMealDetailRows(nutrition);
    if (!nutrition || typeof nutrition !== "object") return null;

    const result: Record<string, Prisma.JsonValue> = {};
    for (const key of ["calories", "weight", "protein", "breadType", "spice"]) {
      const value = nutrition[key];
      if (typeof value === "string" || typeof value === "number") result[key] = value;
    }
    if (Array.isArray(nutrition.details)) {
      result.details = this.serializeMealDetailRows(nutrition.details);
    }
    return result;
  }

  private serializeMealDetailRows(rows: Prisma.JsonArray): Prisma.JsonArray {
    const details: Prisma.JsonArray = [];
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const displayName = (typeof row.displayName === "string" && row.displayName.trim())
        || (typeof row.label === "string" ? row.label.trim() : "");
      const detail: Prisma.JsonObject = {
        label: displayName,
        displayName,
        value: typeof row.value === "string" || typeof row.value === "number" ? String(row.value) : "",
        icon: typeof row.icon === "string" && row.icon.trim() ? row.icon : "utensils"
      };
      if (row.valueType === "PRESENCE") detail.valueType = "PRESENCE";
      if (typeof row.iconUrl === "string") detail.iconUrl = this.publicAssetUrl(row.iconUrl) ?? "";
      details.push(detail);
    }
    return details;
  }

  private serializePublicIngredients(ingredients: Prisma.JsonValue | null) {
    if (!Array.isArray(ingredients)) {
      return ingredients ?? [];
    }

    return ingredients.map((item) => {
      if (typeof item === "string") {
        const name = item.trim();
        return name ? { name, displayName: name } : item;
      }

      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return item;
      }

      const source = item as Record<string, Prisma.JsonValue>;
      const displayName = typeof source.displayName === "string" && source.displayName.trim()
        ? source.displayName.trim()
        : typeof source.name === "string"
          ? source.name.trim()
          : "";

      return {
        name: displayName,
        displayName,
        imageUrl: typeof source.imageUrl === "string" ? this.publicAssetUrl(source.imageUrl) ?? "" : ""
      };
    });
  }

  private serializeSectionSettings(settings: any) {
    if (!settings) {
      return settings;
    }

    return {
      ...settings,
      backgroundImageUrl: this.publicAssetUrl(settings.backgroundImageUrl),
      adBanners: settings.adBanners?.map((banner: any) => ({
        ...banner,
        imageUrl: this.publicAssetUrl(banner.imageUrl)
      })),
      moodItems: settings.moodItems?.map((item: any) => ({
        ...item,
        iconUrl: this.publicAssetUrl(item.iconUrl),
        backgroundValue: this.publicAssetUrl(item.backgroundValue)
      }))
    };
  }

  private dashboardSettingsFromTheme(settings: any): Record<string, any> {
    return settings && typeof settings === "object" && !Array.isArray(settings) && settings.dashboardSettings
      ? settings.dashboardSettings
      : {};
  }

  private serializeSplashScreenSettings(settings: unknown, restaurantLogoUrl?: string | null, heroImageUrl?: string | null, themeSettings?: any) {
    const splash = settings && typeof settings === "object" && !Array.isArray(settings) ? settings as Record<string, any> : {};
    const logoUrl = typeof splash.logoUrl === "string" && splash.logoUrl ? splash.logoUrl : restaurantLogoUrl;
    const configuredBackgroundType = splash.backgroundType === "COLOR" || splash.backgroundType === "IMAGE" ? splash.backgroundType : null;
    const configuredImageUrl = typeof splash.backgroundImageUrl === "string" && splash.backgroundImageUrl ? splash.backgroundImageUrl : null;
    const fallbackImageUrl = heroImageUrl || null;
    const effectiveImageUrl = configuredBackgroundType === "IMAGE" ? configuredImageUrl ?? fallbackImageUrl : configuredBackgroundType ? null : configuredImageUrl ?? fallbackImageUrl;
    const backgroundType = effectiveImageUrl ? "IMAGE" : "COLOR";
    const themePrimary = themeSettings && typeof themeSettings === "object" && !Array.isArray(themeSettings)
      ? themeSettings.colors?.primary
      : null;

    return {
      logoUrl: this.publicAssetUrl(logoUrl),
      backgroundType,
      backgroundColor: typeof splash.backgroundColor === "string" && splash.backgroundColor ? splash.backgroundColor : themePrimary ?? "#e51f2a",
      backgroundImageUrl: this.publicAssetUrl(effectiveImageUrl),
      logoX: this.clampPercent(splash.logoX, 50),
      logoY: this.clampPercent(splash.logoY, 50)
    };
  }

  private clampPercent(value: unknown, fallback: number) {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(100, Math.max(0, parsed));
  }

  private async ensureAllCategory(restaurantId: string) {
    const where = { restaurantId_slug: { restaurantId, slug: "all" } } as const;
    const select = { id: true, isActive: true, sortOrder: true, name: true, deletedAt: true } as const;
    const restoreIfNeeded = async (category: { isActive: boolean; sortOrder: number; name: string; deletedAt: Date | null }) => {
      if (!category.isActive || category.sortOrder !== 0 || category.name !== "الكل" || category.deletedAt !== null) {
        // "all" is a protected system category; retain its ID, products, and presentation fields.
        await this.prisma.category.update({
          where,
          data: { name: "الكل", isActive: true, sortOrder: 0, deletedAt: null }
        });
      }
    };
    const existing = await this.prisma.category.findUnique({ where, select });

    if (existing) {
      await restoreIfNeeded(existing);
      return;
    }

    try {
      await this.prisma.category.create({
        data: {
          restaurantId,
          name: "الكل",
          slug: "all",
          description: "كل الأصناف",
          imagePosition: "78,50",
          imageWidth: 34,
          imageHeight: 34,
          color: "#ed1f2b",
          backgroundType: "GRADIENT",
          backgroundValue: "linear-gradient(135deg, #ed1f2b, #7f1118)",
          sortOrder: 0,
          isActive: true
        }
      });
    } catch (error) {
      const target = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.target : undefined;
      const isAllUniqueConflict = error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
        && (Array.isArray(target)
          ? target.length === 2 && target.includes("restaurantId") && target.includes("slug")
          : target === "Category_restaurantId_slug_key");
      if (!isAllUniqueConflict) throw error;
      // A concurrent first request inserted the exact same tenant-scoped system category.
      const concurrent = await this.prisma.category.findUnique({ where, select });
      if (!concurrent) throw error;
      await restoreIfNeeded(concurrent);
    }
  }

  private publicAssetUrl(url?: string | null) {
    const apiOrigin = this.config.get<string>("API_ORIGIN") ?? `http://localhost:${this.config.get<string>("PORT") ?? 5000}`;
    return publicUploadUrl(url, apiOrigin);
  }

  private buildWhatsappMessage(input: {
    restaurantName: string;
    branchName?: string;
    orderNumber: string;
    customerName?: string;
    customerPhone?: string;
    orderNote?: string;
    fulfillmentType?: "pickup" | "delivery";
    deliveryArea?: string;
    deliveryNear?: string;
    deliveryBeside?: string;
    pickupTime?: string;
    currency: string;
    items: Array<{
      name: string;
      quantity: number;
      unitPrice: string;
      totalPrice: string;
      options: string[];
      note?: string;
    }>;
    itemsSubtotal: string;
    deliveryFee: string | null;
    totalAmount: string;
    showPrices: boolean;
  }) {
    const displayDifference = input.showPrices
      ? currencyDisplayReconciliation(input.items.map((item) => item.totalPrice), input.itemsSubtotal, input.currency)
      : null;
    const displayAmount = (value: string) => currencyDisplayScale(input.currency) === null
      ? `${formatDecimalForDisplay(value, 2)} ${input.currency}` : formatCurrencyAmount(value, input.currency, "ar");
    const lines: (string | null)[] = [
      `🧾 طلب جديد رقم ${input.orderNumber} — OrderSawa`,
      `المطعم: ${isolateWhatsappText(input.restaurantName)}`,
      input.fulfillmentType ? `طريقة الاستلام: ${input.fulfillmentType === "delivery" ? "🛵 توصيل دليفري" : "🍽️ استلام من المطعم"}` : null,
      "━━━━━━━━━━━━━━",
      ...input.items.flatMap((item): (string | null)[] => [
        `${item.quantity} × ${isolateWhatsappText(item.name)}`,
        ...item.options.map((option) => `• ${isolateWhatsappText(option)}`),
        item.note ? `*🔸️ ملاحظة الصنف: ${isolateWhatsappBoldText(item.note)}*` : null,
        input.showPrices ? `إجمالي الصنف: ${displayAmount(item.totalPrice)}` : null,
        "━━━━━━━━━━━━━━",
        ""
      ]),
      input.orderNote ? `*🔸️ ملاحظات الطلب: ${isolateWhatsappBoldText(input.orderNote)}*` : null,
      input.orderNote ? "━━━━━━━━━━━━━━" : null,
      input.orderNote ? "" : null,
      displayDifference ? `فرق عرض التقريب: ${displayDifference}` : null,
      input.showPrices ? `مجموع الأصناف: ${displayAmount(input.itemsSubtotal)}` : null,
      input.showPrices ? `رسوم التوصيل: ${input.fulfillmentType !== "delivery" ? "لا تُضاف للاستلام"
        : input.deliveryFee === null ? "تُحدّد حسب المنطقة" : input.deliveryFee === "0" ? "مجاني" : formatCurrencyAmount(input.deliveryFee, input.currency, "ar")}` : null,
      input.showPrices ? `الإجمالي: ${input.fulfillmentType === "delivery" && input.deliveryFee === null
        ? "يُحدّد بعد رسوم التوصيل" : displayAmount(input.totalAmount)}` : null,
      "",
      input.customerName ? `الاسم: ${isolateWhatsappText(input.customerName)}` : null,
      input.customerPhone ? `الهاتف: ${isolateWhatsappText(input.customerPhone)}` : null,
      input.fulfillmentType === "delivery" && input.deliveryArea ? `المنطقة: ${isolateWhatsappText(input.deliveryArea)}` : null,
      input.fulfillmentType === "delivery" && input.deliveryNear ? `قريب من: ${isolateWhatsappText(input.deliveryNear)}` : null,
      input.fulfillmentType === "delivery" && input.deliveryBeside ? `العنوان: ${isolateWhatsappText(input.deliveryBeside)}` : null,
      input.fulfillmentType === "pickup" && input.pickupTime ? `🕒 وقت الاستلام: ${isolateWhatsappText(input.pickupTime)}` : null
    ];

    return formatWhatsappMessageLines(lines, "ar").replace(/\n+$/, "");
  }

  private async nextDailyOrderSequence(restaurantId: string) {
    const { start, end } = this.currentServerDayRange();
    const existingOrdersToday = await this.prisma.order.count({
      where: {
        restaurantId,
        createdAt: {
          gte: start,
          lt: end
        }
      }
    });

    return existingOrdersToday + 1;
  }

  private currentServerDayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private formatDailyOrderNumber(sequence: number) {
    return String(Math.max(1, sequence)).padStart(3, "0");
  }
}
