import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateWhatsappOrderDto } from "./dto/create-whatsapp-order.dto";

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

    const [features, menus] = await Promise.all([
      this.featureFlags.listFeatures(restaurant.id),
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
      products: restaurant.products.map((product) => this.serializeProduct(product, features, restaurant.currency)),
      theme: restaurant.themeSettings?.settings ?? null,
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
    const features = await this.featureFlags.listFeatures(restaurant.id);
    return restaurant.products.map((product) => this.serializeProduct(product, features, restaurant.currency));
  }

  async theme(restaurantSlug: string) {
    const restaurant = await this.findPublicRestaurant(restaurantSlug);
    return restaurant.themeSettings?.settings ?? null;
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
        isActive: true,
        isAvailable: true,
        deletedAt: null
      }
    });

    if (products.length !== productSlugs.length) {
      throw new BadRequestException("One or more products are unavailable");
    }

    const items = dto.items.map((item) => {
      const product = products.find((candidate) => candidate.slug === item.productSlug)!;
      const unitPrice = Number(product.basePrice);
      const totalPrice = unitPrice * item.quantity;

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

    const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);
    const dashboardSettings = this.dashboardSettingsFromTheme(restaurant.themeSettings?.settings);
    const showPrices = dashboardSettings.showPrices ?? true;
    const orderNumber = this.formatDailyOrderNumber(await this.nextDailyOrderSequence(restaurant.id));
    const message = this.buildWhatsappMessage({
      restaurantName: restaurant.name,
      branchName: branch?.name,
      orderNumber,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      orderNote: dto.orderNote,
      currency: restaurant.currency,
      items,
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
        cartSnapshot: { ...dto, orderNumber } as unknown as Prisma.InputJsonValue,
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
          where: { isActive: true, isAvailable: true, deletedAt: null },
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
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
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
      showPrices: dashboardSettings.showPrices ?? true,
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
      basePrice: Number(product.basePrice),
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
    const existing = await this.prisma.category.findFirst({
      where: { restaurantId, slug: "all", deletedAt: null },
      select: { id: true, isActive: true, sortOrder: true, name: true }
    });

    if (existing) {
      if (!existing.isActive || existing.sortOrder !== 0 || existing.name !== "الكل") {
        await this.prisma.category.update({
          where: { id: existing.id },
          data: { name: "الكل", isActive: true, sortOrder: 0 }
        });
      }
      return;
    }

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
    currency: string;
    items: Array<{
      name: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      options: string[];
      note?: string;
    }>;
    totalAmount: number;
    showPrices: boolean;
  }) {
    const lines = [
      `طلب جديد من ${input.restaurantName}`,
      `رقم الطلب: ${input.orderNumber}`,
      "",
      input.branchName ? `الفرع: ${input.branchName}` : null,
      input.customerName ? `الزبون: ${input.customerName}` : null,
      input.customerPhone ? `الهاتف: ${input.customerPhone}` : null,
      "",
      "العناصر:",
      ...input.items.flatMap((item, index) => [
        `${index + 1}. ${item.quantity}x ${item.name}`,
        item.options.length ? `الإضافات: ${item.options.join(", ")}` : null,
        item.note ? `ملاحظة: ${item.note}` : null,
        input.showPrices ? `السعر: ${item.totalPrice.toFixed(2)} ${input.currency}` : null,
        ""
      ]),
      input.showPrices ? `الإجمالي: ${input.totalAmount.toFixed(2)} ${input.currency}` : null,
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
