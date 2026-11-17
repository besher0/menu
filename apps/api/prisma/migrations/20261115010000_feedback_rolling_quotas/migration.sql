CREATE TABLE "FeedbackQuotaEvent" (
  "id" TEXT NOT NULL,
  "key" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedbackQuotaEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FeedbackQuotaEvent_key_expiresAt_idx" ON "FeedbackQuotaEvent"("key", "expiresAt");
CREATE INDEX "FeedbackQuotaEvent_expiresAt_idx" ON "FeedbackQuotaEvent"("expiresAt");
