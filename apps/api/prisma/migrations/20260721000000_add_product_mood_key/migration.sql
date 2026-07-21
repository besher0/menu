ALTER TABLE "Product" ADD COLUMN "moodKey" TEXT;

CREATE INDEX "Product_restaurantId_moodKey_idx" ON "Product"("restaurantId", "moodKey");
