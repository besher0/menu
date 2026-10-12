-- Convert product ingredient/detail libraries from per-restaurant rows to global rows.
-- Deduplicate before dropping restaurantId so the global unique indexes can be created safely.

WITH grouped AS (
  SELECT
    "adminNameNormalized",
    (array_agg("id" ORDER BY "isActive" DESC, "updatedAt" DESC, "createdAt" ASC, "id" ASC))[1] AS canonical_id,
    (array_agg(NULLIF(trim("adminName"), '') ORDER BY (NULLIF(trim("adminName"), '') IS NOT NULL) DESC, "isActive" DESC, "updatedAt" DESC, "createdAt" ASC))[1] AS best_admin_name,
    (array_agg(NULLIF(trim("displayName"), '') ORDER BY (NULLIF(trim("displayName"), '') IS NOT NULL) DESC, "isActive" DESC, "updatedAt" DESC, "createdAt" ASC))[1] AS best_display_name,
    (array_agg(NULLIF(trim("imageUrl"), '') ORDER BY (NULLIF(trim("imageUrl"), '') IS NOT NULL) DESC, "isActive" DESC, "updatedAt" DESC, "createdAt" ASC))[1] AS best_image_url,
    bool_or("isActive") AS any_active
  FROM "IngredientLibraryItem"
  GROUP BY "adminNameNormalized"
)
UPDATE "IngredientLibraryItem" item
SET
  "adminName" = COALESCE(grouped.best_admin_name, item."adminName"),
  "displayName" = COALESCE(grouped.best_display_name, item."displayName"),
  "imageUrl" = COALESCE(grouped.best_image_url, item."imageUrl"),
  "isActive" = grouped.any_active
FROM grouped
WHERE item."id" = grouped.canonical_id;

WITH grouped AS (
  SELECT
    "adminNameNormalized",
    (array_agg("id" ORDER BY "isActive" DESC, "updatedAt" DESC, "createdAt" ASC, "id" ASC))[1] AS canonical_id
  FROM "IngredientLibraryItem"
  GROUP BY "adminNameNormalized"
)
DELETE FROM "IngredientLibraryItem" item
USING grouped
WHERE item."adminNameNormalized" = grouped."adminNameNormalized"
  AND item."id" <> grouped.canonical_id;

WITH grouped AS (
  SELECT
    "adminNameNormalized",
    (array_agg("id" ORDER BY "isActive" DESC, "updatedAt" DESC, "createdAt" ASC, "id" ASC))[1] AS canonical_id,
    (array_agg(NULLIF(trim("adminName"), '') ORDER BY (NULLIF(trim("adminName"), '') IS NOT NULL) DESC, "isActive" DESC, "updatedAt" DESC, "createdAt" ASC))[1] AS best_admin_name,
    (array_agg(NULLIF(trim("displayName"), '') ORDER BY (NULLIF(trim("displayName"), '') IS NOT NULL) DESC, "isActive" DESC, "updatedAt" DESC, "createdAt" ASC))[1] AS best_display_name,
    (array_agg(NULLIF(trim("value"), '') ORDER BY (NULLIF(trim("value"), '') IS NOT NULL) DESC, "isActive" DESC, "updatedAt" DESC, "createdAt" ASC))[1] AS best_value,
    (array_agg(NULLIF(trim("icon"), '') ORDER BY ((NULLIF(trim("icon"), '') IS NOT NULL) AND NULLIF(trim("icon"), '') <> 'utensils') DESC, (NULLIF(trim("icon"), '') IS NOT NULL) DESC, "isActive" DESC, "updatedAt" DESC, "createdAt" ASC))[1] AS best_icon,
    (array_agg(NULLIF(trim("iconUrl"), '') ORDER BY (NULLIF(trim("iconUrl"), '') IS NOT NULL) DESC, "isActive" DESC, "updatedAt" DESC, "createdAt" ASC))[1] AS best_icon_url,
    bool_or("isActive") AS any_active
  FROM "MealDetailLibraryItem"
  GROUP BY "adminNameNormalized"
)
UPDATE "MealDetailLibraryItem" item
SET
  "adminName" = COALESCE(grouped.best_admin_name, item."adminName"),
  "displayName" = COALESCE(grouped.best_display_name, item."displayName"),
  "value" = COALESCE(grouped.best_value, item."value"),
  "icon" = COALESCE(grouped.best_icon, item."icon", 'utensils'),
  "iconUrl" = COALESCE(grouped.best_icon_url, item."iconUrl"),
  "isActive" = grouped.any_active
FROM grouped
WHERE item."id" = grouped.canonical_id;

WITH grouped AS (
  SELECT
    "adminNameNormalized",
    (array_agg("id" ORDER BY "isActive" DESC, "updatedAt" DESC, "createdAt" ASC, "id" ASC))[1] AS canonical_id
  FROM "MealDetailLibraryItem"
  GROUP BY "adminNameNormalized"
)
DELETE FROM "MealDetailLibraryItem" item
USING grouped
WHERE item."adminNameNormalized" = grouped."adminNameNormalized"
  AND item."id" <> grouped.canonical_id;

ALTER TABLE "IngredientLibraryItem" DROP CONSTRAINT IF EXISTS "IngredientLibraryItem_restaurantId_fkey";
ALTER TABLE "MealDetailLibraryItem" DROP CONSTRAINT IF EXISTS "MealDetailLibraryItem_restaurantId_fkey";

DROP INDEX IF EXISTS "IngredientLibraryItem_restaurantId_adminNameNormalized_key";
DROP INDEX IF EXISTS "IngredientLibraryItem_restaurantId_idx";
DROP INDEX IF EXISTS "IngredientLibraryItem_restaurantId_isActive_idx";
DROP INDEX IF EXISTS "MealDetailLibraryItem_restaurantId_adminNameNormalized_key";
DROP INDEX IF EXISTS "MealDetailLibraryItem_restaurantId_idx";
DROP INDEX IF EXISTS "MealDetailLibraryItem_restaurantId_isActive_idx";

ALTER TABLE "IngredientLibraryItem" DROP COLUMN IF EXISTS "restaurantId";
ALTER TABLE "MealDetailLibraryItem" DROP COLUMN IF EXISTS "restaurantId";

CREATE UNIQUE INDEX "IngredientLibraryItem_adminNameNormalized_key"
ON "IngredientLibraryItem"("adminNameNormalized");

CREATE INDEX "IngredientLibraryItem_isActive_idx"
ON "IngredientLibraryItem"("isActive");

CREATE UNIQUE INDEX "MealDetailLibraryItem_adminNameNormalized_key"
ON "MealDetailLibraryItem"("adminNameNormalized");

CREATE INDEX "MealDetailLibraryItem_isActive_idx"
ON "MealDetailLibraryItem"("isActive");
