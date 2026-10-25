ALTER TABLE "AnalyticsEvent"
ADD COLUMN "dedupeKey" TEXT,
ADD COLUMN "dedupeBucket" TIMESTAMP(3);

CREATE UNIQUE INDEX "AnalyticsEvent_restaurantId_type_dedupeKey_dedupeBucket_key"
ON "AnalyticsEvent"("restaurantId", "type", "dedupeKey", "dedupeBucket");
