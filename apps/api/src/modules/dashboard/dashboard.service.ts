import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { defaultSectionSettings } from "@menu/shared";
import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { resolveTxt } from "dns/promises";
import { slugify } from "../../common/slugify";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDomainDto } from "./dto/create-domain.dto";
import { ListCategoriesQueryDto } from "./dto/list-categories-query.dto";
import { UpdateDashboardSettingsDto } from "./dto/update-dashboard-settings.dto";
import { UpdateThemeDto } from "./dto/update-theme.dto";
import { UpsertBranchDto } from "./dto/upsert-branch.dto";
import { UpsertDashboardBannerDto } from "./dto/upsert-dashboard-banner.dto";
import { UpsertCategoryDto } from "./dto/upsert-category.dto";

type DashboardBanner = {
  id: string;
  title?: string;
  subtitle?: string;
  imageUrl: string;
  targetUrl?: string;
  badge?: string;
  isActive: boolean;
  sortOrder: number;
};

@Injectable()
export class DashboardService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FeatureFlagsService) private readonly featureFlags: FeatureFlagsService
  ) {}

  async currentRestaurant(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      include: {
        branches: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
        subscription: {
          include: {
            plan: {
              include: { features: true }
            }
          }
        },
        themeSettings: true,
        _count: {
          select: {
            products: true,
            categories: true,
            orders: true
          }
        }
      }
    });

    return {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      type: restaurant.type,
      logoUrl: restaurant.logoUrl,
      heroImageUrl: restaurant.heroImageUrl,
      city: restaurant.city,
      country: restaurant.country,
      whatsappPhone: restaurant.whatsappPhone,
      isActive: restaurant.isActive,
      counts: restaurant._count,
      branches: restaurant.branches,
      subscription: restaurant.subscription
        ? {
            status: restaurant.subscription.status,
            plan: {
              key: restaurant.subscription.plan.key,
              name: restaurant.subscription.plan.name
            },
            features: restaurant.subscription.plan.features.map((feature) => ({
              key: feature.key,
              enabled: feature.enabled,
              limit: feature.limit
            }))
          }
        : null,
      theme: restaurant.themeSettings?.settings ?? null
    };
  }

  async overview(restaurantId: string) {
    const [
      products,
      categories,
      branches,
      orders,
      visits,
      todayVisits,
      whatsappClicks,
      features,
      newProducts,
      unavailableProducts,
      viewedEvents
    ] = await Promise.all([
      this.prisma.product.count({ where: { restaurantId, deletedAt: null } }),
      this.prisma.category.count({ where: { restaurantId, deletedAt: null } }),
      this.prisma.branch.count({ where: { restaurantId, deletedAt: null } }),
      this.prisma.order.count({ where: { restaurantId } }),
      this.prisma.analyticsEvent.count({ where: { restaurantId, type: "MENU_VIEWED" } }),
      this.prisma.analyticsEvent.count({
        where: { restaurantId, type: "MENU_VIEWED", createdAt: { gte: this.startOfToday() } }
      }),
      this.prisma.analyticsEvent.count({ where: { restaurantId, type: "WHATSAPP_ORDER_CLICKED" } }),
      this.featureFlags.listFeatures(restaurantId),
      this.prisma.product.findMany({
        where: { restaurantId, deletedAt: null, isNew: true },
        include: { category: true, images: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
        orderBy: { createdAt: "desc" },
        take: 8
      }),
      this.prisma.product.findMany({
        where: { restaurantId, deletedAt: null, isAvailable: false },
        include: { category: true, images: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        take: 8
      }),
      this.prisma.analyticsEvent.findMany({
        where: { restaurantId, type: "PRODUCT_VIEWED" },
        orderBy: { createdAt: "desc" },
        take: 500
      })
    ]);
    const topViewed = await this.topViewedProducts(restaurantId, viewedEvents);

    return {
      cards: {
        todayViews: todayVisits,
        menuViews: visits,
        productsCount: products,
        products,
        categories,
        branches,
        orders,
        visits,
        todayVisits,
        whatsappClicks
      },
      lists: {
        topViewedProducts: topViewed,
        topViewed,
        newProducts: newProducts.map((product) => this.serializeProductSummary(product)),
        unavailableProducts: unavailableProducts.map((product) => this.serializeProductSummary(product))
      },
      lockedHighlights: [
        "PRODUCT_VR_VIEWER",
        "CUSTOM_DOMAIN",
        "WHITE_LABEL",
        "ANALYTICS_ADVANCED"
      ].map((key) => ({
        key,
        locked: !features.some((feature) => feature.key === key && feature.enabled)
      }))
    };
  }

  branches(restaurantId: string) {
    return this.prisma.branch.findMany({
      where: { restaurantId, deletedAt: null },
      orderBy: { createdAt: "asc" }
    });
  }

  async createBranch(restaurantId: string, dto: UpsertBranchDto) {
    const limit = await this.featureFlags.getFeatureLimit(restaurantId, "MAX_BRANCHES");
    const branchCount = await this.prisma.branch.count({ where: { restaurantId, deletedAt: null } });

    if (limit !== null && branchCount >= limit) {
      throw new BadRequestException({
        statusCode: 400,
        error: "FEATURE_LIMIT_REACHED",
        message: "Branch limit reached for current subscription",
        featureKey: "MAX_BRANCHES",
        limit
      });
    }

    return this.prisma.branch.create({
      data: {
        restaurantId,
        slug: await this.uniqueBranchSlug(restaurantId, dto.slug ?? dto.name),
        name: dto.name,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        whatsappPhone: dto.whatsappPhone,
        latitude: dto.latitude,
        longitude: dto.longitude,
        isActive: dto.isActive ?? true
      }
    });
  }

  async updateBranch(restaurantId: string, id: string, dto: UpsertBranchDto) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, restaurantId, deletedAt: null }
    });

    if (!branch) {
      throw new BadRequestException("Branch not found");
    }

    const nextSlug = dto.slug && dto.slug !== branch.slug ? await this.uniqueBranchSlug(restaurantId, dto.slug) : branch.slug;

    return this.prisma.branch.update({
      where: { id },
      data: {
        slug: nextSlug,
        name: dto.name,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        whatsappPhone: dto.whatsappPhone,
        latitude: dto.latitude,
        longitude: dto.longitude,
        isActive: dto.isActive ?? branch.isActive
      }
    });
  }

  async deleteBranch(restaurantId: string, id: string) {
    const branchCount = await this.prisma.branch.count({ where: { restaurantId, deletedAt: null } });

    if (branchCount <= 1) {
      throw new BadRequestException("Restaurant must keep at least one branch");
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id, restaurantId, deletedAt: null }
    });

    if (!branch) {
      throw new BadRequestException("Branch not found");
    }

    return this.prisma.branch.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date()
      }
    });
  }

  async categories(restaurantId: string, query: ListCategoriesQueryDto = {}) {
    await this.ensureAllCategory(restaurantId);
    const page = this.clampPositiveInt(query.page, 1);
    const limit = Math.min(this.clampPositiveInt(query.limit, 20), 100);
    const where: Prisma.CategoryWhereInput = {
      restaurantId,
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const [total, categories] = await Promise.all([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        include: {
          _count: {
            select: { products: true }
          }
        },
        orderBy: this.categoryOrderBy(query.sort),
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    return {
      data: categories,
      meta: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    };
  }

  async createCategory(restaurantId: string, dto: UpsertCategoryDto) {
    const slug = slugify(dto.slug || dto.name);
    const sortOrder = dto.sortOrder === undefined ? await this.nextCategorySortOrder(restaurantId) : Math.max(1, dto.sortOrder);

    if (slug === "all") {
      await this.ensureAllCategory(restaurantId);
      throw new BadRequestException("قسم الكل موجود تلقائياً ولا يمكن إنشاء نسخة ثانية منه.");
    }

    return this.prisma.category.create({
      data: {
        restaurantId,
        name: dto.name,
        slug,
        description: dto.description,
        imageUrl: dto.imageUrl,
        imagePosition: dto.imagePosition ?? "end",
        imageWidth: dto.imageWidth,
        imageHeight: dto.imageHeight,
        color: dto.color,
        backgroundType: dto.backgroundType ?? "COLOR",
        backgroundValue: dto.backgroundValue,
        backgroundOverlay: dto.backgroundOverlay,
        backgroundCss: dto.backgroundCss,
        visualScrollEnabled: dto.visualScrollEnabled ?? false,
        sortOrder,
        isActive: dto.isActive ?? true
      },
      include: {
        _count: {
          select: { products: true }
        }
      }
    });
  }

  async category(restaurantId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, restaurantId, deletedAt: null },
      include: {
        _count: {
          select: { products: true }
        }
      }
    });

    if (!category) {
      throw new NotFoundException("Category not found");
    }

    return category;
  }

  async updateCategory(restaurantId: string, id: string, dto: UpsertCategoryDto) {
    const category = await this.prisma.category.findFirst({
      where: { id, restaurantId, deletedAt: null }
    });

    if (!category) {
      throw new BadRequestException("Category not found");
    }

    const isAllCategory = category.slug === "all";

    return this.prisma.category.update({
      where: { id },
      data: {
        name: isAllCategory ? "الكل" : dto.name,
        slug: isAllCategory ? "all" : dto.slug ? slugify(dto.slug) : category.slug,
        description: dto.description,
        imageUrl: dto.imageUrl,
        imagePosition: dto.imagePosition ?? category.imagePosition,
        imageWidth: dto.imageWidth ?? category.imageWidth,
        imageHeight: dto.imageHeight ?? category.imageHeight,
        color: dto.color,
        backgroundType: dto.backgroundType ?? category.backgroundType,
        backgroundValue: dto.backgroundValue,
        backgroundOverlay: dto.backgroundOverlay,
        backgroundCss: dto.backgroundCss,
        visualScrollEnabled: dto.visualScrollEnabled ?? category.visualScrollEnabled,
        sortOrder: isAllCategory ? 0 : dto.sortOrder ?? category.sortOrder,
        isActive: isAllCategory ? true : dto.isActive ?? category.isActive
      },
      include: {
        _count: {
          select: { products: true }
        }
      }
    });
  }

  async deleteCategory(restaurantId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, restaurantId, deletedAt: null },
      include: { _count: { select: { products: true } } }
    });

    if (!category) {
      throw new BadRequestException("Category not found");
    }

    if (category.slug === "all") {
      throw new BadRequestException("قسم الكل أساسي ولا يمكن حذفه.");
    }

    if (category._count.products > 0) {
      throw new BadRequestException("لا يمكن حذف قسم يحتوي منتجات. انقل المنتجات إلى قسم آخر أولاً.");
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date()
      }
    });
  }

  async reorderCategories(restaurantId: string, items: Array<{ id: string; sortOrder: number }>) {
    const categories = await this.prisma.category.findMany({
      where: { restaurantId, id: { in: items.map((item) => item.id) }, deletedAt: null },
      select: { id: true, slug: true }
    });
    const ownedIds = new Set(categories.map((category) => category.id));
    const protectedIds = new Set(categories.filter((category) => category.slug === "all").map((category) => category.id));

    if (ownedIds.size !== items.length) {
      throw new NotFoundException("One or more categories were not found");
    }

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.category.update({
          where: { id: item.id },
          data: { sortOrder: protectedIds.has(item.id) ? 0 : Math.max(1, item.sortOrder) }
        })
      )
    );

    await this.ensureAllCategory(restaurantId);

    return this.categories(restaurantId, { page: 1, limit: Math.max(items.length, 20), sort: "sortOrder" });
  }

  theme(restaurantId: string) {
    return this.prisma.restaurantThemeSettings.findUnique({
      where: { restaurantId },
      include: { theme: true }
    });
  }

  async domains(restaurantId: string) {
    await this.featureFlags.assertFeature(restaurantId, "CUSTOM_DOMAIN");

    return this.prisma.customDomain.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" }
    });
  }

  async createDomain(restaurantId: string, dto: CreateDomainDto) {
    await this.featureFlags.assertFeature(restaurantId, "CUSTOM_DOMAIN");
    const domain = dto.domain.trim().toLowerCase();
    const verificationToken = `menu-builder=${randomBytes(18).toString("hex")}`;

    return this.prisma.customDomain.create({
      data: {
        restaurantId,
        domain,
        status: "PENDING",
        verificationToken,
        dnsRecords: {
          txt: {
            host: domain,
            value: verificationToken
          },
          cname: {
            host: domain,
            value: process.env.PLATFORM_DOMAIN ?? "yourplatform.com"
          }
        }
      }
    });
  }

  async verifyDomain(restaurantId: string, id: string) {
    await this.featureFlags.assertFeature(restaurantId, "CUSTOM_DOMAIN");

    const domain = await this.prisma.customDomain.findFirst({
      where: { id, restaurantId }
    });

    if (!domain) {
      throw new BadRequestException("Domain not found");
    }

    const dnsVerified = await this.hasDomainVerificationTxt(domain.domain, domain.verificationToken);
    const allowDevBypass = process.env.DOMAIN_VERIFY_BYPASS === "true";

    if (!dnsVerified && !allowDevBypass) {
      return this.prisma.customDomain.update({
        where: { id },
        data: {
          status: "FAILED",
          lastCheckedAt: new Date(),
          failureReason: "DNS TXT verification record was not found"
        }
      });
    }

    return this.prisma.customDomain.update({
      where: { id },
      data: {
        status: "ACTIVE",
        verifiedAt: new Date(),
        dnsVerifiedAt: new Date(),
        sslStatus: "SSL_ACTIVE",
        sslIssuedAt: new Date(),
        activatedAt: new Date(),
        lastCheckedAt: new Date(),
        failureReason: null
      }
    });
  }

  async disableDomain(restaurantId: string, id: string) {
    await this.featureFlags.assertFeature(restaurantId, "CUSTOM_DOMAIN");

    const domain = await this.prisma.customDomain.findFirst({
      where: { id, restaurantId }
    });

    if (!domain) {
      throw new BadRequestException("Domain not found");
    }

    return this.prisma.customDomain.update({
      where: { id },
      data: { status: "DISABLED" }
    });
  }

  async updateTheme(restaurantId: string, dto: UpdateThemeDto) {
    await this.featureFlags.assertFeature(restaurantId, "CUSTOM_THEMES");

    return this.prisma.restaurantThemeSettings.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        settings: dto.settings as Prisma.InputJsonObject,
        customCss: dto.customCss
      },
      update: {
        settings: dto.settings as Prisma.InputJsonObject,
        customCss: dto.customCss
      },
      include: { theme: true }
    });
  }

  async analytics(restaurantId: string) {
    const [visits, productViews, addToCart, whatsappClicks, topProducts] = await Promise.all([
      this.prisma.analyticsEvent.count({ where: { restaurantId, type: "MENU_VIEWED" } }),
      this.prisma.analyticsEvent.count({ where: { restaurantId, type: "PRODUCT_VIEWED" } }),
      this.prisma.analyticsEvent.count({ where: { restaurantId, type: "ADD_TO_CART" } }),
      this.prisma.analyticsEvent.count({ where: { restaurantId, type: "WHATSAPP_ORDER_CLICKED" } }),
      this.prisma.orderItem.groupBy({
        by: ["productId", "name"],
        where: {
          order: { is: { restaurantId } }
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5
      })
    ]);

    return {
      visits,
      productViews,
      addToCart,
      whatsappClicks,
      conversionRate: visits > 0 ? Number(((whatsappClicks / visits) * 100).toFixed(1)) : 0,
      topProducts: topProducts.map((item) => ({
        productId: item.productId,
        name: item.name,
        quantity: item._sum.quantity ?? 0
      }))
    };
  }

  async banners(restaurantId: string) {
    const section = await this.ensureHeroSection(restaurantId);
    return this.extractBanners(section.settings);
  }

  async createBanner(restaurantId: string, dto: UpsertDashboardBannerDto) {
    const section = await this.ensureHeroSection(restaurantId);
    const current = this.extractBanners(section.settings);
    const banner: DashboardBanner = {
      id: randomBytes(8).toString("hex"),
      title: dto.title,
      subtitle: dto.subtitle,
      imageUrl: dto.imageUrl,
      targetUrl: dto.targetUrl,
      badge: dto.badge,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? current.length
    };

    return this.saveHeroBanners(section.id, [...current, banner]);
  }

  async updateBanner(restaurantId: string, id: string, dto: UpsertDashboardBannerDto) {
    const section = await this.ensureHeroSection(restaurantId);
    const current = this.extractBanners(section.settings);

    if (!current.some((banner) => banner.id === id)) {
      throw new NotFoundException("Banner not found");
    }

    const next = current.map((banner) =>
      banner.id === id
        ? {
            ...banner,
            title: dto.title,
            subtitle: dto.subtitle,
            imageUrl: dto.imageUrl,
            targetUrl: dto.targetUrl,
            badge: dto.badge,
            isActive: dto.isActive ?? banner.isActive,
            sortOrder: dto.sortOrder ?? banner.sortOrder
          }
        : banner
    );

    return this.saveHeroBanners(section.id, next);
  }

  async deleteBanner(restaurantId: string, id: string) {
    const section = await this.ensureHeroSection(restaurantId);
    const current = this.extractBanners(section.settings);

    if (!current.some((banner) => banner.id === id)) {
      throw new NotFoundException("Banner not found");
    }

    return this.saveHeroBanners(
      section.id,
      current.filter((banner) => banner.id !== id)
    );
  }

  async settings(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      include: {
        branches: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          include: { openingHours: { orderBy: { day: "asc" } } },
          take: 1
        },
        themeSettings: true
      }
    });
    const branch = restaurant.branches[0] ?? null;
    const dashboardSettings = this.dashboardSettingsFromTheme(restaurant.themeSettings?.settings);

    return {
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        type: restaurant.type,
        description: restaurant.description,
        city: restaurant.city,
        country: restaurant.country,
        address: branch?.address ?? "",
        whatsappPhone: restaurant.whatsappPhone,
        phone: dashboardSettings.phone ?? "",
        email: dashboardSettings.email ?? "",
        logoUrl: restaurant.logoUrl,
        currency: restaurant.currency,
        showPrices: dashboardSettings.showPrices ?? true
      },
      branch: branch
        ? {
            id: branch.id,
            name: branch.name,
            openingHours: this.normalizeOpeningHours(branch.openingHours)
          }
        : null
    };
  }

  async updateSettings(restaurantId: string, dto: UpdateDashboardSettingsDto) {
    const current = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      include: {
        branches: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, take: 1 },
        themeSettings: true
      }
    });
    const branch = current.branches[0] ?? null;

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.country !== undefined ? { country: dto.country } : {}),
        ...(dto.whatsappPhone !== undefined ? { whatsappPhone: dto.whatsappPhone } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {})
      }
    });

    if (branch && dto.address !== undefined) {
      await this.prisma.branch.update({
        where: { id: branch.id },
        data: { address: dto.address }
      });
    }

    if (branch && dto.openingHours) {
      await this.prisma.$transaction([
        this.prisma.branchOpeningHour.deleteMany({ where: { branchId: branch.id } }),
        ...dto.openingHours.map((hour) =>
          this.prisma.branchOpeningHour.create({
            data: {
              branchId: branch.id,
              day: hour.day,
              opensAt: hour.opensAt,
              closesAt: hour.closesAt,
              isClosed: hour.isClosed ?? false
            }
          })
        )
      ]);
    }

    const existingSettings = this.asJsonObject(current.themeSettings?.settings);
    await this.prisma.restaurantThemeSettings.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        settings: {
          ...existingSettings,
          dashboardSettings: {
            phone: dto.phone ?? "",
            email: dto.email ?? "",
            showPrices: dto.showPrices ?? true
          }
        }
      },
      update: {
        settings: {
          ...existingSettings,
          dashboardSettings: {
            ...this.dashboardSettingsFromTheme(existingSettings),
            ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
            ...(dto.email !== undefined ? { email: dto.email } : {}),
            ...(dto.showPrices !== undefined ? { showPrices: dto.showPrices } : {})
          }
        }
      }
    });

    return this.settings(restaurantId);
  }

  private async uniqueBranchSlug(restaurantId: string, input: string) {
    const base = slugify(input) || "branch";
    let candidate = base;
    let counter = 2;

    while (
      await this.prisma.branch.findFirst({
        where: { restaurantId, slug: candidate, deletedAt: null }
      })
    ) {
      candidate = `${base}-${counter}`;
      counter += 1;
    }

    return candidate;
  }

  private async hasDomainVerificationTxt(domain: string, token: string) {
    try {
      const records = await resolveTxt(domain);
      return records.flat().some((record) => record.includes(token));
    } catch {
      return false;
    }
  }

  private startOfToday() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private async topViewedProducts(restaurantId: string, events: Array<{ metadata: Prisma.JsonValue }>) {
    const counts = new Map<string, number>();

    for (const event of events) {
      const metadata = this.asJsonObject(event.metadata);
      const key =
        typeof metadata.productId === "string"
          ? `id:${metadata.productId}`
          : typeof metadata.productSlug === "string"
            ? `slug:${metadata.productSlug}`
            : null;
      if (key) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    const keys = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id]) => id);

    if (!keys.length) {
      const fallback = await this.prisma.product.findMany({
        where: { restaurantId, deletedAt: null },
        include: { category: true, images: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
        orderBy: [{ isPopular: "desc" }, { createdAt: "desc" }],
        take: 8
      });

      return fallback.map((product) => this.serializeProductSummary(product, 0));
    }

    const products = await this.prisma.product.findMany({
      where: {
        restaurantId,
        deletedAt: null,
        OR: [
          { id: { in: keys.filter((key) => key.startsWith("id:")).map((key) => key.slice(3)) } },
          { slug: { in: keys.filter((key) => key.startsWith("slug:")).map((key) => key.slice(5)) } }
        ]
      },
      include: { category: true, images: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } }
    });
    const byKey = new Map<string, any>();
    products.forEach((product) => {
      byKey.set(`id:${product.id}`, product);
      byKey.set(`slug:${product.slug}`, product);
    });

    return keys
      .map((key) => {
        const product = byKey.get(key);
        return product ? this.serializeProductSummary(product, counts.get(key) ?? 0) : null;
      })
      .filter((product): product is NonNullable<typeof product> => Boolean(product));
  }

  private serializeProductSummary(product: any, views = 0) {
    return {
      id: product.id,
      name: product.name,
      categoryName: product.category?.name ?? "",
      imageUrl: product.images?.[0]?.url ?? null,
      views,
      isAvailable: product.isAvailable,
      isNew: product.isNew
    };
  }

  private async ensureHeroSection(restaurantId: string) {
    const menu = await this.prisma.menu.upsert({
      where: { restaurantId_slug: { restaurantId, slug: "main-menu" } },
      create: {
        restaurantId,
        name: "القائمة الرئيسية",
        slug: "main-menu",
        status: "PUBLISHED"
      },
      update: {},
      include: {
        pages: {
          where: { isHome: true },
          include: { sections: { where: { type: "HERO" }, orderBy: { sortOrder: "asc" } } },
          take: 1
        }
      }
    });
    let page = menu.pages[0];

    if (!page) {
      page = await this.prisma.menuPage.create({
        data: {
          menuId: menu.id,
          title: "الرئيسية",
          slug: "home",
          isHome: true,
          sortOrder: 0,
          status: "PUBLISHED"
        },
        include: { sections: { where: { type: "HERO" }, orderBy: { sortOrder: "asc" } } }
      });
    }

    return (
      page.sections[0] ??
      (await this.prisma.menuSection.create({
        data: {
          pageId: page.id,
          type: "HERO",
          sortOrder: 0,
          settings: defaultSectionSettings("HERO") as Prisma.InputJsonValue,
          isActive: true
        }
      }))
    );
  }

  private extractBanners(settings: Prisma.JsonValue): DashboardBanner[] {
    const json = this.asJsonObject(settings);
    const banners = Array.isArray(json.adBanners) ? json.adBanners : [];

    const normalized: Array<DashboardBanner | null> = banners.map((item, index) => {
        const banner = this.asJsonObject(item);
        const imageUrl = typeof banner.imageUrl === "string" ? banner.imageUrl : "";

        if (!imageUrl) {
          return null;
        }

        return {
          id: typeof banner.id === "string" ? banner.id : randomBytes(8).toString("hex"),
          title: typeof banner.title === "string" ? banner.title : "",
          subtitle: typeof banner.subtitle === "string" ? banner.subtitle : "",
          imageUrl,
          targetUrl: typeof banner.targetUrl === "string" ? banner.targetUrl : "",
          badge: typeof banner.badge === "string" ? banner.badge : "",
          isActive: typeof banner.isActive === "boolean" ? banner.isActive : true,
          sortOrder: typeof banner.sortOrder === "number" ? banner.sortOrder : index
        };
      });

    return normalized
      .filter((banner): banner is DashboardBanner => Boolean(banner))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private async saveHeroBanners(sectionId: string, banners: DashboardBanner[]) {
    const section = await this.prisma.menuSection.findUniqueOrThrow({
      where: { id: sectionId },
      include: { page: true }
    });
    const settings = this.asJsonObject(section.settings);
    const normalized = banners
      .map((banner, index) => ({ ...banner, sortOrder: banner.sortOrder ?? index }))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    await this.prisma.$transaction([
      this.prisma.menu.update({ where: { id: section.page.menuId }, data: { status: "PUBLISHED" } }),
      this.prisma.menuPage.update({ where: { id: section.pageId }, data: { status: "PUBLISHED" } }),
      this.prisma.menuSection.update({
        where: { id: sectionId },
        data: {
          isActive: true,
          settings: {
            ...settings,
            adBanners: normalized
          } as Prisma.InputJsonObject
        }
      })
    ]);

    return normalized;
  }

  private normalizeOpeningHours(hours: Array<{ day: number; opensAt: string; closesAt: string; isClosed: boolean }>) {
    const byDay = new Map(hours.map((hour) => [hour.day, hour]));

    return Array.from({ length: 7 }, (_, day) => {
      const existing = byDay.get(day);
      return {
        day,
        opensAt: existing?.opensAt ?? "08:00",
        closesAt: existing?.closesAt ?? "00:00",
        isClosed: existing?.isClosed ?? false
      };
    });
  }

  private dashboardSettingsFromTheme(settings: Prisma.JsonValue | undefined | null) {
    const json = this.asJsonObject(settings);
    return this.asJsonObject(json.dashboardSettings);
  }

  private asJsonObject(value: Prisma.JsonValue | undefined | null): Record<string, any> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
  }

  private categoryOrderBy(sort?: ListCategoriesQueryDto["sort"]): Prisma.CategoryOrderByWithRelationInput[] {
    if (sort === "newest") return [{ id: "desc" }];
    if (sort === "name") return [{ name: "asc" }];
    return [{ sortOrder: "asc" }];
  }

  private clampPositiveInt(value: unknown, fallback: number) {
    const parsed = Number(value ?? fallback);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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
      return existing;
    }

    return this.prisma.category.create({
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
        visualScrollEnabled: false,
        sortOrder: 0,
        isActive: true
      }
    });
  }

  private async nextCategorySortOrder(restaurantId: string) {
    const aggregate = await this.prisma.category.aggregate({
      where: { restaurantId, slug: { not: "all" }, deletedAt: null },
      _max: { sortOrder: true }
    });

    return Math.max(1, (aggregate._max.sortOrder ?? 0) + 1);
  }
}
