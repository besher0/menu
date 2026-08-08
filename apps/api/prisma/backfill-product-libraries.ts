import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.values)) return record.values;
  return [];
}

function ingredientName(item: unknown) {
  if (typeof item === "string") return item.trim();
  if (!item || typeof item !== "object" || Array.isArray(item)) return "";
  const record = item as Record<string, unknown>;
  return text(record.adminName) || text(record.displayName) || text(record.name) || text(record.label) || text(record.title) || text(record.value);
}

function ingredientDisplayName(item: unknown, fallback: string) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return fallback;
  const record = item as Record<string, unknown>;
  return text(record.displayName) || text(record.name) || text(record.label) || text(record.title) || fallback;
}

function ingredientImageUrl(item: unknown) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  return text((item as Record<string, unknown>).imageUrl) || null;
}

function mealDetails(nutrition: unknown) {
  if (Array.isArray(nutrition)) return nutrition;
  if (!nutrition || typeof nutrition !== "object") return [];
  const record = nutrition as Record<string, unknown>;
  const details = jsonArray(record.details);
  if (details.length) return details;
  const items = jsonArray(record.items);
  if (items.length) return items;

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
  return text(record.adminName) || text(record.displayName) || text(record.label) || text(record.name) || text(record.title);
}

function mealDetailDisplayName(item: unknown, fallback: string) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return fallback;
  const record = item as Record<string, unknown>;
  return text(record.displayName) || text(record.label) || text(record.name) || text(record.title) || fallback;
}

async function main() {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { restaurantId: true, ingredients: true, nutrition: true }
  });
  let ingredients = 0;
  let details = 0;

  for (const product of products) {
    for (const item of jsonArray(product.ingredients)) {
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
          value: text(record.value) || text(record.amount) || null,
          icon: text(record.icon) || "utensils",
          iconUrl: text(record.iconUrl) || text(record.imageUrl) || null,
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
