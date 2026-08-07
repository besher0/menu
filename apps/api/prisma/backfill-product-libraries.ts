import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function ingredientName(item: unknown) {
  if (typeof item === "string") return item.trim();
  if (!item || typeof item !== "object" || Array.isArray(item)) return "";
  const record = item as Record<string, unknown>;
  return text(record.adminName) || text(record.displayName) || text(record.name);
}

function ingredientDisplayName(item: unknown, fallback: string) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return fallback;
  const record = item as Record<string, unknown>;
  return text(record.displayName) || text(record.name) || fallback;
}

function ingredientImageUrl(item: unknown) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  return text((item as Record<string, unknown>).imageUrl) || null;
}

function mealDetails(nutrition: unknown) {
  if (!nutrition || typeof nutrition !== "object" || Array.isArray(nutrition)) return [];
  const record = nutrition as Record<string, unknown>;
  if (Array.isArray(record.details)) return record.details;

  return [
    { label: "الوزن التقريبي", value: text(record.weight), icon: "scale" },
    { label: "نوع البروتين", value: text(record.protein), icon: "drumstick" },
    { label: "نوع الخبز", value: text(record.breadType), icon: "wheat" },
    { label: "مستوى الحدة", value: text(record.spice), icon: "flame" }
  ].filter((item) => item.value);
}

function mealDetailAdminName(item: unknown) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return "";
  const record = item as Record<string, unknown>;
  return text(record.adminName) || text(record.displayName) || text(record.label);
}

function mealDetailDisplayName(item: unknown, fallback: string) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return fallback;
  const record = item as Record<string, unknown>;
  return text(record.displayName) || text(record.label) || fallback;
}

async function main() {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { restaurantId: true, ingredients: true, nutrition: true }
  });
  let ingredients = 0;
  let details = 0;

  for (const product of products) {
    if (Array.isArray(product.ingredients)) {
      for (const item of product.ingredients) {
        const adminName = ingredientName(item);
        if (!adminName) continue;
        await prisma.ingredientLibraryItem.upsert({
          where: {
            restaurantId_adminNameNormalized: {
              restaurantId: product.restaurantId,
              adminNameNormalized: normalize(adminName)
            }
          },
          update: {},
          create: {
            restaurantId: product.restaurantId,
            adminName,
            adminNameNormalized: normalize(adminName),
            displayName: ingredientDisplayName(item, adminName),
            imageUrl: ingredientImageUrl(item),
            isActive: true
          }
        });
        ingredients += 1;
      }
    }

    for (const item of mealDetails(product.nutrition)) {
      const adminName = mealDetailAdminName(item);
      if (!adminName) continue;
      const record = item as Record<string, unknown>;
      await prisma.mealDetailLibraryItem.upsert({
        where: {
          restaurantId_adminNameNormalized: {
            restaurantId: product.restaurantId,
            adminNameNormalized: normalize(adminName)
          }
        },
        update: {},
        create: {
          restaurantId: product.restaurantId,
          adminName,
          adminNameNormalized: normalize(adminName),
          displayName: mealDetailDisplayName(item, adminName),
          value: text(record.value) || null,
          icon: text(record.icon) || "utensils",
          iconUrl: text(record.iconUrl) || null,
          isActive: true
        }
      });
      details += 1;
    }
  }

  console.log(`Backfill complete. Processed ingredient references: ${ingredients}, meal detail references: ${details}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
