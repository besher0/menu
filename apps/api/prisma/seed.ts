import { PrismaClient } from "@prisma/client";
import { ABO_MALEK_RESTAURANT, PLAN_FEATURES } from "@menu/shared";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seedPlans() {
  const planMeta = [
    { key: "BASIC", name: "الأساسية", priceMonthly: 19, priceYearly: 190 },
    { key: "PRO", name: "الاحترافية", priceMonthly: 49, priceYearly: 490 },
    { key: "PREMIUM", name: "الذهبية", priceMonthly: 99, priceYearly: 990 }
  ];

  for (const plan of planMeta) {
    const savedPlan = await prisma.subscriptionPlan.upsert({
      where: { key: plan.key },
      update: {
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        isActive: true
      },
      create: {
        key: plan.key,
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        isActive: true
      }
    });

    for (const feature of PLAN_FEATURES[plan.key] ?? []) {
      await prisma.subscriptionFeature.upsert({
        where: { planId_key: { planId: savedPlan.id, key: feature.key } },
        update: {
          enabled: feature.enabled,
          limit: feature.limit ?? null
        },
        create: {
          planId: savedPlan.id,
          key: feature.key,
          enabled: feature.enabled,
          limit: feature.limit ?? null
        }
      });
    }
  }
}

async function seedRestaurant() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@menu.test" },
    update: { passwordHash, role: "SUPER_ADMIN", name: "محمد أحمد" },
    create: {
      email: "admin@menu.test",
      passwordHash,
      role: "SUPER_ADMIN",
      name: "محمد أحمد"
    }
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@abomalek.test" },
    update: { passwordHash, role: "USER", name: "مالك أبو مالك" },
    create: {
      email: "owner@abomalek.test",
      passwordHash,
      role: "USER",
      name: "مالك أبو مالك"
    }
  });

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: ABO_MALEK_RESTAURANT.slug },
    update: {
      name: ABO_MALEK_RESTAURANT.name,
      type: ABO_MALEK_RESTAURANT.type,
      city: ABO_MALEK_RESTAURANT.city,
      country: ABO_MALEK_RESTAURANT.country,
      whatsappPhone: ABO_MALEK_RESTAURANT.whatsappPhone,
      logoUrl: ABO_MALEK_RESTAURANT.logoUrl,
      heroImageUrl: ABO_MALEK_RESTAURANT.heroImageUrl,
      currency: "ل.س",
      isActive: true
    },
    create: {
      slug: ABO_MALEK_RESTAURANT.slug,
      name: ABO_MALEK_RESTAURANT.name,
      type: ABO_MALEK_RESTAURANT.type,
      city: ABO_MALEK_RESTAURANT.city,
      country: ABO_MALEK_RESTAURANT.country,
      whatsappPhone: ABO_MALEK_RESTAURANT.whatsappPhone,
      logoUrl: ABO_MALEK_RESTAURANT.logoUrl,
      heroImageUrl: ABO_MALEK_RESTAURANT.heroImageUrl,
      currency: "ل.س",
      isActive: true
    }
  });

  await prisma.restaurantMember.upsert({
    where: { restaurantId_userId: { restaurantId: restaurant.id, userId: owner.id } },
    update: { role: "OWNER" },
    create: { restaurantId: restaurant.id, userId: owner.id, role: "OWNER" }
  });

  await prisma.restaurantMember.upsert({
    where: { restaurantId_userId: { restaurantId: restaurant.id, userId: superAdmin.id } },
    update: { role: "OWNER" },
    create: { restaurantId: restaurant.id, userId: superAdmin.id, role: "OWNER" }
  });

  const branch = await prisma.branch.upsert({
    where: { restaurantId_slug: { restaurantId: restaurant.id, slug: "main" } },
    update: {
      name: "الفرع الرئيسي",
      city: "حلب",
      country: "سوريا",
      whatsappPhone: ABO_MALEK_RESTAURANT.whatsappPhone,
      isActive: true
    },
    create: {
      restaurantId: restaurant.id,
      slug: "main",
      name: "الفرع الرئيسي",
      city: "حلب",
      country: "سوريا",
      whatsappPhone: ABO_MALEK_RESTAURANT.whatsappPhone,
      isActive: true
    }
  });

  const proPlan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { key: "PRO" } });
  await prisma.restaurantSubscription.upsert({
    where: { restaurantId: restaurant.id },
    update: {
      planId: proPlan.id,
      status: "ACTIVE",
      startsAt: new Date()
    },
    create: {
      restaurantId: restaurant.id,
      planId: proPlan.id,
      status: "ACTIVE",
      startsAt: new Date()
    }
  });

  const theme = await prisma.theme.upsert({
    where: { key: "abo-malek-red" },
    update: {
      name: "Abo Malek Red",
      defaultSettings: ABO_MALEK_RESTAURANT.theme,
      isSystem: true
    },
    create: {
      key: "abo-malek-red",
      name: "Abo Malek Red",
      description: "Dark red fast-food preset inspired by the provided mobile designs.",
      defaultSettings: ABO_MALEK_RESTAURANT.theme,
      isSystem: true
    }
  });

  await prisma.restaurantThemeSettings.upsert({
    where: { restaurantId: restaurant.id },
    update: {
      themeId: theme.id,
      settings: ABO_MALEK_RESTAURANT.theme
    },
    create: {
      restaurantId: restaurant.id,
      themeId: theme.id,
      settings: ABO_MALEK_RESTAURANT.theme
    }
  });

  const categoryBySlug = new Map<string, string>();
  for (const [index, category] of ABO_MALEK_RESTAURANT.categories.entries()) {
    const savedCategory = await prisma.category.upsert({
      where: { restaurantId_slug: { restaurantId: restaurant.id, slug: category.slug } },
      update: {
        name: category.name,
        description: category.description,
        imageUrl: category.imageUrl,
        color: category.color,
        sortOrder: index,
        isActive: true
      },
      create: {
        restaurantId: restaurant.id,
        slug: category.slug,
        name: category.name,
        description: category.description,
        imageUrl: category.imageUrl,
        color: category.color,
        sortOrder: index,
        isActive: true
      }
    });
    categoryBySlug.set(category.slug, savedCategory.id);
  }

  for (const [index, product] of ABO_MALEK_RESTAURANT.products.entries()) {
    const savedProduct = await prisma.product.upsert({
      where: { restaurantId_slug: { restaurantId: restaurant.id, slug: product.slug } },
      update: {
        name: product.name,
        description: product.description,
        basePrice: product.price,
        currency: product.currency,
        categoryId: categoryBySlug.get(product.categorySlug),
        isFeatured: product.featured ?? false,
        isNew: product.new ?? false,
        isPopular: product.popular ?? false,
        ingredients: product.ingredients,
        nutrition: product.nutrition,
        sortOrder: index,
        isActive: true,
        isAvailable: true
      },
      create: {
        restaurantId: restaurant.id,
        categoryId: categoryBySlug.get(product.categorySlug),
        slug: product.slug,
        name: product.name,
        description: product.description,
        basePrice: product.price,
        currency: product.currency,
        isFeatured: product.featured ?? false,
        isNew: product.new ?? false,
        isPopular: product.popular ?? false,
        ingredients: product.ingredients,
        nutrition: product.nutrition,
        sortOrder: index,
        isActive: true,
        isAvailable: true
      }
    });

    await prisma.productImage.deleteMany({ where: { productId: savedProduct.id } });
    await prisma.productImage.create({
      data: {
        productId: savedProduct.id,
        url: product.imageUrl,
        altText: product.name,
        sortOrder: 0,
        isActive: true
      }
    });
  }

  const menu = await prisma.menu.upsert({
    where: { restaurantId_slug: { restaurantId: restaurant.id, slug: "main-menu" } },
    update: { name: "القائمة الرئيسية", status: "PUBLISHED", branchId: branch.id },
    create: {
      restaurantId: restaurant.id,
      branchId: branch.id,
      name: "القائمة الرئيسية",
      slug: "main-menu",
      status: "PUBLISHED"
    }
  });

  const homePage = await prisma.menuPage.upsert({
    where: { menuId_slug: { menuId: menu.id, slug: "home" } },
    update: { title: "الرئيسية", isHome: true, status: "PUBLISHED", sortOrder: 0 },
    create: {
      menuId: menu.id,
      title: "الرئيسية",
      slug: "home",
      isHome: true,
      status: "PUBLISHED",
      sortOrder: 0
    }
  });

  await prisma.menuSection.deleteMany({ where: { pageId: homePage.id } });
  await prisma.menuSection.createMany({
    data: [
      {
        pageId: homePage.id,
        type: "HERO",
        sortOrder: 0,
        settings: {
          title: "شو مزاجك اليوم؟",
          subtitle: "اختار أحد الأصناف وتصفح",
          backgroundImageUrl: "/assets/public/menu-home.png"
        }
      },
      {
        pageId: homePage.id,
        type: "CATEGORY_GRID",
        sortOrder: 1,
        settings: { layout: "horizontal-chips" }
      },
      {
        pageId: homePage.id,
        type: "FEATURED_PRODUCTS",
        sortOrder: 2,
        settings: { title: "الأكثر طلباً" }
      }
    ]
  });

  await prisma.qrCode.upsert({
    where: { id: `${restaurant.id}-main-qr` },
    update: { targetUrl: `/m/${restaurant.slug}`, label: "رابط المنيو الرئيسي" },
    create: {
      id: `${restaurant.id}-main-qr`,
      restaurantId: restaurant.id,
      branchId: branch.id,
      targetUrl: `/m/${restaurant.slug}`,
      label: "رابط المنيو الرئيسي"
    }
  });
}

async function main() {
  await seedPlans();

  if (process.env.SEED_DEMO_RESTAURANT === "true" || process.argv.includes("--demo")) {
    await seedRestaurant();
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
