CREATE TABLE "MenuVisitWindow" (
  "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "browserKey" TEXT NOT NULL,
  "lastAcceptedAt" TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY ("restaurantId", "browserKey")
);
CREATE TABLE "MenuVisitReceipt" (
  "id" TEXT PRIMARY KEY,
  "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MenuVisitReceipt_restaurantId_idx" ON "MenuVisitReceipt"("restaurantId");
