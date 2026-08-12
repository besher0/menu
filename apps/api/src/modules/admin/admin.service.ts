import { BadRequestException, ConflictException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ABO_MALEK_THEME, FEATURE_KEYS, PublicTemplateKey, VERTIGO_THEME } from "@menu/shared";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { slugify } from "../../common/slugify";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRestaurantDto } from "./dto/create-restaurant.dto";

const restaurantDesignSourceInclude = {
  themeSettings: true,
  categories: {
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" }
  },
  menus: {
    orderBy: { createdAt: "asc" },
    include: {
      pages: {
        orderBy: { sortOrder: "asc" },
        include: {
          sections: {
            orderBy: { sortOrder: "asc" }
          }
        }
      }
    }
  }
} satisfies Prisma.RestaurantInclude;

type RestaurantDesignSource = Prisma.RestaurantGetPayload<{ include: typeof restaurantDesignSourceInclude }>;

@Injectable()
export class AdminService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async overview() {
    const [restaurants, activeRestaurants, plans, orders, activeSubscriptions, expiringSoon] = await Promise.all([
      this.prisma.restaurant.count({ where: { deletedAt: null } }),
      this.prisma.restaurant.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.subscriptionPlan.count({ where: { isActive: true } }),
      this.prisma.order.count(),
      this.prisma.restaurantSubscription.findMany({
        where: {
          status: "ACTIVE",
          OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }]
        },
        include: {
          plan: {
            select: {
              name: true,
              priceMonthly: true
            }
          }
        }
      }),
      this.prisma.restaurantSubscription.count({
        where: {
          endsAt: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          }
        }
      })
    ]);

    const cityDistribution = await this.prisma.restaurant.groupBy({
      by: ["city"],
      where: { deletedAt: null },
      _count: { city: true }
    });

    const planDistribution = await this.prisma.restaurantSubscription.groupBy({
      by: ["planId"],
      _count: { planId: true }
    });

    const planNames = await this.prisma.subscriptionPlan.findMany({
      where: { id: { in: planDistribution.map((item) => item.planId) } }
    });

    const planIncome = activeSubscriptions.reduce<Record<string, number>>((totals, subscription) => {
      const planName = subscription.plan.name ?? "غير محدد";
      totals[planName] = (totals[planName] ?? 0) + Number(subscription.plan.priceMonthly ?? 0);
      return totals;
    }, {});
    const subscriptionIncome = Object.values(planIncome).reduce((sum, income) => sum + income, 0);

    return {
      cards: {
        totalIncome: subscriptionIncome,
        restaurants,
        activeRestaurants,
        expiringSoon,
        whatsappOrders: orders,
        plans
      },
      cityDistribution: cityDistribution.map((item) => ({
        city: item.city ?? "غير محدد",
        count: item._count.city
      })),
      planDistribution: planDistribution.map((item) => ({
        plan: planNames.find((plan) => plan.id === item.planId)?.name ?? "غير محدد",
        count: item._count.planId
      })),
      planIncomeDistribution: Object.entries(planIncome).map(([plan, income]) => ({
        plan,
        income
      }))
    };
  }

  async restaurants() {
    const restaurants = await this.prisma.restaurant.findMany({
      where: { deletedAt: null },
      include: {
        subscription: {
          include: { plan: true }
        },
        _count: {
          select: {
            branches: true,
            products: true,
            orders: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return restaurants.map((restaurant) => ({
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      city: restaurant.city,
      type: restaurant.type,
      isActive: restaurant.isActive,
      logoUrl: restaurant.logoUrl,
      createdAt: restaurant.createdAt,
      plan: restaurant.subscription?.plan.name ?? null,
      planKey: restaurant.subscription?.plan.key ?? null,
      counts: restaurant._count
    }));
  }

  async createRestaurant(dto: CreateRestaurantDto) {
    const baseSlug = slugify(dto.slug || dto.name);
    const slug = dto.slug ? baseSlug : await this.nextRestaurantSlug(baseSlug);
    const requestedTemplateKey = this.resolveTemplateKey(dto.templateKey, dto.type);

    if (dto.slug) {
      const existingRestaurant = await this.prisma.restaurant.findUnique({
        where: { slug },
        select: { id: true }
      });

      if (existingRestaurant) {
        throw new ConflictException("Restaurant slug is already used. Choose another public link.");
      }
    }

    const ownerPassword = dto.ownerPassword ?? "password123";
    const passwordHash = await bcrypt.hash(ownerPassword, 10);
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { key: dto.planKey ?? "BASIC" }
    });
    const designSource = dto.copyFromRestaurantId && requestedTemplateKey === "default"
      ? await this.loadRestaurantDesignSource(dto.copyFromRestaurantId)
      : null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const owner = await tx.user.upsert({
          where: { email: dto.ownerEmail },
          update: {
            name: dto.ownerName
          },
          create: {
            email: dto.ownerEmail,
            name: dto.ownerName,
            passwordHash,
            role: "USER"
          }
        });

        const restaurant = await tx.restaurant.create({
          data: {
            name: dto.name,
            slug,
            type: dto.type ?? "مطعم",
            city: dto.city,
            country: dto.country ?? "سوريا",
            whatsappPhone: dto.whatsappPhone,
            logoUrl: dto.logoUrl,
            heroImageUrl: dto.heroImageUrl,
            currency: "ل.س",
            members: {
              create: {
                userId: owner.id,
                role: "OWNER"
              }
            },
            branches: {
              create: {
                name: "الفرع الرئيسي",
                slug: "main",
                city: dto.city,
                country: dto.country ?? "سوريا",
                whatsappPhone: dto.whatsappPhone,
                isActive: true
              }
            },
            ...(designSource ? {} : { categories: { create: this.defaultAllCategoryData() } })
          },
          include: {
            branches: true
          }
        });

        if (plan) {
          await tx.restaurantSubscription.create({
            data: {
              restaurantId: restaurant.id,
              planId: plan.id,
              status: "ACTIVE",
              startsAt: new Date()
            }
          });
        }

        if (designSource) {
          await this.copyRestaurantDesign(tx, designSource, restaurant.id, restaurant.branches[0]?.id ?? null);
        } else {
          await this.createDefaultRestaurantDesign(
            tx,
            restaurant.id,
            restaurant.branches[0]?.id ?? null,
            dto.name,
            dto.heroImageUrl,
            requestedTemplateKey
          );
        }

        await tx.qrCode.create({
          data: {
            restaurantId: restaurant.id,
            branchId: restaurant.branches[0]?.id,
            label: "رابط المنيو الرئيسي",
            targetUrl: publicRestaurantUrl(restaurant.slug)
          }
        });

        return {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          publicUrl: publicRestaurantUrl(restaurant.slug),
          owner: {
            id: owner.id,
            email: owner.email,
            defaultPassword: dto.ownerPassword ? undefined : ownerPassword
          }
        };
      }, {
        maxWait: 10000,
        timeout: 30000
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Restaurant slug is already used. Choose another public link.");
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        throw new ServiceUnavailableException("Database is not reachable. Check Neon compute and DATABASE_URL.");
      }

      throw error;
    }
  }

  async subscriptions() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      include: {
        features: {
          orderBy: { key: "asc" }
        },
        _count: {
          select: { subscriptions: true }
        }
      },
      orderBy: { priceMonthly: "asc" }
    });

    return plans.map((plan) => ({
      id: plan.id,
      key: plan.key,
      name: plan.name,
      priceMonthly: Number(plan.priceMonthly ?? 0),
      priceYearly: Number(plan.priceYearly ?? 0),
      isActive: plan.isActive,
      restaurants: plan._count.subscriptions,
      features: this.serializePlanFeatures(plan.features)
    }));
  }

  async createSubscriptionPlan(dto: {
    key?: string;
    name: string;
    priceMonthly?: number | string | null;
    priceYearly?: number | string | null;
    isActive?: boolean;
    features?: Array<{ key: string; enabled?: boolean; limit?: number | string | null }>;
  }) {
    const key = await this.uniqueSubscriptionPlanKey(this.normalizePlanKey(dto.key || dto.name));

    const plan = await this.prisma.subscriptionPlan.create({
      data: {
        key,
        name: dto.name,
        priceMonthly: this.nullableNumber(dto.priceMonthly),
        priceYearly: this.nullableNumber(dto.priceYearly),
        isActive: dto.isActive ?? true
      }
    });

    await this.saveSubscriptionFeatures(plan.id, dto.features ?? []);
    return this.subscription(plan.id);
  }

  async updateSubscriptionPlan(id: string, dto: {
    name?: string;
    priceMonthly?: number | string | null;
    priceYearly?: number | string | null;
    isActive?: boolean;
    features?: Array<{ key: string; enabled?: boolean; limit?: number | string | null }>;
  }) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id }, select: { id: true } });

    if (!plan) {
      throw new ConflictException("Subscription plan was not found.");
    }

    await this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.priceMonthly !== undefined ? { priceMonthly: this.nullableNumber(dto.priceMonthly) } : {}),
        ...(dto.priceYearly !== undefined ? { priceYearly: this.nullableNumber(dto.priceYearly) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {})
      }
    });

    if (dto.features) {
      await this.saveSubscriptionFeatures(id, dto.features);
    }

    return this.subscription(id);
  }

  async subscription(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
      include: {
        features: { orderBy: { key: "asc" } },
        _count: { select: { subscriptions: true } }
      }
    });

    if (!plan) {
      throw new ConflictException("Subscription plan was not found.");
    }

    return {
      id: plan.id,
      key: plan.key,
      name: plan.name,
      priceMonthly: Number(plan.priceMonthly ?? 0),
      priceYearly: Number(plan.priceYearly ?? 0),
      isActive: plan.isActive,
      restaurants: plan._count.subscriptions,
      features: this.serializePlanFeatures(plan.features)
    };
  }

  async updateRestaurantSubscription(restaurantId: string, planKey: string) {
    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { key: planKey, isActive: true }
    });

    if (!plan) {
      throw new ConflictException("Subscription plan was not found or is inactive.");
    }

    const subscription = await this.prisma.restaurantSubscription.upsert({
      where: { restaurantId },
      update: {
        planId: plan.id,
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt: null
      },
      create: {
        restaurantId,
        planId: plan.id,
        status: "ACTIVE",
        startsAt: new Date()
      },
      include: { plan: true }
    });

    return {
      restaurantId,
      plan: subscription.plan.name,
      planKey: subscription.plan.key,
      status: subscription.status
    };
  }

  async updateRestaurantStatus(restaurantId: string, isActive: boolean) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: restaurantId, deletedAt: null },
      select: { id: true }
    });

    if (!restaurant) {
      throw new BadRequestException("Restaurant was not found.");
    }

    const updated = await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { isActive }
    });

    return {
      id: updated.id,
      isActive: updated.isActive
    };
  }

  async deleteRestaurantPermanently(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: restaurantId, deletedAt: null },
      select: { id: true }
    });

    if (!restaurant) {
      throw new BadRequestException("Restaurant was not found.");
    }

    await this.prisma.$transaction(async (tx) => {
      const [products, productGroups, menus, pages, orders, branches, mediaAssets] = await Promise.all([
        tx.product.findMany({ where: { restaurantId }, select: { id: true } }),
        tx.productOptionGroup.findMany({ where: { product: { restaurantId } }, select: { id: true } }),
        tx.menu.findMany({ where: { restaurantId }, select: { id: true } }),
        tx.menuPage.findMany({ where: { menu: { restaurantId } }, select: { id: true } }),
        tx.order.findMany({ where: { restaurantId }, select: { id: true } }),
        tx.branch.findMany({ where: { restaurantId }, select: { id: true } }),
        tx.mediaAsset.findMany({ where: { restaurantId }, select: { id: true } })
      ]);
      const productIds = products.map((item) => item.id);
      const productGroupIds = productGroups.map((item) => item.id);
      const menuIds = menus.map((item) => item.id);
      const pageIds = pages.map((item) => item.id);
      const orderIds = orders.map((item) => item.id);
      const branchIds = branches.map((item) => item.id);
      const mediaIds = mediaAssets.map((item) => item.id);

      await tx.analyticsEvent.deleteMany({ where: { restaurantId } });
      await tx.syncJob.deleteMany({ where: { restaurantId } });
      await tx.qrCode.deleteMany({ where: { restaurantId } });
      await tx.customDomain.deleteMany({ where: { restaurantId } });
      await tx.restaurantSubscription.deleteMany({ where: { restaurantId } });
      await tx.restaurantThemeSettings.deleteMany({ where: { restaurantId } });
      await tx.imageRule.deleteMany({ where: { restaurantId } });
      await tx.auditLog.deleteMany({ where: { restaurantId } });

      await tx.branchOpeningHour.deleteMany({ where: { branchId: { in: branchIds } } });
      await tx.menuSection.deleteMany({ where: { pageId: { in: pageIds } } });
      await tx.menuVersion.deleteMany({ where: { menuId: { in: menuIds } } });
      await tx.menuPage.deleteMany({ where: { menuId: { in: menuIds } } });
      await tx.menu.deleteMany({ where: { restaurantId } });

      await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.order.deleteMany({ where: { restaurantId } });

      await tx.productImage.deleteMany({ where: { productId: { in: productIds } } });
      await tx.productOption.deleteMany({ where: { groupId: { in: productGroupIds } } });
      await tx.productOptionGroup.deleteMany({ where: { productId: { in: productIds } } });
      await tx.product3DModel.deleteMany({ where: { productId: { in: productIds } } });
      await tx.productVrMedia.deleteMany({ where: { productId: { in: productIds } } });
      await tx.product.deleteMany({ where: { restaurantId } });
      await tx.category.deleteMany({ where: { restaurantId } });

      await tx.mediaVariant.deleteMany({ where: { mediaId: { in: mediaIds } } });
      await tx.mediaAsset.deleteMany({ where: { restaurantId } });
      await tx.ingredientLibraryItem.deleteMany({ where: { restaurantId } });
      await tx.mealDetailLibraryItem.deleteMany({ where: { restaurantId } });
      await tx.restaurantMember.deleteMany({ where: { restaurantId } });
      await tx.branch.deleteMany({ where: { restaurantId } });
      await tx.restaurant.delete({ where: { id: restaurantId } });
    });

    return { deleted: true };
  }

  private async loadRestaurantDesignSource(restaurantId: string) {
    const source = await this.prisma.restaurant.findFirst({
      where: { id: restaurantId, deletedAt: null },
      include: restaurantDesignSourceInclude
    });

    if (!source) {
      throw new BadRequestException("Source restaurant was not found.");
    }

    return source;
  }

  private async copyRestaurantDesign(
    tx: Prisma.TransactionClient,
    source: RestaurantDesignSource,
    restaurantId: string,
    branchId: string | null
  ) {
    await tx.restaurantThemeSettings.create({
      data: {
        restaurantId,
        themeId: source.themeSettings?.themeId,
        settings: this.sanitizeCopiedThemeSettings(source.themeSettings?.settings),
        iconSettings: this.cloneJsonValue(source.themeSettings?.iconSettings),
        customCss: source.themeSettings?.customCss
      }
    });

    if (source.categories.length) {
      await tx.category.createMany({
        data: source.categories.map((category) => ({
          restaurantId,
          name: category.name,
          slug: category.slug,
          description: category.description,
          imageUrl: category.imageUrl,
          imagePosition: category.imagePosition,
          imageWidth: category.imageWidth,
          imageHeight: category.imageHeight,
          color: category.color,
          backgroundType: category.backgroundType,
          backgroundValue: category.backgroundValue,
          backgroundOverlay: category.backgroundOverlay,
          backgroundCss: category.backgroundCss,
          visualScrollEnabled: category.visualScrollEnabled,
          sortOrder: category.sortOrder,
          isActive: category.isActive
        }))
      });
    } else {
      await tx.category.create({
        data: {
          restaurantId,
          ...this.defaultAllCategoryData()
        }
      });
    }

    if (!source.menus.length) {
      await this.createDefaultMenu(tx, restaurantId, branchId);
      return;
    }

    for (const sourceMenu of source.menus) {
      const menu = await tx.menu.create({
        data: {
          restaurantId,
          branchId,
          name: sourceMenu.name,
          slug: sourceMenu.slug,
          status: sourceMenu.status
        }
      });

      for (const sourcePage of sourceMenu.pages) {
        const page = await tx.menuPage.create({
          data: {
            menuId: menu.id,
            title: sourcePage.title,
            slug: sourcePage.slug,
            sortOrder: sourcePage.sortOrder,
            isHome: sourcePage.isHome,
            status: sourcePage.status,
            seoTitle: sourcePage.seoTitle,
            seoDescription: sourcePage.seoDescription
          }
        });

        if (sourcePage.sections.length) {
          await tx.menuSection.createMany({
            data: sourcePage.sections.map((section) => ({
              pageId: page.id,
              type: section.type,
              sortOrder: section.sortOrder,
              isActive: section.isActive,
              settings: this.sanitizeCopiedSectionSettings(section.type, section.settings)
            }))
          });
        }
      }
    }
  }

  private async createDefaultRestaurantDesign(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    branchId: string | null,
    restaurantName: string,
    heroImageUrl?: string,
    templateKey: PublicTemplateKey = "default"
  ) {
    await tx.restaurantThemeSettings.create({
      data: {
        restaurantId,
        settings: this.defaultThemeSettings(templateKey)
      }
    });

    await this.createDefaultMenu(tx, restaurantId, branchId, restaurantName, heroImageUrl, templateKey);
  }

  private async createDefaultMenu(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    branchId: string | null,
    restaurantName?: string,
    heroImageUrl?: string,
    templateKey: PublicTemplateKey = "default"
  ) {
    const menu = await tx.menu.create({
      data: {
        restaurantId,
        branchId,
        name: "القائمة الرئيسية",
        slug: "main-menu",
        status: "PUBLISHED"
      }
    });

    const page = await tx.menuPage.create({
      data: {
        menuId: menu.id,
        title: "الرئيسية",
        slug: "home",
        isHome: true,
        status: "PUBLISHED",
        sortOrder: 0
      }
    });

    await tx.menuSection.createMany({
      data: this.defaultMenuSections(page.id, restaurantName, heroImageUrl, templateKey)
    });
  }

  private defaultThemeSettings(templateKey: PublicTemplateKey) {
    return templateKey === "vertigo" ? VERTIGO_THEME : ABO_MALEK_THEME;
  }

  private resolveTemplateKey(templateKey?: PublicTemplateKey, restaurantType?: string | null): PublicTemplateKey {
    const normalizedType = restaurantType?.trim().toLowerCase() ?? "";
    if (templateKey === "vertigo" || normalizedType.includes("vertigo") || normalizedType.includes("فيرتيغو")) {
      return "vertigo";
    }

    return "default";
  }

  private defaultMenuSections(pageId: string, restaurantName?: string, heroImageUrl?: string, templateKey: PublicTemplateKey = "default") {
    if (templateKey === "vertigo") {
      return [
        {
          pageId,
          type: "HERO",
          sortOrder: 0,
          settings: {
            title: restaurantName ? `welcome to ${restaurantName}` : "welcome",
            subtitle: "CAFE & RETO",
            backgroundImageUrl: heroImageUrl,
            alignment: "start",
            height: "large",
            adBanners: [
              {
                title: "وجبة جديدة",
                subtitle: "تفاصيل الوجبة",
                imageUrl: heroImageUrl ?? "/assets/public/product-detail.png",
                targetUrl: "/menu",
                targetProductId: "",
                badge: "جديد"
              }
            ]
          }
        },
        {
          pageId,
          type: "CATEGORY_GRID",
          sortOrder: 1,
          settings: {
            title: "الأقسام",
            layout: "text-tabs",
            categoryNavVariant: "text-tabs",
            showLandingCategories: false,
            showNestedCategoryStrip: true
          }
        },
        {
          pageId,
          type: "FEATURED_PRODUCTS",
          sortOrder: 2,
          settings: {
            title: "الأصناف المميزة",
            layout: "stack",
            cardVariant: "featured-overlay-large"
          }
        },
        {
          pageId,
          type: "PRODUCT_LIST",
          sortOrder: 3,
          settings: {
            title: "القائمة",
            layout: "list",
            cardVariant: "horizontal-contained"
          }
        }
      ];
    }

    return [
        {
          pageId,
          type: "HERO",
          sortOrder: 0,
          settings: {
            title: restaurantName ? `أهلا بك في ${restaurantName}` : "أهلا بك",
            subtitle: "اختر أحد الأصناف وتصفح",
            backgroundImageUrl: heroImageUrl
          }
        },
        {
          pageId,
          type: "CATEGORY_GRID",
          sortOrder: 1,
          settings: { layout: "horizontal-chips", categoryNavVariant: "image-chips" }
        },
        {
          pageId,
          type: "FEATURED_PRODUCTS",
          sortOrder: 2,
          settings: { title: "الأكثر طلبا", cardVariant: "wide-image" }
        }
      ];
  }

  private defaultAllCategoryData() {
    return {
      name: "الكل",
      slug: "all",
      description: "كل الأصناف",
      imagePosition: "78,50",
      color: "#ed1f2b",
      backgroundType: "GRADIENT" as const,
      backgroundValue: "linear-gradient(135deg, #ed1f2b, #7f1118)",
      visualScrollEnabled: false,
      sortOrder: 0,
      isActive: true
    };
  }

  private sanitizeCopiedThemeSettings(settings: Prisma.JsonValue | null | undefined) {
    const cloned = this.cloneJsonObject(settings ?? ABO_MALEK_THEME);
    const dashboardSettings = this.cloneJsonObject(cloned.dashboardSettings);

    delete dashboardSettings.phone;
    delete dashboardSettings.email;

    const splashScreen = this.cloneJsonObject(dashboardSettings.splashScreen);
    if (Object.keys(splashScreen).length) {
      delete splashScreen.logoUrl;
      delete splashScreen.backgroundImageUrl;
      if (splashScreen.backgroundType === "IMAGE") {
        splashScreen.backgroundType = "COLOR";
      }
      dashboardSettings.splashScreen = splashScreen;
    }

    if (Object.keys(dashboardSettings).length) {
      cloned.dashboardSettings = dashboardSettings;
    }

    return cloned as Prisma.InputJsonObject;
  }

  private sanitizeCopiedSectionSettings(type: string, settings: Prisma.JsonValue) {
    const cloned = this.cloneJsonObject(settings);

    if (type === "HERO") {
      delete cloned.adBanners;
    }

    return cloned as Prisma.InputJsonObject;
  }

  private cloneJsonObject(value: unknown): Record<string, any> {
    const cloned = this.cloneJsonValue(value);
    return cloned && typeof cloned === "object" && !Array.isArray(cloned) ? cloned as Record<string, any> : {};
  }

  private cloneJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }

    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private async nextRestaurantSlug(baseSlug: string) {
    const existing = await this.prisma.restaurant.findMany({
      where: {
        OR: [{ slug: baseSlug }, { slug: { startsWith: `${baseSlug}-` } }]
      },
      select: { slug: true }
    });

    const usedSlugs = new Set(existing.map((restaurant) => restaurant.slug));
    if (!usedSlugs.has(baseSlug)) {
      return baseSlug;
    }

    for (let suffix = 2; suffix < 1000; suffix += 1) {
      const candidate = `${baseSlug}-${suffix}`;
      if (!usedSlugs.has(candidate)) {
        return candidate;
      }
    }

    throw new ConflictException("Could not generate a unique restaurant slug. Choose another public link.");
  }

  private serializePlanFeatures(features: Array<{ key: string; enabled: boolean; limit: number | null }>) {
    const byKey = new Map(features.map((feature) => [feature.key, feature]));

    return FEATURE_KEYS.map((key) => {
      const feature = byKey.get(key);
      return {
        key,
        enabled: feature?.enabled ?? false,
        limit: feature?.limit ?? null
      };
    });
  }

  private async saveSubscriptionFeatures(
    planId: string,
    features: Array<{ key: string; enabled?: boolean; limit?: number | string | null }>
  ) {
    const allowed = new Set<string>(FEATURE_KEYS);
    const normalized = features.filter((feature) => allowed.has(feature.key));

    await this.prisma.$transaction(
      normalized.map((feature) =>
        this.prisma.subscriptionFeature.upsert({
          where: { planId_key: { planId, key: feature.key } },
          update: {
            enabled: feature.enabled ?? false,
            limit: this.nullableInt(feature.limit)
          },
          create: {
            planId,
            key: feature.key,
            enabled: feature.enabled ?? false,
            limit: this.nullableInt(feature.limit)
          }
        })
      )
    );
  }

  private normalizePlanKey(value: string) {
    const key = slugify(value).replace(/-/g, "_").toUpperCase();
    return key || "PLAN";
  }

  private async uniqueSubscriptionPlanKey(baseKey: string) {
    let candidate = baseKey;
    let suffix = 2;

    while (await this.prisma.subscriptionPlan.findUnique({ where: { key: candidate }, select: { id: true } })) {
      candidate = `${baseKey}_${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private nullableNumber(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private nullableInt(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
  }
}

function publicRestaurantUrl(restaurantSlug: string) {
  const domain = normalizeDomain(process.env.ROOT_DOMAIN ?? process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "ordersawa.com");

  return `https://${restaurantSlug}.${domain ?? "ordersawa.com"}`;
}

function normalizeDomain(value?: string | null) {
  return value
    ?.trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    ?.split(":")[0]
    ?.replace(/\.$/, "")
    .toLowerCase() || null;
}
