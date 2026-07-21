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
                where: { isActive: true },
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
    const whatsappPhone = branch?.whatsappPhone ?? restaurant.whatsappPhone;

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
    const message = this.buildWhatsappMessage({
      restaurantName: restaurant.name,
      branchName: branch?.name,
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
        cartSnapshot: dto as unknown as Prisma.InputJsonValue,
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
        metadata: { orderId: order.id, totalAmount }
      }
    });

    return {
      orderId: order.id,
      message,
      whatsappUrl: `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`
    };
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
      ingredients: product.ingredients ?? [],
      nutrition: product.nutrition ?? null,
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

    const apiOrigin = this.config.get<string>("API_ORIGIN") ?? `http://localhost:${this.config.get<string>("PORT") ?? 5010}`;

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
}
