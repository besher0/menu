import { Prisma, PrismaClient } from "@prisma/client";
import { ABO_MALEK_THEME } from "@menu/shared";
import { persistProductConfiguration } from "../src/modules/products/product-configuration.persistence";
import { pizzaMargheritaDemo, comboDemo } from "../../web/src/components/dashboard/product-configuration/demos";

const connection = process.env.DATABASE_URL;
if (!connection || connection !== process.env.DIRECT_URL) throw new Error("Matching disposable DATABASE_URL and DIRECT_URL are required.");
const target = new URL(connection);
if (process.env.NODE_ENV === "production" || process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS !== "1"
  || target.hostname !== "127.0.0.1" || target.port !== "55440"
  || !/^\/ordersawa_stage3_stage6c_stage6d(?:2b|3a)_[a-z0-9_]+$/.test(target.pathname)) {
  throw new Error("Stage 6D.2B seed refuses any non-disposable target.");
}

const db = new PrismaClient({ datasourceUrl: connection });
const restaurantId = "s6d2b-demo-restaurant";
const slug = "s6d2b-demo";
const pizzaId = "s6d2b-pizza";
const comboId = "s6d2b-combo";
const legacyId = "s6d2b-legacy";
const planId = "s6d2b-plan";

async function main() {
  await db.$connect();
  const existing = await db.restaurant.findUnique({ where: { id: restaurantId } });
  if (existing && existing.slug !== slug) throw new Error("Demo restaurant ID collision");
  if (!existing) await db.restaurant.create({ data: {
    id: restaurantId, slug, name: "OrderSawa Local Demo", currency: "EGP", whatsappPhone: "0000000000"
  } });
  await db.restaurantThemeSettings.upsert({ where: { restaurantId },
    create: { id: "s6d2b-theme", restaurantId, settings: ABO_MALEK_THEME as unknown as Prisma.InputJsonValue },
    update: {} });
  await db.subscriptionPlan.upsert({ where: { key: "S6D2B_DISPOSABLE_ONLY" },
    create: { id: planId, key: "S6D2B_DISPOSABLE_ONLY", name: "Isolated test plan" }, update: {} });
  for (const key of ["PRODUCT_CONFIGURATION", "CART_ORDERING", "WHATSAPP_ORDERING"] as const) {
    await db.subscriptionFeature.upsert({ where: { planId_key: { planId, key } },
      create: { id: `s6d2b-${key}`, planId, key, enabled: true }, update: { enabled: true } });
  }
  await db.restaurantSubscription.upsert({ where: { restaurantId },
    create: { id: "s6d2b-sub", restaurantId, planId, status: "ACTIVE", startsAt: new Date("2020-01-01T00:00:00Z") },
    update: { planId, status: "ACTIVE" } });
  await db.category.upsert({ where: { id: "s6d2b-category" },
    create: { id: "s6d2b-category", restaurantId, slug: "demo", name: "Demo Menu" }, update: {} });
  if (!await db.category.findFirst({ where: { restaurantId, slug: "all", deletedAt: null } })) {
    await db.category.create({ data: { id: "s6d2b-all-category", restaurantId, slug: "all", name: "الكل", sortOrder: 0 } });
  }
  const products = [
    { id: pizzaId, slug: "pizza", name: "Pizza Margherita", basePrice: null },
    { id: comboId, slug: "combo", name: "Family Combo", basePrice: "0" },
    { id: legacyId, slug: "legacy", name: "Legacy Demo", basePrice: "20" }
  ];
  for (const product of products) {
    const found = await db.product.findUnique({ where: { id: product.id } });
    if (found && (found.restaurantId !== restaurantId || found.slug !== product.slug)) throw new Error("Demo Product ID collision");
    if (!found) await db.product.create({ data: { ...product, restaurantId, categoryId: "s6d2b-category", currency: "EGP" } });
  }
  const pizza = pizzaMargheritaDemo(pizzaId, 1);
  const capability = { key: "PRODUCT_CONFIGURATION" as const, assigned: true, canRead: true, canWrite: true };
  const combo = comboDemo(comboId, 1, {
    product: { id: pizzaId, name: "Pizza Margherita", basePrice: null, currency: "EGP", isAvailable: true, configurationMode: "NETWORK", configurationVersion: 1 },
    envelope: { productId: pizzaId, mode: "NETWORK", configurationVersion: 1, configurationTree: pizza, basePrice: null,
      isAvailable: true, capability, orderabilityState: "PUBLIC_INTEGRATION_PENDING" }
  }, {
    product: { id: legacyId, name: "Legacy Demo", basePrice: 20, currency: "EGP", isAvailable: true, configurationMode: "LEGACY", configurationVersion: 0 },
    envelope: { productId: legacyId, mode: "LEGACY", configurationVersion: 0, configurationTree: null, basePrice: "20",
      isAvailable: true, capability, orderabilityState: "LEGACY" }
  });
  for (const [id, tree] of [[pizzaId, pizza], [comboId, combo]] as const) {
    if ((await db.product.findUniqueOrThrow({ where: { id } })).configurationVersion === 0) {
      await persistProductConfiguration(db, { restaurantId, productId: id, expectedVersion: 0,
        configuration: tree, requiredCapabilityKey: "PRODUCT_CONFIGURATION" });
    }
  }
  process.stdout.write(`Disposable demo ready: http://localhost:3000/m/${slug}/menu\n`);
}

void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; })
  .finally(async () => db.$disconnect());
