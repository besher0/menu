CREATE TABLE "IngredientLibraryItem" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "adminName" TEXT NOT NULL,
  "adminNameNormalized" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "imageUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IngredientLibraryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MealDetailLibraryItem" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "adminName" TEXT NOT NULL,
  "adminNameNormalized" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "value" TEXT,
  "icon" TEXT NOT NULL DEFAULT 'utensils',
  "iconUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MealDetailLibraryItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IngredientLibraryItem_restaurantId_adminNameNormalized_key"
ON "IngredientLibraryItem"("restaurantId", "adminNameNormalized");

CREATE INDEX "IngredientLibraryItem_restaurantId_idx"
ON "IngredientLibraryItem"("restaurantId");

CREATE INDEX "IngredientLibraryItem_restaurantId_isActive_idx"
ON "IngredientLibraryItem"("restaurantId", "isActive");

CREATE UNIQUE INDEX "MealDetailLibraryItem_restaurantId_adminNameNormalized_key"
ON "MealDetailLibraryItem"("restaurantId", "adminNameNormalized");

CREATE INDEX "MealDetailLibraryItem_restaurantId_idx"
ON "MealDetailLibraryItem"("restaurantId");

CREATE INDEX "MealDetailLibraryItem_restaurantId_isActive_idx"
ON "MealDetailLibraryItem"("restaurantId", "isActive");

ALTER TABLE "IngredientLibraryItem"
ADD CONSTRAINT "IngredientLibraryItem_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MealDetailLibraryItem"
ADD CONSTRAINT "MealDetailLibraryItem_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
