-- Additive only: no existing menu, order, upload or historical record is changed.
CREATE TABLE "RestaurantFeedback" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "stars" INTEGER NOT NULL,
  "comment" VARCHAR(2000),
  "customerName" VARCHAR(100),
  "customerPhone" VARCHAR(32),
  "requestId" UUID NOT NULL,
  "dedupeKey" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantFeedback_stars_check" CHECK ("stars" BETWEEN 1 AND 5),
  CONSTRAINT "RestaurantFeedback_comment_check" CHECK ("stars" > 3 OR length(btrim("comment")) > 0 AND "comment" IS NOT NULL),
  CONSTRAINT "RestaurantFeedback_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantFeedback_restaurantId_requestId_key" ON "RestaurantFeedback"("restaurantId", "requestId");
CREATE UNIQUE INDEX "RestaurantFeedback_restaurantId_dedupeKey_key" ON "RestaurantFeedback"("restaurantId", "dedupeKey");
CREATE INDEX "RestaurantFeedback_restaurantId_createdAt_id_idx" ON "RestaurantFeedback"("restaurantId", "createdAt", "id");
