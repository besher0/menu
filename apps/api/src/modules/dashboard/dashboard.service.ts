import { marketTimeZone } from "../../common/market-time-zone";
import { productReviewWhere } from "../products/product-review-filter";
import { isReservedCategoryName } from "../../common/system-category";
import { feedbackMode, restaurantMapsUrl, googleMapsShareUrl } from "@menu/shared";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { bannerSection, defaultSectionSettings } from "@menu/shared";
import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { resolveTxt } from "dns/promises";
import { slugify } from "../../common/slugify";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { parseDeliveryFeeInput, readDeliveryFee } from "../public-menu/delivery-fee";
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

export { marketTimeZone } from "../../common/market-time-zone";

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
      currency: restaurant.currency,
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

  async overview(restaurantId: string, period = "1", showFeedback = false, rankingOnly = false) {
    if (!["1", "7", "30"].includes(period)) throw new BadRequestException("Invalid period");
    const { country, currency } = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId }, select: { country: true, currency: true }
    });
    const zone = marketTimeZone(country, currency);
    const updatedAt = new Date();
    const [window] = await this.prisma.$queryRaw<Array<{ start: Date }>>`
      SELECT (((timezone(${zone}, ${updatedAt}::timestamptz)::date - ${Number(period) - 1}::int)
        ::timestamp AT TIME ZONE ${zone}) AT TIME ZONE 'UTC') AS start`;
    const createdAt = { gte: window.start, lte: updatedAt };
    const ranking = await this.prisma.$queryRaw<Array<{ id: string; name: string; views: number; imageUrl: string | null }>>`
      WITH counts AS (
        SELECT p.id, COUNT(*)::int AS views FROM "AnalyticsEvent" e
        JOIN "Product" p ON p."restaurantId" = e."restaurantId" AND p."deletedAt" IS NULL AND
          (p.id = e.metadata->>'productId' OR
          (e.metadata->>'productId' IS NULL AND p.slug = e.metadata->>'productSlug'))
        WHERE e."restaurantId" = ${restaurantId} AND e.type = 'PRODUCT_VIEWED'
          AND e."createdAt" BETWEEN ${window.start} AND ${updatedAt}
        GROUP BY p.id ORDER BY views DESC, p.id LIMIT ${rankingOnly ? Prisma.sql`ALL` : Prisma.sql`5`}
      )
      SELECT p.id, p.name, counts.views, (SELECT i.url FROM "ProductImage" i
        WHERE i."productId" = p.id AND i."isActive" ORDER BY i."sortOrder", i.id LIMIT 1) AS "imageUrl"
      FROM counts JOIN "Product" p USING (id) ORDER BY counts.views DESC, p.id`;
    const summary = { zone, updatedAt, start: window.start, lists: { topViewedProducts: ranking } };
    if (rankingOnly) return summary;
    const review = async (condition: Prisma.ProductWhereInput) => {
      const where = { restaurantId, deletedAt: null, ...condition };
      const [count, items] = await Promise.all([
        this.prisma.product.count({ where }),
        this.prisma.product.findMany({ where, select: { id: true, name: true }, orderBy: { id: "asc" }, take: 3 })
      ]);
      return { count, items };
    };
    const [visits, views, unavailable, missingImage, feedback] = await Promise.all([
      this.prisma.analyticsEvent.count({ where: { restaurantId, createdAt, type: "MENU_VIEWED" } }),
      this.prisma.analyticsEvent.count({ where: { restaurantId, createdAt, type: "PRODUCT_VIEWED" } }),
      review(productReviewWhere("unavailable")), review(productReviewWhere("missingImage")),
      showFeedback ? this.prisma.restaurantFeedback.findMany({
        where: { restaurantId }, take: 3, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, stars: true, comment: true, createdAt: true }
      }) : null
    ]);
    return { ...summary, visits, views, unavailable, missingImage,
      feedback: feedback?.map(row => ({ ...row, comment: row.comment?.slice(0, 140) })) ?? null };
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
    return this.prisma.$transaction(async (tx) => {
      // Serialize branch removals per tenant before counting its live branches.
      await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${restaurantId} FOR UPDATE`;
      const branchCount = await tx.branch.count({ where: { restaurantId, deletedAt: null } });

      if (branchCount <= 1) {
        throw new BadRequestException("Restaurant must keep at least one branch");
      }

      const branch = await tx.branch.findFirst({
        where: { id, restaurantId, deletedAt: null }
      });

      if (!branch) {
        throw new BadRequestException("Branch not found");
      }

      return tx.branch.update({
        where: { id },
        data: {
          isActive: false,
          deletedAt: new Date()
        }
      });
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

    if (slug === "all" || isReservedCategoryName(dto.name) || isReservedCategoryName(dto.slug)) {
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
    if (!isAllCategory && (isReservedCategoryName(dto.name) || isReservedCategoryName(dto.slug) || (dto.slug && slugify(dto.slug) === "all"))) {
      throw new BadRequestException("اسم قسم الكل محجوز.");
    }

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
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const category = await transaction.category.findFirst({
          where: { id, restaurantId, deletedAt: null },
          include: {
            products: { select: { id: true } },
            _count: { select: { products: true } }
          }
        });

        if (!category) {
          throw new BadRequestException("Category not found");
        }

        if (category.slug === "all") {
          throw new BadRequestException("قسم الكل أساسي ولا يمكن حذفه.");
        }

        const categoryProductIds = category.products.map((product) => product.id);
        if (categoryProductIds.length) {
          const linkedDependents = await transaction.productConfigurationDependency.findMany({
            where: {
              restaurantId,
              sourceProductId: { in: categoryProductIds }
            },
            select: {
              sourceProductId: true,
              productId: true,
              owner: { select: { name: true } }
            }
          });
          if (linkedDependents.length) {
            throw new ConflictException({
              statusCode: 409,
              error: "CATEGORY_PRODUCT_CONFIGURATION_DEPENDENCY_EXISTS",
              message: "The category contains products used by other product configurations.",
              dependents: linkedDependents
            });
          }
        }

        if (category._count.products > 0) {
          throw new BadRequestException("لا يمكن حذف قسم يحتوي منتجات. انقل المنتجات إلى قسم آخر أولاً.");
        }

        return transaction.category.update({
          where: { id },
          data: {
            isActive: false,
            deletedAt: new Date()
          }
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new ConflictException({
          statusCode: 409,
          error: "CATEGORY_DELETE_CONFLICT",
          message: "Category products changed concurrently; reload and retry deletion."
        });
      }
      throw error;
    }
  }

  async reorderCategories(restaurantId: string, items: Array<{ id: string; sortOrder: number }>) {
    await this.prisma.$transaction(async tx => {
      const catalog = await tx.category.findMany({
        where: { restaurantId, deletedAt: null }, select: { id: true, slug: true }
      });
      const ranks = new Map(items.map(item => [item.id, item.sortOrder]));
      const selected = catalog.filter(row => ranks.has(row.id));
      if (!items.length || selected.length !== items.length) throw new BadRequestException("Invalid reorder scope");
      if (new Set(ranks.values()).size !== items.length) throw new BadRequestException("Duplicate ranks");
      if (catalog.length !== items.length || catalog.some(row => row.slug === "all" ? ranks.get(row.id) !== 0 : ranks.get(row.id) === 0)) {
        throw new BadRequestException("Submit the complete category order with All first");
      }
      for (const item of items) {
        await tx.category.update({ where: { id: item.id, restaurantId }, data: { sortOrder: item.sortOrder } });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

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
    const allowDevBypass = process.env.NODE_ENV === "development" && process.env.DOMAIN_VERIFY_BYPASS === "true";

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
    const existing = await this.prisma.restaurantThemeSettings.findUnique({
      where: { restaurantId }
    });
    const existingSettings = this.asJsonObject(existing?.settings);
    const themeSettings = this.themeOwnedSettings(dto.settings);
    const nextSettings = {
      ...existingSettings,
      ...themeSettings
    };

    return this.prisma.restaurantThemeSettings.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        settings: nextSettings as Prisma.InputJsonObject,
        customCss: dto.customCss
      },
      update: {
        settings: nextSettings as Prisma.InputJsonObject,
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
    const section = await this.findBannerSection(restaurantId);
    return section ? this.extractBanners(section.settings) : [];
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
    const section = await this.findBannerSection(restaurantId);
    if (!section) throw new NotFoundException("Banner not found");
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
    const section = await this.findBannerSection(restaurantId);
    if (!section) throw new NotFoundException("Banner not found");
    const current = this.extractBanners(section.settings);

    if (!current.some((banner) => banner.id === id)) {
      throw new NotFoundException("Banner not found");
    }

    return this.saveHeroBanners(
      section.id,
      current.filter((banner) => banner.id !== id)
    );
  }

  async settings(restaurantId: string, includeAdminControls = false) {
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
        ...(includeAdminControls ? { slug: restaurant.slug } : {}),
        type: restaurant.type,
        description: restaurant.description,
        city: restaurant.city,
        country: restaurant.country,
        address: branch?.address ?? "",
        latitude: branch?.latitude ?? null,
        longitude: branch?.longitude ?? null,
        feedbackMode: feedbackMode(dashboardSettings.feedbackMode),
        googleMapsUrl: googleMapsShareUrl(dashboardSettings.googleMapsUrl) ?? "",
        whatsappPhone: restaurant.whatsappPhone,
        phone: dashboardSettings.phone ?? "",
        email: dashboardSettings.email ?? "",
        instagramUrl: dashboardSettings.instagramUrl ?? "",
        facebookUrl: dashboardSettings.facebookUrl ?? "",
        tiktokUrl: dashboardSettings.tiktokUrl ?? "",
        whatsappUrl: dashboardSettings.whatsappUrl ?? "",
        logoUrl: restaurant.logoUrl,
        currency: restaurant.currency,
        showPrices: dashboardSettings.showPrices ?? true,
        deliveryFee: readDeliveryFee(dashboardSettings, restaurant.currency),
        productOpenMode: this.normalizeProductOpenMode(dashboardSettings.productOpenMode),
        splashScreen: this.normalizeSplashScreenSettings(
          dashboardSettings.splashScreen,
          this.defaultSplashScreenSettings(restaurant.heroImageUrl, restaurant.themeSettings?.settings)
        )
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

  async updateSettings(restaurantId: string, dto: UpdateDashboardSettingsDto, allowAdminSettings = false) {
    const current = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      include: {
        branches: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, take: 1 },
        themeSettings: true
      }
    });
    const branch = current.branches[0] ?? null;
    if (dto.googleMapsUrl?.trim() && !googleMapsShareUrl(dto.googleMapsUrl)) throw new BadRequestException("Invalid Google Maps URL");
    const changesLocation = dto.latitude !== undefined || dto.longitude !== undefined;
    const latitude = dto.latitude !== undefined ? dto.latitude : branch?.latitude;
    const longitude = dto.longitude !== undefined ? dto.longitude : branch?.longitude;
    if (changesLocation && (latitude != null || longitude != null) && (!branch || !restaurantMapsUrl(latitude, longitude))) {
      throw new BadRequestException("Provide a valid latitude and longitude together");
    }
    const existingSettings = this.asJsonObject(current.themeSettings?.settings);
    const existingDashboardSettings = this.dashboardSettingsFromTheme(existingSettings);
    const deliveryFee = dto.deliveryFee === undefined
      ? readDeliveryFee(existingDashboardSettings, dto.currency ?? current.currency)
      : parseDeliveryFeeInput(dto.deliveryFee, dto.currency ?? current.currency);

    const nextRestaurantSlug = allowAdminSettings && dto.slug !== undefined
      ? await this.uniqueRestaurantSlug(restaurantId, dto.slug)
      : undefined;

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(nextRestaurantSlug !== undefined ? { slug: nextRestaurantSlug } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.country !== undefined ? { country: dto.country } : {}),
        ...(dto.whatsappPhone !== undefined ? { whatsappPhone: dto.whatsappPhone } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {})
      }
    });

    if (branch && (dto.address !== undefined || changesLocation)) {
      await this.prisma.branch.update({
        where: { id: branch.id },
        data: { ...(dto.address !== undefined ? {address: dto.address} : {}), ...(changesLocation ? {latitude,longitude} : {}) }
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

    const nextDashboardSettings = {
      ...existingDashboardSettings,
      feedbackMode: feedbackMode(dto.feedbackMode ?? existingDashboardSettings.feedbackMode),
      googleMapsUrl: dto.googleMapsUrl !== undefined ? googleMapsShareUrl(dto.googleMapsUrl) ?? "" : existingDashboardSettings.googleMapsUrl ?? "",
      ...(dto.phone !== undefined ? { phone: dto.phone } : { phone: existingDashboardSettings.phone ?? "" }),
      ...(dto.email !== undefined ? { email: dto.email } : { email: existingDashboardSettings.email ?? "" }),
      ...(dto.instagramUrl !== undefined ? { instagramUrl: dto.instagramUrl } : { instagramUrl: existingDashboardSettings.instagramUrl ?? "" }),
      ...(dto.facebookUrl !== undefined ? { facebookUrl: dto.facebookUrl } : { facebookUrl: existingDashboardSettings.facebookUrl ?? "" }),
      ...(dto.tiktokUrl !== undefined ? { tiktokUrl: dto.tiktokUrl } : { tiktokUrl: existingDashboardSettings.tiktokUrl ?? "" }),
      ...(dto.whatsappUrl !== undefined ? { whatsappUrl: dto.whatsappUrl } : { whatsappUrl: existingDashboardSettings.whatsappUrl ?? "" }),
      ...(dto.showPrices !== undefined ? { showPrices: dto.showPrices } : { showPrices: existingDashboardSettings.showPrices ?? true }),
      deliveryFee,
      ...(dto.productOpenMode !== undefined
        ? { productOpenMode: this.normalizeProductOpenMode(dto.productOpenMode) }
        : { productOpenMode: this.normalizeProductOpenMode(existingDashboardSettings.productOpenMode) }),
      ...(allowAdminSettings && dto.splashScreen !== undefined
        ? {
            splashScreen: this.normalizeSplashScreenSettings(dto.splashScreen, existingDashboardSettings.splashScreen)
          }
        : existingDashboardSettings.splashScreen !== undefined
          ? { splashScreen: this.normalizeSplashScreenSettings(existingDashboardSettings.splashScreen) }
          : {})
    };

    await this.prisma.restaurantThemeSettings.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        settings: {
          ...existingSettings,
          dashboardSettings: nextDashboardSettings
        }
      },
      update: {
        settings: {
          ...existingSettings,
          dashboardSettings: nextDashboardSettings
        }
      }
    });

    return this.settings(restaurantId, allowAdminSettings);
  }

  private async uniqueRestaurantSlug(restaurantId: string, input: string) {
    const slug = slugify(input);
    if (!slug) {
      throw new BadRequestException("Restaurant slug is required");
    }

    const existing = await this.prisma.restaurant.findUnique({
      where: { slug },
      select: { id: true }
    });

    if (existing && existing.id !== restaurantId) {
      throw new ConflictException("Restaurant slug is already used. Choose another public link.");
    }

    return slug;
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
      return Boolean(token) && records.some((chunks) => chunks.join("") === token);
    } catch {
      return false;
    }
  }

  private async findBannerSection(restaurantId: string) {
    const menus = await this.prisma.menu.findMany({
      where: { restaurantId, status: "PUBLISHED" },
      orderBy: { createdAt: "asc" },
      select: {
        slug: true,
        pages: {
          where: { isHome: true, status: "PUBLISHED" },
          orderBy: { sortOrder: "asc" },
          select: {
            isHome: true,
            sections: { where: { type: "HERO" }, orderBy: { sortOrder: "asc" } }
          }
        }
      }
    });
    // Preserve editing of an unpublished main menu when there is no published source.
    return bannerSection(menus) ?? this.prisma.menuSection.findFirst({
      where: { type: "HERO", page: { isHome: true, menu: { restaurantId, slug: "main-menu" } } },
      orderBy: [{ page: { sortOrder: "asc" } }, { sortOrder: "asc" }]
    });
  }

  private async ensureHeroSection(restaurantId: string) {
    const existing = await this.findBannerSection(restaurantId);
    if (existing) return existing;

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
          settings: { ...defaultSectionSettings("HERO"), adBanners: [] } as Prisma.InputJsonValue,
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

  private normalizeProductOpenMode(value: unknown): "MODAL" | "PAGE" {
    return value === "PAGE" ? "PAGE" : "MODAL";
  }

  private normalizeSplashScreenSettings(value: unknown, fallback?: unknown) {
    const base = this.asJsonObject(fallback as Prisma.JsonValue);
    const next = this.asJsonObject(value as Prisma.JsonValue);
    const backgroundType =
      next.backgroundType === "IMAGE" || next.backgroundType === "COLOR"
        ? next.backgroundType
        : base.backgroundType === "IMAGE"
          ? "IMAGE"
          : "COLOR";

    return {
      logoUrl: typeof next.logoUrl === "string" ? next.logoUrl : typeof base.logoUrl === "string" ? base.logoUrl : "",
      backgroundType,
      backgroundColor:
        typeof next.backgroundColor === "string"
          ? next.backgroundColor
          : typeof base.backgroundColor === "string"
            ? base.backgroundColor
            : "#e51f2a",
      backgroundImageUrl:
        typeof next.backgroundImageUrl === "string"
          ? next.backgroundImageUrl
          : typeof base.backgroundImageUrl === "string"
            ? base.backgroundImageUrl
            : "",
      logoX: this.clampPercent(next.logoX ?? base.logoX, 50),
      logoY: this.clampPercent(next.logoY ?? base.logoY, 50)
    };
  }

  private defaultSplashScreenSettings(heroImageUrl?: string | null, themeSettings?: Prisma.JsonValue | null) {
    const theme = this.asJsonObject(themeSettings);
    const colors = this.asJsonObject(theme.colors);
    return {
      backgroundType: heroImageUrl ? "IMAGE" : "COLOR",
      backgroundColor: typeof colors.primary === "string" ? colors.primary : "#e51f2a",
      backgroundImageUrl: heroImageUrl ?? "",
      logoX: 50,
      logoY: 50
    };
  }

  private asJsonObject(value: Prisma.JsonValue | undefined | null): Record<string, any> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
  }

  private themeOwnedSettings(value: Record<string, unknown>) {
    const source = this.asJsonObject(value as Prisma.JsonValue);
    const next: Record<string, unknown> = {};
    for (const key of ["colors", "typography", "radius", "layout", "publicUi"] as const) {
      if (source[key] !== undefined) {
        next[key] = source[key];
      }
    }
    return next;
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

  private clampPercent(value: unknown, fallback: number) {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(100, Math.max(0, parsed));
  }

  private async ensureAllCategory(restaurantId: string) {
    const where = { restaurantId_slug: { restaurantId, slug: "all" } };
    // The unique key also covers soft-deleted rows. Reuse the existing row
    // rather than inserting a conflicting second "all" category.
    const normalize = async (category: {
      id: string; name: string; sortOrder: number; isActive: boolean; deletedAt: Date | null;
    }) => {
      if (category.deletedAt !== null || !category.isActive
        || category.sortOrder !== 0 || category.name !== "الكل") {
        return this.prisma.category.update({
          where: { id: category.id },
          data: { deletedAt: null, name: "الكل", isActive: true, sortOrder: 0 }
        });
      }
      return category;
    };

    const existing = await this.prisma.category.findUnique({
      where,
      select: { id: true, name: true, sortOrder: true, isActive: true, deletedAt: true }
    });
    if (existing) return normalize(existing);

    try {
      return await this.prisma.category.create({
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
    } catch (error) {
      // Concurrent dashboard requests may both observe a missing row. Only
      // recover the exact (restaurantId, slug) unique race, not unrelated
      // SQL errors such as another primary-key conflict.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)
        || error.code !== "P2002") throw error;
      const target = error.meta?.target;
      const slugRace = Array.isArray(target)
        ? target.length === 2 && target.includes("restaurantId") && target.includes("slug")
        : target === "Category_restaurantId_slug_key";
      if (!slugRace) throw error;
      const created = await this.prisma.category.findUnique({
        where,
        select: { id: true, name: true, sortOrder: true, isActive: true, deletedAt: true }
      });
      if (!created) throw error;
      return normalize(created);
    }
  }

  private async nextCategorySortOrder(restaurantId: string) {
    const aggregate = await this.prisma.category.aggregate({
      where: { restaurantId, slug: { not: "all" }, deletedAt: null },
      _max: { sortOrder: true }
    });

    return Math.max(1, (aggregate._max.sortOrder ?? 0) + 1);
  }
}
