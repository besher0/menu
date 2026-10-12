import { Prisma, PrismaClient } from "@prisma/client";
import { ABO_MALEK_THEME } from "@menu/shared";
import { persistProductConfiguration } from "../src/modules/products/product-configuration.persistence";
import {
  comboDemo,
  includedQuantityDemo,
  pizzaMargheritaDemo
} from "../../web/src/components/dashboard/product-configuration/demos";

const connection = process.env.DATABASE_URL;
if (!connection || !process.env.DIRECT_URL || connection !== process.env.DIRECT_URL) {
  throw new Error("Set matching DATABASE_URL and DIRECT_URL for a disposable Stage 5 database only.");
}
const target = new URL(connection);
if (
  !["127.0.0.1", "localhost"].includes(target.hostname)
  || target.port !== "55440"
  || !/^\/ordersawa_stage3_stage5_[a-z0-9_]+$/.test(target.pathname)
) {
  throw new Error("Stage 5 demo seed refuses non-disposable PostgreSQL targets.");
}

const restaurantId = "stage5-demo-restaurant";
const restaurantSlug = "stage5-demo";
const planId = "stage5-demo-plan";
const categoryId = "stage5-demo-category";
const pizzaId = "stage5-demo-pizza";
const comboId = "stage5-demo-combo";
const includedId = "stage5-demo-included";
const legacyId = "stage5-demo-legacy";
const prisma = new PrismaClient({ datasourceUrl: connection });

async function ensureProduct(id: string, slug: string, name: string, basePrice: string | null) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (existing) {
    if (existing.restaurantId !== restaurantId || existing.slug !== slug) {
      throw new Error(`Demo fixture ID collision: ${id}`);
    }
    return existing;
  }
  return prisma.product.create({
    data: { id, restaurantId, categoryId, name, slug, basePrice, currency: "ل.س" }
  });
}

async function ensureConfiguration(id: string, configuration: ReturnType<typeof pizzaMargheritaDemo>) {
  const product = await prisma.product.findUniqueOrThrow({ where: { id } });
  if (product.configurationVersion > 0) return;
  await persistProductConfiguration(prisma, {
    restaurantId,
    productId: id,
    expectedVersion: 0,
    configuration,
    requiredCapabilityKey: "PRODUCT_CONFIGURATION"
  });
}

async function main() {
  await prisma.$connect();
  const existingRestaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (existingRestaurant && existingRestaurant.slug !== restaurantSlug) {
    throw new Error("Demo restaurant ID collision");
  }
  if (!existingRestaurant) {
    await prisma.restaurant.create({ data: {
      id: restaurantId, slug: restaurantSlug, name: "Stage 5 Demo", currency: "ل.س",
      whatsappPhone: "0000000000"
    } });
  }
  if (!(await prisma.restaurantThemeSettings.findUnique({ where: { restaurantId } }))) {
    await prisma.restaurantThemeSettings.create({ data: {
      id: "stage5-demo-theme", restaurantId,
      settings: ABO_MALEK_THEME as unknown as Prisma.InputJsonValue
    } });
  }

  const existingPlan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (existingPlan && existingPlan.key !== "STAGE5_DEMO_ONLY") throw new Error("Demo plan ID collision");
  if (!existingPlan) {
    await prisma.subscriptionPlan.create({ data: {
      id: planId, key: "STAGE5_DEMO_ONLY", name: "Stage 5 disposable fixture"
    } });
  }
  await prisma.subscriptionFeature.upsert({
    where: { planId_key: { planId, key: "PRODUCT_CONFIGURATION" } },
    create: { id: "stage5-demo-capability", planId, key: "PRODUCT_CONFIGURATION", enabled: true },
    update: { enabled: true }
  });
  await prisma.restaurantSubscription.upsert({
    where: { restaurantId },
    create: {
      id: "stage5-demo-subscription", restaurantId, planId,
      status: "ACTIVE", startsAt: new Date("2020-01-01T00:00:00.000Z")
    },
    update: { planId, status: "ACTIVE" }
  });
  const existingCategory = await prisma.category.findUnique({ where: { id: categoryId } });
  if (existingCategory && existingCategory.restaurantId !== restaurantId) throw new Error("Demo category ID collision");
  if (!existingCategory) {
    await prisma.category.create({ data: {
      id: categoryId, restaurantId, slug: "stage5-examples", name: "أمثلة شبكة الأصناف"
    } });
  }

  await ensureProduct(pizzaId, "pizza-margherita-demo", "Pizza Margherita — DEMO", null);
  await ensureProduct(comboId, "combo-demo", "Combo ORIGINAL / CUSTOM — DEMO", "0");
  await ensureProduct(includedId, "included-quantity-demo", "Included Quantity — DEMO", "100");
  await ensureProduct(legacyId, "legacy-custom-source-demo", "Legacy CUSTOM Source — DEMO", "20");

  const pizza = pizzaMargheritaDemo(pizzaId, 1);
  await ensureConfiguration(pizzaId, pizza);
  await ensureConfiguration(includedId, includedQuantityDemo(includedId, 1));
  const demoCapability = { key: "PRODUCT_CONFIGURATION" as const, assigned: true, canRead: true, canWrite: true };
  const combo = comboDemo(comboId, 1, {
    product: { id: pizzaId, name: "Pizza Margherita — DEMO", basePrice: null, currency: "ل.س", isAvailable: true, configurationMode: "NETWORK", configurationVersion: 1 },
    envelope: { productId: pizzaId, mode: "NETWORK", configurationVersion: 1, configurationTree: pizza, basePrice: null, isAvailable: true, capability: demoCapability, orderabilityState: "PUBLIC_INTEGRATION_PENDING" }
  }, {
    product: { id: legacyId, name: "Legacy CUSTOM Source — DEMO", basePrice: 20, currency: "ل.س", isAvailable: true, configurationMode: "LEGACY", configurationVersion: 0 },
    envelope: { productId: legacyId, mode: "LEGACY", configurationVersion: 0, configurationTree: null, basePrice: "20", isAvailable: true, capability: demoCapability, orderabilityState: "LEGACY" }
  });
  await ensureConfiguration(comboId, combo);

  process.stdout.write(`Stage 5 disposable demo ready: http://localhost:3000/m/${restaurantSlug}/menu\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
