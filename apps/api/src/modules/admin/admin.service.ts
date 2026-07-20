import { ConflictException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ABO_MALEK_THEME, FEATURE_KEYS } from "@menu/shared";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { slugify } from "../../common/slugify";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRestaurantDto } from "./dto/create-restaurant.dto";

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
            categories: {
              create: {
                name: "الكل",
                slug: "all",
                description: "كل الأصناف",
                imagePosition: "78,50",
                color: "#ed1f2b",
                backgroundType: "GRADIENT",
                backgroundValue: "linear-gradient(135deg, #ed1f2b, #7f1118)",
                visualScrollEnabled: false,
                sortOrder: 0,
                isActive: true
              }
            }
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

        await tx.restaurantThemeSettings.create({
          data: {
            restaurantId: restaurant.id,
            settings: ABO_MALEK_THEME
          }
        });

        const menu = await tx.menu.create({
          data: {
            restaurantId: restaurant.id,
            branchId: restaurant.branches[0]?.id,
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
          data: [
            {
              pageId: page.id,
              type: "HERO",
              sortOrder: 0,
              settings: {
                title: `أهلا بك في ${dto.name}`,
                subtitle: "اختر أحد الأصناف وتصفح",
                backgroundImageUrl: dto.heroImageUrl
              }
            },
            {
              pageId: page.id,
              type: "CATEGORY_GRID",
              sortOrder: 1,
              settings: { layout: "horizontal-chips" }
            },
            {
              pageId: page.id,
              type: "FEATURED_PRODUCTS",
              sortOrder: 2,
              settings: { title: "الأكثر طلبا" }
            }
          ]
        });

        await tx.qrCode.create({
          data: {
            restaurantId: restaurant.id,
            branchId: restaurant.branches[0]?.id,
            label: "رابط المنيو الرئيسي",
            targetUrl: `/m/${restaurant.slug}`
          }
        });

        return {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          publicUrl: `/m/${restaurant.slug}`,
          owner: {
            id: owner.id,
            email: owner.email,
            defaultPassword: dto.ownerPassword ? undefined : ownerPassword
          }
        };
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
