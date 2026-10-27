import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { currencyDisplayReconciliation, currencyDisplayScale, formatCurrencyAmount, formatDecimalForDisplay, multiplyMoney, sumMoney, validateCurrencyAmount } from "@menu/shared";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateWhatsappOrderDto } from "./dto/create-whatsapp-order.dto";
import { readDeliveryFee } from "./delivery-fee";
import {
  resolvePublicProductConfiguration,
  type PublicConfigurationProductRecord,
  type PublicProductConfigurationResponse
} from "./public-product-configuration";
import { quotePublicProductConfiguration } from "./public-product-quote";

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
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FeatureFlagsService) private readonly featureFlags: FeatureFlagsService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  async menu(restaurantSlug: string, userAgent?: string | string[], trackView = true) {
    const restaurant = await this.findPublicRestaurant(restaurantSlug);

    if (trackView) {
      await this.prisma.analyticsEvent.create({
        data: {
          restaurantId: restaurant.id,
          type: "MENU_VIEWED",
          path: `/m/${restaurant.slug}`,
          userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent
        }
      });
    }

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
        && /^[0-9a-fA-F]{64,}$/.test(process.env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY ?? ""),
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
    body: { type?: string; path?: string; metadata?: Record<string, unknown> },
    userAgent?: string | string[]
  ) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { slug: restaurantSlug, isActive: true, deletedAt: null }
    });

    if (!restaurant) {
      throw new NotFoundException("Restaurant not found");
    }

    const event = await this.prisma.analyticsEvent.create({
      data: {
        restaurantId: restaurant.id,
        type: body.type ?? "PAGE_VIEWED",
        path: body.path,
        metadata: body.metadata as Prisma.InputJsonValue | undefined,
        userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent
      }
    });

    return { id: event.id };
  }

  async createWhatsappOrder(restaurantSlug: string, dto: CreateWhatsappOrderDto) {
    const restaurant = await this.prisma.restaurant.findFirst({
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

    const productSlugs = dto.items.map((item) => item.productSlug);
    const products = await this.prisma.product.findMany({
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
      const product = products.find((candidate) => candidate.slug === item.productSlug)!;
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
    const orderNumber = this.formatDailyOrderNumber(await this.nextDailyOrderSequence(restaurant.id));
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

    const order = await this.prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch?.id,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        totalAmount,
        currency: restaurant.currency,
        status: "PENDING_WHATSAPP",
        whatsappMessage: message,
        cartSnapshot: { ...dto, orderNumber, itemsSubtotal, deliveryFee, finalTotalKnown: dto.fulfillmentType !== "delivery" || deliveryFee !== null } as unknown as Prisma.InputJsonValue,
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

    await this.prisma.analyticsEvent.create({
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
      whatsappUrl: `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`
    };
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
    const existing = await this.prisma.restaurant.findFirst({
      where: { slug: restaurantSlug, isActive: true, deletedAt: null },
      select: { id: true }
    });

    if (!existing) {
      throw new NotFoundException("Restaurant not found");
    }

    await this.ensureAllCategory(existing.id);

    const restaurant = await this.prisma.restaurant.findFirst({
      where: { slug: restaurantSlug, isActive: true, deletedAt: null },
      include: {
        branches: {
          where: { isActive: true, deletedAt: null },
          orderBy: { createdAt: "asc" },
          include: { openingHours: { orderBy: { day: "asc" } } }
        },
        categories: {
          where: { isActive: true, deletedAt: null },
          include: { _count: { select: { products: true } } },
          orderBy: { sortOrder: "asc" }
        },
        products: {
          where: PUBLIC_PRODUCT_CANDIDATE_FILTER,
          include: {
            category: true,
            images: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
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
          orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { createdAt: "desc" }]
        },
        themeSettings: true
      }
    });

    if (!restaurant) {
      throw new NotFoundException("Restaurant not found");
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
      category: product.category
        ? {
            id: product.category.id,
            slug: product.category.slug,
            name: product.category.name
          }
        : null,
      imageUrl: this.publicAssetUrl(product.images[0]?.url),
      images: product.images.map((image: any) => ({
        ...image,
        url: this.publicAssetUrl(image.url)
      })),
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
    features: Array<{ key: string; enabled: boolean }>,
    currency: string,
    capabilityEnabled: boolean
  ) {
    const hasNetworkCandidates = products.some(
      (product) => product.configurationVersion > 0 && product.configurationTree !== null
    );
    const catalogProducts = capabilityEnabled && hasNetworkCandidates
      ? await this.configurationCatalogProducts(restaurantId)
      : [];

    return products.flatMap((product) => {
      const legacy = product.configurationVersion === 0 && product.configurationTree === null;
      if (legacy) {
        if (product.basePrice === null || validateCurrencyAmount(product.basePrice.toString(), currency, "$product.basePrice").length) return [];
        return [this.serializeProduct(product, features, currency)];
      }
      if (!capabilityEnabled) return [];

      const owner = catalogProducts.find((candidate) => candidate.id === product.id);
      if (!owner) return [];
      const configuration = resolvePublicProductConfiguration({
        restaurantId,
        owner,
        catalogProducts,
        capabilityEnabled,
        currency
      });
      if (!configuration) return [];

      return [{
        ...this.serializeProduct(product, features, currency),
        basePrice: null,
        price: configuration.minimumPrice,
        productConfiguration: this.configurationSummary(configuration)
      }];
    });
  }

  private configurationSummary(configuration: PublicProductConfigurationResponse) {
    return {
      mode: "NETWORK" as const,
      configurationRevision: configuration.configurationRevision,
      orderable: configuration.orderable,
      previewOnly: true as const,
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
    if (!nutrition || typeof nutrition !== "object" || Array.isArray(nutrition)) {
      return nutrition ?? null;
    }

    const record = { ...(nutrition as Record<string, Prisma.JsonValue>) };
    if (Array.isArray(record.details)) {
      record.details = record.details.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        const source = item as Record<string, Prisma.JsonValue>;
        const displayName = typeof source.displayName === "string" && source.displayName.trim()
          ? source.displayName.trim()
          : typeof source.label === "string"
            ? source.label.trim()
            : "";
        const detail: Record<string, Prisma.JsonValue> = {
          label: displayName,
          displayName,
          value: typeof source.value === "string" ? source.value : "",
          icon: typeof source.icon === "string" && source.icon.trim() ? source.icon : "utensils"
        };
        if (typeof detail.iconUrl === "string") {
          detail.iconUrl = this.publicAssetUrl(detail.iconUrl) ?? "";
        } else if (typeof source.iconUrl === "string") {
          detail.iconUrl = this.publicAssetUrl(source.iconUrl) ?? "";
        }
        return detail;
      }) as Prisma.JsonArray;
    }

    return record;
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
    if (!url) {
      return null;
    }

    if (!url.includes("/uploads/")) {
      return url;
    }

    const apiOrigin = this.config.get<string>("API_ORIGIN") ?? `http://localhost:${this.config.get<string>("PORT") ?? 5000}`;

    if (url.startsWith("/uploads/")) {
      return `${apiOrigin}${url}`;
    }

    try {
      const parsedUrl = new URL(url);
      return `${apiOrigin}${parsedUrl.pathname}${parsedUrl.search}`;
    } catch {
      return url;
    }
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
    const lines = [
      `طلب جديد من ${input.restaurantName}`,
      `رقم الطلب: ${input.orderNumber}`,
      "",
      input.branchName ? `الفرع: ${input.branchName}` : null,
      input.customerName ? `الزبون: ${input.customerName}` : null,
      input.customerPhone ? `الهاتف: ${input.customerPhone}` : null,
      input.fulfillmentType ? `طريقة الاستلام: ${input.fulfillmentType === "delivery" ? "توصيل دليفري" : "استلام من المطعم"}` : null,
      input.fulfillmentType === "delivery" && input.deliveryArea ? `المنطقة: ${input.deliveryArea}` : null,
      input.fulfillmentType === "delivery" && input.deliveryNear ? `قريب من: ${input.deliveryNear}` : null,
      input.fulfillmentType === "delivery" && input.deliveryBeside ? `جانب: ${input.deliveryBeside}` : null,
      input.fulfillmentType === "pickup" && input.pickupTime ? `وقت الاستلام: ${input.pickupTime}` : null,
      "",
      "العناصر:",
      ...input.items.flatMap((item, index) => [
        `${index + 1}- ${item.quantity}x ${item.name}`,
        item.options.length ? `الإضافات: ${item.options.join(", ")}` : null,
        item.note ? `ملاحظة: ${item.note}` : null,
        input.showPrices ? `السعر: ${currencyDisplayScale(input.currency) === null
          ? `${formatDecimalForDisplay(item.totalPrice, 2)} ${input.currency}`
          : formatCurrencyAmount(item.totalPrice, input.currency)}` : null,
        ""
      ]),
      displayDifference ? `فرق عرض التقريب: ${displayDifference}` : null,
      input.showPrices ? `مجموع الأصناف: ${currencyDisplayScale(input.currency) === null
        ? `${formatDecimalForDisplay(input.itemsSubtotal, 2)} ${input.currency}`
        : formatCurrencyAmount(input.itemsSubtotal, input.currency)}` : null,
      input.showPrices && input.fulfillmentType === "delivery" ? `رسوم التوصيل: ${input.deliveryFee === null ? "تُحدّد حسب المنطقة" : input.deliveryFee === "0" ? "مجاني" : formatCurrencyAmount(input.deliveryFee, input.currency)}` : null,
      input.showPrices && (input.fulfillmentType !== "delivery" || input.deliveryFee !== null) ? `الإجمالي: ${currencyDisplayScale(input.currency) === null
        ? `${formatDecimalForDisplay(input.totalAmount, 2)} ${input.currency}`
        : formatCurrencyAmount(input.totalAmount, input.currency)}` : null,
      input.orderNote ? "" : null,
      input.orderNote ? "ملاحظة الطلب:" : null,
      input.orderNote ?? null,
      "",
      `الوقت: ${new Date().toLocaleString("ar-SY")}`
    ];

    return lines.filter(Boolean).join("\n");
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
